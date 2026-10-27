import * as payloadHelper from 'losant-handlebars';
import crypto from 'node:crypto';
import { trimLower } from './lib/common.js';
import { validateEncoding } from 'losant-nodejs-utils/src/utils/validate-encoding.js';
import { renderAndValidateAlgorithm } from './lib/crypto-utils.js';

const ALGORITHMS_SET = new Set([
  'md5',
  'sha1',
  'sha256',
  'sha512',
  'whirlpool',
  'ripemd'
]);

class HashNode {

  /* Example Config:
  {
    secretTemplate: <String - Optional: Template for the key to sign the data with. If empty, a plain hash is created instead of an HMAC>,
    secretEncodingTemplate: <String - Optional: Template for the encoding of the secret key. Default utf8>,
    algorithmTemplate: <String - Optional: Template for the algorithm to use. One of md5, sha1, sha256, sha512, whirlpool, or ripemd. Default SHA256>,
    dataTemplate: <String - Required: Template for the data to hash>,
    dataEncodingTemplate: <String - Optional: Template for the encoding of the incoming data. Default utf8>,
    encodingTemplate: <String - Optional: Template for the encoding to output the hash in. Default hex>,
    destinationPath: <String - Required: Payload path where the resulting hash string is written>
  }
  Notes:
    Errors: An unsupported algorithm or encoding throws a validation error.
  */

  constructor(id, outputIds, config) {
    this.id = id;
    this.outputIds = outputIds;
    this.secretTemplate = config.secretTemplate;
    this.secretEncodingTemplate = config.secretEncodingTemplate || 'utf8';
    this.algorithmTemplate = config.algorithmTemplate || 'SHA256';
    this.dataTemplate = config.dataTemplate;
    this.dataEncodingTemplate = config.dataEncodingTemplate || 'utf8';
    this.encodingTemplate = config.encodingTemplate || 'hex';
    this.destinationPath = config.destinationPath;
  }

  async run(context, payload) {
    const algorithm = renderAndValidateAlgorithm(this.algorithmTemplate, payload, { ALGORITHMS_SET });

    const key = payloadHelper.renderToString(this.secretTemplate, payload);
    const data = payloadHelper.renderToString(this.dataTemplate, payload);
    const dataEncoding = trimLower(payloadHelper.renderToString(this.dataEncodingTemplate, payload));
    const resultEncoding = trimLower(payloadHelper.renderToString(this.encodingTemplate, payload));

    validateEncoding(dataEncoding, data);
    validateEncoding(resultEncoding);

    let value;
    if (key) {
      const keyEncoding = trimLower(payloadHelper.renderToString(this.secretEncodingTemplate, payload));
      validateEncoding(keyEncoding, key);
      const hashEncrypt = crypto.createHmac(algorithm, key, { encoding: keyEncoding });
      hashEncrypt.update(data, dataEncoding);
      value = hashEncrypt.digest(resultEncoding);
    } else {
      value = crypto.hash(algorithm, Buffer.from(data, dataEncoding), resultEncoding);
    }
    payload = payloadHelper.set(this.destinationPath, value, payload);
    return [ this.outputIds, payload ];
  }
}

export default HashNode;
