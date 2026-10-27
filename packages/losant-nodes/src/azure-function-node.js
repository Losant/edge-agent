import * as payloadHelper from 'losant-handlebars';
import errors from 'losant-nodejs-utils/src/errors.js';
import axios from 'losant-nodejs-utils/src/axios.js';
import url from 'url';
import resolveValueByLookupType from './lib/resolve-value-by-lookup-type.js';
import { includes, isUndefined } from 'omnibelt';
import { MAX_RESPONSE_SIZE, MAX_RESPONSE_SIZE_DISPLAY_MB } from 'losant-nodejs-utils/src/utils/storage-helpers.js';
import isValidDomain from 'losant-nodejs-utils/src/utils/is-valid-domain.js';
import { isPublicIp } from 'losant-nodejs-utils/src/utils/ip-helpers.js';

class AzureFunctionNode {

  /* Example Config:
  {
    hostNameTemplate: <String - Required: host name of the Azure function app. Must be a valid domain name or a public IP address>,
    credentialNameTemplate: <String - Optional: template resolving to the name of the Azure credential to auth with. When set, its secret is used as the function key and apiKeyTemplate is ignored>,
    apiKeyTemplate: <String - Optional: API key for the Azure app or function. Sent as the code query parameter. Ignored when credentialNameTemplate is set>,
    functionNameTemplate: <String - Required: Azure function name>,
    sourceMethodTemplate: <String - Optional: template resolving to one of jsonTemplate|payloadPath|workflowPayload. How to construct the data sent to the function. Default workflowPayload (the whole payload is sent). Any other value throws a Validation error. jsonTemplate and payloadPath require sourceData>,
    sourceData: <String - Required for jsonTemplate|payloadPath: a JSON template or a payload path, depending on the source method. Ignored for workflowPayload>,
    isHttp: <Boolean - Optional: whether the function is HTTP triggered. Default true. HTTP functions are called at /api/<functionName>; non-HTTP functions are called at /admin/functions/<functionName>>,
    resultPath: <String - Optional: payload path for { body, statusCode, azureHeaders: { 'request-context' } } on a response, or { error: { type, message } } on a request failure. If blank, the result is discarded>
  }
  Notes:
  A single output is used (outputIds).
  The request is a POST over https. Any HTTP status code is treated as a response (check statusCode); a non-2xx status does not set error.
  Request failures (timeout, response larger than the size limit, network errors) do not throw: they are written to resultPath as { error }. Invalid source method, host name, function name, or source data throws.
  */

  constructor(id, outputIds, config) {
    this.id = id;
    this.outputIds = outputIds;
    this.isHttp = config.isHttp || isUndefined(config.isHttp);
    this.hostNameTemplate = config.hostNameTemplate;
    this.credentialNameTemplate = config.credentialNameTemplate;
    this.apiKeyTemplate = config.apiKeyTemplate;
    this.functionNameTemplate = config.functionNameTemplate;
    this.sourceMethodTemplate = config.sourceMethodTemplate || 'workflowPayload';
    this.sourceData = config.sourceData;
    this.resultPath = config.resultPath;
  }

  async run(context, payload) {
    const sourceMethod = payloadHelper.renderToString(this.sourceMethodTemplate, payload);
    if (!sourceMethod || !includes(sourceMethod, ['payloadPath', 'jsonTemplate', 'workflowPayload'])) {
      throw errors.Validation({ message: 'Invalid Source Method' });
    }
    const host = payloadHelper.renderToString(this.hostNameTemplate, payload);
    if (!host) {
      throw errors.Validation({ message: 'Host Name is required' });
    }
    if (!isValidDomain(host) && !isPublicIp(host)) {
      throw errors.Validation({ message: `Host Name is invalid: ${host}` });
    }

    let apiKey;
    if (this.credentialNameTemplate) {
      apiKey = await context.loadCredential({
        credentialNameTemplate: this.credentialNameTemplate,
        type: 'azure',
        applicationId: context.applicationId,
        payload,
        secretOnly: true
      });
    } else {
      apiKey = payloadHelper.renderToString(this.apiKeyTemplate, payload);
    }

    const functionName = payloadHelper.renderToString(this.functionNameTemplate, payload);
    if (!functionName) {
      throw errors.Validation({ message: 'Function Name is required' });
    }
    const folder = this.isHttp && '/api/' || '/admin/functions/';
    const body = resolveValueByLookupType({
      lookupType: sourceMethod,
      inputValue: this.sourceData,
      payload,
      title: 'Source Data',
      errorOnMissing: true,
      defaultLookup: 'workflowPayload'
    });

    const options = {
      method: 'POST',
      url: url.format({
        protocol: 'https',
        hostname: host,
        pathname: folder+functionName,
        query: { code: apiKey }
      }),
      data: JSON.stringify(body),
      maxContentLength: MAX_RESPONSE_SIZE,
      timeout: context.externalTimeout
    };

    let result;
    try {
      const resolved = await axios(options, {
        allStatusCodesAreValid: true,
        parseAsLJson: true
      });
      result = {
        body: resolved.data,
        statusCode: resolved.status,
        azureHeaders: { 'request-context': resolved.headers['request-context'] }
      };
    } catch (e) {
      let err = e;
      if (e.code === 'ETIMEDOUT' || (e.code === 'ECONNABORTED' && includes('timeout', e.message))) {
        err = errors.NodeTimeout({ title: 'Azure Function' });
      } else if (includes('maxContentLength', e.message)) {
        err = errors.TooLarge({
          maximum: MAX_RESPONSE_SIZE_DISPLAY_MB,
          size: MAX_RESPONSE_SIZE_DISPLAY_MB,
          title: 'Response Body'
        });
      }
      result = { error: { type: err.type, message: err.message } };
    }
    if (this.resultPath) { payload = payloadHelper.set(this.resultPath, result, payload); }

    return [this.outputIds, payload];
  }
}

export default AzureFunctionNode;
