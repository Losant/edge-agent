import * as payloadHelper from 'losant-handlebars';
import errors from 'losant-nodejs-utils/src/errors.js';
import Particle from 'particle-api-js';

export default class ParticleCallNode {

  /* Example Config:
    { integrationId: <String - Optional: template for integration id. Only used by subclasses that support integrations, where the integration supplies the access token and can supply default device and product values>,
      accessToken: <String - Required when integrationId is not set: template for particle access token>,
      nameTemplate: <String - Required: template for function name>,
      argMethod: <String - Optional: form of data input (stringTemplate|payloadPath). Default stringTemplate>,
      argTemplate: <String - Optional: String template for arg field if stringTemplate argMethod>,
      argPayloadPath: <String - Optional: payload path for arg field if payloadPath argMethod>,
      deviceTemplate: <String - Required unless integrationId supplies a default device: template for device ID or name to call>,
      productTemplate: <String - Optional: template for product ID or slug>,
      resultPath: <String - Optional: payload path to place the function response body, or { error: { message, statusCode } } if the call fails> }

    Notes: The argument is sent as a string, and non-string values are JSON stringified. Our own validation errors are written to resultPath (if set) as { error: { type, message } } and the node continues. Other errors are thrown.
  */

  constructor(id, outputIds, config) {
    this.id = id;
    this.outputIds = outputIds;
    this.integrationId = config.integrationId;

    this.accessToken = config.accessToken;
    this.deviceTemplate = config.deviceTemplate;
    this.productTemplate = config.productTemplate;

    this.nameTemplate = config.nameTemplate;
    this.argMethod = config.argMethod || 'stringTemplate';
    this.argTemplate = config.argTemplate;
    this.argPayloadPath = config.argPayloadPath;

    this.resultPath = config.resultPath;
  }

  getConfig(/*context, payload*/) {}
  async renderCredentials(payload) {
    const accessToken = payloadHelper.renderToString(this.accessToken, payload).trim();
    if (!accessToken) {
      throw errors.Validation({ message: 'Access Token is required' });
    }
    const product = payloadHelper.renderToString(this.productTemplate, payload).trim();
    const deviceId = payloadHelper.renderToString(this.deviceTemplate, payload).trim();
    if (!deviceId) {
      throw errors.Validation({ message: 'Device is required' });
    }

    return {
      auth: accessToken,
      deviceId,
      product
    };
  }

  async run(context, payload) {
    try {
      const callInfo = await this.getConfig(context, payload);
      callInfo.name = payloadHelper.renderToString(this.nameTemplate, payload).trim();
      if (!callInfo.name) { throw errors.Validation({ message: 'Call Function Name is required' }); }

      let arg;
      if (this.argMethod === 'payloadPath') {
        arg = payloadHelper.lookup(this.argPayloadPath, payload);
      } else {
        arg = payloadHelper.render(this.argTemplate, payload);
      }
      if (typeof arg !== 'string') { arg = JSON.stringify(arg); }
      if (arg) { callInfo.argument = arg; }

      const client = new Particle();
      try {
        const response = await client.callFunction(callInfo);
        if (this.resultPath) {
          payload = payloadHelper.set(this.resultPath,
            response.body, payload);
        }
      } catch (err) {
        if (this.resultPath) {
          payload = payloadHelper.set(this.resultPath,
            {
              error: {
                message: err.shortErrorDescription || err.errorDescription || err.message,
                statusCode: err.statusCode
              }
            }, payload);
        }
      }
      return [this.outputIds, payload];
    } catch (err) {
      if (err.statusCode) {
        // this is one of our thrown errors that we want to report nicely
        if (this.resultPath) {
          payload = payloadHelper.set(this.resultPath, {
            error: { type: err.type, message: err.message }
          }, payload);
        }
        return [this.outputIds, payload];
      }

      throw err;
    }
  }
}

