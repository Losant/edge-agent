import {
  __, always,
  equals, compose, isNil, isNotNil,
  concat, isPopulatedString, pick, evolve,
  toInteger, when, either, clamp,
  curryN, isNilOrEmpty, multiply,
  prop, updateKeys, toUpper, includes, omit,
  toNumber
} from 'omnibelt';
import https from 'https';
import * as payloadHelper from 'losant-handlebars';
import LJSON from 'losant-nodejs-utils/src/ljson.js';
import axios from 'losant-nodejs-utils/src/axios.js';
import errors from 'losant-nodejs-utils/src/errors.js';
import FormData from 'form-data';
import qs from 'qs';
import { validateEncoding } from 'losant-nodejs-utils/src/utils/validate-encoding.js';
import { MAX_RESPONSE_SIZE, MAX_RESPONSE_SIZE_DISPLAY_MB, writeFileToDisk } from 'losant-nodejs-utils/src/utils/storage-helpers.js';
import { getBasicAuthValue, fpThrowT, isTimeoutError } from './lib/common.js';
import { REDACTED_PLACEHOLDER } from 'losant-nodejs-utils/src/utils/redactor.js';
import ensureValidHttpUri from 'losant-nodejs-utils/src/utils/ensure-valid-uri.js';
import ljsonRender from './lib/ljson-render.js';
import fs from 'fs-extra';
import { getFlagOption, renderAndValidateWriteToDiskPath, renderAndValidateReadFromDiskPath } from './lib/node-storage-helpers.js';

const DEFAULT_NAME = 'Losant';

const ALLOWED_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD']);
const METHODS_WITH_BODY = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// :: Any -> Boolean
const is0 = equals(0);

// :: Error -> Object
const errorToObject = compose(
  evolve({ message: LJSON.safeParse }),
  pick(['name', 'message'])
);

// :: Any -> Number
const defaultToNonZero = (defaultVal) => when(
  either(isNil, is0),
  always(defaultVal)
);
// this function considers what axios gives back
// and then transforms the results in the original way we were handing requests back with the deprecated lib request
// for instance axios uses data, request uses body
// axios uses url, request uses uri
// :: RequestResponse -> NodeRequestResponse
const getRequestFromRequestResponse = compose(
  evolve({
    body: LJSON.safeParse, // original to when using request
    method: toUpper // axios returns method in lowercase from request returned in upper case.
  }),
  (obj) => {
    if (typeof obj.body !== 'string' && !Buffer.isBuffer(obj.body)) {
      delete obj.body;
    }
    if (obj.headers?.toJSON) {
      const headers = { ...obj.headers.toJSON() };
      if (isNotNil(headers['Content-Length'])) {
        headers['Content-Length'] = toNumber(headers['Content-Length']);
      }
      obj.headers = headers;
    }
    return obj;
  },
  updateKeys({
    url: 'uri', // request gives back a uri, and axios gives back and wants a url
    data: 'body' // axios does not take a body, it takes data, whereas request gives a body.
  }),
  pick([
    'method',
    'data',
    'url',
    'headers'
  ]),
  prop('config')
);

// :: NodeParams -> NodeRequestResponse
const getRequestFromNodeParams = compose(
  updateKeys({
    data: 'body', // axios does not take a body, it takes data, whereas request gives a body.
    url: 'uri' // axios wants a url, request wanted a uri
  }),
  pick([
    'method',
    'url',
    'data',
    'headers',
    'timeout',
    'bodyUrl'
  ])
);

const addRequestLikeInfo = (config, node, requestEncoding, redactor) => {
  config.strictSSL = !node.disableSSLVerification; // backwards for request use to take option strictSSL
  if (config.body && Buffer.isBuffer(config.body)) {
    config.body = config.body.toString(requestEncoding);
  }

  if (redactor) {
    redactor(config);
  }

  return config;
};

const validValues = {
  errorBehavior: new Set(['throw', 'payloadPath']),
  authType: new Set(['none', 'basic', 'clientCert', 'credential'])
};
const validBodyTypes = new Set(['none', 'string', 'multipart', 'urlencoded', 'url', 'jsonTemplate', 'diskPath']);

const addHeader = (headerNameMap, headers, name, value, replace = false) => {
  const normalizedHeaderName = String(name).toLowerCase().trim();
  let currentNames = headerNameMap.get(normalizedHeaderName);
  if (!currentNames) {
    currentNames = new Set();
    headerNameMap.set(normalizedHeaderName, currentNames);
  }

  if (!replace && currentNames.size) {
    return false;
  }

  currentNames.add(name);
  headers[name] = value;

  return true;
};

