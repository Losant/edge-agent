import snmp from 'net-snmp';
import errors from 'losant-nodejs-utils/src/errors.js';
import * as payloadHelper from 'losant-handlebars';
import { getSnmpSession, validateSnmpOid, buildResult } from '../lib/snmp-utils.js';
import { isNil, defer } from 'omnibelt';

class SnmpReadNode {

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

    // read node specific configs
    readInstructionsType: <String - Optional: type of read instructions, must be 'templateStrings' or 'payloadPath'. Default 'templateStrings'>,
    readInstructions: <String or Array - Required: actual read instructions. Will be either a payload path string or an array of objects which contain the 'oidTemplate' and 'resultKey' keys>,
    resultPath: <String - Required: payload path to store results. If blank, the result is discarded>
  }
  Notes:
    If readInstructionsType = payloadPath, each object in the array uses the unsuffixed keys oid and
    resultKey, and their values are used as-is, they are not rendered as templates. A payloadPath array
    must contain at least one instruction.
    resultKey is a payload path within the result object. It cannot be 'errors' or start with 'errors.'.
    The result is an object with each value stored at its resultKey. If any error occurs, an errors
    array is added containing entries of { type: 'SNMP_READ_ERROR', message, oid? }, where oid is set for
    errors on a specific value.
    Invalid configuration (invalid instructions or OIDs, bad session settings) throws, while SNMP
    request failures are reported in the errors array.
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

    // read node specific configs
    this.readInstructionsType = config.readInstructionsType || 'templateStrings';
    this.readInstructions = config.readInstructions;
    this.resultPath = config.resultPath;
  }

  async run(context, payload) {
    const instructionMap = {};
    let instructions;
    if (this.readInstructionsType === 'payloadPath') {
      instructions = payloadHelper.lookup(this.readInstructions, payload);
      if (!instructions) {
        throw errors.Validation({ message: 'SNMP Read Node instructions are required.' });
      }
      if (!Array.isArray(instructions)) {
        throw errors.Validation( { message: 'SNMP Read Node instructions must be an array.' });
      }
      if (!instructions.length) {
        throw errors.Validation({ message: 'SNMP Read Node: At least one instruction is required.' });
      }
      instructions.forEach((instruction) => {
        if (!instruction || typeof instruction !== 'object' || isNil(instruction)) {
          throw errors.Validation({ message: 'Each SNMP Read Node instruction must be an object.' });
        }
        if (!instruction.oid || !instruction.resultKey ) {
          throw errors.Validation({ message: 'SNMP Read Node instructions must have both oid and resultKey properties.' });
        }
        if (instruction.resultKey === 'errors' || instruction.resultKey.startsWith('errors.')) {
          throw errors.Validation({ message: 'Keys cannot contain the special path errors.' });
        }
        validateSnmpOid(instruction.oid);
        instructionMap[instruction.oid] = instruction.resultKey;
      });
    } else {
      instructions = this.readInstructions;
      if (!Array.isArray(instructions)) {
        throw errors.Validation( { message: 'SNMP Read Node instructions must be an array.' });
      }
      instructions.forEach((instruction) => {
        if (!instruction || typeof instruction !== 'object' || isNil(instruction)) {
          throw errors.Validation({ message: 'Each SNMP Read Node instruction must be an object.' });
        }
        if (!instruction.oidTemplate || !instruction.resultKey ) {
          throw errors.Validation({ message: 'SNMP Read Node instructions must have both oidTemplate and resultKey properties.' });
        }
        if (instruction.resultKey === 'errors' || instruction.resultKey.startsWith('errors.')) {
          throw errors.Validation({ message: 'Keys cannot contain the special path errors.' });
        }
        const oid = payloadHelper.renderToString(instruction.oidTemplate, payload);
        validateSnmpOid(oid);
        instructionMap[oid] = instruction.resultKey;
      });
    }
    const oids = Object.keys(instructionMap);
    const deferred = defer();
    const session = await getSnmpSession(this, payload, context.externalTimeout);
    let result = {};
    const snmpErrors = [];
    session.on('close', () => {
      deferred.resolve();
    });
    session.on('error', (error) => {
      snmpErrors.push({ type: 'SNMP_READ_ERROR', message: error.message });
      result = buildResult(session, snmpErrors, result);
    });
    session.get(oids, (error, varbinds) => {
      if (error) {
        snmpErrors.push({ type: 'SNMP_READ_ERROR', message: error.message });
        result = buildResult(session, snmpErrors, result);
      } else {
        varbinds.forEach((varbind) => {
          if (snmp.isVarbindError(varbind)) {
            snmpErrors.push({ type: 'SNMP_READ_ERROR', message: snmp.varbindError(varbind), oid: varbind.oid });
          } else {
            if (Buffer.isBuffer(varbind.value)) {
              varbind.value = String(varbind.value);
            }
            result = payloadHelper.set(instructionMap[varbind.oid], varbind.value, result);
          }
        });
        result = buildResult(session, snmpErrors, result);
      }
    });
    await deferred.promise;
    payload = payloadHelper.set(this.resultPath, result, payload);
    return [this.outputIds, payload];
  }
}

export default SnmpReadNode;

