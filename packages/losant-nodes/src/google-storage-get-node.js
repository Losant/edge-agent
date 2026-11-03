import GcsWrapper from 'losant-nodejs-utils/src/utils/gcs-wrapper.js';
import errors from 'losant-nodejs-utils/src/errors.js';
import { validateAndParseJwt, validateAndGetProjectId } from './lib/google-auth.js';
import { pick } from 'omnibelt';
import { renderAndValidateCommonGetFields, performStorageGet } from './lib/node-storage-helpers.js';

class GoogleCloudStorageGetNode {

  /* Example Config:
  {
    destination: <String - Required: Payload path where the result is written. See Notes>,
    credentialNameTemplate: <String - Optional: Template for the name of a GCP credential to authenticate with. If set, the jwt keys are ignored>,
    projectIdTemplate: <String - Optional: Template for a project ID that overrides the project ID in the credential or JWT>,
    jwtDataMethod: <String - Optional: Either jsonTemplate or payloadPath. Default jsonTemplate. Not used if credentialNameTemplate is set>,
    jwtData: <String - Required unless credentialNameTemplate is set: JSON template or payload path (per jwtDataMethod) for the Service Account JWT>,
    bucketNameTemplate: <String - Required: Template for the GCS bucket to get from>,
    fileNameTemplate: <String - Required: Template for the full path to a file within the given bucket. Maximum 1024 characters>,
    encodingTemplate: <String - Optional: Template for the encoding of the file to get. Default utf8. Ignored if isDownloadURL is true>,
    isDownloadURL: <Boolean - Optional: If true, a signed download URL is returned instead of the file contents. encodingTemplate and diskPathTemplate are ignored. Default false>,
    diskPathTemplate: <String - Optional: Only available on edge. If set, the file is written to this location instead of being returned>,
    shouldAppend: <Boolean - Optional: Only used with diskPathTemplate. If true, the contents are appended to the file rather than overwriting it. Default false>,
    errorIfFileExists: <Boolean - Optional: Only used with diskPathTemplate. If true, the operation fails if the file already exists. If false, an existing file is written over. Default false>
  }
  Notes:
    Result: { metadata, value } is written to destination. value is the file contents, the signed download URL
      (isDownloadURL), or the disk path the file was written to (diskPathTemplate).
    Errors: If the file is not found, is too large to return, or the download fails, { error } (the error message)
      is written to destination rather than thrown. Invalid config and credential problems throw.
  */

  constructor(id, outputIds, config) {
    this.id = id;
    this.outputIds = outputIds;
    this.destination = config.destination;
    this.credentialNameTemplate = config.credentialNameTemplate;
    this.projectIdTemplate = config.projectIdTemplate;
    this.jwtDataMethod = config.jwtDataMethod || 'jsonTemplate';
    this.jwtData = config.jwtData;
    this.isDownloadURL = config.isDownloadURL || false;
    this.bucketNameTemplate = config.bucketNameTemplate;
    this.fileNameTemplate = config.fileNameTemplate;
    this.encodingTemplate = config.encodingTemplate || 'utf8';
    this.diskPathTemplate = config.diskPathTemplate;
    this.shouldAppend = config.shouldAppend || false;
    this.errorIfFileExists = config.errorIfFileExists || false;
  }

  async createStorageInstance(context, payload) {
    const { jwt: keyJson } = await validateAndParseJwt(payload, context, {
      jwtJsonTemplate: this.jwtData,
      jwtPayloadPath: this.jwtData,
      jwtDataMethod: this.jwtDataMethod,
      credentialNameTemplate: this.credentialNameTemplate
    });

    if (!keyJson) { throw errors.Validation({ message: 'Account key is required' }); }
    const projectId = validateAndGetProjectId(keyJson, this.projectIdTemplate, payload);
    const storage = GcsWrapper({ keyJson: pick(['client_email', 'private_key'], keyJson), projectId });
    return storage;
  }

  async run(context, payload) {
    const { encoding, diskPath, bucket, filename } = await renderAndValidateCommonGetFields(this, context, payload);
    const storage = await this.createStorageInstance(context, payload);
    await storage.validateConfig({ bucket });
    payload = await performStorageGet(this, storage, payload, { encoding, diskPath, bucket, filename });
    return [this.outputIds, payload];
  }
}

export default GoogleCloudStorageGetNode;
