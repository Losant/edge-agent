import 'reflect-metadata';
import * as payloadHelper from 'losant-handlebars';
import errors from 'losant-nodejs-utils/src/errors.js';
import crypto from 'node:crypto';
import { trim } from 'omnibelt';
import { trimLower } from './common.js';
import { isIpAddress } from 'losant-nodejs-utils/src/utils/ip-helpers.js';
import isValidDomain from 'losant-nodejs-utils/src/utils/is-valid-domain.js';
import { validateEncoding } from 'losant-nodejs-utils/src/utils/validate-encoding.js';
import { hasNonPrintableChars } from 'losant-nodejs-utils/src/utils/non-printable.js';
import { ONE_DAY_MS } from 'losant-nodejs-utils/src/constants/time.js';
import * as x509 from '@peculiar/x509';
import { id_ce_subjectAltName as idCeSubjectAltName } from '@peculiar/asn1-x509';

// X.500 OIDs keyed by the short names peculiar emits when serializing a
// parsed RDN. Used in mergeSubject to translate a CSR-extracted entry's key
// to its canonical OID for matching against override fields.
const PECULIAR_KEY_TO_OID = {
  CN: '2.5.4.3',
  C: '2.5.4.6',
  ST: '2.5.4.8',
  L: '2.5.4.7',
  O: '2.5.4.10',
  OU: '2.5.4.11',
  E: '1.2.840.113549.1.9.1'
};

// OIDs for the subject DN fields we expose as overrides, keyed by our
// user-facing field names. Single source of truth for the OID values is
// PECULIAR_KEY_TO_OID above.
const SUBJECT_FIELD_TO_OID = {
  commonName:         PECULIAR_KEY_TO_OID.CN,
  country:            PECULIAR_KEY_TO_OID.C,
  state:              PECULIAR_KEY_TO_OID.ST,
  locality:           PECULIAR_KEY_TO_OID.L,
  organization:       PECULIAR_KEY_TO_OID.O,
  organizationalUnit: PECULIAR_KEY_TO_OID.OU,
  email:              PECULIAR_KEY_TO_OID.E
};

// `country` is intentionally absent: it's gated by COUNTRY_RE (exactly two
// ASCII letters), not a length cap.
const SUBJECT_FIELD_MAX_LENGTHS = {
  commonName: 64,
  state: 128,
  locality: 128,
  organization: 64,
  organizationalUnit: 64,
  email: 255
};

// peculiar's GeneralName type tags. Note that peculiar uses 'url' for what
// we call 'uri' (and what RFC 5280 calls uniformResourceIdentifier).
const SAN_TYPE_TO_PECULIAR = {
  dns: 'dns',
  uri: 'url',
  ip: 'ip',
  email: 'email'
};

const SAN_VALUE_MAX_LENGTHS = {
  uri: 1024,
  email: 254,
  ip: 45  // longest IPv6 string form
};

// Key-usage flag names → peculiar bit values. Names mirror the RFC 5280
// keyUsage labels exactly. The ExtKeyUsage map below is similar.
const KEY_USAGE_FLAG_MAP = {
  digitalSignature:  x509.KeyUsageFlags.digitalSignature,
  nonRepudiation:    x509.KeyUsageFlags.nonRepudiation,
  keyEncipherment:   x509.KeyUsageFlags.keyEncipherment,
  dataEncipherment:  x509.KeyUsageFlags.dataEncipherment,
  keyAgreement:      x509.KeyUsageFlags.keyAgreement,
  keyCertSign:       x509.KeyUsageFlags.keyCertSign,
  cRLSign:           x509.KeyUsageFlags.cRLSign,
  encipherOnly:      x509.KeyUsageFlags.encipherOnly,
  decipherOnly:      x509.KeyUsageFlags.decipherOnly
};

// Named EKU purposes → OIDs. Strict enum: arbitrary OIDs are not accepted.
const EXTENDED_KEY_USAGE_OID_MAP = {
  serverAuth:      x509.ExtendedKeyUsage.serverAuth,
  clientAuth:      x509.ExtendedKeyUsage.clientAuth,
  codeSigning:     x509.ExtendedKeyUsage.codeSigning,
  emailProtection: x509.ExtendedKeyUsage.emailProtection,
  timeStamping:    x509.ExtendedKeyUsage.timeStamping,
  ocspSigning:     x509.ExtendedKeyUsage.ocspSigning
};

