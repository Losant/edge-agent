import * as payloadHelper from 'losant-handlebars';
import crypto from 'node:crypto';
import { trimLower } from './lib/common.js';
import { validateEncoding } from 'losant-nodejs-utils/src/utils/validate-encoding.js';
import { renderAndValidateAlgorithm, renderAndValidateDSAEncoding, renderAndValidatePadding, renderSigningField } from './lib/crypto-utils.js';
import errors from 'losant-nodejs-utils/src/errors.js';

class CryptoSignNode {

  /* Example Config:
  {
    algorithmTemplate: <String - Optional: digest algorithm, one of md5, sha1, sha256, sha384. Default sha256>,
    dataTemplate: <String - Required: the data to sign>,
    dataEncodingTemplate: <String - Optional: encoding of the data. Default utf8>,
    signatureEncodingTemplate: <String - Optional: output encoding of the signature. Default base64>,
    credentialNameTemplate: <String - Optional: Cloud only. Name of a certificate key pair credential to load the private key from. When set, keyTemplateType and keyTemplate are ignored>,
    keyTemplateType: <String - Optional: how keyTemplate is resolved, one of stringTemplate, payloadPath, or diskPath. Default stringTemplate>,
    keyTemplate: <String - Required unless credentialNameTemplate is set: the private key itself (stringTemplate), a payload path to it (payloadPath), or a file path to it (diskPath)>,
    paddingTemplate: <String - Optional: name of a Node.js crypto padding constant, RSA_PKCS1_PADDING or RSA_PKCS1_PSS_PADDING. Default RSA_PKCS1_PADDING. See https://nodejs.org/docs/latest/api/crypto.html#crypto-constants>,
    dsaEncodingTemplate: <String - Optional: format of the signature, der or ieee-p1363. Default der>,
    resultPath: <String - Required: payload path for { signature: <String> } on success or { error: { message } } on failure>
  }
  Notes:
    Single output. It runs whether signing succeeded or failed.
    A missing key, a credential load failure, or an invalid algorithm, padding, DSA encoding, or data/signature encoding throws.
    Errors raised while parsing the key or signing (for example an invalid private key) are written to resultPath as { error: { message } } and do not throw.
  */

  constructor(id, outputIds, config) {
    this.id = id;
    this.outputIds = outputIds;
    this.algorithmTemplate = config.algorithmTemplate || 'sha256';
    this.dataTemplate = config.dataTemplate;
    this.dataEncodingTemplate = config.dataEncodingTemplate || 'utf8';
    this.signatureEncodingTemplate = config.signatureEncodingTemplate || 'base64';
    // ways to get the private key to sign with
    // cloud only
    this.credentialNameTemplate = config.credentialNameTemplate;
    // edge/cloud
    this.keyTemplateType = config.keyTemplateType || 'stringTemplate';
    this.keyTemplate = config.keyTemplate;

    this.paddingTemplate = config.paddingTemplate || 'RSA_PKCS1_PADDING';
    this.dsaEncodingTemplate = config.dsaEncodingTemplate || 'der';
    this.resultPath = config.resultPath;
  }

  async run(context, payload) {
    const algorithm = renderAndValidateAlgorithm(this.algorithmTemplate, payload);

    const data = payloadHelper.renderToString(this.dataTemplate, payload);
    const dataEncode = trimLower(payloadHelper.renderToString(this.dataEncodingTemplate, payload));
    validateEncoding(dataEncode, data);
    const signatureEncode = trimLower(payloadHelper.renderToString(this.signatureEncodingTemplate, payload));
    validateEncoding(signatureEncode);
    let key;
    if (this.credentialNameTemplate) {
      key = await context.loadCredential({
        credentialNameTemplate: this.credentialNameTemplate,
        type: 'certificateKeyPair',
        applicationId: context.applicationId,
        payload,
        secretOnly: true
      });
    } else {
      key = await renderSigningField(this.keyTemplateType, this.keyTemplate, payload, context);
    }
    if (!key) {
      throw errors.MissingField({ title: 'Key' });
    }

    const padding = renderAndValidatePadding(this.paddingTemplate, payload);
    const dsaEncoding = renderAndValidateDSAEncoding(this.dsaEncodingTemplate, payload);
    const result = {};
    try {
      try {
        crypto.createPrivateKey({ key });
      } catch {
        throw errors.Validation({ message: 'Key is invalid.' });
      }
      const signature = crypto.createSign(algorithm);
      signature.update(data, dataEncode);
      signature.end();
      result.signature = signature.sign({ key, padding: crypto.constants[padding], dsaEncoding }, signatureEncode);
    } catch (e) {
      result.error = { message: e.message };
    }
    payload = payloadHelper.set(this.resultPath, result, payload);
    return [ this.outputIds, payload ];
  }

}

export default CryptoSignNode;
