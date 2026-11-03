import * as payloadHelper from 'losant-handlebars';
import errors from 'losant-nodejs-utils/src/errors.js';
import { mapRejectNil, trim, mapP } from 'omnibelt';
import { renderSigningField, getCertInfo } from './lib/crypto-utils.js';

export const CERT_START = '-----BEGIN CERTIFICATE-----';
export const CERT_END = '-----END CERTIFICATE-----';

class CertificateReadNode {

  /* Example Config:
  {
    crtTemplateType: <String - Optional: one of payloadPath|stringTemplate|diskPath. How crtTemplate is resolved. Default stringTemplate. diskPath files are limited to 1 MB>,
    crtTemplate: <String - Required: the PEM-encoded certificate or certificate bundle to read, or the location of it depending on crtTemplateType>,
    resultPath: <String - Required: payload path for the result. A single certificate produces one { publicKey, info } object; a bundle of several certificates produces an array of those objects>
  }
  Notes:
  A single output is used (outputIds).
  info holds serial, subject fields (country, state, locality, organization, organizationUnit, commonName, emailAddress), notValidBefore, notValidAfter, issuerName, and fingerprint.
  Input that does not start with a BEGIN CERTIFICATE marker and end with an END CERTIFICATE marker (after trimming whitespace) throws a Validation error.
  In a bundle, an entry that cannot be parsed does not throw: its array element is { error: { message: 'Invalid certificate in bundle.' } }.
  */

  constructor(id, outputIds, config) {
    this.id = id;
    this.outputIds = outputIds;
    this.crtTemplateType = config.crtTemplateType || 'stringTemplate';
    this.crtTemplate = config.crtTemplate;
    this.resultPath = config.resultPath;
  }

  async run(context, payload) {
    const crt = await renderSigningField(this.crtTemplateType, this.crtTemplate, payload, context);
    if (!crt.startsWith(CERT_START) || !crt.endsWith(CERT_END)) {
      throw errors.Validation({ message: 'Certificate is in an invalid format.' });
    }
    const crts = mapRejectNil((s) => {
      if (!trim(s)) { return; }
      return trim(`${s}${CERT_END}`);
    }, crt.split(CERT_END));
    let result = await mapP(async (cert) => {
      let toReturn;
      try {
        toReturn = await getCertInfo(cert);
      } catch {
        toReturn = { error: { message: 'Invalid certificate in bundle.' } };
      }
      return toReturn;
    }, crts);
    if (result.length === 1) {
      result = result[0];
    }
    payload = payloadHelper.set(this.resultPath, result, payload);
    return [ this.outputIds, payload ];
  }

}

export default CertificateReadNode;
