import * as payloadHelper from 'losant-handlebars';
import sendgrid from '@sendgrid/mail';
import errors from 'losant-nodejs-utils/src/errors.js';
import { toInteger, timeoutP } from 'omnibelt';
import { renderAddresses, resolveAttachments } from './email-helpers.js';
import { isTimeoutError } from './common.js';

// CAUTION
// sendgrid is a singleton, with Losant's sendgrid key
// so we force make our own every time with its own api key
// when upgrading sendgrid, make sure the following
// is still correct
// CAUTION
const createMailClient = (apiKey) => {
  const mailClient = new sendgrid.constructor();
  mailClient.client = new mailClient.client.constructor();
  mailClient.setApiKey(apiKey);
  return mailClient;
};

class SendgridEmailNode {

  /* Example Config:
  { bodyTemplate: <String - Optional: template for the HTML body of the email. Omitted if it renders blank>,
    subjectTemplate: <String - Optional: template for subject of email. Omitted if it renders blank>,
    fromTemplate: <String - Optional: template for from email address. Used only if the subclass accepts it, otherwise the subclass fallback address is used>,
    replyToTemplate: <String - Optional: template for reply to email address. Used only if the subclass accepts it>,
    sendgridApiKey: <String - Required when credentialNameTemplate is not set: template for sendgrid api key>,
    credentialNameTemplate: <String - Optional: template for the name of the credential to auth with. If set, sendgridApiKey is ignored>,
    resultPath: <String - Optional: payload path to store { message: 'success' } or { error }>,
    maxRecipients: <Number - Optional: maximum total recipients across to, cc, and bcc, extras are dropped. No limit if not set or less than 1>,
    toAddresses: [
      0 or more of:
      <String - Required: template for an email address to send to>
    ],
    ccAddresses: [
      0 or more of:
      <String - Required: template for an email address to cc>
    ],
    bccAddresses: [
      0 or more of:
      <String - Required: template for an email address to bcc>
    ],
    attachments: [
      0 or more of, up to 10:
      {
        urlTemplate: <String - Optional: template for url to download content from. Ignored when contentTemplate renders content>,
        contentTemplate: <String - Optional: template for attachment content. Takes precedence over urlTemplate. Content that is not already base64 is base64 encoded>,
        filenameTemplate: <String - Optional: template for the filename. When downloading from urlTemplate, defaults to the last segment of the url path>
      }
    ]
   }

  Notes: It is valid to have no entries in to/cc/bcc, but probably doesn't make sense. A timeout throws. Other send failures are written to resultPath as { error }.
  */

  constructor(id, outputIds, config) {
    this.id = id;
    this.outputIds = outputIds;
    this.bodyTemplate = config.bodyTemplate;
    this.subjectTemplate = config.subjectTemplate;
    this.fromTemplate = config.fromTemplate;
    this.replyToTemplate = config.replyToTemplate;
    this.toAddresses = config.toAddresses;
    this.ccAddresses = config.ccAddresses;
    this.bccAddresses = config.bccAddresses;
    this.sendgridApiKey = config.sendgridApiKey;
    this.credentialNameTemplate = config.credentialNameTemplate;
    this.resultPath = config.resultPath;
    this.attachments = config.attachments || [];

    // optional limit on total recipients
    this.maxRecipients = toInteger(config.maxRecipients);
    if (this.maxRecipients < 1) { this.maxRecipients = Infinity; }
  }

  isValidFromEmail(/* context, email */) { }

  fallbackFromEmail(/* context */) { }

  async run(context, payload) {
    let apiKey;
    if (this.credentialNameTemplate) {
      apiKey = await context.loadCredential({
        credentialNameTemplate: this.credentialNameTemplate,
        type: 'sendgrid',
        applicationId: context.applicationId,
        payload,
        secretOnly: true
      });
    } else {
      apiKey = payloadHelper.renderToString(this.sendgridApiKey, payload).trim();
      if (!apiKey) { throw errors.MissingField({ title: 'SendGrid API Key' }); }
    }

    const email = {
      custom_args: {
        applicationId: context.applicationId,
        workflowId: context.flowId,
        workflowVersion: context.flowVersion
      }
    };
    const subject = payloadHelper.renderToString(this.subjectTemplate, payload);
    if (subject) { email.subject = subject; }

    const html = payloadHelper.renderToString(this.bodyTemplate, payload);
    if (html) { email.html = html; }

    const from = renderAddresses(this.fromTemplate, payload);
    if (from[0] && await this.isValidFromEmail(context, from[0].email)) {
      email.from = from[0];
    } else {
      email.from = { email: this.fallbackFromEmail(context) };
    }

    const replyTo = renderAddresses(this.replyToTemplate, payload);
    if (replyTo[0] && await this.isValidFromEmail(context, replyTo[0].email)) {
      email.replyTo = replyTo[0];
    }

    let availableRecipients = this.maxRecipients || Infinity;
    ['to', 'cc', 'bcc'].forEach((type) => {
      if (availableRecipients < 1) { return; }

      let addresses = renderAddresses(this[`${type}Addresses`], payload);
      if (addresses.length === 0) { return; }

      if (addresses.length > availableRecipients) {
        addresses = addresses.slice(0, availableRecipients);
      }
      availableRecipients -= addresses.length;
      email[type] = addresses;
    });

    let result;
    try {
      const { attachments, timeLeft } = await resolveAttachments(this, context, payload, 'SendGrid');
      email.attachments = attachments;

      const mailClient = createMailClient(apiKey);
      await timeoutP(timeLeft, mailClient.send(email));
      result = { message: 'success' };
    } catch (e) {
      if (isTimeoutError(e)) {
        throw errors.NodeTimeout({ title: 'SendGrid' });
      }

      if (e.response) {
        result = { error: e.response.body };
      } else {
        result = { error: e.message };
      }
    }
    if (this.resultPath) { payload = payloadHelper.set(this.resultPath, result, payload); }
    return [this.outputIds, payload];
  }

}

// the domains of from/reply to emails are not allowed
// to include the word losant
SendgridEmailNode.LOSANT_EMAIL_REGEXP = /@.*(l|i)osant.*/i;

export default SendgridEmailNode;
