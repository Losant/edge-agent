import {
  BlobServiceClient, StorageSharedKeyCredential, BlobSASPermissions, generateBlobSASQueryParameters
} from '@azure/storage-blob';

import errors from '../errors.js';
import { isEmpty } from 'omnibelt';
import {
  getUploaderAndSignedUrlFunc,
  contentTypeFromFilename,
  DEFAULT_DOWNLOAD_EXPIRES,
  transformErrorCurry,
  getLosantPostSignedUrl,
  getLosantPutSignedUrl
} from './storage-helpers.js';
import zstreams from 'zstreams';
import { ONE_MIN_MS } from '../constants/time.js';

const CANNOT_CONNECT_ERROR = errors.Validation({ message: 'Could not connect to Azure with the given configuration.' });

const isServerError = (error) => {
  return error.statusCode >= 500;
};

const isNotFoundError = (err) => {
  return err && (err.code === 'BlobNotFound' || err.statusCode === 404);
};

const transformError = transformErrorCurry('azure', { isNotFoundError, isServerError });

const AzureStorage = (config = {}) => {
  if (isEmpty(config)) { throw CANNOT_CONNECT_ERROR; }
  if (!config.account || typeof config.account !== 'string') {
    throw errors.Validation({ message: 'Account is required and must be a string.' });
  }
  if (!config.accountKey || typeof config.accountKey !== 'string') {
    throw errors.Validation({ message: 'Account Key is required and must be a string.' });
  }
  const blobServiceClient = new BlobServiceClient(
    `https://${config.account}.blob.core.windows.net`,
    new StorageSharedKeyCredential(config.account, config.accountKey),
    { connectionOptions: { retryOptions: { maxTries: 1, tryTimeoutInMs: ONE_MIN_MS } } }
  );

  const getClient = (filename, bucket, options = {}) => {
    const containerClient = blobServiceClient.getContainerClient(bucket);
    if (options.timeout) {
      containerClient.pipeline.options.connectionOptions.retryOptions.tryTimeoutInMs = options.timeout;
    }
    return containerClient.getBlockBlobClient(filename);
  };

  const validateConfig = async ({ ensureBucketExists = false, bucket } = {}) => {
    if (!bucket) { bucket = config.bucket; }
    if (!bucket || typeof bucket !== 'string') {
      throw errors.Validation({ message: 'Bucket is required and must be a string.' });
    }
    if (!ensureBucketExists) { return true; }
    let containerExists;
    try {
      const containerClient = blobServiceClient.getContainerClient(bucket);
      containerExists = await containerClient.exists();
    } catch (e) {
      if (e.statusCode === 403) { throw errors.Validation({ message: 'Forbidden' }); } //a 403 from Azure does not include a message
      if (e.message) { throw errors.Validation({ message: e.message }); }
      throw CANNOT_CONNECT_ERROR;
    }
    if (!containerExists) { throw errors.Validation({ message: `The container ${bucket} was not found` }); }
  };

  const getDownloadSignedUrlSync = (filename, bucket, options = {}) => {
    const now = new Date();
    const sharedAccessPolicy = {
      permissions: BlobSASPermissions.from({ read: 1 }),
      startsOn: now,
      expiresOn: new Date(Number(now) + (options.expires || DEFAULT_DOWNLOAD_EXPIRES)),
      protocol: 'https',
      containerName: bucket,
      blobName: filename
    };

    const client = getClient(filename, bucket);
    const params = generateBlobSASQueryParameters(sharedAccessPolicy, client.credential);
    return `${client.url}?${params}`;
  };

  const getDownloadSignedUrl = async (filename, bucket, options = {}) => {
    const now = new Date();
    const sharedAccessPolicy = {
      permissions: BlobSASPermissions.from({ read: 1 }),
      startsOn: now,
      expiresOn: new Date(Number(now) + (options.expires || DEFAULT_DOWNLOAD_EXPIRES)),
      protocol: 'https'
    };

    const client = getClient(filename, bucket);
    return client.generateSasUrl(sharedAccessPolicy);
  };

  const deleteFile = async (filename, bucket) => {
    try {
      const client = getClient(filename, bucket);
      await client.deleteIfExists();
      return true;
    } catch (e) {
      throw transformError(e);
    }
  };

  const copyFile = async (sourceFile, destinationFile, bucket) => {
    try {
      const sourceUrl = await getDownloadSignedUrl(sourceFile, bucket);
      const destinationClient = getClient(destinationFile, bucket);
      await destinationClient.syncCopyFromURL(sourceUrl);
      return true;
    } catch (e) {
      throw transformError(e);
    }
  };

  const moveFile = async (sourceFile, destinationFile, bucket) => {
    await copyFile(sourceFile, destinationFile, bucket);
    return deleteFile(sourceFile, bucket);
  };

  const getFileReadStream = async (filename, bucket) => {
    const client = getClient(filename, bucket);
    try {
      return zstreams((await client.download()).blobDownloadStream);
    } catch (e) {
      throw transformError(e);
    }
  };

  const getFileInfo = async (filename, bucket) => {
    const client = getClient(filename, bucket);
    try {
      const data = await client.getProperties();
      return {
        etag: data.etag,
        contentType: data.contentSettings?.contentType || contentTypeFromFilename(filename) || 'application/octet-stream',
        fileSize: Number(data.contentLength) || 0
      };
    } catch (e) {
      const cleanErr = transformError(e);
      if (cleanErr.isNotFoundError) { return null; }
      throw cleanErr;
    }
  };

  const uploadStream = async (filename, readStream, bucket, contentType, options = {}) => {
    const client = getClient(filename, bucket, options);
    if (!options.blobHTTPHeaders) {
      options.blobHTTPHeaders = { blobContentType: contentType };
    }

    // letting buffer size and concurrency default
    await client.uploadStream(readStream, undefined, undefined, options);
    return true;
  };

  const putObject = async (str, filename, bucket, contentType, options = {}) => {
    const client = getClient(filename, bucket, options);
    if (!options.blobHTTPHeaders) {
      options.blobHTTPHeaders = { blobContentType: contentType };
    }
    return client.uploadData(Buffer.from(str), options);
  };

  return {
    validateConfig,
    deleteFile,
    moveFile,
    getFileInfo,
    getFileReadStream,
    getPostSignedUrl: getLosantPostSignedUrl(config.apiUrl, config.jwtInfo),
    uploadStream,
    getDownloadSignedUrl,
    getPutSignedUrl: getLosantPutSignedUrl(config.apiUrl, config.jwtInfo),
    uploadStrAndSignUrl: getUploaderAndSignedUrlFunc(uploadStream, getDownloadSignedUrl),
    copyFile,
    putObject,
    getDownloadSignedUrlSync
  };
};

export default AzureStorage;

