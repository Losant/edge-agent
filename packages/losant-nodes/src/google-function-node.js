import * as payloadHelper from 'losant-handlebars';
import axios from 'losant-nodejs-utils/src/axios.js';
import errors from 'losant-nodejs-utils/src/errors.js';
import { timeoutP, includes, __, trim, endsWith, anyPass } from 'omnibelt';
import resolveValueByLookupType from './lib/resolve-value-by-lookup-type.js';
import { MAX_RESPONSE_SIZE, MAX_RESPONSE_SIZE_DISPLAY_MB } from 'losant-nodejs-utils/src/utils/storage-helpers.js';
import fetchApiResult from './lib/google-apis.js';
import { google } from 'googleapis';
const cloudFunctions = google.cloudfunctions('v1');

import {
  GOOGLE_AUTH_SCOPES,
  getJwtAuthClient,
  validateAndParseAuthCredentials,
  validateAndGetProjectId
} from './lib/google-auth.js';
const { CLOUD_PLATFORM } = GOOGLE_AUTH_SCOPES;

const isValidSourceMethod = includes(__, ['payloadPath', 'jsonTemplate', 'workflowPayload']);
const VALID_HOSTNAMES = [ '.cloudfunctions.net', '.run.app' ];
const anyValidHostnames = VALID_HOSTNAMES.map((hostname) => { return endsWith(hostname); });
const isValidHostname = anyPass(anyValidHostnames);

class GoogleFunctionNode {

  /* Example Config:
  {
    invocationMethod: <String - Optional: How to invoke the GCP function. One of api or http. Default api>,
    allowUnauthenticated: <Boolean - Optional: Only applies when invocationMethod is http. If true, the function is called without authentication and the credential and jwt keys are ignored. Default false>,
    triggerUrlTemplate: <String - Required when invocationMethod is http: Template for the URL of an HTTP triggered function. The hostname must end with .cloudfunctions.net or .run.app>,
    functionNameTemplate: <String - Required when invocationMethod is api: Template for the GCP function name>,
    regionTemplate: <String - Required when invocationMethod is api: Template for the GCP region>,
    credentialNameTemplate: <String - Optional: Template for the name of a GCP credential to authenticate with. If set, the jwt keys are ignored>,
    projectIdTemplate: <String - Optional: Template for a project ID that overrides the project ID in the credential or JWT. Only used when invocationMethod is api>,
    jwtDataMethod: <String - Optional: Format of the GCP service account JWT input. One of jsonTemplate or payloadPath. Default jsonTemplate. Not used if credentialNameTemplate is set or allowUnauthenticated is true>,
    jwtDataTemplate: <String - Required unless credentialNameTemplate is set or allowUnauthenticated is true: JSON template (jsonTemplate) or payload path (payloadPath) for the service account JWT>,
    sourceDataMethod: <String - Optional: How to construct the data sent to the function. One of jsonTemplate, payloadPath, or workflowPayload. Default workflowPayload. All but workflowPayload require sourceDataTemplate>,
    sourceDataTemplate: <String - Required unless sourceDataMethod is workflowPayload: JSON template or payload path for the data sent to the function>,
    resultPath: <String - Optional: Payload path where the result, or an error, is written>
  }
  Notes:
    Result: When invocationMethod is http, { result, executionId } is written to resultPath, where result is the
      response body. When invocationMethod is api, the API response is written to resultPath.
    Errors: Failures while calling the function, including timeouts and responses that are too large, are written to
      resultPath as { error: { type, message } } rather than thrown. Invalid config (for example a missing region,
      function name, trigger URL, or an invalid source method) and credential problems throw.
  */

  constructor(id, outputIds, config) {
    this.id = id;
    this.outputIds = outputIds;
    this.invocationMethod = config.invocationMethod || 'api';
    this.triggerUrlTemplate = config.triggerUrlTemplate;
    this.regionTemplate = config.regionTemplate;
    this.functionNameTemplate = config.functionNameTemplate;
    this.allowUnauthenticated = config.allowUnauthenticated && this.invocationMethod === 'http';
    this.jwtDataMethod = config.jwtDataMethod || 'jsonTemplate';
    this.jwtDataTemplate = config.jwtDataTemplate;
    this.sourceDataMethod = config.sourceDataMethod || 'workflowPayload';
    this.sourceDataTemplate = config.sourceDataTemplate;
    this.resultPath = config.resultPath;
    this.projectIdTemplate = config.projectIdTemplate;
    this.credentialNameTemplate = config.credentialNameTemplate;
  }