// Hash algorithm strings → WebCrypto's expected names. md5 is intentionally
// absent: WebCrypto doesn't support it (and md5 cert signing is broken anyway).
const HASH_TO_WEBCRYPTO = {
  sha1: 'SHA-1',
  sha256: 'SHA-256',
  sha384: 'SHA-384',
  sha512: 'SHA-512'
};

// Algorithms accepted for cert signing. Pass to renderAndValidateAlgorithm
// as the `ALGORITHMS_SET` option to override the generic crypto-sign default.
export const CERT_ALGORITHMS_SET = new Set(Object.keys(HASH_TO_WEBCRYPTO));
const VALID_SAN_TYPES = new Set(Object.keys(SAN_TYPE_TO_PECULIAR));
const COUNTRY_RE = (/^[A-Za-z]{2}$/);

// Detects the type of PEM input the csrTemplate field received. Always
// throws a Validation error for input it can't dispatch — generic for
// unrecognized input, specific for inputs that are recognizable but
// unsupported (multi-block bundles, encrypted keys, certificates) so the
// user gets a precise hint.
const GENERIC_PEM_ERROR = 'csrTemplate must be a PEM-encoded CSR, public key, or unencrypted private key.';
const detectPemType = (pemString) => {
  if (typeof pemString !== 'string') {
    throw errors.Validation({ message: GENERIC_PEM_ERROR });
  }
  let blocks;
  try { blocks = x509.PemConverter.decodeWithHeaders(pemString); } catch {
    throw errors.Validation({ message: GENERIC_PEM_ERROR });
  }
  if (blocks.length === 0) {
    throw errors.Validation({ message: GENERIC_PEM_ERROR });
  }
  if (blocks.length > 1) {
    throw errors.Validation({ message: 'csrTemplate must contain exactly one PEM block.' });
  }
  const block = blocks[0];
  const label = block.type?.toUpperCase();
  // Legacy openssl-encrypted private keys (RSA/EC PRIVATE KEY with a
  // `Proc-Type: 4,ENCRYPTED` PEM header) carry the unencrypted label but
  // can't be parsed without a password. Catch them upfront alongside the
  // PKCS#8 ENCRYPTED PRIVATE KEY case below.
  const isLegacyEncrypted = block.headers?.some(
    (h) => h.key === 'Proc-Type' && (/\bENCRYPTED\b/).test(h.value)
  );
  if (isLegacyEncrypted) {
    throw errors.Validation({ message: 'csrTemplate encrypted private keys are not supported. Decrypt the key before passing it.' });
  }
  switch (label) {
    case 'CERTIFICATE REQUEST':
    case 'NEW CERTIFICATE REQUEST':
      return 'csr';
    case 'PUBLIC KEY':
      return 'publicKey';
    case 'PRIVATE KEY':
    case 'RSA PRIVATE KEY':
    case 'EC PRIVATE KEY':
      return 'privateKey';
    case 'ENCRYPTED PRIVATE KEY':
      throw errors.Validation({ message: 'csrTemplate encrypted private keys are not supported. Decrypt the key before passing it.' });
    case 'CERTIFICATE':
      throw errors.Validation({ message: 'csrTemplate expected a CSR, public key, or private key, but received a certificate.' });
    default:
      throw errors.Validation({ message: GENERIC_PEM_ERROR });
  }
};

const validateSubjectField = (field, value) => {
  if (field === 'country') {
    if (!COUNTRY_RE.test(value)) {
      throw errors.Validation({ message: 'countryTemplate must be a 2-letter ISO 3166 country code.' });
    }
    return value.toUpperCase();
  }
  const max = SUBJECT_FIELD_MAX_LENGTHS[field];
  if (max && value.length > max) {
    throw errors.Validation({ message: `${field}Template value exceeds maximum length of ${max} characters.` });
  }
  if (hasNonPrintableChars(value)) {
    throw errors.Validation({ message: `${field}Template value contains an invalid control or non-printable character.` });
  }
  return value;
};

// Returns peculiar's JsonNameParams shape: an array of `{ OID: [value] }`
// entries ready to splice into a subject Name. Empty/unset templates are
// dropped silently (consistent with how renderToString handles missing
// payload paths).
export const renderSubjectOverrides = (templates, payload) => {
  const result = [];
  for (const [ field, oid ] of Object.entries(SUBJECT_FIELD_TO_OID)) {
    const tpl = templates[field];
    if (tpl) {
      const rendered = trim(payloadHelper.renderToString(tpl, payload));
      if (rendered) {
        result.push({ [oid]: [ validateSubjectField(field, rendered) ] });
      }
    }
  }
  return result;
};

