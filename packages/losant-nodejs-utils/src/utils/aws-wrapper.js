import errors from '../errors.js';
import {
  S3,
  GetObjectCommand,
  HeadObjectCommand,
  Upload,
  getSignedUrl,
  createPresignedPost
} from './s3.js';
import { isEmpty, timeoutP } from 'omnibelt';
import {
  getUploaderAndSignedUrlFunc,
  contentTypeFromFilename,
  DEFAULT_DOWNLOAD_EXPIRES,
  DEFAULT_UPLOAD_EXPIRES,
  transformErrorCurry,
  getLosantPutSignedUrl
} from './storage-helpers.js';
import zstreams from 'zstreams';
import { ONE_MIN_MS } from '../constants/time.js';
import { URL } from 'url';
import moment from 'moment';
import { createHmac, createHash } from 'crypto';

const CANNOT_CONNECT_ERROR = errors.Validation({ message: 'Could not connect to Amazon S3 with the given configuration.' });
// https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-s3/modules/_error.html
const isServerError = (err = {}) => {
  const code = err.code || err.Code || err.$metadata?.httpStatusCode;
  return code === 'InternalError' || // 500
    code === 'NotImplemented' || // 501
    code === 'ServiceUnavailable' || // 503
    code === 'SlowDown' || // 503
    code === 'busy' ||
    code === 'ETIMEDOUT' || // 400
    code === 500 ||
    code === 501 ||
    code === 503 ||
    code === 400;
};

const isNotFoundError = (err = {}) => {
  const code = err.code || err.Code || err.$metadata?.httpStatusCode;
  return code === 'NoSuchKey' || code === 'NotFound' || code === 404;
};


const getMessage = (err) => {
  const code = err.code || err.Code || err.$metadata?.httpStatusCode;
  if (code === 403 && err.message === 'UnknownError') {
    return 'The AWS Access Key Id you provided does not exist in our records.';
  }
  if (!err.message && code) {
    return String(code);
  }
  return err.message;
};

const transformError = transformErrorCurry('aws', { isNotFoundError, isServerError, getMessage });

