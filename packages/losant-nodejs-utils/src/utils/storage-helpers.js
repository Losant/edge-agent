import { Readable as stream } from 'stream';
import path from 'node:path';
import mime from 'mime-types';
import { ONE_DAY_MS, ONE_HOUR_MS } from '../constants/time.js';
import errors from '../errors.js';
import { validateSSLKey } from './validate-ssl.js';
import { createSigner } from 'fast-jwt';
import { trim } from 'omnibelt';
import { tmpdir } from 'os';
import fs from 'fs-extra';
import zstreams from 'zstreams';
import { nanoid } from 'nanoid';

const baseTmpDir = tmpdir();
const MB = 1024 * 1024;
const RETRY_UPLOAD_COUNT = 3;
export const MAX_RESPONSE_SIZE = Number(process.env.MAX_RESPONSE_SIZE_MB || 5) * MB;
export const DEFAULT_UPLOAD_EXPIRES = ONE_HOUR_MS;
export const MAX_RESPONSE_SIZE_DISPLAY_MB = `${MAX_RESPONSE_SIZE/MB}MB`;

export const DEFAULT_DOWNLOAD_EXPIRES = 7 * ONE_DAY_MS;

export const getUploaderAndSignedUrlFunc = (uploadStreamFunc, getDownloadUrlFunc) => {
  const uploadStrAndSignUrl = async function(str, uploadOpts, expires) {
    if (!str.pipe) {
      const s = new stream();
      s.push(str);
      s.push(null);
      str = s;
    }
    if (uploadOpts.directory) {
      uploadOpts.filename = path.join(uploadOpts.directory, uploadOpts.filename);
    }
    await uploadStreamFunc(uploadOpts.filename, str, uploadOpts.bucket, uploadOpts.contentType);
    return getDownloadUrlFunc(uploadOpts.filename, uploadOpts.bucket, { expires });
  };

  return uploadStrAndSignUrl;
};

export const contentTypeFromFilename = (filename) => {
  if (filename.endsWith('.ipynb')) { return 'application/x-ipynb+json'; }
  return mime.lookup(filename) || 'application/octet-stream';
};

export const transformErrorCurry = (type, { isNotFoundError, isServerError, getMessage }) => {
  return (err, region) => {
    if (err.type === 'ExternalStorage') { return err; }
    let message;
    if (getMessage) {
      message = getMessage(err, region);
    } else {
      message = err.message;
      if (!message && err.code) {
        message = String(err.code);
      }
    }
    return errors.ExternalStorage({
      storage: type,
      message,
      isServerError: isServerError(err),
      isNotFoundError: isNotFoundError(err),
      possibleRegion: region
    });
  };
};

const signJWT = (filename, bucket, options) => {
  const issueToken = createSigner({
    key: options.secret,
    algorithm: options.algo,
    iss: Array.isArray(options.issuer) ? options.issuer[0] : options.issuer,
    expiresIn: options.expires || DEFAULT_UPLOAD_EXPIRES
  });
  return issueToken({
    filename,
    bucket,
    contentType: options.contentType
  });
};

export const getLosantPostSignedUrl = (apiUrl, jwtInfo = {}) => {
  return async (filename, bucket, options = {}) => {
    const opts = { ...options, ...jwtInfo };
    const fileSignedAuth = signJWT(filename, bucket, opts);
    return { url: `${apiUrl}/storage`, fields: { fileSignedAuth } };
  };
};

export const getLosantPutSignedUrl = (apiUrl, jwtInfo = {}) => {
  return async (filename, bucket, options = {}) => {
    const opts = { ...options, ...jwtInfo };
    const fileSignedAuth = signJWT(filename, bucket, opts);
    return `${apiUrl}/storage?fileSignedAuth=${fileSignedAuth}`;
  };
};

export const downloadFile = async (readStream, encoding) => {
  let dataSize = 0;
  const bufArray = await readStream.through(async (buffer) => {
    dataSize += buffer && buffer.length || 0;
    if (dataSize > MAX_RESPONSE_SIZE) {
      throw errors.Validation({ message: `File size cannot exceed ${MAX_RESPONSE_SIZE_DISPLAY_MB}` });
    }
    return buffer;
  }).intoArray();

  return (Buffer.concat(bufArray)).toString(encoding);
};

export const writeFileToDisk = async (fromStream, localPath, intoFileOpts = {}) => {
  const writableStream = zstreams(fs.createWriteStream(localPath, intoFileOpts));
  let writeStreamError;
  writableStream.once('error', function(e) {
    writeStreamError = e;
  });
  fromStream.once('data', function() {
    if (writeStreamError) {
      return fromStream.destroy(writeStreamError);
    }
  });
  await zstreams(fromStream).throughSync((chunk) => chunk.toString(intoFileOpts.encoding)).pipe(writableStream).intoPromise();
  if (writeStreamError) {
    throw writeStreamError;
  }
};

export const validateGoogleConfig = async (config = {}, type, jsonOnly = false) => {
  type = type ? `${type}.`: '';
  let credObj;
  if (!jsonOnly && (!config.projectId || typeof config.projectId !== 'string')) {
    throw errors.Validation({ message: `${type}projectId must be a string.` });
  }
  if (!config.keyJson) {
    throw errors.Validation({ message: `${type}keyJson is required.` });
  }
  try {
    if (typeof config.keyJson === 'string') {
      credObj = JSON.parse(config.keyJson);
    } else {
      credObj = config.keyJson;
    }
  } catch {
    throw errors.Validation({ message: `${type}keyJson must be a valid JSON Object.` });
  }

  if (typeof credObj !== 'object') {
    throw errors.Validation({ message: `${type}keyJson must be a valid JSON Object.` });
  }

  if (!credObj.client_email) {
    throw errors.Validation({ message: `${type}keyJson must contain "client_email".` });
  }
  if (typeof credObj.client_email !== 'string') {
    throw errors.Validation({ message: `${type}keyJson "client_email" must be a string.` });
  }
  if (!credObj.private_key) {
    throw errors.Validation({ message: `${type}keyJson must contain "private_key".` });
  }

  try {
    await validateSSLKey(trim(String(credObj.private_key)), { password: ' ' });
  } catch {
    throw errors.Validation({ message: `Provided ${type}private_key is not valid` });
  }
  return credObj;
};

/*
  To whom it may concern:
  I declare this is stupid. Google is having trouble doing CSV in-memory streaming
  uploads. So we write it to a temporary local file and then upload the file.
  No idea what is happening under the covers with the google lib.

   Sincerely,
   mk

   This is the OG reason why we did upload streams this way, and we decided to do it with azure as well.
*/
const _uploadFileInternal = async (pFuncUpload, localPath, bucket, filename, contentType, opts, retryCount = 0) => {
  try {
    return await pFuncUpload(bucket, filename, localPath, contentType, opts);
  } catch (e) {
    if (retryCount < RETRY_UPLOAD_COUNT) {
      return _uploadFileInternal(pFuncUpload, localPath, bucket, filename, contentType, opts, ++retryCount);
    } else {
      throw e;
    }
  }
};

export const uploadStreamByDiskCurry = (pFuncUpload) => {
  return async (filename, fromStream, bucket, contentType, options = {}) => {
    const localName = path.join(baseTmpDir, nanoid());
    try {
      await zstreams(fromStream).intoFile(localName);
      return await _uploadFileInternal(pFuncUpload, localName, bucket, filename, contentType, options);
    } finally {
      await fs.remove(localName);
    }
  };
};
