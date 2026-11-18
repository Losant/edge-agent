import { Storage as GCStorage } from '@google-cloud/storage';
import { JWT } from 'google-auth-library';
import errors from '../errors.js';
import {
  includes, clone, isEmpty,
  defer, timeoutP
} from 'omnibelt';
import { ONE_MIN_MS } from '../constants/time.js';
import {
  getUploaderAndSignedUrlFunc, contentTypeFromFilename, DEFAULT_DOWNLOAD_EXPIRES, DEFAULT_UPLOAD_EXPIRES, transformErrorCurry, uploadStreamByDiskCurry, validateGoogleConfig
} from './storage-helpers.js';
import crypto from 'crypto';
import qs from 'qs';
import stream from 'stream';
import zstreams from 'zstreams';
import fs from 'fs-extra';

const CANNOT_CONNECT_ERROR = errors.Validation({ message: 'Could not connect to Google Cloud Storage with the given configuration.' });

const RESUMABLE_THRESHOLD = 5000000;

const ACTION_TO_HTTP_METHOD = { read: 'GET', write: 'PUT', delete: 'DELETE', resumable: 'POST' };

const isServerError = (error) => {
  return (error.response && error.response.statusCode >= 500) || error.code === 'ETIMEDOUT';
};
const isNotFoundError = (err) => {
  return err && (includes('No such object', err.message) || err.code === 404);
};

const transformError = transformErrorCurry('gcs', { isNotFoundError, isServerError });

// The following helpers port @google-cloud/storage's own internal signing logic
// (src/util.js, src/signer.js#getSignedUrlV2, src/file.js#generateSignedPostPolicyV2)
// so we can sign directly with the service account private key. We can't use the
// library's own file.getSignedUrl()/generateSignedPostPolicyV2() for this: they
// resolve the GoogleAccessId via authClient.getCredentials(), which only works
// when GoogleAuth was constructed with its now-deprecated `credentials` option.
const fixedEncodeURIComponent = (str) => {
  return encodeURIComponent(str).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
};
const gcsEncodeURI = (uri, encodeSlash) => {
  return uri.split('/').map(fixedEncodeURIComponent).join(encodeSlash ? '%2F' : '/');
};
const gcsQsStringify = (queryObj) => {
  return Object.keys(queryObj)
    .map((key) => `${gcsEncodeURI(key, true)}=${gcsEncodeURI(String(queryObj[key]), true)}`)
    .join('&');
};
const getCanonicalHeaders = (headers = {}) => {
  return Object.keys(headers)
    .map((name) => [name.toLowerCase(), headers[name]])
    .sort((a, b) => a[0].localeCompare(b[0]))
    .filter(([, value]) => value !== undefined)
    .map(([name, value]) => `${name}:${String(value).trim().replace(/\s{2,}/g, ' ')}\n`)
    .join('');
};
const getResourcePath = (cname, bucket, file) => {
  if (cname) { return `/${file || ''}`; }
  if (file) { return `/${bucket}/${file}`; }
  return `/${bucket}`;
};
const signWithPrivateKey = (privateKey, data) => {
  return crypto.createSign('RSA-SHA256').update(data).sign(privateKey, 'base64');
};

