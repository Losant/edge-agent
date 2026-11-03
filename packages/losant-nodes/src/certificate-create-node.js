import * as payloadHelper from 'losant-handlebars';
import errors from 'losant-nodejs-utils/src/errors.js';
import enforceTime from 'losant-nodejs-utils/src/utils/enforce-time.js';
import { trim } from 'omnibelt';
import { getCertInfo, renderAndValidateAlgorithm, renderSigningField } from './lib/crypto-utils.js';
import {
  CERT_ALGORITHMS_SET, renderSerialNumber, renderSubjectAltNames,
  renderSubjectOverrides, signCertificate, validateExtendedKeyUsages, validateKeyUsages
} from './lib/cert-create-helpers.js';
import { renderToIntegerRange } from './lib/common.js';

class CertificateCreateNode {

  /* Example Config:
  {
    csrTemplateType: <String - Optional: one of payloadPath|stringTemplate|diskPath. How csrTemplate is resolved. Default stringTemplate. diskPath files are limited to 1 MB>,
    csrTemplate: <String - Required: PEM-encoded CSR, public key, or unencrypted private key. Treated as a template, a payload path, or a disk path depending on csrTemplateType. When a key is provided (no CSR), the cert's subject/SAN come entirely from the override fields below>,
    credentialNameTemplate: <String - Optional: (Cloud ONLY) template resolving to the name of a certificate key pair credential holding the CA key/cert pair. When set, takes precedence over caKeyTemplate / caCrtTemplate>,
    caKeyTemplateType: <String - Optional: one of payloadPath|stringTemplate|diskPath. How caKeyTemplate is resolved. Default stringTemplate. Ignored if credentialNameTemplate is set>,
    caKeyTemplate: <String - Required unless credentialNameTemplate is set: the CA private key (PEM), or the location of it depending on caKeyTemplateType>,
    caCrtTemplateType: <String - Optional: one of payloadPath|stringTemplate|diskPath. How caCrtTemplate is resolved. Default stringTemplate. Ignored if credentialNameTemplate is set>,
    caCrtTemplate: <String - Required unless credentialNameTemplate is set: the CA certificate (PEM), or the location of it depending on caCrtTemplateType>,
    algorithmTemplate: <String - Optional: hash algorithm, one of sha1|sha256|sha384|sha512 (case-insensitive). Default sha256. Ignored for Ed25519 CA keys>,
    expiresInDaysTemplate: <String - Optional: template resolving to the number of days until the certificate expires, an integer from 1 to 3650 (10 years). Default 365>,
    notBeforeTemplate: <String - Optional: ISO 8601 date or epoch timestamp for the cert's notBefore. Defaults to the current time. expiresInDaysTemplate counts forward from this value>,
    serialNumberTemplate: <String - Optional: positive bare hex integer (e.g. 'ABCDEF', no 0x prefix); up to 20 octets. If unset, a random 16-byte serial is generated>,
    commonNameTemplate: <String - Optional: replaces the CN from the CSR (or sets it for a key-only input)>,
    countryTemplate: <String - Optional: replaces C from the CSR. 2-letter ISO 3166 code>,
    stateTemplate: <String - Optional: replaces ST from the CSR>,
    localityTemplate: <String - Optional: replaces L from the CSR>,
    organizationTemplate: <String - Optional: replaces O from the CSR>,
    organizationalUnitTemplate: <String - Optional: replaces OU from the CSR>,
    emailTemplate: <String - Optional: replaces emailAddress from the CSR>,
    subjectAltNames: <Array - Optional: [{ type: 'dns'|'uri'|'ip'|'email', valueTemplate: <String> }]. If non-empty, fully REPLACES the CSR's SAN list (any SANs in the CSR are dropped). Leave unset/empty to inherit the CSR's SANs verbatim>,
    keyUsages: <Array - Optional: list of RFC 5280 KeyUsage flag names. Allowed: digitalSignature, nonRepudiation, keyEncipherment, dataEncipherment, keyAgreement, keyCertSign, cRLSign, encipherOnly, decipherOnly. Empty/unset means no KeyUsage extension. Combinations are not cross-validated (e.g. encipherOnly + decipherOnly together, or keyCertSign on a non-CA leaf), so choose sensible combinations>,
    extendedKeyUsages: <Array - Optional: list of RFC 5280 ExtendedKeyUsage purpose names. Allowed: serverAuth, clientAuth, codeSigning, emailProtection, timeStamping, ocspSigning. Empty/unset means no ExtendedKeyUsage extension. Not cross-validated against keyUsages: most TLS validators expect e.g. a serverAuth EKU to be paired with at least digitalSignature in keyUsages>,
    resultPath: <String - Required: payload path for { certificate, publicKey, info } on success or { error: { message } } if signing fails. certificate is the PEM-encoded certificate; info holds serial, subject fields, notValidBefore, notValidAfter, issuerName, and fingerprint>
  }
  Notes:
  A single output is used (outputIds).
  Only the CSR's SubjectAltName extension is preserved in the issued cert; other CSR extensions (KeyUsage, ExtendedKeyUsage, BasicConstraints, custom OIDs) are dropped. Use keyUsages / extendedKeyUsages to set those on the issued certificate.
  Configuration problems (missing CSR/key, missing CA key or certificate, invalid algorithm, expiry, serial, notBefore, subject, SAN, or usage values) throw a Validation error. Failures while signing (for example a malformed CSR or a CA key that does not match the CA certificate) do not throw: they are written to resultPath as { error: { message } }.
  */

