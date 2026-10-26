import * as payloadHelper from 'losant-handlebars';
import { validateEncodingCurry } from 'losant-nodejs-utils/src/utils/validate-encoding.js';
import { Encoder } from 'cbor-x';

const VALID_CBOR_ENCODINGS = [
  'base64',
  'binary',
  'hex'
];

export const validateEncoding = validateEncodingCurry(VALID_CBOR_ENCODINGS);

class CborEncodeNode {
  /* Example Config:
  {
    sourcePath: <String - Required: payload path of the value to encode as CBOR>,
    resultPath: <String - Required: payload path for the encoded CBOR as a string in the chosen encoding. Not written when an error occurs>,
    errorPath: <String - Optional: payload path for caught errors as { type: 'CBOR_ENCODE_NODE_ERROR', message }>,
    encodingTemplate: <String - Optional: template resolving to the encoding of the output string: hex|base64|binary. Default hex>
  }
  Notes:
  A single output is used (outputIds).
  Encoding errors (such as an invalid encoding) are not thrown: they are written to errorPath and the workflow continues.
  */

  constructor(id, outputIds, config) {
    this.id = id;
    this.outputIds = outputIds;
    this.encodingTemplate = config.encodingTemplate || 'hex';
    this.sourcePath = config.sourcePath;
    this.resultPath = config.resultPath;
    this.errorPath = config.errorPath;
  }

  async run(context, payload) {
    try {
      const encoding = payloadHelper.renderToString(this.encodingTemplate, payload);
      validateEncoding(encoding);

      const data = payloadHelper.lookup(this.sourcePath, payload);
      const encoder = new Encoder({ useRecords: false, variableMapSize: true, useTag259ForMaps: false });
      const encoded = encoder.encode(data);
      payload = payloadHelper.set(this.resultPath, encoded.toString(encoding), payload);
    } catch (e) {
      payload = payloadHelper.set(this.errorPath, { type: 'CBOR_ENCODE_NODE_ERROR', message: e.message }, payload);
    }

    return [this.outputIds, payload];
  }
}

export default CborEncodeNode;