const GcsStorage = (config = {}) => {
  // this will unwrap keyJson if coming from application beforeSave
  // thus clone it so this can do what it wants.
  if (isEmpty(config)) {
    throw CANNOT_CONNECT_ERROR;
  }
  config = clone(config);
  const bucketToDomainMap = config.bucketToDomainMap || {};
  delete config.bucketToDomainMap;

  const getCreds = (configuration = {}) => {
    let credentials;
    if (typeof configuration.keyJson === 'string') {
      try { credentials = JSON.parse(configuration.keyJson); } catch {}
    }
    return credentials || configuration.keyJson;
  };
  if (!config.credentials || !config.credentials.client_email || !config.credentials.private_key) {
    config.credentials = getCreds(config);
  }
  // Built directly from the service account's email/key via the JWT constructor,
  // per google-auth-library's own guidance, instead of GoogleAuth's deprecated
  // `credentials` option. Used only for regular API calls (list/get/put/delete) -
  // all signed-URL/policy generation below signs with the private key directly.
  // Scopes match what Storage applies internally when it builds its own default
  // auth client from `credentials`.
  const authClient = new JWT({
    email: config.credentials.client_email,
    key: config.credentials.private_key,
    scopes: [
      'https://www.googleapis.com/auth/iam',
      'https://www.googleapis.com/auth/cloud-platform',
      'https://www.googleapis.com/auth/devstorage.full_control'
    ]
  });

  const gcs = new GCStorage({
    authClient,
    projectId: config.projectId || config.credentials.project_id
  });

  const getFile = (filename, bucketName) => {
    const bucket = gcs.bucket(bucketName);
    return bucket.file(filename);
  };

  const validateConfig = async ({ ensureBucketExists = false, bucket } = {}) => {
    await validateGoogleConfig(config);
    if (!bucket) { bucket = config.bucket; }
    if (!bucket || typeof bucket !== 'string') {
      throw errors.Validation({ message: 'Bucket is required and must be a string.' });
    }
    if (!ensureBucketExists) { return true; }
    await gcs.bucket(bucket).getFiles({ maxResults: 1 }).catch(() => {
      throw CANNOT_CONNECT_ERROR;
    });
    return true;
  };

  const deleteFile = async (filename, bucket) => {
    const file = getFile(filename, bucket);
    try {
      await file.delete();
      return true;
    } catch (err) {
      const sErr = transformError(err);
      if (sErr.isNotFoundError) {
        return true;
      }
      throw sErr;
    }
  };
  // this will only copy files within the same bucket
  const copyFile = async (currentFile, newFile, bucket) => {
    const file = getFile(currentFile, bucket);
    let copy;
    try {
      copy = await file.copy(newFile);
    } catch (err) {
      throw transformError(err);
    }
    return copy;
  };

  const moveFile = async (currentFile, newFile, bucket) => {
    const file = getFile(currentFile, bucket);
    try {
      await file.move(newFile);
    } catch (err) {
      throw transformError(err);
    }
    return true;
  };

  const getFileReadStream = async (filename, bucket, options) => {
    return zstreams(getFile(filename, bucket).createReadStream(options))
      .on('error', function(err) {
        this.triggerChainError(transformError(err));
      });
  };

  const getFileInfo = async (filename, bucket) => {
    const file = getFile(filename, bucket);
    try {
      const metadata = (await file.getMetadata())[0];
      return {
        etag: metadata.etag || undefined,
        fileSize: Number(metadata.size) || 0,
        contentType: metadata.contentType || contentTypeFromFilename(filename) || 'application/octet-stream'
      };
    } catch (err) {
      const sErr = transformError(err);
      if (sErr.isNotFoundError) {
        return null;
      }
      throw sErr;
    }
  };

  // Ports signer.js#getSignedUrlV2 + file.js#getSignedUrl's option handling.
  const signUrl = (action, expiresDefault) => {
    return async (filename, bucket, options = {}) => {
      const method = ACTION_TO_HTTP_METHOD[action];
      const expiresInSeconds = Math.floor((Date.now() + (options.expires || expiresDefault)) / 1000);

      const extensionHeaders = {};
      Object.keys(options.extensionHeaders || {}).forEach((key) => {
        extensionHeaders[key.toLowerCase()] = options.extensionHeaders[key];
      });

      const queryParams = { ...options.queryParams };
      if (typeof options.responseType === 'string') {
        queryParams['response-content-type'] = options.responseType;
      }
      const promptSaveAs = options.promptSaveAs || filename.substring(filename.lastIndexOf('/')+1);
      queryParams['response-content-disposition'] = `attachment; filename="${promptSaveAs}"`;
      if (typeof options.responseDisposition === 'string') {
        queryParams['response-content-disposition'] = options.responseDisposition;
      }

      const cname = options.cname || bucketToDomainMap[bucket];
      const encodedFile = gcsEncodeURI(filename, false);
      const canonicalHeadersString = getCanonicalHeaders(extensionHeaders);
      const stringToSign = [
        method,
        options.contentMd5 || '',
        options.contentType || '',
        expiresInSeconds,
        canonicalHeadersString + getResourcePath(false, bucket, encodedFile)
      ].join('\n');
      const signature = signWithPrivateKey(config.credentials.private_key, stringToSign);

      // Key order matches signer.js's `Object.assign({GoogleAccessId, Expires,
      // Signature}, cfg.queryParams)`, which appends extra params after the
      // core three rather than merging them in first.
      const query = {
        GoogleAccessId: config.credentials.client_email,
        Expires: expiresInSeconds,
        Signature: signature,
        ...queryParams
      };
      const host = cname || 'https://storage.googleapis.com';
      return `${host}${getResourcePath(!!cname, bucket, encodedFile)}?${gcsQsStringify(query)}`;
    };
  };

  const getDownloadSignedUrlSync = (filename, bucket, options = {}) => {
    const expires = Math.floor((Date.now() + (options.expires || DEFAULT_DOWNLOAD_EXPIRES)) / 1000);

    const signingPath = `/${bucket}/${filename}`;
    const url = bucketToDomainMap[bucket] ?
      `${bucketToDomainMap[bucket]}/${filename}` : `https://storage.googleapis.com${signingPath}`;

    const stringPolicy = [
      'GET',
      '', // contentMD5
      '', // contentType
      expires,
      signingPath
    ].join('\n');
    const signature = crypto.createSign('RSA-SHA256')
      .update(Buffer.from(stringPolicy).toString('base64'), 'base64')
      .sign(config.credentials.private_key, 'base64');
    const queryObj = {
      GoogleAccessId: config.credentials.client_email,
      Expires: expires,
      Signature: signature
    };

    const promptSaveAs = options.promptSaveAs || filename.substring(filename.lastIndexOf('/')+1);
    if (promptSaveAs) {
      queryObj['response-content-disposition'] = `attachment; filename="${promptSaveAs}"`;
    }

    const queryStr = qs.stringify(queryObj);

    return `${url}?${queryStr}`;
  };

  // signed URL for uploading a file with a PUT request
  const getPutSignedUrl = signUrl('write', DEFAULT_UPLOAD_EXPIRES);

  const getDownloadSignedUrl = signUrl('read', DEFAULT_DOWNLOAD_EXPIRES);

  // Ports file.js#generateSignedPostPolicyV2.
  const getPostSignedUrl = async (filename, bucket, options = {}) => {
    const expires = new Date(Date.now() + (options.expires || DEFAULT_UPLOAD_EXPIRES));
    const conditions = [
      ['eq', '$key', filename],
      { bucket }
    ];
    if (options.contentType) {
      conditions.push(['eq', '$Content-Type', options.contentType]);
    }
    const policyBase64 = Buffer.from(JSON.stringify({ expiration: expires.toISOString(), conditions })).toString('base64');
    const signature = signWithPrivateKey(config.credentials.private_key, policyBase64);

    return {
      url: bucketToDomainMap[bucket] || `https://storage.googleapis.com/${bucket}`,
      fields: {
        'GoogleAccessId': config.credentials.client_email,
        'key': filename,
        'Content-Type': options.contentType,
        bucket,
        'policy': policyBase64,
        signature
      }
    };
  };

  const _gcsUpload = async (bucket, filename, localPath, contentType, options) => {
    options = {
      destination: filename,
      resumable: false,
      metadata: { },
      ...options
    };
    if (contentType) { options.metadata.contentType = contentType; }

    // maintain the pre storage 6 behavior of setting resumable to true
    // only for larger files: https://github.com/googleapis/nodejs-storage/pull/1864/files
    try {
      const stats = await fs.stat(localPath);
      if (stats.size > RESUMABLE_THRESHOLD) {
        options.resumable = true;
      }
    } catch {}

    return gcs.bucket(bucket).upload(localPath, options);
  };
  const uploadStream = uploadStreamByDiskCurry(_gcsUpload);

  const putObject = async (str, filename, bucket, contentType, options = {}) => {
    const timeout = options.timeout || ONE_MIN_MS;
    options = {
      ...options,
      contentType,
      resumable: false
    };
    delete options.timeout;
    const deferred = defer();
    const file = getFile(filename, bucket);
    const writeStream = file.createWriteStream(options);
    writeStream.on('finish', () => {
      deferred.resolve();
    });
    writeStream.on('error', (err) => {
      deferred.reject(err);
    });
    const readStream = stream.Readable.from(str);
    readStream.pipe(writeStream);
    try {
      await timeoutP(timeout, deferred.promise);
    } catch (err) {
      if (!writeStream.writableEnded) {
        try {
          writeStream.destroy();
        } catch {}
      }
      throw transformError(err);
    }
  };

  return {
    validateConfig,
    deleteFile,
    moveFile,
    getFileInfo,
    getFileReadStream,
    getPostSignedUrl,
    uploadStream,
    getDownloadSignedUrl,
    getPutSignedUrl,
    uploadStrAndSignUrl: getUploaderAndSignedUrlFunc(uploadStream, getDownloadSignedUrl),
    copyFile,
    putObject,
    getDownloadSignedUrlSync
  };

};

export default GcsStorage;
