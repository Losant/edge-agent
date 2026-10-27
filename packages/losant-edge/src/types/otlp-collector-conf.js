import t from 'tcomb';
import fs from 'fs-extra';
import { isNil, isNilOrEmpty, prop, reject, trim } from 'omnibelt';
import ensureValidHttpUri from 'losant-nodejs-utils/src/utils/ensure-valid-uri.js';
import { validateCertKeyPair } from 'losant-nodejs-utils/src/utils/validate-ssl.js';
import Struct from './lib/struct.js';
import FilePath from './file-path.js';
import { SslKey, SslCertificate } from './lib/refinements.js';
import { configError, configErrorFromException } from '../lib/configuration-error.js';
import { METRICS_PATH, LOGS_PATH, TRACES_PATH } from '../lib/otel-constants.js';

const OtlpCollectorAuthType = t.enums.of(['none', 'basic', 'bearer', 'clientCert'], 'OtlpCollectorAuthType');

// @iarna/toml parses TOML datetime literals into date-like objects (not
// always `instanceof Date`), which otel-utils.js's toAttrValue already
// special-cases via toISOString - allow them here too.
const DateLike = t.irreducible('DateLike', (x) => !isNil(x) && typeof x.toISOString === 'function');
const ResourceAttributeValue = t.union([t.String, t.Number, t.Boolean, DateLike]);

const OtlpCollectorConf = Struct({
  url: t.String,
  authType: OtlpCollectorAuthType,
  username: t.maybe(t.String),
  password: t.maybe(t.String),
  bearerToken: t.maybe(t.String),
  clientCertPath: t.maybe(FilePath),
  clientKeyPath: t.maybe(FilePath),
  caCertPath: t.maybe(FilePath),
  clientCert: t.maybe(SslCertificate),
  clientKey: t.maybe(SslKey),
  caCert: t.maybe(SslCertificate),
  disableSSLVerification: t.Boolean,
  resourceAttributes: t.maybe(t.dict(t.String, ResourceAttributeValue))
}, {
  name: 'OtlpCollectorConf',
  strict: true,
  defaultProps: {
    authType: 'none',
    disableSSLVerification: false,
    resourceAttributes: {}
  }
});

OtlpCollectorConf.fromArgs = prop('otlpCollector');

OtlpCollectorConf.resolveAndValidate = async (conf) => {
  if (isNilOrEmpty(conf)) { return undefined; }
  const nonNilProps = reject(isNil, conf);
  if (isNilOrEmpty(nonNilProps)) { return undefined; }

  const url = trim(conf.url);
  if (isNilOrEmpty(url)) {
    throw configError('Collector URL must not be empty.');
  }

  let parsed;
  try {
    parsed = ensureValidHttpUri(url);
  } catch (err) {
    throw configError(`Collector URL is invalid: ${err.message}`);
  }

  if (parsed.search) {
    throw configError('Collector URL must not contain a query string.');
  }
  if (parsed.hash) {
    throw configError('Collector URL must not contain a fragment.');
  }
  if (parsed.username || parsed.password) {
    throw configError('Collector URL must not contain embedded credentials. Use the authentication fields instead.');
  }

  const pathPrefix = parsed.pathname.replace(/\/+$/, '');
  if (pathPrefix.endsWith(METRICS_PATH)) {
    const base = `${parsed.origin}${pathPrefix.slice(0, -METRICS_PATH.length)}`;
    throw configError(`Collector URL must not include ${METRICS_PATH}: use ${base}`);
  }
  if (pathPrefix.endsWith(LOGS_PATH)) {
    const base = `${parsed.origin}${pathPrefix.slice(0, -LOGS_PATH.length)}`;
    throw configError(`Collector URL must not include ${LOGS_PATH}: use ${base}`);
  }
  if (pathPrefix.endsWith(TRACES_PATH)) {
    const base = `${parsed.origin}${pathPrefix.slice(0, -TRACES_PATH.length)}`;
    throw configError(`Collector URL must not include ${TRACES_PATH}: use ${base}`);
  }

  conf.url = `${parsed.origin}${pathPrefix}`;

  const authType = conf.authType || 'none';
  if (authType === 'basic') {
    conf.username = trim(conf.username);
    if (isNilOrEmpty(conf.username)) {
      throw configError('Username must be provided when authType is basic.');
    }
  } else if (authType === 'bearer') {
    conf.bearerToken = trim(conf.bearerToken);
    if (isNilOrEmpty(conf.bearerToken)) {
      throw configError('Bearer token must be provided when authType is bearer.');
    }
  } else if (authType === 'clientCert') {
    if (isNilOrEmpty(conf.clientCert) && !isNilOrEmpty(conf.clientCertPath)) {
      try {
        conf.clientCert = await fs.readFile(conf.clientCertPath, 'utf8');
      } catch (e) {
        throw configErrorFromException(e, `read clientCert from path ${conf.clientCertPath}`);
      }
    }
    if (isNilOrEmpty(conf.clientKey) && !isNilOrEmpty(conf.clientKeyPath)) {
      try {
        conf.clientKey = await fs.readFile(conf.clientKeyPath, 'utf8');
      } catch (e) {
        throw configErrorFromException(e, `read clientKey from path ${conf.clientKeyPath}`);
      }
    }
    if (isNilOrEmpty(conf.clientCert)) {
      throw configError('Client certificate must be provided when authType is clientCert.');
    }
    if (isNilOrEmpty(conf.clientKey)) {
      throw configError('Client key must be provided when authType is clientCert.');
    }
    try {
      await validateCertKeyPair(conf.clientCert, conf.clientKey, { password: ' ', skipDateValidation: true });
    } catch (e) {
      throw configError(`Client certificate or key is invalid: ${e.message}`);
    }
  }

  if (!conf.disableSSLVerification && isNilOrEmpty(conf.caCert) && !isNilOrEmpty(conf.caCertPath)) {
    try {
      conf.caCert = await fs.readFile(conf.caCertPath, 'utf8');
    } catch (e) {
      throw configErrorFromException(e, `read caCert from path ${conf.caCertPath}`);
    }
  }

  return conf;
};

export default OtlpCollectorConf;