  constructor(id, outputIds, config) {
    this.id = id;
    this.outputIds = outputIds;
    this.csrTemplateType = config.csrTemplateType || 'stringTemplate';
    this.csrTemplate = config.csrTemplate;
    this.credentialNameTemplate = config.credentialNameTemplate;
    this.caKeyTemplateType = config.caKeyTemplateType || 'stringTemplate';
    this.caKeyTemplate = config.caKeyTemplate;
    this.caCrtTemplateType = config.caCrtTemplateType || 'stringTemplate';
    this.caCrtTemplate = config.caCrtTemplate;
    this.algorithmTemplate = config.algorithmTemplate || 'sha256';
    this.expiresInDaysTemplate = config.expiresInDaysTemplate || 365;
    this.serialNumberTemplate = config.serialNumberTemplate;
    this.notBeforeTemplate = config.notBeforeTemplate;
    this.commonNameTemplate = config.commonNameTemplate;
    this.countryTemplate = config.countryTemplate;
    this.stateTemplate = config.stateTemplate;
    this.localityTemplate = config.localityTemplate;
    this.organizationTemplate = config.organizationTemplate;
    this.organizationalUnitTemplate = config.organizationalUnitTemplate;
    this.emailTemplate = config.emailTemplate;
    this.subjectAltNames = config.subjectAltNames;
    this.keyUsages = config.keyUsages;
    this.extendedKeyUsages = config.extendedKeyUsages;
    this.resultPath = config.resultPath;
  }

  async run(context, payload) {
    const csrOrKeyPem = await renderSigningField(this.csrTemplateType, this.csrTemplate, payload, context);
    if (!csrOrKeyPem) {
      throw errors.MissingField({ title: 'csrTemplate' });
    }
    const days = renderToIntegerRange({
      payload, template: this.expiresInDaysTemplate, fieldName: 'expiresInDaysTemplate', defaultValue: 365, min: 1, max: 3650
    });
    const algorithm = renderAndValidateAlgorithm(this.algorithmTemplate, payload, {
      ALGORITHMS_SET: CERT_ALGORITHMS_SET
    });
    const subjectOverrides = renderSubjectOverrides({
      commonName: this.commonNameTemplate,
      country: this.countryTemplate,
      state: this.stateTemplate,
      locality: this.localityTemplate,
      organization: this.organizationTemplate,
      organizationalUnit: this.organizationalUnitTemplate,
      email: this.emailTemplate
    }, payload);
    const altNames = renderSubjectAltNames(this.subjectAltNames, payload);
    const keyUsageBits = validateKeyUsages(this.keyUsages);
    const extendedKeyUsageOids = validateExtendedKeyUsages(this.extendedKeyUsages);
    const serial = renderSerialNumber(this.serialNumberTemplate, payload);
    const renderedNotBefore = trim(payloadHelper.renderToString(this.notBeforeTemplate, payload));
    let notBefore = new Date();
    if (renderedNotBefore) {
      notBefore = enforceTime(renderedNotBefore, enforceTime.noTimeFallback);
      if (!notBefore) {
        throw errors.Validation({ message: `notBeforeTemplate '${renderedNotBefore}' is not a valid date.` });
      }
    }

    let caKeyPem, caCertPem;
    if (this.credentialNameTemplate) {
      const cred = await context.loadCredential({
        credentialNameTemplate: this.credentialNameTemplate,
        type: 'certificateKeyPair',
        applicationId: context.applicationId,
        payload
      });
      caKeyPem = cred.privateKey;
      caCertPem = cred.certificate;
    } else {
      caKeyPem = await renderSigningField(this.caKeyTemplateType, this.caKeyTemplate, payload, context);
      caCertPem = await renderSigningField(this.caCrtTemplateType, this.caCrtTemplate, payload, context);
    }
    if (!caKeyPem || !caCertPem) {
      throw errors.Validation({ message: 'Both CA Key and Certificate must be given.' });
    }

    try {
      const results = await signCertificate({
        csrOrKeyPem,
        caKeyPem,
        caCertPem,
        days,
        hash: algorithm,
        subjectOverrides,
        altNames,
        serial,
        notBefore,
        keyUsageBits,
        extendedKeyUsageOids
      });
      const { publicKey, info } = await getCertInfo(results.certificate);
      payload = payloadHelper.set(this.resultPath,
        { certificate: results.certificate, publicKey, info },
        payload);
    } catch (e) {
      payload = payloadHelper.set(this.resultPath,
        { error: { message: e.message } },
        payload);
    }
    return [ this.outputIds, payload ];
  }

}

export default CertificateCreateNode;