  async run(context, payload) {
    if (!this.sourceDataMethod || !isValidSourceMethod(this.sourceDataMethod)) {
      throw errors.Validation({ message: 'Invalid Source Method' });
    }

    let authClient, projectId, region, functionName, triggerUrl;
    const invokeByHTTP = this.invocationMethod === 'http';
    if (!this.allowUnauthenticated) {
      const { authCredentials } = await validateAndParseAuthCredentials(payload, context, {
        jwtJsonTemplate: this.jwtDataTemplate,
        jwtPayloadPath: this.jwtDataTemplate,
        jwtDataMethod: this.jwtDataMethod,
        credentialNameTemplate: this.credentialNameTemplate
      }, !invokeByHTTP);
      if (!invokeByHTTP) {
        projectId = validateAndGetProjectId(authCredentials, this.projectIdTemplate, payload);
      }
      authClient = invokeByHTTP ?
        new google.auth.GoogleAuth({ credentials: authCredentials }) : //HTTP authClient takes a target audience, which overrides scope
        getJwtAuthClient(authCredentials, CLOUD_PLATFORM);
    }

    if (this.invocationMethod === 'api') {
      region = payloadHelper.renderToString(this.regionTemplate, payload);
      if (!region) {
        throw errors.Validation({ message: 'Region is required' });
      }

      functionName = trim(payloadHelper.renderToString(this.functionNameTemplate, payload));
      if (!functionName) {
        throw errors.Validation({ message: 'Function Name is required' });
      }
      if (!functionName.match(/^[a-z][a-z0-9-]*[a-z0-9]$/i) || functionName.length > 63) {
        throw errors.Validation({ message: 'Invalid Function Name' });
      }
    } else if (invokeByHTTP) {
      triggerUrl = trim(payloadHelper.renderToString(this.triggerUrlTemplate, payload));
      if (!triggerUrl) {
        throw errors.Validation({ message: 'Trigger URL is required' });
      }
      let parsedUrl;
      try {
        parsedUrl = new URL(triggerUrl);
      } catch {
        throw errors.Validation({ message: `Invalid URL: ${triggerUrl}` });
      }
      if (!isValidHostname(parsedUrl.hostname)) {
        throw errors.Validation({ message: `Google Cloud functions must be at hostname "${VALID_HOSTNAMES.join(', ')}".` });
      }
    }

    const data = resolveValueByLookupType({
      lookupType: this.sourceDataMethod,
      inputValue: this.sourceDataTemplate,
      payload,
      title: 'Source Data',
      errorOnMissing: true,
      defaultLookup: 'workflowPayload'
    });

    let result;
    try {
      if (invokeByHTTP) {
        let res;
        const options = {
          method: 'POST',
          timeout: context.externalTimeout,
          url: triggerUrl,
          data,
          maxContentLength: MAX_RESPONSE_SIZE
        };
        if (authClient) {
          // Instance of a gaxios client
          const client = await timeoutP(context.externalTimeout, authClient.getIdTokenClient(triggerUrl));
          res = await timeoutP(context.externalTimeout, client.request(options));
        } else {
          res = await axios(options);
        }
        result = { result: res.data, executionId: res.headers.get('function-execution-id') };
      } else {
        const args = {
          authClient,
          timeout: context.externalTimeout,
          timeoutMessage: 'ETIMEDOUT',
          params: {
            name: `projects/${projectId}/locations/${region}/functions/${functionName}`,
            data: JSON.stringify(data)
          }
        };
        await timeoutP(context.externalTimeout, authClient.authorize());
        result = await fetchApiResult(cloudFunctions.projects.locations.functions.call.bind(cloudFunctions.projects), args);
      }
    } catch (e) {
      let err;
      if (includes('maxContentLength', e.message)) {
        err = errors.TooLarge({ maximum: MAX_RESPONSE_SIZE_DISPLAY_MB, size: MAX_RESPONSE_SIZE_DISPLAY_MB, title: 'Response Body' });
      } else {
        err = { type: e.type || 'GCP_FUNCTION_ERROR', message: e.message };
      }
      result = { error: { type: err.type, message: err.message } };
    }
    if (this.resultPath) { payload = payloadHelper.set(this.resultPath, result, payload); }

    return [this.outputIds, payload];
  }
}

export default GoogleFunctionNode;
