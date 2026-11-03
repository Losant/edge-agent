import * as payloadHelper from 'losant-handlebars';
import errors from 'losant-nodejs-utils/src/errors.js';
import ljsonRender from './lib/ljson-render.js';
import { EventHubProducerClient } from '@azure/event-hubs';

export default class AzureEventHubPublishNode {

  /* Example Config:
    {
      credentialNameTemplate: <String - Optional: template for the name of the credential to auth with, for subclasses that support credentials. When set, connectionString is not required>,
      hostNameTemplate: <String - Optional: template for hostname of the event hub namespace. Used with credentialNameTemplate by subclasses that support credentials, which require it>,
      hubName: <String - Required: template for event hub name>,
      connectionString: <String - Required when credentialNameTemplate is not set: template for event hub connection string>,
      partitionKeyTemplate: <String - Optional: template for partition key to publish with>,
      dataMethod: <String - Optional: form of data input (stringTemplate|payloadPath). Default stringTemplate>,
      dataTemplate: <String - Optional: String template for data field if stringTemplate dataMethod>,
      dataPayloadPath: <String - Optional: payload path for data field if payloadPath dataMethod>,
      propMethod: <String - Optional: form of properties input (individualFields|jsonTemplate|payloadPath). Default individualFields>,
      propFields: [
        // if individualFields is propMethod
        0 or more of:
        { keyTemplate: <String - Required: template for key name. Entries with a blank key are skipped>,
          valueTemplate: <String - Required: template for value> }
      ],
      // propTemplate or propPayloadPath should resolve to object like
      // { key1: value1, key2: value2, etc.. }
      propTemplate: <String - Optional: JSON template for props if jsonTemplate propMethod>,
      propPayloadPath: <String - Optional: payload path for props if payloadPath propMethod>,
      resultPath: <String - Optional: payload path to place the publish result. Receives { success: true } or { error: { message }, success: false }> }

    Notes: Publish failures, and our own validation errors (which also include a type), are written to resultPath (if set) and the node continues. Other errors are thrown.
  */


  renderCredentials(payload) {
    const result = {};
    if (!this.credentialNameTemplate) {
      result.connectionString = payloadHelper.renderToString(this.connectionString, payload).trim();
      if (!result.connectionString) {
        throw errors.Validation({ message: 'Connection String is required' });
      }
    }

    result.hubName = payloadHelper.renderToString(this.hubName, payload).trim();
    if (!result.hubName) {
      throw errors.Validation({ message: 'Hub Name is required' });
    }
    return result;
  }

  constructor(id, outputIds, config) {
    this.id = id;
    this.outputIds = outputIds;

    this.connectionString = config.connectionString;
    this.credentialNameTemplate = config.credentialNameTemplate;
    this.hostNameTemplate = config.hostNameTemplate;
    this.hubName = config.hubName;

    this.partitionKeyTemplate = config.partitionKeyTemplate;
    this.dataMethod = config.dataMethod || 'stringTemplate';
    this.dataTemplate = config.dataTemplate;
    this.dataPayloadPath = config.dataPayloadPath;

    this.propMethod = config.propMethod || 'individualFields';
    this.propFields = config.propFields || [];
    this.propTemplate = config.propTemplate;
    this.propPayloadPath = config.propPayloadPath;

    this.resultPath = config.resultPath;
  }

  async run(context, payload) {
    let client;
    try {
      const config = await this.renderCredentials(payload, context);
      const producerParams = config.credential ?
        [config.hostName, config.hubName, config.credential] :
        [config.connectionString, config.hubName];
      const partitionKey = payloadHelper.renderToString(this.partitionKeyTemplate, payload).trim() || null;

      const eventData = { properties: {} };
      if (this.dataMethod === 'payloadPath') {
        eventData.body = payloadHelper.lookup(this.dataPayloadPath, payload);
      } else {
        eventData.body = payloadHelper.render(this.dataTemplate, payload);
      }

      if (this.propMethod === 'payloadPath') {
        eventData.properties = payloadHelper.lookup(this.propPayloadPath, payload);
      } else if (this.propMethod === 'jsonTemplate') {
        eventData.properties = ljsonRender(this.propTemplate, payload, 'Properties');
      } else {
        this.propFields.forEach((fieldPair) => {
          const key = payloadHelper.renderToString(fieldPair.keyTemplate, payload);
          if (!key) { return; }
          eventData.properties[key] = payloadHelper.render(fieldPair.valueTemplate, payload);
        });
      }

      try {
        client = new EventHubProducerClient(...producerParams, { retryOptions: { maxRetries: 0 } });
        await client.sendBatch([eventData], { partitionKey });
      } catch (e) {
        try { await client.close(); } catch {}
        if (this.resultPath) {
          payload = payloadHelper.set(
            this.resultPath,
            { error: { message: e.message }, success: false },
            payload);
        }
        return [this.outputIds, payload];
      }
      try { await client.close(); } catch {}
      if (this.resultPath) {
        payload = payloadHelper.set(this.resultPath, { success: true }, payload);
      }
      return [this.outputIds, payload];
    } catch (e) {
      if (e.statusCode) {
        // this is one of our thrown errors that we want to report nicely
        if (this.resultPath) {
          payload = payloadHelper.set(
            this.resultPath,
            { error: { type: e.type, message: e.message }, success: false },
            payload
          );
        }
        return [this.outputIds, payload];
      }
      throw e;
    }
  }
}

