/**
 * These are the common args that every Cloud ML API wrapper function expects.
 * Each wrapper function may list additional args.
 * @typedef {Object} ApiArgs
 * @property {AuthClient} authClient Auth client.
 * @property {number=}    timeout    Request timeout (in ms).
 */

import { google } from 'googleapis';
import {
  pipe, prop, when, always, isNot, isNilOrEmpty, assoc, evolve, ifElse,
  converge, concat, updateKeyPaths, format
} from 'omnibelt';

import {
  lookup,
  renderToStringTrimmed
} from './fp-payload-helper.js';


import errors from 'losant-nodejs-utils/src/errors.js';
const { MissingField, InvalidType } = errors;

import {
  GOOGLE_AUTH_SCOPES,
  validateAndParseAuthCredentials
} from './google-auth.js';

import fetchApiResult from './google-apis.js';

const ml = google.ml('v1');

export const AUTH_SCOPES = [GOOGLE_AUTH_SCOPES.CLOUD_PLATFORM];

export const TIMEOUT_MESSAGE = 'ETIMEDOUT';

const setCommonArgs = assoc('timeoutMessage', TIMEOUT_MESSAGE);

/**
 * Parses the resource name used by the Cloud ML API.
 * It's really more of a URL endpoint, but Google calls it a resource name.
 *
 * @param {Object}  args              Function args.
 * @param {string}  args.projectId    The Project ID for the Cloud Platform project.
 * @param {string}  args.modelName    The name of the Cloud ML model.
 * @param {string=} args.modelVersion The model version.
 *
 * @return {string} The resource name / endpoint.
 */
export const parseModelResourceName = converge(concat, [
  format('projects/{projectId}/models/{modelName}'),
  ifElse(
    prop('modelVersion'),
    format('/versions/{modelVersion}'),
    always('')
  )
]);

export const validateAndParseBaseConfig = (payload, config) => {
  return evolve({
    modelName: pipe(
      when(isNilOrEmpty, () => {
        throw MissingField({ title: 'Model Name' });
      }),
      renderToStringTrimmed(payload)
    ),
    modelVersion: renderToStringTrimmed(payload),
    instancesPath: pipe(
      when(isNilOrEmpty, () => {
        throw MissingField({ title: 'Instances Path' });
      })
    ),
    resultPath: when(isNilOrEmpty, () => {
      throw MissingField({ title: 'Result Path' });
    })
  })(config);
};

export const validateAndParseInstances = (payload, config) => {
  if (prop('instances', config)) {
    return config;
  }

  const { instancesPath } = config;

  const instances = lookup(payload, instancesPath);

  if (isNot(Array, instances)) {
    throw InvalidType({
      title: 'Instances',
      expectedType: 'Array',
      value: instances
    });
  }

  return assoc('instances', instances, config);
};

export const validateAndParseConfig = async (payload, config, context) => {
  config = validateAndParseBaseConfig(payload, config);
  config = validateAndParseInstances(payload, config);
  config = await validateAndParseAuthCredentials(payload, context, config);
  return config;
};

/**
 * Fetches prediction data using the given params.
 *
 * @see ml.projects.predict
 *
 * @param {ApiArgs}  args              Function args.
 * @param {string}   args.resourceName Resource name.
 * @param {Array<*>} args.instances    Instances to get predictions for.
 *
 * @return {Promise<Object>} Promise that resolves to the fetch result.
 */
export const getPrediction = pipe(
  setCommonArgs,
  updateKeyPaths({
    resourceName: ['params', 'name'],
    instances: ['params', 'resource', 'instances']
  }),
  fetchApiResult(ml.projects.predict.bind(ml.projects))
);