const bodyEvaluators = {
  string: ({ node, payload, nodeParams }) => {
    if (!node.bodyTemplate) { return; }
    const body = payloadHelper.renderToString(node.bodyTemplate, payload);
    nodeParams.requestEncoding = payloadHelper.renderToString(node.requestEncodingTemplate, payload);
    validateEncoding(nodeParams.requestEncoding, body);
    nodeParams.data = Buffer.from(body, nodeParams.requestEncoding);
  },
  multipart: ({ node, payload, nodeParams, headerNameMap }) => {
    const formData = new FormData();
    if (Array.isArray(node.bodyFields) && node.bodyFields.length) {
      node.bodyFields.forEach(({ keyTemplate, valueTemplate }) => {
        const key = payloadHelper.renderToString(keyTemplate, payload);
        if (!key) { return; }

        let value = payloadHelper.render(valueTemplate, payload);
        if (value === undefined) { return; }
        // can't add anything other than strings to formData, so nicely stringify objects/arrays
        value = typeof(value) === 'string' ? value : JSON.stringify(value);

        formData.append(key, value);
      });
    }
    nodeParams.data = formData.getBuffer();
    addHeader(headerNameMap, nodeParams.headers, 'Content-Type', `multipart/form-data; boundary=${formData.getBoundary()}`);
  },
  urlencoded: ({ node, payload, nodeParams, headerNameMap }) => {
    const bodyStrings = [];
    if (Array.isArray(node.bodyFields) && node.bodyFields.length) {
      let bodyObj = {};
      node.bodyFields.forEach(({ keyTemplate, valueTemplate }) => {
        const key = payloadHelper.renderToString(keyTemplate, payload);
        if (!key) { return; }

        const value = payloadHelper.render(valueTemplate, payload);
        if (value === undefined) { return; }

        if (bodyObj[key] !== undefined) {
          bodyStrings.push(qs.stringify(bodyObj));
          bodyObj = {};
        }

        bodyObj[key] = value;
      });
      bodyStrings.push(qs.stringify(bodyObj));
    }
    nodeParams.data = bodyStrings.join('&');
    addHeader(headerNameMap, nodeParams.headers, 'Content-Type', 'application/x-www-form-urlencoded;charset=utf-8');
  },
  url: async ({ node, payload, nodeParams }) => {
    const bodyUrl = payloadHelper.renderToString(node.bodyTemplate, payload);
    ensureValidHttpUri(bodyUrl);

    let upStream;
    try {
      upStream = await axios({
        url: bodyUrl,
        method: 'GET',
        responseType: 'stream',
        timeout: nodeParams.timeout,
        headers: {
          'User-Agent': nodeParams.headers['User-Agent']
        }
      });
    } catch (err) {
      if (isTimeoutError(err)) {
        throw errors.NodeTimeout({ title: 'HTTP' });
      } else {
        if (err.name !== 'ValidationError') {
          err.name = concat('Http', err.name);
        }
        throw err;
      }
    }

    nodeParams.bodyUrl = bodyUrl;
    nodeParams.data = upStream.data;
  },
  jsonTemplate: ({ node, payload, nodeParams, headerNameMap }) => {
    if (!node.bodyTemplate) { return; }
    const body = ljsonRender(node.bodyTemplate, payload, 'bodyTemplate', true);
    if (body === undefined) { return; }
    nodeParams.data = JSON.stringify(body);
    addHeader(headerNameMap, nodeParams.headers, 'Content-Type', 'application/json');
  },
  diskPath: async ({ node, payload, nodeParams, context }) => {
    const diskPath = await renderAndValidateReadFromDiskPath(node, context, payload, { fieldName: 'bodyTemplate' });
    nodeParams.requestEncoding = payloadHelper.renderToString(node.requestEncodingTemplate, payload);
    validateEncoding(nodeParams.requestEncoding);
    nodeParams.bodyDiskPath = diskPath;
    nodeParams.data = fs.createReadStream(diskPath, { encoding: nodeParams.requestEncoding });
  }
};


class HttpNode {

