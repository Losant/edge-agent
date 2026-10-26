import { __, T, pipe, prop, propEq, append, cond, objOf, omit, has, unless, timeoutP } from 'omnibelt';

import { set } from './lib/fp-payload-helper.js';

import {
  getNodeTimeout,
  handleNodeTimeoutError
} from './lib/common.js';

import {
  getJwtAuthClient,
  isGoogleAuthError,
  handleGoogleAuthError,
  validateAndGetProjectId
} from './lib/google-auth.js';

import {
  AUTH_SCOPES,
  TIMEOUT_MESSAGE,
  getPrediction,
  parseModelResourceName,
  validateAndParseConfig
} from './lib/google-ml.js';

const NODE_TITLE = 'Google ML';

class GoogleMlNode {

  /* Example Config:
  {
    credentialNameTemplate: <String - Optional: Template for the name of a GCP credential to authenticate with. If set, the jwt keys are ignored>,
    projectIdTemplate: <String - Optional: Template for a project ID that overrides the project ID in the credential or JWT>,
    jwtDataMethod: <String - Required unless credentialNameTemplate is set: Either jsonTemplate or payloadPath>,
    jwtJsonTemplate: <String - Required when jwtDataMethod is jsonTemplate: JSON template for the Service Account JWT>,
    jwtPayloadPath: <String - Required when jwtDataMethod is payloadPath: Payload path to the Service Account JWT>,
    modelName: <String - Required: Template for the Cloud ML model name>,
    modelVersion: <String - Optional: Template for the model version name. If not specified, Cloud ML uses the model's default version>,
    instancesPath: <String - Required: Payload path to the array of instances to use in the request body>,
    resultPath: <String - Required: Payload path where the result is written. See Notes>
  }
  Notes:
    JWT refers to a Service Account JWT generated via the Cloud Platform Console.
    Result: On success, the predictions array from the response is written to resultPath. If Cloud ML responds with
      an error body, or the request fails, { error } is written to resultPath instead of throwing.
    Missing or invalid config values (including instancesPath not resolving to an array), authentication failures,
      and node timeouts throw.
  */

  constructor(id, outputIds, config) {
    this.id = id;
    this.outputIds = outputIds;
    this.config = config;
  }

  async run(context, payload) {
    const {
      modelName,
      modelVersion,
      instances,
      resultPath,
      authCredentials
    } = await validateAndParseConfig(payload, this.config, context);

    const authClient = getJwtAuthClient(authCredentials, AUTH_SCOPES);

    const projectId = validateAndGetProjectId(authCredentials, this.config.projectIdTemplate, payload);

    const resourceName = parseModelResourceName({
      projectId,
      modelName,
      modelVersion
    });

    const nodeTimeout = getNodeTimeout(context);

    const setResult = pipe(
      set(payload, resultPath),
      append(__, [this.outputIds])
    );

    // Cloud ML returns a success result in the form of `{ error: ... }` so we
    // have to put some of the error handling logic in the success handler.
    // If we have an error we want to put the whole `{ error: ... }` object
    // on the result path; if not then we only care about the predictions part
    // of the response.
    const handlePredictionSuccess = pipe(
      unless(
        has('error'),
        prop('predictions')
      ),
      setResult
    );

    const handleAuthSuccess = () => {
      const fetchArgs = {
        authClient,
        resourceName,
        instances,
        timeout: nodeTimeout
      };

      return getPrediction(fetchArgs).then(handlePredictionSuccess);
    };

    const isNodeTimeoutError = propEq(TIMEOUT_MESSAGE, 'code');

    const handleError = cond([
      [isGoogleAuthError, handleGoogleAuthError(NODE_TITLE)],
      [isNodeTimeoutError, handleNodeTimeoutError(NODE_TITLE)],
      [T, pipe(
        omit(['originalRequest']),
        objOf('error'),
        setResult
      )]
    ]);

    try {
      return await timeoutP(nodeTimeout,
        authClient.authorize().then(handleAuthSuccess)
      );
    } catch (e) {
      return handleError(e);
    }
  }
}

export default GoogleMlNode;
