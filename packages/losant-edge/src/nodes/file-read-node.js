import fs from 'fs-extra';
import * as payloadHelper from 'losant-handlebars';
import { checkEncoding } from '../utils.js';
import errors from 'losant-nodejs-utils/src/errors.js';
import { FIVE_MEGABYTES } from 'losant-nodejs-utils/src/constants/size.js';

const readFile = async (file, start, length, encoding) => {
  const fd = await fs.open(file, 'r');
  const { bytesRead, buffer } = await fs.read(fd, Buffer.alloc(length), 0, length, start);
  await fs.close(fd);
  return { bytesRead, value: buffer.toString(encoding) };
};

class FileReadNode {

  /* Example Config:
  {
    pathTemplate: <String - Required: the location of the file to read>,
    startTemplate: <Number - Optional: the byte to start reading the file at. Default 0 (beginning of file). If negative, it is subtracted from the file size (clamped at 0)>,
    lengthTemplate: <Number - Optional: how many bytes to read from the start. Defaults to the rest of the file. Must not be negative, and the number of bytes read must be under 5MB>,
    encodingTemplate: <String - Optional: encoding used to decode the file (ascii|utf8|utf16le|ucs2|base64|latin1|binary|hex). Default utf8>,
    resultPath: <String - Required: payload path at which to place the result of the read>
  }
  Notes:
    On success the result at resultPath is { value, bytesRead }. On a failure it is
    { error: { type, message } } where type is NOT_FOUND (the path does not exist or is
    not a regular file) or READ_FILE_ERROR (the start is at or beyond the end of the
    file, or reading the file failed). A length of 0 or blank reads to the end of the file.
    Invalid numbers, an invalid encoding, a negative length, a read of 5MB or more, or a
    protected path throw a validation error instead of writing to resultPath.
  */

  constructor(id, outputIds, config) {
    this.id = id;
    this.outputIds = outputIds;
    this.pathTemplate = config.pathTemplate;
    this.startTemplate = config.startTemplate;
    this.lengthTemplate = config.lengthTemplate;
    this.encodingTemplate = config.encodingTemplate || 'utf8';
    this.resultPath = config.resultPath;
  }

  async run(context, payload) {
    const renderedPath = payloadHelper.renderToString(this.pathTemplate, payload);

    let realPath, stats;
    try {
      ({ realPath, stats } = await context.diskUtils.guardFileReadPath(renderedPath));
    } catch (e) {
      if (e.type !== 'NotFound') { throw e; }
      payload = payloadHelper.set(this.resultPath, {
        error: { type: 'NOT_FOUND', message: e.message }
      }, payload);
      return [this.outputIds, payload];
    }

    const encoding = payloadHelper.renderToString(this.encodingTemplate, payload);
    checkEncoding(encoding);

    let start = Number(payloadHelper.renderToString(this.startTemplate, payload) || 0);
    let length = Number(payloadHelper.renderToString(this.lengthTemplate, payload) || (stats.size - start));
    if (!isFinite(start)) {
      throw errors.Validation({ message: 'startTemplate must be a number.' });
    }

    if (!isFinite(length)) {
      throw errors.Validation({ message: 'lengthTemplate must be a number.' });
    }

    if (start < 0) {
      start = stats.size + start;
      if (start < 0) { start = 0; }
    }

    if (start >= stats.size) {
      payload = payloadHelper.set(this.resultPath, { error: { type: 'READ_FILE_ERROR', message: `Start cannot be greater than the file size ${stats.size}` } }, payload);
      return [this.outputIds, payload];
    }

    if (length < 0) {
      throw errors.Validation({ message: 'lengthTemplate must be greater than 0.' });
    }

    if ((stats.size - start) <= length) {
      length = stats.size - start;
    }

    if (length >= FIVE_MEGABYTES) {
      throw errors.Validation({ message: 'Cannot read a file larger than 5MB' });
    }

    let result = {};
    try {
      result = await readFile(realPath, start, length, encoding);
    } catch (e) {
      result.error = { type: 'READ_FILE_ERROR', message: e.message };
    }

    payload = payloadHelper.set(this.resultPath, result, payload);
    return [this.outputIds, payload];
  }

}


export default FileReadNode;
