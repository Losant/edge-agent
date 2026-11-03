import AzureWrapper from 'losant-nodejs-utils/src/utils/azure-wrapper.js';
import * as payloadHelper from 'losant-handlebars';
import errors from 'losant-nodejs-utils/src/errors.js';
import { isTimeoutError } from './lib/common.js';
import { renderAndValidateCommonPutFields, performStoragePut } from './lib/node-storage-helpers.js';

const errorToOutput = (e) => {
  if (isTimeoutError(e)) {
    const error = errors.NodeTimeout({ title: 'Azure Blob Storage: Put' });
    return { error: { type: error.type, message: error.message }, success: false };
  } else {
    return { error: e.message, success: false };
  }
};

export const getAzureStorage = async function(node, { applicationId, loadCredential }, payload) {
  let storage;
  if (node.credentialNameTemplate) {
    const azureConfig = await loadCredential({
      credentialNameTemplate: node.credentialNameTemplate,
      type: 'azure',
      applicationId,
      payload
    });
    storage = AzureWrapper(azureConfig);
  } else {
    storage = AzureWrapper({
      account: payloadHelper.renderToString(node.accountTemplate, payload),
      accountKey: payloadHelper.renderToString(node.accountKeyTemplate, payload)
    });
  }

  return storage;
};


class AzureBlobStoragePutNode {

  /* Example Config:
  {
    destination: <String - Optional: payload path for { success: true } on success or { success: false, error: <message String> } on failure>,
    credentialNameTemplate: <String - Optional: template resolving to the name of the Azure credential to auth with. When set, accountTemplate and accountKeyTemplate are ignored>,
    accountTemplate: <String - Required unless credentialNameTemplate is set: Azure Storage account name>,
    accountKeyTemplate: <String - Required unless credentialNameTemplate is set: Azure Storage account access key>,
    containerNameTemplate: <String - Required: Azure container to put to>,
    blobNameTemplate: <String - Required: full path to a blob within the given container. Maximum 1024 characters>,
    contentTypeTemplate: <String - Required: MIME type of the blob being uploaded>,
    blobContentTemplate: <String - Required unless blobUrlTemplate or diskPathTemplate is set: the contents of the blob being uploaded>,
    blobUrlTemplate: <String - Optional: URL of a blob or internet resource to download and upload. Takes precedence over diskPathTemplate and blobContentTemplate>,
    diskPathTemplate: <String - Optional: the disk file to upload (only available on edge). Takes precedence over blobContentTemplate>,
    encodingTemplate: <String - Optional: encoding of the blob content. Default utf8. Not used with blobUrlTemplate>
  }
  Notes:
  A single output is used (outputIds).
  Upload failures (including timeouts and a disk file that is not found) do not throw: they are written to destination as { success: false, error: <message String> }. A timeout is written as { success: false, error: { type, message } }.
  A missing content type, an over-long blob name, an invalid encoding, or an invalid container/credential configuration throws.
  */

  constructor(id, outputIds, config) {
    this.id = id;
    this.outputIds = outputIds;
    this.destination = config.destination;
    this.credentialNameTemplate = config.credentialNameTemplate;
    this.accountTemplate = config.accountTemplate;
    this.accountKeyTemplate = config.accountKeyTemplate;
    this.containerNameTemplate = config.containerNameTemplate;
    this.blobNameTemplate = config.blobNameTemplate;
    this.contentTypeTemplate = config.contentTypeTemplate;
    this.blobContentTemplate = config.blobContentTemplate;
    this.encodingTemplate = config.encodingTemplate || 'utf8';
    this.blobUrlTemplate = config.blobUrlTemplate;
    this.diskPathTemplate = config.diskPathTemplate;
  }

  async createStorageInstance(context, payload) {
    return getAzureStorage(this, context, payload);
  }

  async run(context, payload) {
    let result;
    const {
      encoding, fileContent, fileUrl, diskPath, bucket, fileName, contentType, error
    } = await renderAndValidateCommonPutFields(
      this,
      context,
      payload,
      { fileKey: 'blob', bucketKey: 'containerNameTemplate' }
    );

    if (error) {
      payload = payloadHelper.set(this.destination, errorToOutput(error), payload);
      return [this.outputIds, payload];
    }

    const storage = await this.createStorageInstance(context, payload);
    await storage.validateConfig({ bucket });

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

export default AzureBlobStoragePutNode;