const validateSanValue = (type, value) => {
  const max = SAN_VALUE_MAX_LENGTHS[type];
  if (max && value.length > max) {
    throw errors.Validation({ message: `Subject Alternative Name ${type} value exceeds maximum length of ${max} characters.` });
  }
  if (type === 'dns') {
    if (!isValidDomain(value, { wildcard: true, subdomain: true })) {
      throw errors.Validation({ message: `Subject Alternative Name DNS value '${value}' is invalid.` });
    }
  } else if (type === 'ip') {
    if (!isIpAddress(value)) {
      throw errors.Validation({ message: `Subject Alternative Name IP value '${value}' is invalid.` });
    }
  } else if (type === 'uri') {
    if (!URL.canParse(value)) {
      throw errors.Validation({ message: `Subject Alternative Name URI value '${value}' is invalid.` });
    }
  }
  // No specific validation for email entries, length cap above prevents crazy inputs.
};

export const renderSubjectAltNames = (altNamesConfig, payload) => {
  if (!Array.isArray(altNamesConfig) || !altNamesConfig.length) { return []; }
  const result = [];
  for (const entry of altNamesConfig) {
    const type = trimLower(entry?.type || '');
    if (!VALID_SAN_TYPES.has(type)) {
      throw errors.Validation({ message: `Subject Alternative Name type '${entry?.type}' is invalid. Must be one of: ${Array.from(VALID_SAN_TYPES).join(', ')}.` });
    }
    const value = trim(payloadHelper.renderToString(entry?.valueTemplate, payload));
    if (value) {
      validateSanValue(type, value);
      result.push({ type: SAN_TYPE_TO_PECULIAR[type], value });
    }
  }
  return result;
};

// Per-field subject merge that preserves multi-valued RDNs (e.g. multiple OUs),
// true multi-key RDNs (e.g. `CN=foo+O=bar`), and custom OIDs from the CSR.
// For each CSR entry, drops only the keys whose OID matches an override; if
// the entry has any non-overridden keys remaining, those survive. Overrides
// are appended at the end.
const mergeSubject = (csrJsonName, overridesArray) => {
  const overrideOids = new Set(overridesArray.flatMap(Object.keys));
  const merged = [];
  for (const entry of csrJsonName) {
    const kept = {};
    for (const [ key, values ] of Object.entries(entry)) {
      const oid = PECULIAR_KEY_TO_OID[key] || key;
      if (!overrideOids.has(oid)) {
        kept[key] = values;
      }
    }
    if (Object.keys(kept).length > 0) {
      merged.push(kept);
    }
  }
  return [ ...merged, ...overridesArray ];
};

// Normalize a user-supplied hex serial to the form X509CertificateGenerator
// accepts. Input is a bare hex string (no `0x` prefix), matching the
// convention used by the platform's other hex inputs via validateEncoding.
// Leading `00` is prepended when the high bit is set so the encoded ASN.1
// INTEGER is positive per RFC 5280, and the encoded length is capped at 20
// octets.
const normalizeSerial = (raw) => {
  validateEncoding('hex', raw);
  let hex = raw.toLowerCase();
  if (!hex || (/^0+$/).test(hex)) {
    throw errors.Validation({ message: 'serialNumberTemplate must be a positive hex integer.' });
  }
  if (hex.length % 2) { hex = `0${hex}`; }
  if (parseInt(hex.slice(0, 2), 16) >= 0x80) { hex = `00${hex}`; }
  if (hex.length > 40) {
    throw errors.Validation({ message: 'serialNumberTemplate exceeds 20 octets (RFC 5280 limit).' });
  }
  return hex;
};

export const renderSerialNumber = (template, payload) => {
  const rendered = trim(payloadHelper.renderToString(template, payload));
  if (!rendered) { return `00${crypto.randomBytes(16).toString('hex')}`; }
  return normalizeSerial(rendered);
};

