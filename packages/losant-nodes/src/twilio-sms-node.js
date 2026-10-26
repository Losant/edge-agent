import * as payloadHelper from 'losant-handlebars';
import twilio from 'twilio';
import resolvePhoneNumbers from './lib/resolve-phone-numbers.js';
import errors from 'losant-nodejs-utils/src/errors.js';
import { mapSerialP, timeoutP } from 'omnibelt';
import { isTimeoutError } from './lib/common.js';

const SEGMENT_LENGTH = 153; // https://www.twilio.com/docs/glossary/what-sms-character-limit
const MAX_TO_NUMBERS = 100;

class TwilioSmsNode {

  /* Example Config:
  { accountSid: <String - Required unless credentialNameTemplate is set: template for the twilio account sid, must start with AC>,
    authToken: <String - Required unless credentialNameTemplate is set: template for the twilio auth token, or the API Key Secret if username is also set>,
    username: <String - Optional: template for the twilio API Key SID, must start with SK. If not set, the account sid is used as the API Key SID>,
    credentialNameTemplate: <String - Optional: name template of the twilio credential to auth with. If set, accountSid, authToken, and username are ignored>,
    fromNumber: <String - Optional: template for the phone number to send from>,
    messagingServiceSid: <String - Optional: template for the messaging service sid to send from>,
    bodyTemplate: <String - Optional: template for the body of the message>,
    mediaUrl: <String - Optional: template for the media url>,
    maxSegments: <Number - Optional: maximum number of 153-byte message segments the body may use. If the body exceeds it, no messages are sent and each recipient result is an error>,
    singleRecipient: <Boolean - Optional: if true, only the first valid recipient is sent to and every later recipient result is an error>,
    toNumbers: [
      0 or more of:
      <String - Required: template for the phone number to send to>
    ],
    resultsPath: <String - Optional: payload path for the results array> }

  Notes: Provide fromNumber or messagingServiceSid; this is not validated by the node, so Twilio
         rejects the message per recipient if neither is set. If both are set, both are sent to Twilio.
         At least one of bodyTemplate or mediaUrl should be set. If neither renders non-empty, the result for each recipient is an error.
         toNumbers will work with 0 entries, but nothing will happen. A maximum of 100 numbers is allowed or the node throws.
         resultsPath receives an array with one entry per toNumbers entry, in order. Successful sends are
         { number, success: true }. Failures are { error: true, number, message } and do not throw; invalid or
         duplicate numbers, timeouts, and Twilio errors are reported this way.
         Missing or malformed credentials throw.
  */

  constructor(id, outputIds, config) {
    this.id = id;
    this.outputIds = outputIds;
    this.accountSid = config.accountSid;
    this.authToken = config.authToken;
    this.username = config.username;
    this.credentialNameTemplate = config.credentialNameTemplate;
    this.toNumbers = config.toNumbers || [];

    // At least one of these two
    this.fromNumber = config.fromNumber;
    this.messagingServiceSid = config.messagingServiceSid;

    // At least one of these two
    this.bodyTemplate = config.bodyTemplate;
    this.mediaUrl = config.mediaUrl;

    // Optional
    this.resultsPath = config.resultsPath;

    // optional send limits
    this.maxSegments = config.maxSegments;
    this.singleRecipient = config.singleRecipient;
  }

  resolveCreds(context, payload) {
    if (this.credentialNameTemplate) {
      return context.loadCredential({
        credentialNameTemplate: this.credentialNameTemplate,
        type: 'twilio',
        applicationId: context.applicationId,
        payload
      });
    }

    const accountSid = payloadHelper.renderToString(this.accountSid, payload).trim();
    const apiKeySecret = payloadHelper.renderToString(this.authToken, payload).trim();
    let apiKeySid = payloadHelper.renderToString(this.username, payload).trim();
    if (!accountSid || !apiKeySecret || !accountSid.startsWith('AC') || (apiKeySid && !apiKeySid.startsWith('SK'))) {
      throw errors.MissingField({ title: 'Twilio Credentials' });
    }

    // if they are using their global account key
    if (!apiKeySid) { apiKeySid = accountSid; }

    return { accountSid, apiKeySid, apiKeySecret };
  }

  async run(context, payload) {
    const creds = await this.resolveCreds(context, payload);
    const toNumbers = resolvePhoneNumbers(this.toNumbers, payload);
    if (toNumbers.length > MAX_TO_NUMBERS) {
      throw errors.Validation({
        message: `Maximum number of To Numbers is ${MAX_TO_NUMBERS}.`
      });
    }

    const sms = { };
    const from = payloadHelper.renderToString(this.fromNumber, payload);
    if (from) { sms.from = from; }
    const messagingServiceSid = payloadHelper.renderToString(this.messagingServiceSid, payload);
    if (messagingServiceSid) { sms.messagingServiceSid = messagingServiceSid; }

    const body = payloadHelper.renderToString(this.bodyTemplate, payload);
    if (body) { sms.body = body; }
    const mediaUrl = payloadHelper.renderToString(this.mediaUrl, payload);
    if (mediaUrl) { sms.mediaUrl = mediaUrl; }

    const client = twilio(creds.apiKeySid, creds.apiKeySecret, { accountSid: creds.accountSid });

    let exceedsMaxSegments = false;
    if (sms.body && this.maxSegments) {
      exceedsMaxSegments = (Buffer.from(sms.body).length / SEGMENT_LENGTH) > this.maxSegments;
    }

    const sentNumbers = new Set();
    const start = Date.now();
    const maxAllowedTime = Math.min(context.externalTimeout, context.maxFlowRunTime - (start - context.runStart));
    let timeLeft = maxAllowedTime;
    const results = await mapSerialP(async (toNumber) => {
      if (timeLeft <= 0) {
        return { error: true, number: toNumber.parsed || toNumber.orig, message: 'Timeout' };
      }
      if (!toNumber.parsed) {
        return { error: true, message: 'Phone number invalid', number: toNumber.orig };
      }
      if (!sms.body && !sms.mediaUrl) {
        return { error: true, message: 'Message content must be provided', number: toNumber.orig };
      }
      if (exceedsMaxSegments) {
        return { error: true, message: `Message exceeds maximum allowed segments (${this.maxSegments})`, number: toNumber.orig };
      }
      if (sentNumbers.has(toNumber.parsed)) {
        return { error: true, message: 'Duplicate phone number', number: toNumber.parsed };
      }
      if (this.singleRecipient && sentNumbers.size) {
        return { error: true, message: 'Can only send to a single number', number: toNumber.parsed };
      }

      sentNumbers.add(toNumber.parsed);
      let result;
      try {
        await timeoutP(timeLeft, client.messages.create({
          ...sms,
          to: toNumber.parsed
        }));
        result = { number: toNumber.parsed, success: true };
      } catch (err) {
        result = {
          error: true,
          number: toNumber.parsed,
          message: isTimeoutError(err) ? 'Timeout' : (err.message || `${err.status} Error from Twilio`)
        };
      }

      timeLeft = maxAllowedTime - (Date.now() - start);
      return result;
    }, toNumbers);

    if (this.resultsPath) { payload = payloadHelper.set(this.resultsPath, results, payload); }
    return [this.outputIds, payload];
  }

}

export default TwilioSmsNode;
