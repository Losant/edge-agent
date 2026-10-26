/**
 * @typedef {Object} AuthCredentials
 * @property {string} clientEmail
 * @property {string} privateKey
 * @property {string} projectId
 *
 * @typedef {(string|Array<string>)} AuthScopes
 *
 * @typedef {Object} AuthResponse
 * @property {string=} refresh_token
 * @property {string=} expiry_date
 * @property {string=} access_token
 * @property {string=} token_type
 *
 * @typedef {Object} AuthClient
 * @property {function(Error, AuthResponse=): void} authorize
 *
 * @typedef {function(string, void, string, AuthScopes, void): AuthClient} AuthClientProvider
 */

import * as payloadHelper from 'losant-handlebars';
import ljsonRender from './ljson-render.js';
import { google } from 'googleapis';
import {
  pipe, is, isNilOrEmpty, propEq, propSatisfies, assoc, mapKeys, camelCase,
  either, anyPass, includes, objOf, thunkify, fpThrow
} from 'omnibelt';

import {
  DATA_METHOD_PAYLOAD_PATH,
  DATA_METHOD_JSON_TEMPLATE
} from './constants.js';

import errors from 'losant-nodejs-utils/src/errors.js';
const { MissingField, InvalidEnumValue, AuthenticationError } = errors;

/**
 * The `error.status` that comes back when you make a request to a Google API
 * endpoint with invalid auth credentials.
 */
export const GOOGLE_AUTH_ERROR_STATUS = 'UNAUTHENTICATED';

/**
 * A map of the auth scopes required by various Google APIs.
 */
export const GOOGLE_AUTH_SCOPES = {
  CLOUD_PLATFORM: 'https://www.googleapis.com/auth/cloud-platform',
  BIG_QUERY: 'https://www.googleapis.com/auth/bigquery'
};

/**
 * An array of valid values for the `jwtDataMethod` node config key.
 */
export const VALID_JWT_DATA_METHODS = [
  DATA_METHOD_JSON_TEMPLATE,
  DATA_METHOD_PAYLOAD_PATH
];

/**
 * Creates a new JWT auth client using the given credentials.
 *
 * @signature AuthClientProvider -> AuthCredentials -> AuthScopes -> AuthClient
 *
 * @param {AuthClientProvider} AuthClientProvider  The JWT class to use.
 * @param {AuthCredentials}    authCredentials     The auth credentials to use.
 * @param {AuthScopes}         authScopes          The auth scope(s) to use.
 *
 * @return {AuthClient} The auth client.
 */
export const getJwtAuthClient = (authCredentials, authScopes) => {
  const { clientEmail, privateKey } = authCredentials;

  const hasValidAuthScopes = either(is(String), is(Array))(authScopes);
  const validAuthScopes = hasValidAuthScopes ? authScopes : '';

  const authClient = new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: validAuthScopes
  });

  return authClient;
};

/**
 * Determines whether the given error is an authorization error.
 *
 * @signature Error -> Boolean
 *
 * @param {Error} error The error to check.
 *
 * @return {Boolean} True if the given error is a known auth error, false if not.
 */
export const isGoogleAuthError = anyPass([
  propEq(GOOGLE_AUTH_ERROR_STATUS, 'status'),
  propSatisfies(includes('PEM_read_bio'), 'message'),
  propSatisfies(includes('routines::unsupported'), 'message')
]);

/**
 * Takes a node title and returns a thunk that throws an AuthenticationError.
 *
 * @signature String -> Function
 *
 * @throws AuthenticationError
 */
export const handleGoogleAuthError = pipe(
  objOf('title'),
  AuthenticationError,
  thunkify(fpThrow)
);

export const validateAndParseJwt = async (payload, context, config) => {
  const {
    jwtDataMethod,
    jwtJsonTemplate,
    jwtPayloadPath,
    credentialNameTemplate
  } = config;

  let jwtResult;
  if (credentialNameTemplate) {
    jwtResult = await context.loadCredential({
      credentialNameTemplate,
      type: 'gcp',
      applicationId: context.applicationId,
      payload
    });
  } else {
    if (jwtDataMethod === DATA_METHOD_JSON_TEMPLATE) {
      jwtResult = ljsonRender(jwtJsonTemplate, payload, 'JWT JSON Template');
    } else if (jwtDataMethod === DATA_METHOD_PAYLOAD_PATH) {
      jwtResult = payloadHelper.lookup(jwtPayloadPath, payload);
      if (isNilOrEmpty(jwtResult)) {
        throw MissingField({ title: 'JWT Payload Path' });
      }

    } else {
      throw InvalidEnumValue({
        field: 'jwtDataMethod',
        allowedValues: VALID_JWT_DATA_METHODS,
        actualValue: jwtDataMethod
      });
    }
  }

  return assoc('jwt', jwtResult, config);
};

export const validateAndParseAuthCredentials = async (payload, context, config, shouldMapKeys = true) => {
  const { jwt } = await validateAndParseJwt(payload, context, config);

  const authCredentials = shouldMapKeys ? mapKeys(camelCase, jwt) : jwt;
  return assoc('authCredentials', authCredentials, config);
};

export const validateAndGetProjectId = (authCredentials, projectIdTemplate, payload) => {
  let projectId;
  if (projectIdTemplate) {
    projectId = payloadHelper.renderToString(projectIdTemplate, payload);
  }
  if (!projectId) {
    projectId = authCredentials.project_id || authCredentials.projectId;
  }
  if (!projectId) {
    throw errors.Validation({ message: 'Project ID is required' });
  }
  if (!projectId.match(/^[a-z][a-z0-9-]*[a-z0-9]$/) || projectId.length < 6 || projectId.length > 30) {
    throw errors.Validation({ message: 'Invalid Project ID' });
  }
  return projectId;
};
