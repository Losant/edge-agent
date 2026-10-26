import * as payloadHelper from 'losant-handlebars';
import LJSON from 'losant-nodejs-utils/src/ljson.js';
import { validateEncoding } from './cbor-encode-node.js';
import { Decoder } from 'cbor-x';

class CborDecodeNode {
  /* Example Config:
  {
    sourcePath: <String - Required: payload path of the CBOR-encoded string to decode>,
    resultPath: <String - Required: payload path for the decoded value. Extended types are serialized as in other Losant payload values. Not written when an error occurs>,
    errorPath: <String - Optional: payload path for caught errors as { type: 'CBOR_DECODE_NODE_ERROR', message }>,
    encodingTemplate: <String - Optional: template resolving to the encoding of the source string: hex|base64|binary. Default hex. Ignored if sourcePath resolves to a non-string>
  }
  Notes:
  A single output is used (outputIds).
  Decoding errors (invalid encoding, empty or missing source, malformed CBOR) are not thrown: they are written to errorPath and the workflow continues.
  64-bit integers are decoded as numbers.
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
    let error;
    try {
      const encoding = payloadHelper.renderToString(this.encodingTemplate, payload);
      const data = payloadHelper.lookup(this.sourcePath, payload);
      validateEncoding(encoding, typeof data === 'string' ? data : undefined);

      if (!data) {
        error = 'Source Path resolved to empty value';
      } else {
        const decoder = new Decoder({ useRecords: false, int64AsNumber: true });
        const decoded = decoder.decode(Buffer.from(data, encoding));
        const serialized = LJSON.parse(LJSON.stringify(decoded, { serializeTypes: true }));
        payload = payloadHelper.set(this.resultPath, serialized, payload);
      }
    } catch (e) {
      error = e.message;
    }

    if (error) {
      payload = payloadHelper.set(this.errorPath, { type: 'CBOR_DECODE_NODE_ERROR', message: error }, payload);
    }
    return [this.outputIds, payload];
  }
}

export default CborDecodeNode;