// Import a Node KeyObject into a WebCrypto CryptoKey for signing. Returns
// both the key and the signing algorithm to pass to
// X509CertificateGenerator.create — the import variant needs `namedCurve`
// for EC, the signing variant doesn't. Ed25519 has a fixed internal hash
// (SHA-512), so `hash` is silently ignored for it. Ed448 is *not*
// supported as a CA key: peculiar 2.0's algorithm spread merges WebCrypto's
// `{name:'Ed448'}` over our params and then has no toAsnAlgorithm case for
// it. Ed448 leaf inputs (CSR/pubkey/privkey signed by an RSA/EC/Ed25519 CA)
// still work — peculiar parses them fine; only the signing path is broken.
const importSigningKey = async (caKeyObj, hash) => {
  const jwk = caKeyObj.export({ format: 'jwk' });
  let importAlgorithm, signingAlgorithm;
  if (jwk.kty === 'RSA') {
    signingAlgorithm = { name: 'RSASSA-PKCS1-v1_5', hash };
    importAlgorithm = signingAlgorithm;
  } else if (jwk.kty === 'EC') {
    signingAlgorithm = { name: 'ECDSA', hash };
    importAlgorithm = { ...signingAlgorithm, namedCurve: jwk.crv };
  } else if (jwk.kty === 'OKP' && jwk.crv === 'Ed25519') {
    signingAlgorithm = { name: 'Ed25519' };
    importAlgorithm = signingAlgorithm;
  } else {
    const detail = jwk.crv ? `${jwk.kty} (${jwk.crv})` : jwk.kty;
    throw errors.Validation({ message: `CA key type '${detail}' is not supported. Only RSA, ECDSA, and Ed25519 CA keys can be used for signing.` });
  }
  const signingKey = await crypto.webcrypto.subtle.importKey('jwk', jwk, importAlgorithm, false, [ 'sign' ]);
  return { signingKey, signingAlgorithm };
};

// Derive a peculiar PublicKey from a PEM private key, going through Node's
// stdlib (handles RSA + EC + Ed25519 + Ed448 + all standard PEM private-key
// formats). Encrypted keys are filtered upstream by detectPemType, so any
// failure here is a malformed key.
const derivePublicKey = (privateKeyPem) => {
  let pubPem;
  try {
    const privKeyObj = crypto.createPrivateKey(privateKeyPem);
    pubPem = crypto.createPublicKey(privKeyObj).export({ type: 'spki', format: 'pem' });
  } catch {
    throw errors.Validation({ message: 'csrTemplate private key could not be parsed.' });
  }
  return new x509.PublicKey(pubPem);
};

// Validate + collapse a list of KU names into a single peculiar bitmask.
// Returns null when the list is empty/unset (caller omits the extension).
export const validateKeyUsages = (keyUsages) => {
  if (!Array.isArray(keyUsages) || keyUsages.length === 0) { return null; }
  let bits = 0;
  for (const name of keyUsages) {
    const flag = KEY_USAGE_FLAG_MAP[name];
    if (flag === undefined) {
      throw errors.Validation({ message: `Key usage '${name}' is invalid. Must be one of: ${Object.keys(KEY_USAGE_FLAG_MAP).join(', ')}.` });
    }
    // eslint-disable-next-line no-bitwise
    bits |= flag;
  }
  return bits;
};

// Validate + resolve a list of named EKU purposes to OID strings. Returns
// null when the list is empty/unset.
export const validateExtendedKeyUsages = (ekus) => {
  if (!Array.isArray(ekus) || ekus.length === 0) { return null; }
  return ekus.map((entry) => {
    const oid = EXTENDED_KEY_USAGE_OID_MAP[entry];
    if (!oid) {
      throw errors.Validation({ message: `Extended key usage '${entry}' is invalid. Must be one of: ${Object.keys(EXTENDED_KEY_USAGE_OID_MAP).join(', ')}.` });
    }
    return oid;
  });
};

const buildExtensions = async ({ publicKey, caCert, altNames, keyUsageBits, extendedKeyUsageOids }) => {
  const extensions = [
    new x509.BasicConstraintsExtension(false, undefined, true),
    await x509.SubjectKeyIdentifierExtension.create(publicKey),
    await x509.AuthorityKeyIdentifierExtension.create(caCert)
  ];
  if (keyUsageBits !== null) {
    extensions.push(new x509.KeyUsagesExtension(keyUsageBits, true));
  }
  if (extendedKeyUsageOids !== null) {
    extensions.push(new x509.ExtendedKeyUsageExtension(extendedKeyUsageOids));
  }
  if (altNames.length) {
    extensions.push(new x509.SubjectAlternativeNameExtension(altNames));
  }
  return extensions;
};

