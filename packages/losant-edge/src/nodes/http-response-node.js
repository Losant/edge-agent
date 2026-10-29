import fs from 'fs-extra';
import * as payloadHelper from 'losant-handlebars';
import { is, isNilOrEmpty, mapRejectNil } from 'omnibelt';

import { mapRejectNilKeyValTemplates } from '../utils.js';

class HttpResponseNode {

  /* Example Config:
  {
    bodyTemplate: <String - Optional: template for the response body. Used when bodyTemplateType is string or path. Empty body when omitted>,
    bodyTemplateType: <String - Optional: how to interpret bodyTemplate (string|path|payload|diskPath). Default string. string renders it as a template, path sends the value at that payload path, payload sends the entire payload (bodyTemplate is ignored), diskPath streams the file at bodyTemplate as the response body. Non-string, non-diskPath bodies are JSON-serialized>,
    headerInfo: [
      0 or more of:
      { keyTemplate: <String - Required: template for header key name>,
        valueTemplate: <String - Required: template for header value> }
    ],
    cookieInfo: [
      0 or more of:
      { nameTemplate: <String - Required: template for cookie name. Entries with an empty rendered name are skipped>,
        valueTemplate: <String - Optional: template for cookie value>,
        maxAgeTemplate: <String - Optional: template for cookie expiration in seconds. Only applied when a value is set and it renders to a positive number>,
        pathTemplate: <String - Optional: template for cookie path> }
    ],
    responseCodeTemplate: <String - Optional: template for the HTTP response code. Default 200, also used when the template does not render to a number>
  }
  Notes:
    This node is a no-op (the payload passes through unchanged) unless the workflow was triggered by a request that expects a reply,
    meaning context.originalPayload.data.replyId exists and is not empty.
    No result is written to the payload. The payload is passed unchanged to all outputIds.
  */

  constructor(id, outputIds, config) {
    this.id = id;
    this.outputIds = outputIds;
    this.bodyTemplate = config.bodyTemplate;
    this.bodyTemplateType = config.bodyTemplateType || 'string';
    this.headerInfo = config.headerInfo || [];
    this.cookieInfo = config.cookieInfo || [];
    this.responseCodeTemplate = config.responseCodeTemplate;
  }

  async run(context, payload) {
    const replyId = payloadHelper.lookup('data.replyId', context.originalPayload);
    if (isNilOrEmpty(replyId)) { return [this.outputIds, payload]; }

    let body = '';
    if (this.bodyTemplateType === 'payload') {
      body = payload;
    } else if (this.bodyTemplateType === 'diskPath') {
      const renderedPath = payloadHelper.renderToString(this.bodyTemplate, payload);
      const { realPath } = await context.diskUtils.guardFileReadPath(renderedPath);
      body = fs.createReadStream(realPath);
    } else if (this.bodyTemplate) {
      if (this.bodyTemplateType === 'path') {
        body = payloadHelper.lookup(this.bodyTemplate, payload);
      } else {
        body = payloadHelper.render(this.bodyTemplate, payload);
      }
    }
    if (this.bodyTemplateType !== 'diskPath' && !is(String, body)) {
      body = JSON.stringify(body) || '';
    }
    const headers = mapRejectNilKeyValTemplates(this.headerInfo, payload);

    const cookies = mapRejectNil(({ nameTemplate, valueTemplate, maxAgeTemplate, pathTemplate }) => {
      if (isNilOrEmpty(nameTemplate)) { return; }
      const name = payloadHelper.renderToString(nameTemplate, payload).trim();
      if (isNilOrEmpty(name)) { return; }

      const cookie = { name };

      const path = payloadHelper.renderToString(pathTemplate, payload).trim();
      if (!isNilOrEmpty(path)) { cookie.path = path; }

      const value = payloadHelper.renderToString(valueTemplate, payload);
      if (!isNilOrEmpty(value)) {
        cookie.value = value;
        const ttl = parseInt(payloadHelper.render(maxAgeTemplate, payload), 10);
        if (isFinite(ttl) && ttl > 0) { cookie.ttl = ttl; }
      }

      return cookie;
    }, this.cookieInfo);

    let responseCode = parseInt(payloadHelper.render(this.responseCodeTemplate, payload), 10);
    if (!isFinite(responseCode)) { responseCode = 200; }

    const response = { body, headers, responseCode, cookies };
    context.flowHttpResponse(replyId, response);

    return [this.outputIds, payload];
  }

}


export default HttpResponseNode;
