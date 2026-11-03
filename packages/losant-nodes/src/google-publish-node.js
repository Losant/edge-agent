import * as payloadHelper from 'losant-handlebars';
import errors from 'losant-nodejs-utils/src/errors.js';
import ljsonRender from './lib/ljson-render.js';
import { PubSub } from '@google-cloud/pubsub';
import { isNil, toString, isPlainObject } from 'omnibelt';
import { validateAndParseAuthCredentials, validateAndGetProjectId } from './lib/google-auth.js';

const maxRetry = 10;
const gPubSubTopicRegExp = /^[A-Za-z0-9-_.~+%]{3,255}$/;
export default class GooglePublishNode {

  /* Example Config:
    {
      credentialNameTemplate: <String - Optional: template for the name of the credential to auth with. If set, jwtDataMethod and jwtDataTemplate are ignored>,
      projectIdTemplate: <String - Optional: template for the project ID. Overrides the project ID on the credential or JWT, which is used if this renders blank>,
      jwtDataMethod: <String - Optional: how jwtDataTemplate is interpreted (jsonTemplate|payloadPath). Default jsonTemplate. Any other value throws>,
      jwtDataTemplate: <String - Required when credentialNameTemplate is not set: JSON template for the GCP account token (JWT), or a payload path to it when jwtDataMethod is payloadPath>,
      topicTemplate: <String - Required: template for topic to publish on. Must be 3-255 characters of A-Z, a-z, 0-9, and -_.~+%>,
      dataMethod: <String - Optional: form of data input (stringTemplate|payloadPath). Default stringTemplate>,
      dataTemplate: <String - Optional: String template for data field if stringTemplate dataMethod>,
      dataPayloadPath: <String - Optional: payload path for data field if payloadPath dataMethod>,
      attrMethod: <String - Optional: form of attr input (individualFields|jsonTemplate|payloadPath). Default individualFields>,
      attrFields: [
        // if individualFields is attrMethod
        0 or more of:
        { keyTemplate: <String - Required: template for key name. Entries with a blank key are skipped>,
          valueTemplate: <String - Required: template for value> }
      ],
      // attrTemplate or attrPayloadPath should resolve to object like
      // { key1: value1, key2: value2, etc.. }
      attrTemplate: <String - Optional: JSON template for attrs if jsonTemplate attrMethod>,
      attrPayloadPath: <String - Optional: payload path for attrs if payloadPath attrMethod>,
      resultPath: <String - Optional: payload path to place the publish result. Receives { messageId } or { error: { message } }>
    }

    Notes: Attribute values are converted to strings, and attributes with null or undefined values are dropped. Our own validation errors are written to resultPath (if set) as { error: { type, message } } and the node continues. Other errors are thrown.
  */

  constructor(id, outputIds, config) {
    this.id = id;
    this.outputIds = outputIds;

    this.credentialNameTemplate = config.credentialNameTemplate;
    this.projectIdTemplate = config.projectIdTemplate;

    this.jwtDataMethod = config.jwtDataMethod || 'jsonTemplate';
    this.jwtDataTemplate = config.jwtDataTemplate;

    this.topicTemplate = config.topicTemplate;
    this.dataMethod = config.dataMethod || 'stringTemplate';
    this.dataTemplate = config.dataTemplate;
    this.dataPayloadPath = config.dataPayloadPath;
    this.attrMethod = config.attrMethod || 'individualFields';
    this.attrFields = config.attrFields || [];
    this.attrTemplate = config.attrTemplate;
    this.attrPayloadPath = config.attrPayloadPath;
    this.resultPath = config.resultPath;
  }

  async renderCredentials(payload, context) {
    const { authCredentials } = await validateAndParseAuthCredentials(payload, context, {
      jwtJsonTemplate: this.jwtDataTemplate,
      jwtPayloadPath: this.jwtDataTemplate,
      jwtDataMethod: this.jwtDataMethod,
      credentialNameTemplate: this.credentialNameTemplate
    }, false);
    if (!authCredentials) {
      throw errors.Validation({ message: 'JWT Data is required' });
    }
    const projectId = validateAndGetProjectId(authCredentials, this.projectIdTemplate, payload);
    return { projectId, keyJson: authCredentials };
  }

  async run(context, payload) {
    try {
      let topic = payloadHelper.renderToString(this.topicTemplate, payload).trim();
      if (!topic.match(gPubSubTopicRegExp)) {
        throw errors.Validation({ message: `Invalid topic name: ${topic}` });
      }

      const msg = { attributes: {} };
      if (this.dataMethod === 'payloadPath') {
        msg.data = payloadHelper.lookup(this.dataPayloadPath, payload);
      } else {
        msg.data = payloadHelper.render(this.dataTemplate, payload);
      }
      if (isNil(msg.data)) { msg.data = null; }

      let attr;
      if (this.attrMethod === 'payloadPath') {
        attr = payloadHelper.lookup(this.attrPayloadPath, payload);
      } else if (this.attrMethod === 'jsonTemplate') {
        attr = ljsonRender(this.attrTemplate, payload, 'Attributes');
      } else {
        attr = {};
        this.attrFields.forEach((fieldPair) => {
          const key = payloadHelper.renderToString(fieldPair.keyTemplate, payload);
          if (!key) { return; }
          attr[key] = payloadHelper.render(fieldPair.valueTemplate, payload);
        });
      }

      if (isPlainObject(attr)) {
        Object.keys(attr).forEach((key) => {
          const val = attr[key];
          if (isNil(val)) { return; }
          msg.attributes[key] = toString(val);
        });
      }

      const config = await this.renderCredentials(payload, context);
      const client = new PubSub({
        projectId: config.projectId,
        credentials: config.keyJson
      });

      topic = client.topic(topic);

      // if no max retry, gcp publish will never stop trying
      topic.setPublishOptions({ gaxOpts: { retry: maxRetry } });

      // match how the pre 0.14 library behaved
      msg.data = Buffer.from(JSON.stringify(msg.data), 'binary');
      try {
        const messageId = await topic.publish(msg.data, msg.attributes);
        if (this.resultPath) {
          payload = payloadHelper.set(this.resultPath, { messageId }, payload);
        }
        return [this.outputIds, payload];
      } catch (err) {
        if (this.resultPath) {
          payload = payloadHelper.set( this.resultPath, { error: { message: err.message } }, payload );
        }
        return [this.outputIds, payload];
      }
    } catch (err) {
      if (err.statusCode) {
        // this is one of our thrown errors that we want to report nicely
        if (this.resultPath) {
          payload = payloadHelper.set( this.resultPath, { error: { type: err.type, message: err.message } }, payload );
        }
        return [this.outputIds, payload];
      }
      throw err;
    }
  }

}