/**
 * Build and sign an X.509 leaf certificate using @peculiar/x509.
 *
 * Params:
 *   csrOrKeyPem — rendered csrTemplate (CSR, public key, or unencrypted
 *     private key PEM); type is dispatched internally via detectPemType.
 *   caKeyPem, caCertPem — CA private key + certificate PEMs. The key/cert
 *     pair is verified to match (SPKI byte compare) before signing.
 *   days — leaf validity span in days; notAfter = notBefore + days.
 *   hash — hash name from CERT_ALGORITHMS_SET. Ignored for Ed25519 CA keys
 *     (Ed25519 has a fixed internal hash).
 *   subjectOverrides — peculiar JsonNameParams from renderSubjectOverrides
 *     (may be []). Merged into the CSR's subject for CSR inputs; used as the
 *     full subject for key inputs.
 *   altNames — peculiar JsonGeneralNames from renderSubjectAltNames (may be
 *     []). When non-empty, fully replaces the CSR's SAN list.
 *   serial — bare hex from renderSerialNumber.
 *   notBefore — Date for the cert's notBefore. Cloned internally before ms
 *     stripping (peculiar issue #122).
 *   keyUsageBits — bitmask from validateKeyUsages, or null to omit the
 *     KeyUsage extension.
 *   extendedKeyUsageOids — OID array from validateExtendedKeyUsages, or null
 *     to omit the ExtendedKeyUsage extension.
 *
 * Returns { certificate: <PEM string> } to match the existing caller shape.
 */
export const signCertificate = async ({
  csrOrKeyPem, caKeyPem, caCertPem, days, hash, subjectOverrides, altNames,
  serial, notBefore, keyUsageBits = null, extendedKeyUsageOids = null
}) => {
  const pemType = detectPemType(csrOrKeyPem);
  const hashName = HASH_TO_WEBCRYPTO[hash];

  let caCert;
  try { caCert = new x509.X509Certificate(caCertPem); } catch {
    throw errors.Validation({ message: 'CA Certificate could not be parsed.' });
  }
  let caKeyObj;
  try { caKeyObj = crypto.createPrivateKey(caKeyPem); } catch {
    throw errors.Validation({ message: 'CA Key could not be parsed (note: encrypted private keys are not supported).' });
  }
  // Verify the CA private key matches the CA certificate's public key. SPKI
  // DER encoding is canonical for a given key, so a byte-equal compare on the
  // raw SPKI is sufficient.
  const derivedSpki = crypto.createPublicKey(caKeyObj).export({ type: 'spki', format: 'der' });
  if (!derivedSpki.equals(Buffer.from(caCert.publicKey.rawData))) {
    throw errors.Validation({ message: 'CA Key and Certificate do not match.' });
  }
  const { signingKey, signingAlgorithm } = await importSigningKey(caKeyObj, hashName);

  let publicKey, subject, csrAltNames = [];

  if (pemType === 'csr') {
    let csr;
    try { csr = new x509.Pkcs10CertificateRequest(csrOrKeyPem); } catch {
      throw errors.Validation({ message: 'csrTemplate is not a valid CSR.' });
    }
    publicKey = csr.publicKey;
    subject = mergeSubject(csr.subjectName.toJSON(), subjectOverrides);
    csrAltNames = csr.getExtension(idCeSubjectAltName)?.names?.toJSON() || [];
  } else if (pemType === 'publicKey') {
    try { publicKey = new x509.PublicKey(csrOrKeyPem); } catch {
      throw errors.Validation({ message: 'csrTemplate is not a valid public key.' });
    }
    subject = subjectOverrides;
  } else { // 'privateKey'
    publicKey = derivePublicKey(csrOrKeyPem);
    subject = subjectOverrides;
  }

  // SAN: override list fully replaces; otherwise carry through whatever the
  // CSR's SAN extension had. Both arrays are already in peculiar's
  // JsonGeneralNames shape (`[{type, value}]`).
  const finalAltNames = altNames.length ? altNames : csrAltNames;

  // RFC 5280 §4.1.2.6 requires either a non-empty subject OR a SAN extension.
  // Reject upfront rather than producing a non-conformant cert.
  if (subject.length === 0 && finalAltNames.length === 0) {
    throw errors.Validation({ message: 'Certificate must have a subject or at least one Subject Alternative Name (RFC 5280). The CSR has no subject, and no override was provided.' });
  }

  // Strip ms from notBefore (peculiar issue #122 produces non-RFC-conformant
  // GeneralizedTime when validity dates contain non-zero ms). Clone first
  // rather than mutate the caller's Date.
  notBefore = new Date(notBefore);
  notBefore.setMilliseconds(0);
  const notAfter = new Date(notBefore.getTime() + (Math.floor(days) * ONE_DAY_MS));

  const cert = await x509.X509CertificateGenerator.create({
    serialNumber: serial,
    subject,
    issuer: caCert.subjectName,
    notBefore,
    notAfter,
    signingAlgorithm,
    publicKey,
    signingKey,
    extensions: await buildExtensions({
      publicKey, caCert, altNames: finalAltNames, keyUsageBits, extendedKeyUsageOids
    })
  });

  return { certificate: cert.toString('pem') };
};
