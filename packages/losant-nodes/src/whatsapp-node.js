import * as payloadHelper from 'losant-handlebars';
import resolvePhoneNumbers from './lib/resolve-phone-numbers.js';
import axios from 'losant-nodejs-utils/src/axios.js';
import { mapSerialP, isPlainObject } from 'omnibelt';
import errors from 'losant-nodejs-utils/src/errors.js';
import resolveValueByLookupType from './lib/resolve-value-by-lookup-type.js';
import { isTimeoutError, getExternalTimeout } from './lib/common.js';

const MAX_TO_NUMBERS = 100;

class WhatsAppNode {

  /* Example Config:
  { credentialNameTemplate: <String - Optional: name template of the WhatsApp credential to auth with. If set, accessTokenTemplate and fromNumberIdTemplate are ignored>,
    accessTokenTemplate: <String - Required unless credentialNameTemplate is set: WhatsApp access token>,
    fromNumberIdTemplate: <String - Required unless credentialNameTemplate is set: template for the phone number id to send from>,
    toNumberTemplates: [
      0 or more of:
      <String - Required: template for the phone number to send to>
    ],

    messageSourceMethod: <String - Optional: how messageSourceValue is resolved (payloadPath|jsonTemplate|stringTemplate). Default stringTemplate>,
    messageSourceValue: <String - Required unless templateNameTemplate is set: data for the message>,

    templateNameTemplate: <String - Optional: name of the message template to use. If not set, a plain text message is sent>,
    templateLanguageTemplate: <String - Optional: language of the message template. Default en_US. Only used with templateNameTemplate>,

    resultsPath: <String - Optional: payload path for the results array> }

    Notes: if templateNameTemplate is provided,
      messageSourceValue should resolve to an array of objects or a single object (the template components).
      It may be left empty to send the template without components.
      Otherwise messageSourceValue should resolve to a string (the text of the message). A non-string value is sent as JSON.
    A maximum of 100 numbers is allowed or the node throws. Missing credentials or message content throw.
    resultsPath receives an array with one entry per toNumberTemplates entry, in order.
    Successful sends are { success: true, number, messageId }.
    Failures are { error: true, number, message } and do not throw; invalid or duplicate numbers,
    timeouts, and WhatsApp errors are reported this way.
  */

  constructor(id, outputIds, config) {
    this.id = id;
    this.outputIds = outputIds;
    this.credentialNameTemplate = config.credentialNameTemplate;
    this.accessTokenTemplate = config.accessTokenTemplate;
    this.fromNumberIdTemplate = config.fromNumberIdTemplate;
    this.toNumberTemplates = config.toNumberTemplates || [];
    this.messageSourceMethod = config.messageSourceMethod;
    this.messageSourceValue = config.messageSourceValue;
    this.templateNameTemplate = config.templateNameTemplate;
    this.templateLanguageTemplate = config.templateLanguageTemplate;
    this.resultsPath = config.resultsPath;
  }

  resolveCredentials(context, payload) {
    if (this.credentialNameTemplate) {
      return context.loadCredential({
        credentialNameTemplate: this.credentialNameTemplate,
        type: 'whatsapp',
        applicationId: context.applicationId,
        payload
      });
    } else {
      const accessToken = payloadHelper.renderToString(this.accessTokenTemplate, payload).trim();
      if (!accessToken) {
        throw errors.MissingField({ title: 'Access Token' });
      }
      const fromNumberId = payloadHelper.renderToString(this.fromNumberIdTemplate, payload);
      if (!fromNumberId) {
        throw errors.MissingField({ title: 'From Number ID' });
      }
      return { accessToken, fromNumberId };
    }
  }

  async run(context, payload) {
    const { accessToken, fromNumberId } = await this.resolveCredentials(context, payload);

    const toNumbers = resolvePhoneNumbers(this.toNumberTemplates, payload);
    if (toNumbers.length > MAX_TO_NUMBERS) {
      throw errors.Validation({
        message: `Maximum number of To Numbers is ${MAX_TO_NUMBERS}.`
      });
    }

    let templateLang, templateName;
    if (this.templateNameTemplate) {
      templateName = payloadHelper.renderToString(this.templateNameTemplate, payload);
      if (!templateName) {
        throw errors.MissingField({ title: 'Template Name' });
      }
      templateLang = payloadHelper.renderToString(this.templateLanguageTemplate, payload) || 'en_US';
    }

    let messageSource = resolveValueByLookupType({
      lookupType: this.messageSourceMethod,
      inputValue: this.messageSourceValue,
      payload,
      title: 'Message Source',
      blankJsonToUndefined: true
    });

    let baseMessage;
    if (templateName) {
      if (!messageSource) { messageSource = []; }
      if (!Array.isArray(messageSource)) { messageSource = [messageSource]; }
      if (!messageSource.every((component) => isPlainObject(component))) {
        throw errors.Validation({
          message: 'All message template components must be objects.'
        });
      }

      baseMessage = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        type: 'template',
        template: {
          name: templateName,
          language: {
            code: templateLang
          },
          components: messageSource
        }
      };
    } else {
      if (typeof(messageSource) !== 'string') {
        messageSource = JSON.stringify(messageSource);
      }
      if (!messageSource) {
        throw errors.Validation({ message: 'A message must be provided.' });
      }

      baseMessage = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        type: 'text',
        text: {
          preview_url: false,
          body: messageSource
        }
      };
    }

    const baseRequest = {
      url: `https://graph.facebook.com/v19.0/${fromNumberId}/messages`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    };

    const sentNumbers = new Set();
    const start = Date.now();
    const maxAllowedTime = getExternalTimeout(context, start);
    let timeLeft = maxAllowedTime;
    const results = await mapSerialP(async (toNumber) => {
      if (timeLeft <= 0) {
        return { error: true, number: toNumber.parsed || toNumber.orig, message: 'Timeout' };
      }
      if (!toNumber.parsed) {
        return { error: true, number: toNumber.orig, message: 'Phone number invalid' };
      }
      if (sentNumbers.has(toNumber.parsed)) {
        return { error: true, number: toNumber.parsed, message: 'Duplicate phone number' };
      }
      sentNumbers.add(toNumber.parsed);

      const data = {
        ...baseMessage,
        to: toNumber.parsed
      };

      let result;
      try {
        const sendResult = await axios({
          ...baseRequest,
          data,
          timeout: timeLeft
        }, { allStatusCodesAreValid: true });
        if (sendResult.status === 200) {
          result = { success: true, number: toNumber.parsed, messageId: sendResult.data?.messages?.[0]?.id };
        } else {
          result = {
            error: true,
            number: toNumber.parsed,
            message: sendResult.data?.error?.message || `${sendResult.status} Error from WhatsApp`
          };
        }
      } catch (err) {
        result = {
          error: true,
          number: toNumber.parsed,
          message: isTimeoutError(err) ? 'Timeout' : (err.message || 'Error from WhatsApp')
        };
      }

      timeLeft = maxAllowedTime - (Date.now() - start);
      return result;
    }, toNumbers);

    if (this.resultsPath) { payload = payloadHelper.set(this.resultsPath, results, payload); }
    return [this.outputIds, payload];
  }

}

export default WhatsAppNode;
