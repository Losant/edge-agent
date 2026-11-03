import t from 'tcomb';
import { isNilOrEmpty, reject } from 'omnibelt';
import fs from 'fs-extra';
import { configErrorFromException, configError } from '../lib/configuration-error.js';
import FilePath from './file-path.js';
import { SslKey, SslCertificate } from './lib/refinements.js';
import { validateCertKeyPair } from 'losant-nodejs-utils/src/utils/validate-ssl.js';

const SslConf = t.interface({
  key: t.maybe(SslKey),
  certificate: t.maybe(SslCertificate),
  bundle: t.maybe(SslCertificate),
  keyPath: t.maybe(FilePath),
  certificatePath: t.maybe(FilePath),
  bundlePath: t.maybe(FilePath)
}, {
  name: 'SslConf',
  strict: true
});

// intentionally not returning cast to type
const resolvePaths = async (sslConf) => {
  sslConf = reject(isNilOrEmpty, sslConf);

  // if there are no values OR paths, well, we don't have an ssl config
  if (isNilOrEmpty(sslConf)) { return; }

  await Promise.all(['key', 'certificate', 'bundle'].map(async (field) => {
    const pathField = `${field}Path`;
    if (isNilOrEmpty(sslConf[field]) && !isNilOrEmpty(sslConf[pathField])) {
      try {
        sslConf[field] = await fs.readFile(sslConf[pathField], 'utf8');
      } catch (e) {
        throw configErrorFromException(e, `read ssl ${field} from path ${sslConf[pathField]}`);
      }
    }
  }));
  return sslConf;
};

// to be used *after* resolving paths
const validateSsl = async (sslConf) => {
  if (isNilOrEmpty(sslConf) || (isNilOrEmpty(sslConf.key) && isNilOrEmpty(sslConf.certificate))) {
    return;
  }

  if (!isNilOrEmpty(sslConf.key) && isNilOrEmpty(sslConf.certificate)) {
    throw configError('SSL certificate must be provided if key is provided.');
  }

  if (isNilOrEmpty(sslConf.key) && !isNilOrEmpty(sslConf.certificate)) {
    throw configError('SSL key must be provided if certificate is provided.');
  }

  try {
    await validateCertKeyPair(sslConf.certificate, sslConf.key, { password: ' ', bundle: sslConf.bundle, skipDateValidation: true });
  } catch (e) {
    throw configError(`SSL configuration is invalid: ${e.message}`);
  }

  return sslConf;
};

// :: (SslConf) -> Promise<SslConf>
SslConf.resolveAndValidate = async (sslConf) => {
  return validateSsl(
    await resolvePaths(sslConf)
  );
};

export default SslConf;
