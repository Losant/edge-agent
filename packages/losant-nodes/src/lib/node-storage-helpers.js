import * as payloadHelper from 'losant-handlebars';
import errors from 'losant-nodejs-utils/src/errors.js';
import { validateEncoding } from 'losant-nodejs-utils/src/utils/validate-encoding.js';
import fs from 'fs-extra';
import stream from 'node:stream';
import axios from 'losant-nodejs-utils/src/axios.js';
import { downloadFile, MAX_RESPONSE_SIZE, MAX_RESPONSE_SIZE_DISPLAY_MB, writeFileToDisk } from 'losant-nodejs-utils/src/utils/storage-helpers.js';
import { capitalize } from 'omnibelt';

const MAX_FILENAME_LENGTH = 1024;

export const getFlagOption = ({ shouldAppend, errorIfFileExists }) => {
  let flags = 'w';
  if (shouldAppend) {
    flags = 'a';
  }
  if (errorIfFileExists) {
    flags += 'x';
  }
  return flags;
};

export const renderAndValidateReadFromDiskPath = async (node, context, payload, { fieldName = 'diskPathTemplate' } = {}) => {
  const diskPath = payloadHelper.renderToString(node[fieldName], payload);
  const { realPath } = await context.diskUtils.guardFileReadPath(diskPath);
  return realPath;
};

export const renderAndValidateWriteToDiskPath = async (node, context, payload) => {
  const diskPath = payloadHelper.renderToString(node.diskPathTemplate, payload);
  const { resolvedPath } = await context.diskUtils.guardPath(diskPath, { checkAncestors: true });
  return resolvedPath;
};

export const renderAndValidateCommonPutFields = async (node, context, payload, { fileKey = 'file', bucketKey = 'bucketNameTemplate' } = {}) => {
  let encoding, fileContent, fileUrl, diskPath;
  if (node[`${fileKey}UrlTemplate`]) {
    fileUrl = payloadHelper.renderToString(node[`${fileKey}UrlTemplate`], payload);
  } else {
    if (node.diskPathTemplate) {
      try {
        diskPath = await renderAndValidateReadFromDiskPath(node, context, payload);
      } catch (e) {
        if (e.type === 'NotFound') {
          return { error: e };
        }
        throw e;
      }
    } else {
      fileContent = payloadHelper.renderToString(node[`${fileKey}ContentTemplate`], payload);
    }
    encoding = payloadHelper.renderToString(node.encodingTemplate, payload);
    validateEncoding(encoding, fileContent);
  }

  const contentType = payloadHelper.renderToString(node.contentTypeTemplate, payload);
  if (!contentType) { throw errors.Validation({ message: `${capitalize(fileKey)}s must provide a content type` }); }

  const bucket = payloadHelper.renderToString(node[bucketKey], payload);
  const fileName = payloadHelper.renderToString(node[`${fileKey}NameTemplate`], payload);
  if (fileName.length > MAX_FILENAME_LENGTH) {
    throw errors.Validation({ message: `${capitalize(fileKey)} name cannot exceed ${MAX_FILENAME_LENGTH} characters` });
  }
  return {
    encoding, fileContent, fileUrl, diskPath, bucket, fileName, contentType
  };
};

export const performStoragePut = async (node, storage, context, {
  encoding, fileContent, fileUrl, diskPath, bucket, fileName, contentType
}) => {
  const getUpStream = async () => {
    let upStream;
    if (node.fileUrlTemplate || node.blobUrlTemplate) {
      upStream = await axios({
        url: fileUrl,
        method: 'GET',
        responseType: 'stream',
        timeout: context.externalTimeout
      });
      upStream = upStream.data;
    } else if (diskPath) {
      upStream = fs.createReadStream(diskPath, { encoding });
    } else {
      upStream = new stream.Readable();
      upStream.push(fileContent, encoding);
      upStream.push(null);
    }
    return upStream;
  };

  const opts = { timeout: context.externalTimeout, reGetStream: getUpStream }; // reGetStream is used for s3
  if (node.fileType) {
    opts.fileType = node.fileType;
  } else if (node.blobType) {
    opts.blobType = node.blobType;
  } if (node.serverSideEncryption) {
    opts.serverSideEncryption = node.serverSideEncryption;
  }

  return storage.uploadStream(
    fileName,
    await getUpStream(),
    bucket,
    contentType,
    opts
  );
};

export const renderAndValidateCommonGetFields = async (node, context, payload, { filenameKey = 'fileNameTemplate', bucketKey = 'bucketNameTemplate' } = {}) => {
  let encoding, diskPath;

  if (!node.isDownloadURL) {
    encoding = payloadHelper.renderToString(node.encodingTemplate, payload);
    validateEncoding(encoding);
    if (node.diskPathTemplate) {
      diskPath = await renderAndValidateWriteToDiskPath(node, context, payload);
    }
  }

  const bucket = payloadHelper.renderToString(node[bucketKey], payload);
  const filename = payloadHelper.renderToString(node[filenameKey], payload);
  if (filename.length > MAX_FILENAME_LENGTH) {
    throw errors.NotFound({ message: `File name cannot exceed ${MAX_FILENAME_LENGTH} characters` });
  }

  return { encoding, diskPath, bucket, filename };
};

export const performStorageGet = async (node, storage, payload, { encoding, diskPath, bucket, filename }) => {
  let result = {};
  let fileStream;
  try {
    result.metadata = await storage.getFileInfo(filename, bucket, true);
    if (result.metadata === null) {
      throw errors.Validation({ message: `The file ${filename} was not found.` });
    }
    if (node.isDownloadURL) {
      result.value = await storage.getDownloadSignedUrl(filename, bucket);
    } else if (diskPath) {
      fileStream = await storage.getFileReadStream(filename, bucket);
      await writeFileToDisk(fileStream, diskPath, { flags: getFlagOption(node), encoding });
      result.value = diskPath;
    } else if (result.metadata.fileSize > MAX_RESPONSE_SIZE) {
      throw errors.Validation({ message: `File size cannot exceed ${MAX_RESPONSE_SIZE_DISPLAY_MB}` });
    } else {
      fileStream = await storage.getFileReadStream(filename, bucket);
      result.value = await downloadFile(fileStream, encoding);
    }
  } catch (e) {
    result = { error: e.message };
  } finally {
    payload = payloadHelper.set(node.destination, result, payload);
  }
  return payload;
};
