import fs from 'fs-extra';
import * as payloadHelper from 'losant-handlebars';
import { checkEncoding } from '../utils.js';
import { getFlagOption } from 'losant-nodes/src/lib/node-storage-helpers.js';

class FileWriteNode {

  /* Example Config:
  {
    pathTemplate: <String - Required: template or string that is a path to the file to write to>,
    fileContentsTemplate: <String - Required: template or string of file contents to write to the file>,
    encodingTemplate: <String - Optional: encoding to use to write to the file (ascii|utf8|utf16le|ucs2|base64|latin1|binary|hex). Default utf8>,
    shouldAppend: <Boolean - Optional: if true, append the contents to the file instead of replacing it. Default false>,
    errorIfFileExists: <Boolean - Optional: if true, cancel and write an error when the file already exists. Default false>,
    resultPath: <String - Required: payload path at which to place the result of the write>
  }
  Notes:
    The result at resultPath is { value: true } on success, or
    { value: false, error: { type: 'WRITE_FILE_ERROR', message } } when writing fails
    (including an existing file with errorIfFileExists). Missing parent directories are
    created. An invalid encoding or a protected path throws a validation error instead
    of writing to resultPath.
  */

  constructor(id, outputIds, config) {
    this.id = id;
    this.outputIds = outputIds;
    this.pathTemplate = config.pathTemplate;
    this.fileContentsTemplate = config.fileContentsTemplate;
    this.encodingTemplate = config.encodingTemplate || 'utf8';
    this.shouldAppend = config.shouldAppend || false;
    this.errorIfFileExists = config.errorIfFileExists || false;
    this.resultPath = config.resultPath;
  }

  async run(context, payload) {
    const { resolvedPath: file } = await context.diskUtils.guardPath(
      payloadHelper.renderToString(this.pathTemplate, payload),
      { checkAncestors: true }
    );
    const fileContents = payloadHelper.renderToString(this.fileContentsTemplate, payload);

    const encoding = payloadHelper.renderToString(this.encodingTemplate, payload);
    checkEncoding(encoding);
    const result = { value: false };
    try {
      await fs.outputFile(file, fileContents, { encoding, flag: getFlagOption(this) });
      result.value = true;
    } catch (err) {
      result.error = { type: 'WRITE_FILE_ERROR', message: err.message };
    }
    payload = payloadHelper.set(this.resultPath, result, payload);

    return [this.outputIds, payload];
  }

}


export default FileWriteNode;
