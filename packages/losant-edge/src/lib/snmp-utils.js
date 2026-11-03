import snmp from 'net-snmp';
import verifyHosts from 'losant-nodejs-utils/src/utils/verify-hosts.js';
import errors from 'losant-nodejs-utils/src/errors.js';
import { SNMP_SECURITY_LEVELS, SNMP_AUTH_METHODS, SNMP_ENCRYPTION_METHODS, SNMP_VERSIONS } from '../constants.js';
import * as payloadHelper from 'losant-handlebars';
import { getTimeoutTemplate } from 'losant-nodes/src/lib/common.js';

// https://www.hl7.org/fhir/datatypes.html#oid
const OID_REGEXP = /^[0-2](\.(0|[1-9][0-9]*))+$/;

export const validateSnmpOid = (oid) => {
  if (typeof(oid) !== 'string' || !OID_REGEXP.test(oid)) {
    throw errors.Validation({ message: `Invalid SNMP OID: ${oid}` });
  }
};

export const getSnmpSession = async (node, payload, externalTimeout) => {
  const host = payloadHelper.renderToString(node.hostTemplate, payload);
  const port = payloadHelper.render(node.portTemplate, payload);
  const sourcePort = payloadHelper.render(node.sourcePortTemplate, payload);
  const timeout = getTimeoutTemplate(node, payload, externalTimeout);
  const version = payloadHelper.renderToString(node.snmpVersionTemplate, payload);
  if (!host) {
    throw errors.Validation({ message: 'Host is required.' });
  }
  await verifyHosts(host);
  const numberPort = Number(port);
  const numberSourcePort = Number(sourcePort);
  if (!Number.isInteger(numberPort) || numberPort < 0 || numberPort > 65535) {
    throw errors.Validation({ message: `Port "${port}" is invalid, must be an integer between 0 and 65535.` });
  }
  if (sourcePort && (!Number.isInteger(numberSourcePort) || numberSourcePort < 0 || numberSourcePort > 65535)) {
    throw errors.Validation({ message: `Source port "${sourcePort}" is invalid, must be an integer between 0 and 65535.` });
  }
  if (!SNMP_VERSIONS.includes(version)) {
    throw errors.Validation({ message: `Version "${version}" is invalid, must be one of the following values: ${SNMP_VERSIONS.join(', ')}.` });
  }
  const options = { retries: 0 };
  options.port = numberPort;
  if (numberSourcePort || sourcePort === 0) {
    options.sourcePort = numberSourcePort;
  }
  options.timeout = timeout;
  let session;
  if (version === 'Version1' || version === 'Version2c') {
    const community = payloadHelper.renderToString(node.communityTemplate, payload);
    if (!community) {
      throw errors.Validation({ message: 'Community string is required.' });
    }
    options.version = snmp[version];
    session = snmp.createSession(host, community, options);
  } else { // v3
    options.version = snmp.Version3;
    const name = payloadHelper.renderToString(node.nameTemplate, payload);
    if (!name) {
      throw errors.Validation({ message: 'Username is required.' });
    }
    const user = { name };
    const securityLevel = payloadHelper.renderToString(node.securityLevelTemplate, payload);
    if (!SNMP_SECURITY_LEVELS.includes(securityLevel)) {
      throw errors.Validation({ message: `Security level "${securityLevel}" is invalid, must be one of the following values: ${SNMP_SECURITY_LEVELS.join(', ')}.` });
    }
    if (securityLevel !== 'none') {
      user.level = securityLevel === 'auth' ? snmp.SecurityLevel.authNoPriv : snmp.SecurityLevel.authPriv;
      const authMethod = payloadHelper.renderToString(node.authMethodTemplate, payload);
      if (!SNMP_AUTH_METHODS.includes(authMethod)) {
        throw errors.Validation({ message: `Auth method "${authMethod}" is invalid, must be one of the following values: ${SNMP_AUTH_METHODS.join(', ')}.` });
      }
      user.authProtocol = snmp.AuthProtocols[authMethod];
      user.authKey = payloadHelper.renderToString(node.authKeyTemplate, payload);
      if (!user.authKey) {
        throw errors.Validation({ message: 'Auth key required.' });
      }
      if (securityLevel === 'authAndEncrypt') {
        const encryptionMethod = payloadHelper.renderToString(node.encryptionMethodTemplate, payload);
        if (!SNMP_ENCRYPTION_METHODS.includes(encryptionMethod)) {
          throw errors.Validation({ message: `Encryption method "${encryptionMethod}" is invalid, must be one of the following values: ${SNMP_ENCRYPTION_METHODS.join(', ')}.` });
        }
        user.privProtocol = snmp.PrivProtocols[encryptionMethod];
        user.privKey = payloadHelper.renderToString(node.encryptionKeyTemplate, payload);
        if (!user.privKey) {
          throw errors.Validation({ message: 'Encryption key required.' });
        }
      }
    } else {
      user.level = snmp.SecurityLevel.noAuthNoPriv;
    }
    session = snmp.createV3Session(host, user, options);
  }
  return session;
};

export const buildResult = (session, snmpErrors, res) => {
  if (snmpErrors?.length) {
    res.errors = snmpErrors;
  }
  session.close();
  return res;
};