  /* Example Config:
  {
    method: <String - Optional: Template that renders to one of GET|POST|PUT|PATCH|DELETE|HEAD. Default GET>,
    uriTemplate: <String - Required: Template for the request URI>,
    responsePath: <String - Optional: Payload path where the response is written. See Notes>,
    errorBehavior: <String - Optional: One of throw|payloadPath, behavior when the node has errors. Default throw (edge >= 1.1.1)>,
    errorPath: <String - Optional: Only used when errorBehavior is payloadPath. Payload path where HTTP errors are written (edge >= 1.1.1)>,
    diskPathTemplate: <String - Optional: Only available on edge. If set, the response body is written to this location>,
    shouldAppend: <Boolean - Optional: Only used with diskPathTemplate. If true, the response is appended to the file rather than overwriting it. Default false>,
    errorIfFileExists: <Boolean - Optional: Only used with diskPathTemplate. If true, the request fails if the file already exists. If false, an existing file is written over. Default false>,
    bodyType: <String - Optional: Type of the request body. One of string|multipart|urlencoded|none|url|jsonTemplate|diskPath. Default string>,
    bodyTemplate: <String - Optional: Template for the body. Used by bodyType string and jsonTemplate. For bodyType url it is the URL to download and send as the body, and for bodyType diskPath it is the path of the file to send>,
    bodyFields: [
      0 or more of (used by bodyType multipart and urlencoded):
      { keyTemplate: <String - Required: template for field name>,
        valueTemplate: <String - Required: template for field value> }
    ],
    timeoutTemplate: <String - Optional: Template for the HTTP timeout in seconds. Defaults to, and is capped at, the maximum external call time (30 seconds by default) (edge >= 1.1.1)>,
    disableSSLVerification: <Boolean - Optional: Default false>,
    disableRedirects: <Boolean - Optional: When true, returns 3xx responses instead of following the redirect. Default false (edge >= 1.50.1)>,
    caCertTemplate: <String - Optional: Template for the CA Cert (edge >= 1.5.0)>,
    authType: <String - Optional: One of none|basic|clientCert|credential. Default none>,
    authCredentials: <Object - Optional:
      if basic auth - Username + Password sent with authenticated requests (expected: { usernameTemplate: 'foo', passwordTemplate: 'bar' })
      if client cert auth (edge >= 1.5.0) - Key + Cert used for client cert authentication (expected: { keyTemplate: 'foo', certTemplate: 'bar' })
    >,
    credentialNameTemplate: <String - Required when authType is credential: Template for the name of the credential to auth with>,
    headerInfo: [
      0 or more of:
      { key: <String - Required: header name. Not templated>,
        valueTemplate: <String - Required: template for header value> }
    ],
    encodingTemplate: <String - Optional: Template for the encoding used to interpret the response body. Default utf8>,
    requestEncodingTemplate: <String - Optional: Template for the encoding used to interpret the request body. Default utf8. Only used by bodyType string and diskPath>
  }
  Notes:
    The request body is only sent for POST, PUT, PATCH and DELETE requests.
    Result: When responsePath is set, { requestDuration, request, statusCode, headers, body } is written there.
      body is the parsed response body, or the disk path the body was written to if diskPathTemplate is set.
      Responses with any status code are treated as successful.
    Errors: With errorBehavior throw, errors are thrown. With errorBehavior payloadPath, { request, error: { name, message } }
      is written to errorPath (if set) and the node continues.
  */

  constructor(id, outputIds, config) {
    this.id = id;
    this.outputIds = outputIds;
    this.method = config.method || 'GET';
    this.responsePath = config.responsePath;
    this.diskPathTemplate = config.diskPathTemplate;
    this.shouldAppend = config.shouldAppend || false;
    this.errorIfFileExists = config.errorIfFileExists || false;
    this.errorBehavior = config.errorBehavior || 'throw';
    this.errorPath = config.errorPath;
    this.uriTemplate = config.uriTemplate;
    this.bodyType = config.bodyType || 'string';
    this.bodyTemplate = config.bodyTemplate;
    this.bodyFields = config.bodyFields || [];
    this.timeoutTemplate = config.timeoutTemplate; // Defaulted during `run`
    this.headerInfo = config.headerInfo || [];
    this.disableRedirects = config.disableRedirects || false;
    this.disableSSLVerification = config.disableSSLVerification || false;
    this.caCertTemplate = config.caCertTemplate;
    this.authType = config.authType || 'none';
    this.authCredentials = config.authCredentials || {};
    this.credentialNameTemplate = config.credentialNameTemplate;
    this.encodingTemplate = config.encodingTemplate || 'utf8';
    this.requestEncodingTemplate = config.requestEncodingTemplate || 'utf8';
  }

