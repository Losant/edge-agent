import * as payloadHelper from 'losant-handlebars';
import errors from 'losant-nodejs-utils/src/errors.js';
import { upperFirst, isPlainObject } from 'omnibelt';
import ljsonRender from './lib/ljson-render.js';
import { SendMessageCommand } from '@aws-sdk/client-sqs';
import BaseAwsNode from './lib/base-aws-node.js';

export default class SqsSendNode extends BaseAwsNode {

  /* Example Config:
    {
      accessKeyIdTemplate: <String - Required: template for access key>,
      secretAccessKeyTemplate: <String - Required: template for secret>,
      regionTemplate: <String - Required: template for region>,
      queueUrl: <String - Required: template for queueUrl>,

      dataMethod: <String - Optional: form of data input (stringTemplate|payloadPath). Default stringTemplate>,
      dataTemplate: <String - Optional: String template for data field if stringTemplate dataMethod>,
      dataPayloadPath: <String - Optional: payload path for data field if payloadPath dataMethod>,

      attributeMethod: <String - Optional: form of attribute input (individualFields|jsonTemplate|payloadPath). Default individualFields>,
      attributeFields: [
        // if individualFields is attributeMethod
        0 or more of:
        { keyTemplate: <String - Required: template for key name. Entries with a blank key are skipped>,
          valueTemplate: <String - Required: template for value> }
      ],
      // attributeTemplate or attributePayloadPath should resolve to object like
      // { key1: value1, key2: value2, etc.. }
      attributeTemplate: <String - Optional: JSON template for attributes if jsonTemplate attributeMethod>,
      attributePayloadPath: <String - Optional: payload path for attributes if payloadPath attributeMethod>,

      messageGroupIdTemplate: <String - Optional: Group ID to associate this message with. Required by FIFO queues, and only sent when the queue URL contains .fifo>,
      messageDeduplicationIdTemplate: <String - Optional: Deduplication ID for the receiver. Required by FIFO queues, and only sent when the queue URL contains .fifo>,

      resultPath: <String - Optional: payload path to place the publish result. Receives { messageId, success: true } or { error: { type, message }, success: false }> }

    Notes: A message body that is not a string is JSON stringified. Attributes must be an object with at most 10 keys. Number values are sent as Number attributes and everything else as String attributes. Errors from SQS and our own validation errors are written to resultPath (if set) and the node continues. Other errors are thrown.
  */

  constructor(id, outputIds, config) {
    super(id, outputIds, config);
    this.queueUrl = config.queueUrl;

    this.dataMethod = config.dataMethod || 'stringTemplate';
    this.dataTemplate = config.dataTemplate;
    this.dataPayloadPath = config.dataPayloadPath;

    this.attributeMethod = config.attributeMethod || 'individualFields';
    this.attributeFields = config.attributeFields || [];
    this.attributeTemplate = config.attributeTemplate;
    this.attributePayloadPath = config.attributePayloadPath;

    this.messageGroupIdTemplate = config.messageGroupIdTemplate;
    this.messageDeduplicationIdTemplate = config.messageDeduplicationIdTemplate;

    this.resultPath = config.resultPath;
  }

  async run(context, payload) {
    try {
      const clientInst = await this.createSqsInstance(context, payload);
      const client = clientInst.client;
      let queueUrl = clientInst.queueUrl;
      if (!queueUrl) {
        queueUrl = payloadHelper.renderToString(this.queueUrl, payload).trim();
        if (!queueUrl) {
          throw errors.MissingField({ title: 'Queue URL' });
        }
      }
      const messageData = { MessageAttributes: {} };
      if (this.dataMethod === 'payloadPath') {
        messageData.MessageBody = payloadHelper.lookup(this.dataPayloadPath, payload);
      } else {
        messageData.MessageBody = payloadHelper.render(this.dataTemplate, payload);
      }
      if (typeof messageData.MessageBody !== 'string') {
        messageData.MessageBody = JSON.stringify(messageData.MessageBody);
      }

      let attributes = {};
      if (this.attributeMethod === 'payloadPath') {
        attributes = payloadHelper.lookup(this.attributePayloadPath, payload);
      } else if (this.attributeMethod === 'jsonTemplate') {
        attributes = ljsonRender(this.attributeTemplate, payload, 'Attributes');
      } else {
        this.attributeFields.forEach((fieldPair) => {
          const key = payloadHelper.renderToString(fieldPair.keyTemplate, payload);
          if (!key) { return; }
          attributes[key] = payloadHelper.render(fieldPair.valueTemplate, payload);
        });
      }

      if (!isPlainObject(attributes)) {
        throw errors.Validation({ message: 'Attributes must be an object' });
      }

      const attributeMap = Object.entries(attributes);
      if (attributeMap.length > 10) {
        throw errors.Validation({ message: 'Attributes cannot exceed 10 keys' });
      }

      attributeMap.forEach(([key, value]) => {
        let DataType = upperFirst(typeof value);
        if (DataType !== 'String' && DataType !== 'Number') { DataType = 'String'; }

        messageData.MessageAttributes[key] = {
          DataType,
          StringValue: typeof value === 'string' ? value : JSON.stringify(value) //numbers need to be sent as strings
        };
      });

      if (queueUrl.includes('.fifo')) {
        messageData.MessageGroupId = payloadHelper.renderToString(this.messageGroupIdTemplate, payload);
        messageData.MessageDeduplicationId = payloadHelper.renderToString(this.messageDeduplicationIdTemplate, payload);
        if (!messageData.MessageGroupId) { delete messageData.MessageGroupId; }
        if (!messageData.MessageDeduplicationId) { delete messageData.MessageDeduplicationId; }
      }
      messageData.QueueUrl = queueUrl;

      const command = new SendMessageCommand(messageData);
      const data = await client.send(command).catch((e) => {
        throw errors.Validation({ message: e.message });
      });
      if (this.resultPath) {
        payload = payloadHelper.set(this.resultPath, { messageId: data.MessageId, success: true }, payload);
      }
      return [this.outputIds, payload];
    } catch (e) {
      if (e.statusCode) {
        // this is one of our thrown errors that we want to report nicely
        if (this.resultPath) {
          payload = payloadHelper.set(this.resultPath, { error: { type: e.type, message: e.message }, success: false }, payload);
        }
        return [this.outputIds, payload];
      }
      throw e;
    }
  }
}

