import * as payloadHelper from 'losant-handlebars';
import errors from 'losant-nodejs-utils/src/errors.js';
import { renderAddresses, resolveAttachments } from './lib/email-helpers.js';
import FormData from 'form-data';
import axios from 'losant-nodejs-utils/src/axios.js';
import { isTimeoutError } from './lib/common.js';

const addressObjToString = (addrObj) => {
  return addrObj.name ? `${addrObj.name} <${addrObj.email}>` : addrObj.email;
};

class MailgunEmailNode {

  /* Example Config:
  {
    mailgunApiKey: <String - Required unless credentialNameTemplate is set: template for the Mailgun API key>,
    credentialNameTemplate: <String - Optional: template for the name of a Mailgun credential supplying the API key. When set, mailgunApiKey is ignored>,
    mailgunRegion: <String - Optional: Mailgun region (us|eu). Default us>,
    bodyTemplate: <String - Optional: template for the HTML body of the email. Omitted from the request if it renders empty>,
    subjectTemplate: <String - Optional: template for the subject of the email. Omitted from the request if it renders empty>,
    fromTemplate: <String - Required: template for the from email address. The domain part is the Mailgun sending domain>,
    replyToTemplate: <String - Optional: template for reply to email address>,
    resultPath: <String - Optional: payload path for the Mailgun response, or { error } if the request failed>,
    toAddresses: [
      1 or more of:
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
      0 or more of:
      {
        urlTemplate: <String - Optional: template for url to download content from>,
        contentTemplate: <String - Optional: template for attachment content>,
        filenameTemplate: <String - Optional: template for the filename>
      }
    ]
  }
  Notes:
    A missing API key or from address throws. A timeout throws.
    Other request failures do not throw. { error: message } is written to resultPath instead.
    At most 10 attachments are allowed, and attachment size is limited; see lib/email-helpers.js.
  */

  constructor(id, outputIds, config) {
    this.id = id;
    this.outputIds = outputIds;
    this.mailgunApiKey = config.mailgunApiKey;
    this.credentialNameTemplate = config.credentialNameTemplate;
    this.mailgunRegion = config.mailgunRegion;
    this.bodyTemplate = config.bodyTemplate;
    this.subjectTemplate = config.subjectTemplate;
    this.fromTemplate = config.fromTemplate;
    this.replyToTemplate = config.replyToTemplate;
    this.toAddresses = config.toAddresses;
    this.ccAddresses = config.ccAddresses;
    this.bccAddresses = config.bccAddresses;
    this.attachments = config.attachments || [];
    this.resultPath = config.resultPath;
  }

  async run(context, payload) {
    let apiKey;
    if (this.credentialNameTemplate) {
      apiKey = await context.loadCredential({
        credentialNameTemplate: this.credentialNameTemplate,
        type: 'mailgun',
        applicationId: context.applicationId,
        payload,
        secretOnly: true
      });
    } else {
      apiKey = payloadHelper.renderToString(this.mailgunApiKey, payload).trim();
      if (!apiKey) { throw errors.MissingField({ title: 'Mailgun API Key' }); }
    }

    const formData = new FormData();
    formData.append('v:applicationId', context.applicationId);
    formData.append('v:workflowId', context.flowId);
    formData.append('v:workflowVersion', context.flowVersion);

    const subject = payloadHelper.renderToString(this.subjectTemplate, payload);
    if (subject) { formData.append('subject', subject); }

    const html = payloadHelper.renderToString(this.bodyTemplate, payload);
    if (html) { formData.append('html', html); }

    const from = renderAddresses(this.fromTemplate, payload);
    if (!from[0]) {
      throw errors.MissingField({ title: 'From Address' });
    }
    formData.append('from', addressObjToString(from[0]));
    const sendingDomain = from[0].email.split('@').at(-1);

    const replyTo = renderAddresses(this.replyToTemplate, payload);
    if (replyTo[0]) {
      formData.append('h:Reply-To', addressObjToString(replyTo[0]));
    }

    ['to', 'cc', 'bcc'].forEach((type) => {
      const addresses = renderAddresses(this[`${type}Addresses`], payload);
      if (addresses.length === 0) { return; }
      formData.append(type, addresses.map(addressObjToString).join(', '));
    });

    let result;
    try {
      const { attachments, timeLeft } = await resolveAttachments(this, context, payload, 'Mailgun');
      attachments.forEach((attachment) => {
        formData.append('attachment', Buffer.from(attachment.content, 'base64'), { contentType: attachment.type, filename: attachment.filename });
      });

      const response = await axios({
        url:  `https://api.${this.mailgunRegion === 'eu' ? 'eu.' : ''}mailgun.net/v3/${encodeURIComponent(sendingDomain)}/messages`,
        method: 'POST',
        timeout: timeLeft,
        data: formData,
        headers: formData.getHeaders(),
        auth: {
          username: 'api',
          password: apiKey
        }
      });
      result = response.data;
    } catch (e) {
      if (isTimeoutError(e)) {
        throw errors.NodeTimeout({ title: 'Mailgun' });
      }
      if (e.response) {
        result = { error: e.response.data?.message || e.response.statusText };
      } else {
        result = { error: e.message };
      }
    }
    if (this.resultPath) { payload = payloadHelper.set(this.resultPath, result, payload); }
    return [this.outputIds, payload];
  }

}

export default MailgunEmailNode;
