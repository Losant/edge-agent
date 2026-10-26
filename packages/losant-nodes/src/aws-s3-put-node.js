import * as payloadHelper from 'losant-handlebars';
import errors from 'losant-nodejs-utils/src/errors.js';
import { isTimeoutError } from './lib/common.js';
import { renderAndValidateCommonPutFields, performStoragePut } from './lib/node-storage-helpers.js';
import AwsNodeBase from './lib/base-aws-node.js';

const SERVER_SIDE_ENCRYPTION_STRATEGIES = ['AES256'];

const errorToOutput = (e) => {
  if (isTimeoutError(e)) {
    const error = errors.NodeTimeout({ title: 'AWS S3: Put' });
    return { error: { type: error.type, message: error.message }, success: false };
  } else {
    return { error: e.message, success: false };
  }
};

class AwsS3PutNode extends AwsNodeBase {

  /* Example Config:
  {
    // defined in base class
    credentialNameTemplate: <String - Optional: name of the AWS credential to auth with. When set, the access key, secret, and region keys below are ignored>,
    accessKeyIdTemplate: <String - Required unless credentialNameTemplate is set: Amazon Access Key>,
    secretAccessKeyTemplate: <String - Required unless credentialNameTemplate is set: Amazon Access Key Secret>,
    regionTemplate: <String - Required unless credentialNameTemplate is set: Amazon Region>,

    destination: <String - Required: payload path for { success: true } on success or { success: false, error: <message String> } on failure>,
    bucketNameTemplate: <String - Required: S3 bucket to put to>,
    fileNameTemplate: <String - Required: full path of the file to be placed in the given bucket. Maximum 1024 characters>,
    contentTypeTemplate: <String - Required: MIME type of the file being uploaded>,
    fileContentTemplate: <String - Required unless fileUrlTemplate or diskPathTemplate is set: the contents of the file being uploaded>,
    fileUrlTemplate: <String - Optional: URL to download the file content from and stream into the S3 file. Takes precedence over diskPathTemplate and fileContentTemplate>,
    diskPathTemplate: <String - Optional: the disk file to upload (only available on edge). Takes precedence over fileContentTemplate>,
    encodingTemplate: <String - Optional: encoding of the file content. Default utf8. Not used with fileUrlTemplate>,
    serverSideEncryption: <String - Optional: server-side encryption strategy. Only AES256 is valid; any other value throws a Validation error>
  }
  Notes:
  A single output is used (outputIds).
  Upload failures (including timeouts and a disk file that is not found) do not throw: they are written to destination as { success: false, error: <message String> }. A timeout is written as { success: false, error: { type, message } }.
  A missing content type, an over-long file name, an invalid encoding, or an invalid serverSideEncryption value throws.
  */

  constructor(id, outputIds, config) {
    super(id, outputIds, config);
    this.destination = config.destination;
    this.bucketNameTemplate = config.bucketNameTemplate;
    this.fileNameTemplate = config.fileNameTemplate;
    this.contentTypeTemplate = config.contentTypeTemplate;
    this.fileContentTemplate = config.fileContentTemplate;
    this.encodingTemplate = config.encodingTemplate || 'utf8';
    this.serverSideEncryption = config.serverSideEncryption;
    this.fileUrlTemplate = config.fileUrlTemplate;
    this.diskPathTemplate = config.diskPathTemplate;
  }

  async run(context, payload) {
    let result;
    const {
      encoding, fileContent, fileUrl, diskPath, bucket, fileName, contentType, error
    } = await renderAndValidateCommonPutFields(
      this,
      context,
      payload
    );

    if (error) {
      payload = payloadHelper.set(this.destination, errorToOutput(error), payload);
      return [this.outputIds, payload];
    }

    if (this.serverSideEncryption && !SERVER_SIDE_ENCRYPTION_STRATEGIES.includes(this.serverSideEncryption)) {
      throw errors.Validation({ message: `serverSideEncryption invalid. Must be one of the following: ${SERVER_SIDE_ENCRYPTION_STRATEGIES.join(' | ').trim()}` });
    }
    const storage = await this.createStorageInstance(context, payload, bucket);
    try {
      await performStoragePut(
        this,
        storage,
        context,
        {
          encoding, fileContent, fileUrl, diskPath, bucket, fileName, contentType
        }
      );
      result = { success: true };
    } catch (e) {
      result = errorToOutput(e);
    }

    payload = payloadHelper.set(this.destination, result, payload);
    return [this.outputIds, payload];
  }
}

export default AwsS3PutNode;

