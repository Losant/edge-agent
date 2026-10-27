import * as payloadHelper from 'losant-handlebars';
import { createClient as createLosantClient } from 'losant-rest';
import errors from 'losant-nodejs-utils/src/errors.js';
import retry from 'retry';
import { isValidObjectId } from 'losant-nodejs-utils/src/bson.js';
import { has, defer } from 'omnibelt';
import resolveValueByLookupType from './resolve-value-by-lookup-type.js';

// options for retrying 10 times in ~30 seconds, starting at 100ms
const maxRetries = Number(process.env.API_NODE_MAX_RETRIES) || 10;
const retryOptions = { retries: maxRetries, factor: 1.7, minTimeout: 100 };

const attachEventSourceOverride = () => {
  throw errors.Validation({ message: 'Invalid action provided' });
};

class LosantApiNode {

  /* Example Config:
  { apiTokenTemplate: <String - Optional: template for the API token to use. When set, applicationIdTemplate is required and the subclass must accept provided tokens, which the base class does not. Otherwise the subclass generates a token>,
    applicationIdTemplate: <String - Required when apiTokenTemplate is set: template for the application ID to use. Must be a valid ObjectId. Ignored otherwise, when the current application is used>,
    resource: <String - Required: template for the resource to use. Must be allowed by the subclass>,
    action: <String - Required: template for the action to call on the resource. Must exist on the resource>,
    responsePath: <String - Optional: payload path to store { result }, or { error: { statusCode, type, message } } if the API returns an error>,
    params: [
      0 or more of:
      { name: <String - Required: template for param name. Entries with a blank name or value are skipped>,
        type: <String - Optional: how value is resolved - json|string|path. Default json, which is also used for unrecognized values>,
        value: <String - Required: param value, resolved according to type> }
    ] }

  Notes: The removeData action throws if a param's value resolves to an empty string or undefined. A timeout throws a NodeTimeout error. Other errors without a statusCode are retried before being thrown.
  */

  constructor(id, outputIds, config) {
    this.id = id;
    this.outputIds = outputIds;
    this.resource = config.resource;
    this.action = config.action;
    this.params = config.params || [];
    this.responsePath = config.responsePath;
    this.apiTokenTemplate = config.apiTokenTemplate;
    this.applicationIdTemplate = config.applicationIdTemplate;
  }

  // Subclasses override to allow resources. The default rejects every resource.
  isResourceValid(/* resource */) { return false; }

  generateToken(/* context */) { }

  // Subclasses override to accept an API token provided in the node config.
  // The default rejects provided tokens.
  isProvidedTokenValid(/* apiToken */) { return false; }

  losantApiUrl(/* context */) { }

  async run(context, payload) {
    let resource = payloadHelper.renderToString(this.resource, payload).trim();
    const action = payloadHelper.renderToString(this.action, payload).trim();

    if (!this.isResourceValid(resource)) { throw errors.Validation({ message: 'Invalid resource provided' }); }

    let apiToken, apiCallAppId;
    if (this.apiTokenTemplate) {
      apiCallAppId = payloadHelper.renderToString(this.applicationIdTemplate, payload).trim();
      if (!isValidObjectId(apiCallAppId)) {
        throw errors.Validation({ message: 'Invalid Application ID provided' });
      }
      apiToken = payloadHelper.renderToString(this.apiTokenTemplate, payload).trim();
      if (!this.isProvidedTokenValid(apiToken)) {
        throw errors.Validation({ message: 'Invalid API token provided' });
      }
    } else {
      apiToken = await this.generateToken(context);
      apiCallAppId = context.applicationId;
    }

    const clientOptions = {
      acceptVersion: '*',
      timeout: context.externalTimeout,
      accessToken: apiToken,
      url: this.losantApiUrl(context)
    };

    const requestParams = {
      _actions: false,
      _links: false,
      _embedded: true,
      applicationId: apiCallAppId
    };

    if (context.whitelabel) {
      requestParams.losantdomain = context.whitelabel.domain;
    }

    const client = createLosantClient(clientOptions);
    client.attachEventSource = attachEventSourceOverride; // prevent any of the SSE stream endpoints

    resource = client[resource];
    if (!has(action, resource)) { throw errors.Validation({ message: 'Invalid action provided' }); }

    this.params.forEach((param) => {
      if (!param.name || !param.value) { return; }
      const name = payloadHelper.renderToString(param.name, payload);
      if (!name) { return; }

      const value = resolveValueByLookupType({
        lookupType: param.type,
        inputValue: param.value,
        payload,
        title: `Param ${name}`,
        defaultLookup: 'json'
      });

      if (action === 'removeData' && param.value && (value === '' || value === undefined)) {
        // special case for removeData to keep people from accidentally
        // removing all their data
        throw errors.Validation({ message: `Template for "${name}" evaluated as empty` });
      }

      requestParams[name] = value;
    });

    const deferred = defer();
    const operation = retry.operation(retryOptions);
    operation.attempt(async () => {
      try {
        const response = await resource[action](requestParams);
        deferred.resolve({ result: response });
      } catch (response) {
        if (response.statusCode) {
          deferred.resolve({
            error: {
              statusCode: response.statusCode,
              type: response.type,
              message: response.message
            }
          });
        } else if (String(response.message).match(/timeout/i)) {
          deferred.reject(errors.NodeTimeout({ title: 'API' }));
        } else if (String(response.message).match(/is required/)) {
          deferred.reject(errors.Validation({ message: response.message }));
        } else {
          if (operation.retry(response)) {
            return; // going to retry
          } else {
            deferred.reject(operation.mainError());
          }
        }
      }
    });

    const payloadData = await deferred.promise;
    if (this.responsePath) {
      payload = payloadHelper.set(this.responsePath, payloadData, payload);
    }

    return [this.outputIds, payload];
  }

}

export default LosantApiNode;
