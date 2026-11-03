import * as payloadHelper from 'losant-handlebars';
import { trim } from 'omnibelt';
import AwsWrapper from 'losant-nodejs-utils/src/utils/aws-wrapper.js';
import errors from 'losant-nodejs-utils/src/errors.js';
import http from 'http';
import https from 'https';
import CacheableLookup from 'cacheable-lookup';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import { Lambda } from '@aws-sdk/client-lambda';
import { SQSClient } from '@aws-sdk/client-sqs';

export const cacheable = new CacheableLookup();
export const lambdaRequestHandler = new NodeHttpHandler({
  httpAgent: new http.Agent({ lookup: cacheable.lookup }),
  httpsAgent: new https.Agent({ lookup: cacheable.lookup })
});

class BaseAwsNode {

  /* Example Config:
  {
    credentialNameTemplate: <String - Optional: template for the name of the credential to auth with. If set, the key, secret, and region templates below are ignored>,
    accessKeyIdTemplate: <String - Required when credentialNameTemplate is not set: template for the AWS Access Key ID. Also accepted as awsAccessKeyId>,
    secretAccessKeyTemplate: <String - Required when credentialNameTemplate is not set: template for the AWS Secret Access Key. Also accepted as awsSecretAccessKey>,
    regionTemplate: <String - Required when credentialNameTemplate is not set: template for the AWS Region. Also accepted as awsRegion>
  }
  */

  constructor(id, outputIds, config) {
    this.id = id;
    this.outputIds = outputIds;
    this.credentialNameTemplate = config.credentialNameTemplate;
    // the ORs are for backward compatibility with lambda.
    this.accessKeyIdTemplate = config.accessKeyIdTemplate || config.awsAccessKeyId;
    this.secretAccessKeyTemplate = config.secretAccessKeyTemplate || config.awsSecretAccessKey;
    this.regionTemplate = config.regionTemplate || config.awsRegion;
  }

  async getConfig(context, payload) {
    if (this.credentialNameTemplate) {
      return context.loadCredential({
        credentialNameTemplate: this.credentialNameTemplate,
        type: 'aws',
        applicationId: context.applicationId,
        payload
      });
    }
    const accessKeyId = trim(payloadHelper.renderToString(this.accessKeyIdTemplate, payload));
    const secretAccessKey = trim(payloadHelper.renderToString(this.secretAccessKeyTemplate, payload));
    const region = trim(payloadHelper.renderToString(this.regionTemplate, payload));
    if (!accessKeyId) {
      throw errors.MissingField({ title: 'AWS Access Key ID' });
    }

    if (!secretAccessKey) {
      throw errors.MissingField({ title: 'AWS Secret Key' });
    }

    if (!region) {
      throw errors.MissingField({ title: 'AWS Region' });
    }
    return { accessKeyId, secretAccessKey, region };
  }

  async createSqsInstance(context, payload) {
    const config = await this.getConfig(context, payload);
    const client = new SQSClient({
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
      region: config.region
    });
    // queue URL came from integration
    return { client, queueUrl: config.queueUrl };
  }

  async createLambdaInstance(context, payload) {
    const { accessKeyId, secretAccessKey, region } = await this.getConfig(context, payload);
    return new Lambda({
      credentials: { accessKeyId, secretAccessKey },
      region,
      maxAttempts: 0,
      requestHandler: lambdaRequestHandler
    });
  }

  async createStorageInstance(context, payload, bucket) {
    const config = await this.getConfig(context, payload);
    config.allowRegionReplacement = true;
    const storage = AwsWrapper(config);
    await storage.validateConfig({ bucket });
    return storage;
  };

  async run() {
    // To be implemented by subclasses
  }

}

export default BaseAwsNode;
