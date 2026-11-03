import * as payloadHelper from 'losant-handlebars';
import errors from 'losant-nodejs-utils/src/errors.js';
import { trimLower } from './common.js';
import { ONE_MEGABYTE } from 'losant-nodejs-utils/src/constants/size.js';
import { trim, pick } from 'omnibelt';
import _pem from 'pem';
const pem = _pem.promisified;

const CRYPTO_ALGORITHMS_SET = new Set([ 'md5', 'sha256', 'sha1', 'sha384' ]);
const VALID_PADDING_SET = new Set([ 'RSA_PKCS1_PADDING', 'RSA_PKCS1_PSS_PADDING' ]);
const VALID_DSA_SET = new Set([ 'der', 'ieee-p1363' ]);

const pluckCertInfo = pick([
  'serial', 'country', 'state', 'locality', 'organization',
  'organizationUnit', 'commonName', 'emailAddress'
]);

export const getCertInfo = async (cert) => {
  const [
    certInfo,
    fingerPrintInfo,
    publicKeyInfo
  ] = await Promise.all([
    pem.readCertificateInfo(cert),
    pem.getFingerprint(cert),
    pem.getPublicKey(cert)
  ]);
  if (!fingerPrintInfo || !certInfo) {
    return {};
  }
  const info = pluckCertInfo(certInfo);
  info.notValidBefore = new Date(certInfo.validity.start);
  info.notValidAfter = new Date(certInfo.validity.end);
  info.issuerName = certInfo.issuer.commonName;
  if (fingerPrintInfo.fingerprint) {
    info.fingerprint = fingerPrintInfo.fingerprint;
  }
  return { publicKey: publicKeyInfo.publicKey, info };
};

export const renderAndValidatePadding = (template, payload) => {
  const padding = payloadHelper.renderToString(template, payload);
  if (!VALID_PADDING_SET.has(padding)) {
    throw errors.Validation({ message: `Padding ${padding} is invalid.` });
  }
  return padding;
};

export const renderAndValidateDSAEncoding = (template, payload) => {
  const dsaEncoding = payloadHelper.renderToString(template, payload);
  if (!VALID_DSA_SET.has(dsaEncoding)) {
    throw errors.Validation({ message: `DSA Encoding ${dsaEncoding} is invalid.` });
  }
  return dsaEncoding;
};

export const renderAndValidateAlgorithm = (algorithmTemplate, payload, { ALGORITHMS_SET = CRYPTO_ALGORITHMS_SET } = {}) => {
  const algorithm = trimLower(payloadHelper.renderToString(algorithmTemplate, payload));
  if (!ALGORITHMS_SET.has(algorithm)) {
    throw errors.Validation({ message: `Algorithm must be one of the following ${Array.from(ALGORITHMS_SET).join(', ')}, not '${algorithm}'.` });
  }
  return algorithm;
};

export const renderSigningField = async (type, template, payload, context) => {
  let prop;
  if (type === 'diskPath') {
    const diskPath = payloadHelper.renderToString(template, payload);
    prop = await context.diskUtils.loadGuardedFile(diskPath, {
      maxSize: ONE_MEGABYTE
    });
  } else if (type === 'payloadPath') {
    prop = payloadHelper.lookup(template, payload);
  } else {
    prop = payloadHelper.renderToString(template, payload);
  }
  return trim(prop);
};
