import { getAzureStorage } from './azure-blob-storage-put-node.js';
import { renderAndValidateCommonGetFields, performStorageGet } from './lib/node-storage-helpers.js';

class AzureBlobStorageGetNode {

  /* Example Config:
  {
    destination: <String - Required: payload path for { value, metadata } on success or { error: <message String> } on failure>,
    credentialNameTemplate: <String - Optional: template resolving to the name of the Azure credential to auth with. When set, accountTemplate and accountKeyTemplate are ignored>,
    accountTemplate: <String - Required unless credentialNameTemplate is set: Azure Storage account name>,
    accountKeyTemplate: <String - Required unless credentialNameTemplate is set: Azure Storage account access key>,
    containerNameTemplate: <String - Required: Azure container to get from>,
    blobNameTemplate: <String - Required: full path to a blob within the given container. Maximum 1024 characters>,
    encodingTemplate: <String - Optional: encoding used to read the blob (and to write it to disk). Default utf8. Ignored when isDownloadURL is true>,
    isDownloadURL: <Boolean - Optional: when true, value is a signed download URL instead of the blob contents. Default false>,
    diskPathTemplate: <String - Optional: only available on edge. When set, the blob is written to this path and value is that path instead of the contents. Ignored when isDownloadURL is true>,
    shouldAppend: <Boolean - Optional: only used with diskPathTemplate. Append to the file instead of overwriting it. Default false>,
    errorIfFileExists: <Boolean - Optional: only used with diskPathTemplate. When true, the write fails if a file already exists at the disk path; when false, an existing file is overwritten (or appended to). Default false>
  }
  Notes:
  A single output is used (outputIds).
  The result at destination is { value, metadata } where metadata is the blob info returned by storage. Failures (blob not found, blob larger than the response size limit when not writing to disk, disk write errors) do not throw: they are written to destination as { error: <message String> }.
  */

  constructor(id, outputIds, config) {
    this.id = id;
    this.outputIds = outputIds;
    this.destination = config.destination;
    this.isDownloadURL = config.isDownloadURL || false;
    this.credentialNameTemplate = config.credentialNameTemplate;
    this.accountTemplate = config.accountTemplate;
    this.accountKeyTemplate = config.accountKeyTemplate;
    this.containerNameTemplate = config.containerNameTemplate;

    this.blobNameTemplate = config.blobNameTemplate;
    this.encodingTemplate = config.encodingTemplate || 'utf8';
    this.diskPathTemplate = config.diskPathTemplate;
    this.shouldAppend = config.shouldAppend || false;
    this.errorIfFileExists = config.errorIfFileExists || false;
  }

  async createStorageInstance(context, payload) {
    return getAzureStorage(this, context, payload);
  }

  async run(context, payload) {
    const { encoding, diskPath, bucket, filename } = await renderAndValidateCommonGetFields(this, context, payload, {
      filenameKey: 'blobNameTemplate',
      bucketKey: 'containerNameTemplate'
    });
    const storage = await this.createStorageInstance(context, payload);
    await storage.validateConfig({ bucket });
    payload = await performStorageGet(this, storage, payload, { encoding, diskPath, bucket, filename });
    return [this.outputIds, payload];
  }
}

export default AzureBlobStorageGetNode;
