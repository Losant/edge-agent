import GcsWrapper from 'losant-nodejs-utils/src/utils/gcs-wrapper.js';
import * as payloadHelper from 'losant-handlebars';
import errors from 'losant-nodejs-utils/src/errors.js';
import { isTimeoutError } from './lib/common.js';
import { validateAndParseJwt, validateAndGetProjectId } from './lib/google-auth.js';
import { pick } from 'omnibelt';
import { renderAndValidateCommonPutFields, performStoragePut } from './lib/node-storage-helpers.js';

const errorToOutput = (e) => {
  if (isTimeoutError(e)) {
    const error = errors.NodeTimeout({ title: 'Google Cloud Storage: Upload' });
    return { error: { type: error.type, message: error.message }, success: false };
  } else {
    return { error: e.message, success: false };
  }
};

class GoogleCloudStoragePutNode {

  /* Example Config:
  {
    destination: <String - Required: Payload path where the result of the put is written. See Notes>,
    credentialNameTemplate: <String - Optional: Template for the name of a GCP credential to authenticate with. If set, the jwt keys are ignored>,
    projectIdTemplate: <String - Optional: Template for a project ID that overrides the project ID in the credential or JWT>,
    jwtDataMethod: <String - Optional: Either jsonTemplate or payloadPath. Default jsonTemplate. Not used if credentialNameTemplate is set>,
    jwtData: <String - Required unless credentialNameTemplate is set: JSON template or payload path (per jwtDataMethod) for the Service Account JWT>,
    bucketNameTemplate: <String - Required: Template for the bucket to put to>,
    fileNameTemplate: <String - Required: Template for the full path to a file within the given bucket. Maximum 1024 characters>,
    encodingTemplate: <String - Optional: Template for the encoding of the file to put. Default utf8. Not used when fileUrlTemplate is set>,
    contentTypeTemplate: <String - Required: Template for the MIME type of the file being uploaded. An empty value throws a validation error>,
    fileContentTemplate: <String - Optional: Template for the contents of the file being uploaded>,
    fileUrlTemplate: <String - Optional: Template for a URL to a file or internet resource to upload>,
    diskPathTemplate: <String - Optional: Template for the disk file to upload. Only available on edge>
  }
  Notes:
    Source: Provide exactly one of fileUrlTemplate, diskPathTemplate, or fileContentTemplate. If more than one is set,
      precedence is fileUrlTemplate, then diskPathTemplate, then fileContentTemplate.
    Result: { success: true } is written to destination on success. On failure, { error, success: false } is written,
      where error is the error message (or { type, message } for a timeout). This includes a diskPathTemplate file that
      is not found. Validation errors in the config, and credential problems, throw.
  */

  constructor(id, outputIds, config) {
    this.id = id;
    this.outputIds = outputIds;
    this.destination = config.destination;
    this.credentialNameTemplate = config.credentialNameTemplate;
    this.projectIdTemplate = config.projectIdTemplate;
    this.jwtDataMethod = config.jwtDataMethod || 'jsonTemplate';
    this.jwtData = config.jwtData;

    this.bucketNameTemplate = config.bucketNameTemplate;
    this.fileNameTemplate = config.fileNameTemplate;

    this.contentTypeTemplate = config.contentTypeTemplate;
    this.fileContentTemplate = config.fileContentTemplate;
    this.encodingTemplate = config.encodingTemplate || 'utf8';
    this.fileUrlTemplate = config.fileUrlTemplate;
    this.diskPathTemplate = config.diskPathTemplate;
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

export default GoogleCloudStoragePutNode;