const AwsWrapper = (config = {}) => {
  if (isEmpty(config)) {
    throw CANNOT_CONNECT_ERROR;
  }

  // a non string region will cause an error inside of the aws lib on init
  if (!config.region || typeof config.region !== 'string') {
    throw errors.Validation({ message: 'Region must be a string.' });
  }

  let s3;
  const recreateClient = () => {
    s3 = new S3({
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
      region: config.region
    });
    s3.middlewareStack.add((next) => async (...args) => {
      const result = await next(...args); // eslint-disable-line callback-return
      if (result?.response.statusCode === 301) {
        const region = result.response.headers['x-amz-bucket-region'];
        if (region && region !== config.region) {
          throw errors.ExternalStorage({
            storage: 'aws',
            message: `The region may be incorrect, expected ${region}`,
            isServerError: false,
            isNotFoundError: false,
            possibleRegion: region
          });
        }
      }
      return result;
    }, {
      step: 'deserialize',
      priority: 'low'
    });
  };
  recreateClient();

  const sendCommandRetryRegion = async (sendCommand) => {
    if (!config.allowRegionReplacement) {
      return sendCommand();
    }
    try {
      return await sendCommand();
    } catch (err) {
      if (err.possibleRegion) {
        config.region = err.possibleRegion;
        recreateClient();
        return sendCommand(true);
      } else {
        throw err;
      }
    }
  };

  const validateConfig = async ({ ensureBucketExists = false, bucket } = {}) => {
    if (!config.accessKeyId || typeof config.accessKeyId !== 'string') {
      throw errors.Validation({ message: 'Access Key ID is required and must be a string.' });
    }
    if (!config.secretAccessKey || typeof config.secretAccessKey !== 'string') {
      throw errors.Validation({ message: 'Secret Access Key is required and must be a string.' });
    }
    if (!bucket) { bucket = config.bucket; }
    if (!bucket || typeof bucket !== 'string') {
      throw errors.Validation({ message: 'Bucket is required and must be a string.' });
    }
    if (!ensureBucketExists) { return true; }

    try {
      await sendCommandRetryRegion(() => {
        return s3.getBucketAcl({ Bucket: bucket });
      });
    } catch (err) {
      throw err.possibleRegion ? err : CANNOT_CONNECT_ERROR;
    }
    return true;
  };


  const deleteFile = async (file, bucket) => {
    try {
      await s3.deleteObject({ Bucket: bucket, Key: file });
    } catch (err) {
      const sErr = transformError(err);
      // if there is noSuchKey consider that a delete since it's not in the bucket.
      if (!sErr || sErr.isNotFoundError) { return true; }
      throw sErr;
    }
    return true;
  };

  const copyFile = async (currentFile, newFile, bucket) => {
    // from what I can tell, the CopySource param has to be encoded
    // https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3.html#copyObject-property
    // destination key should not be encoded, and then the key passed to delete
    // should not be encoded, so we do a one off encode right here
    const encodedSourceKey = encodeURIComponent(currentFile).replace(/%2F/g, '/');
    try {
      await s3.copyObject({ Bucket: bucket, CopySource: `/${bucket}/${encodedSourceKey}`, Key: newFile });
    } catch (e) {
      throw transformError(e);
    }
  };

  const moveFile = async (currentFile, newFile, bucket) => {
    await copyFile(currentFile, newFile, bucket);
    return deleteFile(currentFile, bucket);
  };

  const getFileReadStream = async (file, bucket) => {
    let result;
    try {
      result = await s3.getObject({ Bucket: bucket, Key: file });
    } catch (e) {
      throw transformError(e);
    }
    return zstreams(result.Body)
      .on('error', function(err) {
        this.triggerChainError(transformError(err));
      });
  };

  const getFileInfo = async (file, bucket, returnAll=false) => {
    let data = null;

    try {
      data = await sendCommandRetryRegion(() => {
        return s3.send(new HeadObjectCommand({ Bucket: bucket, Key: file }));
      });
    } catch (err) {
      const sErr = transformError(err);
      if (sErr.isNotFoundError) {
        return null;
      }
      throw sErr;
    }
    if (returnAll) {
      return data;
    }
    return {
      etag: data?.ETag && data.ETag.replace(/"/g, '') || undefined,
      fileSize: Number(data?.ContentLength) || 0,
      contentType: data?.ContentType || contentTypeFromFilename(file) || 'application/octet-stream'
    };
  };

  const getDownloadSignedUrl = async (file, bucket, options = {}) => {
    const command = new GetObjectCommand({ Bucket: bucket, Key: file });
    return getSignedUrl(s3, command, { expiresIn: (options.expires || DEFAULT_DOWNLOAD_EXPIRES) / 1000 });
  };

  const getDownloadSignedUrlSync = (file, bucket, options = {}) => {
    // https://docs.aws.amazon.com/AmazonS3/latest/API/sigv4-query-string-auth.html
    if (!file.startsWith('/')) {
      file = `/${file}`;
    }
    const date = moment();
    const credential = `${config.accessKeyId}/${date.format('YYYYMMDD')}/${config.region}/s3/aws4_request`; //ACCESSKEY/20221104/us-east-1/s3/aws4_request
    let domainSuffix = 'com';
    if (config.region.startsWith('cn')) {
      domainSuffix = 'com.cn';
    }
    const host = `https://s3.${config.region}.amazonaws.${domainSuffix}`;
    const path = `${bucket}${file}`;
    const url = new URL(`${host}/${path}`);
    url.searchParams.set('X-Amz-Algorithm', 'AWS4-HMAC-SHA256');
    url.searchParams.set('X-Amz-Content-Sha256', 'UNSIGNED-PAYLOAD');
    url.searchParams.set('X-Amz-Credential', credential);
    url.searchParams.set('X-Amz-Date', date.format('YYYYMMDDTHHmmss[Z]'));
    url.searchParams.set('X-Amz-Expires', (options.expires || DEFAULT_DOWNLOAD_EXPIRES) / 1000);
    url.searchParams.set('X-Amz-SignedHeaders', 'host');
    url.searchParams.set('X-id', 'GetObject');
    const canonicalReq = `GET\n/${path}\n${url.search.replace('?', '')}\nhost:s3.${config.region}.amazonaws.${domainSuffix}\n\nhost\nUNSIGNED-PAYLOAD`;
    const canonicalRequestHash = createHash('sha256');
    canonicalRequestHash.update(canonicalReq);
    const toSign = `AWS4-HMAC-SHA256\n${date.format('YYYYMMDDTHHmmss[Z]')}\n${date.format('YYYYMMDD')}/${config.region}/s3/aws4_request\n${canonicalRequestHash.digest('hex')}`;
    const dataKey = createHmac('sha256', `AWS4${config.secretAccessKey}`);
    dataKey.update(date.format('YYYYMMDD'));
    const dateRegionKey = createHmac('sha256', dataKey.digest('hex'), { encoding: 'hex' });
    dateRegionKey.update(config.region);
    const dateRegionServiceKey = createHmac('sha256', dateRegionKey.digest('hex'), { encoding: 'hex' });
    dateRegionServiceKey.update('s3');
    const signingKey = createHmac('sha256', dateRegionServiceKey.digest('hex'), { encoding: 'hex' });
    signingKey.update('aws4_request');
    const signature = createHmac('sha256', signingKey.digest('hex'), { encoding: 'hex' });
    signature.update(toSign);
    url.searchParams.set('X-Amz-Signature', signature.digest('hex'));
    return url.toString();
  };

  const getPostSignedUrl = async (file, bucket, options = {}) => {
    const params = {
      Bucket: bucket,
      Fields: {
        key: file
      },
      Expires: (options.expires || DEFAULT_UPLOAD_EXPIRES) / 1000, // aws expects seconds instead of milliseconds
      Key: file
    };

    if (options.contentType) {
      params.Fields['Content-Type'] = options.contentType;
    }

    let signedInfo;
    try {
      signedInfo = await createPresignedPost(s3, params);  // aws expects seconds instead of milliseconds
    } catch (e) {
      throw transformError(e);
    }
    return signedInfo;
  };

  const _upload = async (filename, body, bucket, contentType, { serverSideEncryption, timeout, reGetStream } = {}) => {
    const uploadFile = async (isRetry) => {
      if (isRetry && reGetStream) {
        body = await reGetStream();
      }
      const upload = new Upload({
        client: s3,
        params: {
          Bucket: bucket,
          Key: filename,
          ContentType: contentType,
          Body: body,
          ACL: 'private',
          ServerSideEncryption: serverSideEncryption
        }
      });
      try {
        if (timeout) {
          await timeoutP(timeout, upload.done());
        } else {
          await upload.done();
        }
      } catch (err) {
        try { upload.abort(); } catch {}
        throw err;
      }
    };
    try {
      if (!reGetStream && typeof body !== 'string') {
        await uploadFile();
      } else {
        await sendCommandRetryRegion(uploadFile);
      }
    } catch (err) {
      throw transformError(err);
    }
  };

  const putObject = async (str, filename, bucket, contentType, options = {}) => {
    if (!options.timeout) { options.timeout = ONE_MIN_MS; }
    return _upload(filename, str, bucket, contentType, options);
  };

  const getPutSignedUrl = async (filename, bucket, options = {}) => {
    const putFunction = getLosantPutSignedUrl(options.apiUrl, { secret: options.secret, algo: options.algo, issuer: options.issuer });
    return putFunction(filename, bucket, options);
  };

  return {
    validateConfig,
    deleteFile,
    moveFile,
    getFileReadStream,
    getFileInfo,
    getPostSignedUrl,
    uploadStream: _upload,
    getDownloadSignedUrl,
    getPutSignedUrl,
    uploadStrAndSignUrl: getUploaderAndSignedUrlFunc(_upload, getDownloadSignedUrl),
    copyFile,
    putObject,
    getDownloadSignedUrlSync
  };
};

export default AwsWrapper;
