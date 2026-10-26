import { renderAndValidateCommonGetFields, performStorageGet } from './lib/node-storage-helpers.js';
import AwsNodeBase from './lib/base-aws-node.js';

class AwsS3GetNode extends AwsNodeBase {

  /* Example Config:
  {
    // defined in base class
    credentialNameTemplate: <String - Optional: name of the AWS credential to auth with. When set, the access key, secret, and region keys below are ignored>,
    accessKeyIdTemplate: <String - Required unless credentialNameTemplate is set: Amazon Access Key>,
    secretAccessKeyTemplate: <String - Required unless credentialNameTemplate is set: Amazon Access Key Secret>,
    regionTemplate: <String - Required unless credentialNameTemplate is set: Amazon Region>,

    destination: <String - Required: payload path for { value, metadata } on success or { error: <message String> } on failure>,
    bucketNameTemplate: <String - Required: S3 bucket to get from>,
    fileNameTemplate: <String - Required: full path to a file within the given bucket. Maximum 1024 characters>,
    encodingTemplate: <String - Optional: encoding used to read the file (and to write it to disk). Default utf8. Ignored when isDownloadURL is true>,
    isDownloadURL: <Boolean - Optional: when true, value is a signed download URL instead of the file contents. Default false>,
    diskPathTemplate: <String - Optional: only available on edge. When set, the file is written to this path and value is that path instead of the contents. Ignored when isDownloadURL is true>,
    shouldAppend: <Boolean - Optional: only used with diskPathTemplate. Append to the file instead of overwriting it. Default false>,
    errorIfFileExists: <Boolean - Optional: only used with diskPathTemplate. When true, the write fails if a file already exists at the disk path; when false, an existing file is overwritten (or appended to). Default false>
  }
  Notes:
  A single output is used (outputIds).
  The result at destination is { value, metadata } where metadata is the file info returned by storage. Failures (file not found, file larger than the response size limit when not writing to disk, disk write errors) do not throw: they are written to destination as { error: <message String> }.
  */

  constructor(id, outputIds, config) {
    super(id, outputIds, config);
    this.destination = config.destination;
    this.isDownloadURL = config.isDownloadURL || false;
    this.bucketNameTemplate = config.bucketNameTemplate;
    this.fileNameTemplate = config.fileNameTemplate;
    this.encodingTemplate = config.encodingTemplate || 'utf8';
    this.diskPathTemplate = config.diskPathTemplate;
    this.shouldAppend = config.shouldAppend || false;
    this.errorIfFileExists = config.errorIfFileExists || false;
  }

  async run(context, payload) {
    // { encoding, diskPath, bucket, filename }
    const renderedFields = await renderAndValidateCommonGetFields(this, context, payload);
    const storage = await this.createStorageInstance(context, payload, renderedFields.bucket);
    payload = await performStorageGet(this, storage, payload, renderedFields);
    return [this.outputIds, payload];
  }
}

export default AwsS3GetNode;

