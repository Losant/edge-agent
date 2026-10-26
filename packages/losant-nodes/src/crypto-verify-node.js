import * as payloadHelper from 'losant-handlebars';
import crypto from 'node:crypto';
import { trimLower } from './lib/common.js';
import { validateEncoding } from 'losant-nodejs-utils/src/utils/validate-encoding.js';
import { renderAndValidateAlgorithm, renderSigningField, renderAndValidateDSAEncoding, renderAndValidatePadding } from './lib/crypto-utils.js';
import errors from 'losant-nodejs-utils/src/errors.js';

class CryptoVerifyNode {

  /* Example Config:
  {
    algorithmTemplate: <String - Optional: digest algorithm used to verify the signature, one of md5, sha1, sha256, sha384. Default sha256>,
    dataTemplate: <String - Required: the data the signature was created from>,
    dataEncodingTemplate: <String - Optional: encoding of the data. Default utf8>,
    signatureTemplate: <String - Required: the signature to verify against the data and public key>,
    signatureEncodingTemplate: <String - Optional: encoding of the signature. Default base64>,
    credentialNameTemplate: <String - Optional: Cloud only. Name of a certificate key pair credential to load the public key or certificate from. When set, keyTemplateType and keyTemplate are ignored>,
    keyTemplateType: <String - Optional: how keyTemplate is resolved, one of stringTemplate, payloadPath, or diskPath. Default stringTemplate>,
    keyTemplate: <String - Required unless credentialNameTemplate is set: the public key or X.509 certificate itself (stringTemplate), a payload path to it (payloadPath), or a file path to it (diskPath)>,
    paddingTemplate: <String - Optional: name of a Node.js crypto padding constant, RSA_PKCS1_PADDING or RSA_PKCS1_PSS_PADDING. Default RSA_PKCS1_PADDING. See https://nodejs.org/docs/latest/api/crypto.html#crypto-constants>,
    dsaEncodingTemplate: <String - Optional: format of the signature, der or ieee-p1363. Default der>,
    resultPath: <String - Optional: payload path for { error: { message } } when verification fails with an error. Nothing is written on success or on a plain signature mismatch>
  }
  Notes:
    Outputs: outputIds[1] runs when the signature is valid. outputIds[0] runs when it is not valid or when an error occurred.
    A missing key, a credential load failure, or an invalid algorithm, padding, DSA encoding, or data/signature encoding throws.
    Errors raised while parsing the key or verifying (for example an invalid key or certificate) do not throw. They take outputIds[0] and, if resultPath is set, are written there.
  */

  constructor(id, outputIds, config) {
    this.id = id;
    this.outputIds = outputIds;
    this.algorithmTemplate = config.algorithmTemplate || 'sha256';
    this.dataTemplate = config.dataTemplate;
    this.dataEncodingTemplate = config.dataEncodingTemplate || 'utf8';
    this.signatureTemplate = config.signatureTemplate;
    this.signatureEncodingTemplate = config.signatureEncodingTemplate || 'base64';
    // ways to get a key to verify against
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
    const signature = payloadHelper.renderToString(this.signatureTemplate, payload);
    const signatureEncode = trimLower(payloadHelper.renderToString(this.signatureEncodingTemplate, payload));
    validateEncoding(signatureEncode, signature);
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
    let result = false;
    try {
      try {
        const cert = new crypto.X509Certificate(key);
        key = cert.publicKey;
      } catch {
        try {
          key = crypto.createPublicKey(key);
        } catch {
          throw errors.Validation({ message: 'Private Key, Public Key or Certificate is invalid.' });
        }
      }
      const verifier = crypto.createVerify(algorithm);
      verifier.update(data, dataEncode);
      result = verifier.verify({ key, padding: crypto.constants[padding], dsaEncoding }, signature, signatureEncode);
    } catch (e) {
      if (this.resultPath) {
        payload = payloadHelper.set(this.resultPath, { error: { message: e.message } }, payload);
      }
    }

    const resultIds = this.outputIds[Number(result)];
    return [ resultIds, payload ];
  }

}

export default CryptoVerifyNode;
