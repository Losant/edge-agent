import errors from 'losant-nodejs-utils/src/errors.js';
import * as payloadHelper from 'losant-handlebars';
import { getSnmpSession, validateSnmpOid, buildResult } from '../lib/snmp-utils.js';
import { defer } from 'omnibelt';
import snmp from 'net-snmp';


class SnmpGetSubtreeNode {

  /* Example Config:
  {
    hostTemplate: <String - Required: host for SNMP session>,
    portTemplate: <String - Optional: port for SNMP session, an integer from 0 to 65535. Default 161>,
    sourcePortTemplate: <String - Optional: source port for SNMP session, an integer from 0 to 65535. A random port is used if not provided>,
    timeoutTemplate: <String - Optional: the timeout for the snmp connection and reads. Default the externalTimeout (normally 30 seconds), cannot be longer than the externalTimeout>,
    snmpVersionTemplate: <String - Optional: version of SNMP to use, must be 'Version1', 'Version2c', or 'Version3'. Default 'Version2c'>,
    communityTemplate: <String - Optional: community string which specifies permissions, used for Version1 or Version2c. Default 'public'>,

    // v3 configs
    nameTemplate: <String - Required for Version3: username>,
    securityLevelTemplate: <String - Optional: specifies level of security for Version3, 'none', 'auth', or 'authAndEncrypt'. Default 'none'>,
    authMethodTemplate: <String - Optional: auth protocol to use for Version3 if security level is above 'none', must be one of 'sha', 'md5', or 'none'. Default 'sha'>,
    authKeyTemplate: <String - Required for Version3 if security level is above 'none': authentication key>,
    encryptionMethodTemplate: <String - Required for Version3 if security level is 'authAndEncrypt': method to use for encryption, must be one of 'des', 'aes'>,
    encryptionKeyTemplate: <String - Required for Version3 if security level is 'authAndEncrypt': the encryption key>,

    rootOidTemplate: <String - Required: Root oid prefix for which to find subtree>,
    resultPath: <String - Required: Payload path at which to store results. If blank, the result is discarded>
  }
  Notes:
    The result is an object keyed by the OID of each value found under the root OID. If any
    error occurs, an errors array is added containing entries of
    { type: 'SNMP_GET_SUBTREE_ERROR', message, oid? }, where oid is set for errors on a specific value.
    Invalid configuration (missing host or root OID, invalid OID, bad session settings) throws,
    while SNMP request failures are reported in the errors array.
  */

  constructor(id, outputIds, config) {
    this.id = id;
    this.outputIds = outputIds;

    // common config
    this.hostTemplate = config.hostTemplate;
    this.portTemplate = config.portTemplate || 161;
    this.sourcePortTemplate = config.sourcePortTemplate;
    this.timeoutTemplate = config.timeoutTemplate;
    this.snmpVersionTemplate = config.snmpVersionTemplate || 'Version2c';

    // only for v1 or v2c
    this.communityTemplate = config.communityTemplate || 'public';

    // only for v3
    this.nameTemplate = config.nameTemplate;
    this.securityLevelTemplate = config.securityLevelTemplate || 'none';
    this.authMethodTemplate = config.authMethodTemplate || 'sha';
    this.authKeyTemplate = config.authKeyTemplate;
    this.encryptionMethodTemplate = config.encryptionMethodTemplate;
    this.encryptionKeyTemplate = config.encryptionKeyTemplate;

    // get subtree node-specific configs
    this.rootOidTemplate = config.rootOidTemplate;
    this.resultPath = config.resultPath;
  }

  async run(context, payload) {
    const rootOid = payloadHelper.renderToString(this.rootOidTemplate, payload);
    if (!rootOid) {
      throw errors.Validation({ message: 'Root OID required.' });
    }
    validateSnmpOid(rootOid);

    const deferred = defer();
    const session = await getSnmpSession(this, payload, context.externalTimeout);
    let result = {};
    const snmpErrors = [];
    session.on('close', () => {
      deferred.resolve();
    });
    session.on('error', (error) => {
      snmpErrors.push({ type: 'SNMP_GET_SUBTREE_ERROR', message: error.message });
      result = buildResult(session, snmpErrors, result);
    });
    session.subtree(rootOid, (varbinds) => {
      varbinds.forEach((varbind) => {
        if (snmp.isVarbindError(varbind)) {
          snmpErrors.push({ type: 'SNMP_GET_SUBTREE_ERROR', message: snmp.varbindError(varbind), oid: varbind.oid });
        } else {
          if (Buffer.isBuffer(varbind.value)) {
            varbind.value = String(varbind.value);
          }
          result[varbind.oid] = varbind.value;
        }
      });
    }, (error) => {
      if (error) {
        snmpErrors.push({ type: 'SNMP_GET_SUBTREE_ERROR', message: error.message });
      }
      result = buildResult(session, snmpErrors, result);
    });
    await deferred.promise;
    payload = payloadHelper.set(this.resultPath, result, payload);
    return [this.outputIds, payload];
  }
}

export default SnmpGetSubtreeNode;