  async run(context, payload) {
    // NOTE: Putting all the non-throwing request params up top gives the most context
    //       possible when throwing for validation reason.
    const nodeParams = {
      headers: {},
      maxContentLength: MAX_RESPONSE_SIZE,
      requestEncoding: 'utf8'
    };
    if (this.disableRedirects) {
      nodeParams.maxRedirects = 0;
    }
    const headerNameMap = new Map();
    const agentOptions = {
      ecdhCurve: 'auto',
      secureProtocol: 'TLS_method', // allow TLS 1.0 and 1.1
      ciphers: 'DEFAULT@SECLEVEL=0' // openSSL 3.0 by default no longer allows 1.0 and 1.1 at security level 1 only 0.
    };
    let configRedactor;

    try {
      const render = curryN(2, payloadHelper.render)(__, payload);
      const renderToNumber = compose(toInteger, render);
      const renderToString = curryN(2, payloadHelper.renderToString)(__, payload);

      Object.keys(validValues).forEach((field) => {
        if (!validValues[field].has(this[field])) {
          throw errors.Validation({
            message: `Invalid ${field} "${this[field]}". Must be one of: ${Array.from(validValues[field])}`
          });
        }
      });

      if (!validBodyTypes.has(this.bodyType)) {
        throw errors.Validation({
          message: `Invalid bodyType "${this.bodyType}". Must be one of: ${Array.from(validBodyTypes)}`
        });
      }

      nodeParams.method = renderToString(this.method).trim().toUpperCase();
      if (!ALLOWED_METHODS.has(nodeParams.method)) {
        throw errors.Validation({
          message: `Invalid method "${nodeParams.method}". Must be one of: ${Array.from(ALLOWED_METHODS)}`
        });
      }

      this.headerInfo.forEach(({ key, valueTemplate }) => {
        if (!key) { return; } // header keys are not templated; skip entries with no key
        const headerVal = renderToString(valueTemplate);
        if (headerVal) {
          addHeader(headerNameMap, nodeParams.headers, key, headerVal, true);
        }
      });

      addHeader(headerNameMap, nodeParams.headers, 'User-Agent', `${context.whitelabel?.name || DEFAULT_NAME}Workflow/${context.flowId}`);

      if (isPopulatedString(this.caCertTemplate)) {
        agentOptions.ca = renderToString(this.caCertTemplate);
      }

      if (this.disableSSLVerification) {
        agentOptions.rejectUnauthorized = false;
      }

      nodeParams.timeout = compose(
        clamp(0, context.externalTimeout),
        defaultToNonZero(context.externalTimeout),
        multiply(1000),
        renderToNumber
      )(this.timeoutTemplate);

      nodeParams.url = compose(
        when(
          isNilOrEmpty,
          fpThrowT(errors.MissingField({ title: 'URI' }))
        ),
        renderToString
      )(this.uriTemplate);

      nodeParams.responseEncoding = renderToString(this.encodingTemplate);
      validateEncoding(nodeParams.responseEncoding);

      if (this.authType === 'basic') {
        const basicAuthUsername = this.authCredentials.usernameTemplate && renderToString(this.authCredentials.usernameTemplate) || '';
        const basicAuthPassword = this.authCredentials.passwordTemplate && renderToString(this.authCredentials.passwordTemplate) || '';
        addHeader(headerNameMap, nodeParams.headers, 'Authorization', getBasicAuthValue(basicAuthUsername, basicAuthPassword));
      } else if (this.authType === 'clientCert') {
        agentOptions.key = renderToString(this.authCredentials.keyTemplate);
        agentOptions.cert = renderToString(this.authCredentials.certTemplate);
      } else if (this.authType === 'credential') {
        const credInfo = await context.loadCredential({
          credentialNameTemplate: this.credentialNameTemplate,
          type: 'http',
          applicationId: context.applicationId,
          payload
        });
        const parsedUri = context.validateAgainstCredentialUri(nodeParams.url, credInfo.uriMatch);

        if (credInfo.authMethod === 'header' || credInfo.authMethod === 'basicAuth') {
          if (credInfo.authMethod === 'basicAuth') {
            credInfo.secretValue = getBasicAuthValue(credInfo.publicValue, credInfo.secretValue);
            credInfo.publicValue = 'Authorization';
          }
          const wasAdded = addHeader(headerNameMap, nodeParams.headers, credInfo.publicValue, credInfo.secretValue);
          if (!wasAdded) {
            throw errors.Validation({ message: `Credential attempted to add a duplicate header of name ${credInfo.publicValue}.` });
          }
          configRedactor = (payloadConfig) => { payloadConfig.headers[credInfo.publicValue] = REDACTED_PLACEHOLDER; };
        } else if (credInfo.authMethod === 'queryParam') {
          if (parsedUri.searchParams.has(credInfo.publicValue)) {
            throw errors.Validation({ message: `Credential attempted to add a duplicate query param of name ${credInfo.publicValue}.` });
          }
          parsedUri.searchParams.set(credInfo.publicValue, REDACTED_PLACEHOLDER);
          const redactedUri = parsedUri.toString();
          parsedUri.searchParams.set(credInfo.publicValue, credInfo.secretValue);
          nodeParams.url = parsedUri.toString();
          configRedactor = (payloadConfig) => { payloadConfig.uri = redactedUri; };
        } else if (credInfo.authMethod === 'clientCertificate') {
          agentOptions.cert = credInfo.publicValue;
          agentOptions.key = credInfo.secretValue;
          // no redaction needed
        }
      }

      const beforeBodyEval = Date.now();
      if (METHODS_WITH_BODY.has(nodeParams.method)) {
        const bodyEvaluator = bodyEvaluators[this.bodyType];
        if (bodyEvaluator) {
          await bodyEvaluator({ node: this, payload, nodeParams, headerNameMap, context });
        }
      }

      const reqOptions = omit(['requestEncoding', 'bodyUrl', 'bodyDiskPath'], {
        ...nodeParams,
        headers: { ...nodeParams.headers }
      });

      if (!headerNameMap.has('accept-encoding')) {
        // adding this cause otherwise axios adds this by default
        // as "gzip, compress, deflate, br"
        reqOptions.headers['Accept-Encoding'] = false;
      }
      if (!headerNameMap.has('content-type')) {
        // adding this cause otherwise axios adds this by default
        // as "application/x-www-form-urlencoded"
        reqOptions.headers['Content-Type'] = false;
      }
      reqOptions.httpsAgent = new https.Agent(agentOptions);

      // adjust timeout for time spent in evaluating body
      const beforeRequest = Date.now();
      reqOptions.timeout = reqOptions.timeout - (beforeRequest - beforeBodyEval);
      if (reqOptions.timeout < 1) {
        throw errors.NodeTimeout({ title: 'HTTP' });
      }
      let diskPath;
      if (this.diskPathTemplate) {
        diskPath = await renderAndValidateWriteToDiskPath(this, context, payload);
        reqOptions.responseType = 'stream';
      }

      let resolved;
      try {
        resolved = await axios(reqOptions, {
          blankDefaultHeaders: true,
          allStatusCodesAreValid: true,
          parseAsLJson: true
        });
      } catch (err) {
        if (isTimeoutError(err)) {
          throw errors.NodeTimeout({ title: 'HTTP' });
        } else if (includes('maxContentLength', err.message)) {
          throw errors.TooLarge({
            maximum: MAX_RESPONSE_SIZE_DISPLAY_MB,
            size: MAX_RESPONSE_SIZE_DISPLAY_MB,
            title: 'Response Body'
          });
        } else {
          if (err.name !== 'ValidationError') {
            err.name = concat('Http', err.name);
          }
          throw err;
        }
      }
      if (diskPath && resolved.data) {
        await writeFileToDisk(resolved.data, diskPath, { flags: getFlagOption(this), encoding: nodeParams.responseEncoding });
      }
      if (this.responsePath) {
        const response = {
          requestDuration: Date.now() - beforeRequest,
          request: addRequestLikeInfo(getRequestFromRequestResponse(resolved), this, nodeParams.requestEncoding, configRedactor),
          statusCode: resolved.status,
          headers: { ...resolved.headers.toJSON() } // copy to a plain object because the Axios headers object has a different prototype
        };
        response.body = diskPath || resolved.data;
        if (nodeParams.bodyUrl) {
          response.request.bodyUrl = nodeParams.bodyUrl;
        } else if (nodeParams.bodyDiskPath) {
          response.request.bodyDiskPath = nodeParams.bodyDiskPath;
        }
        payload = payloadHelper.set(this.responsePath, response, payload);
      }

      return [this.outputIds, payload];
    } catch (error) {
      if ((nodeParams.bodyUrl || nodeParams.bodyDiskPath) && nodeParams.data) {
        // nodeParams.data is a stream, we need to terminate it just in case
        try { nodeParams.data.destroy(); } catch {}
      }

      if ('payloadPath' === this.errorBehavior) {
        if (this.errorPath) {
          const response = {
            request: addRequestLikeInfo(getRequestFromNodeParams(nodeParams), this, nodeParams.requestEncoding, configRedactor),
            error: errorToObject(error)
          };
          payload = payloadHelper.set(this.errorPath, response, payload);
        }
        return [this.outputIds, payload];
      } else {
        throw error;
      }
    }
  }

}

export default HttpNode;
