import snmp from 'net-snmp';
import errors from 'losant-nodejs-utils/src/errors.js';
import * as payloadHelper from 'losant-handlebars';
import { getSnmpSession, validateSnmpOid, buildResult } from '../lib/snmp-utils.js';
import { isNil, defer } from 'omnibelt';
import niceBooleanCast from 'losant-nodejs-utils/src/utils/nice-boolean-cast.js';

class SnmpWriteNode {

  /* Example Config:
  {
    hostTemplate: <String - Required: host for SNMP session>,
    portTemplate: <String - Optional: port for SNMP session, an integer from 0 to 65535. Default 161>,
    sourcePortTemplate: <String - Optional: source port for SNMP session, an integer from 0 to 65535. A random port is used if not provided>,
    timeoutTemplate: <String - Optional: the timeout for the snmp connection and writes. Default the externalTimeout (normally 30 seconds), cannot be longer than the externalTimeout>,
    snmpVersionTemplate: <String - Optional: version of SNMP to use, must be 'Version1', 'Version2c', or 'Version3'. Default 'Version2c'>,
    communityTemplate: <String - Optional: community string which specifies permissions, used for Version1 or Version2c. Default 'public'>,

    // v3 configs
    nameTemplate: <String - Required for Version3: username>,
    securityLevelTemplate: <String - Optional: specifies level of security for Version3, 'none', 'auth', or 'authAndEncrypt'. Default 'none'>,
    authMethodTemplate: <String - Optional: auth protocol to use for Version3 if security level is above 'none', must be one of 'sha', 'md5', or 'none'. Default 'sha'>,
    authKeyTemplate: <String - Required for Version3 if security level is above 'none': authentication key>,
    encryptionMethodTemplate: <String - Required for Version3 if security level is 'authAndEncrypt': method to use for encryption, must be one of 'des', 'aes'>,
    encryptionKeyTemplate: <String - Required for Version3 if security level is 'authAndEncrypt': the encryption key>,

    // write node specific configs
    writeInstructionsType: <String - Optional: type of write instructions, must be 'templateStrings' or 'payloadPath'. Default 'templateStrings'>,
    writeInstructions: <String or Array - Required: actual write instructions. Will be either a payload path string or an array of objects which contain the 'oidTemplate', 'type', 'valueTemplate', and optionally 'resultKey' keys>,
    resultPath: <String - Optional: payload path to store results. If blank, the result is discarded>
  }
  Notes:
    type is one of Boolean|Integer|OctetString|Null|OID|IpAddress|Counter|Gauge|TimeTicks|Opaque and is
    used as-is, it is not a template. valueTemplate is not needed if type is Null.
    If writeInstructionsType = payloadPath, each object in the array uses the unsuffixed keys oid, type,
    value, and resultKey, and their values are used as-is, they are not rendered as templates. A
    payloadPath array must contain at least one instruction.
    resultKey is optional and is a payload path within the result object. Only instructions with a
    resultKey have their returned value stored. It cannot be 'errors' or start with 'errors.'.
    The result is an object with each returned value stored at its resultKey. If any error occurs, an
    errors array is added containing entries of { type: 'SNMP_WRITE_ERROR', message, oid? }, where oid is
    set for errors on a specific value.
    Invalid configuration (invalid instructions, OIDs, types, or values, bad session settings) throws,
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

    // write node specific configs
    this.writeInstructionsType = config.writeInstructionsType || 'templateStrings';
    this.writeInstructions = config.writeInstructions;
    this.resultPath = config.resultPath;
  }

  isValidWriteValue(value) {
    if (typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string' || isNil(value)) {
      return true;
    }
    return false;
  }

  async run(context, payload) {
    const instructionMap = {};
    let instructions;
    let renderedInstructions = [];
    if (this.writeInstructionsType === 'payloadPath') {
      instructions = payloadHelper.lookup(this.writeInstructions, payload);
      if (!instructions) {
        throw errors.Validation( { message: 'SNMP Write Node instructions are required.' });
      }
      if (!Array.isArray(instructions)) {
        throw errors.Validation( { message: 'SNMP Write Node instructions must be an array.' });
      }
      if (!instructions.length) {
        throw errors.Validation({ message: 'SNMP Write Node: At least one instruction is required.' });
      }
      instructions.forEach((instruction) => {
        if (!instruction || typeof instruction !== 'object' || isNil(instruction)) {
          throw errors.Validation({ message: 'Each SNMP Write Node instruction must be an object.' });
        }
        if (!instruction.oid || !instruction.type || (isNil(instruction.value) && instruction.type !== 'Null')) {
          throw errors.Validation({ message: 'SNMP Write Node instructions must have all of the following properties: oid, type, and value if type is not "Null".' });
        }
        validateSnmpOid(instruction.oid);
        let type = snmp.ObjectType[instruction.type];
        if (!type) {
          if (instruction.type !== undefined) {
            throw errors.Validation({ message: `Invalid SNMP data type "${instruction.type}".` });
          }
          type = snmp.ObjectType.Integer;
        }
        if (!this.isValidWriteValue(instruction.value)) {
          throw errors.Validation({ message: `Invalid SNMP Value: ${instruction.value}` });
        }
        if (instruction.resultKey) {
          if (instruction.resultKey === 'errors' || instruction.resultKey.startsWith('errors.')) {
            throw errors.Validation({ message: 'Keys cannot contain the special path errors.' });
          }
          instructionMap[instruction.oid] = instruction.resultKey;
        }
        renderedInstructions.push({ oid: instruction.oid, type, value: instruction.value });
      });
    } else {
      instructions = this.writeInstructions;
      if (!Array.isArray(instructions)) {
        throw errors.Validation( { message: 'SNMP Write Node instructions must be an array.' });
      }
      renderedInstructions = instructions.map((instruction) => {
        if (!instruction || typeof instruction !== 'object' || isNil(instruction)) {
          throw errors.Validation({ message: 'Each SNMP Write Node instruction must be an object.' });
        }
        if (!instruction.oidTemplate || !instruction.type) {
          throw errors.Validation({ message: 'SNMP Write Node instructions must have all of the following properties: oidTemplate, type, and valueTemplate if type is not "Null".' });
        }
        const oid = payloadHelper.renderToString(instruction.oidTemplate, payload);
        validateSnmpOid(oid);
        let type = snmp.ObjectType[instruction.type];
        if (!type) {
          if (instruction.type !== undefined) {
            throw errors.Validation({ message: `Invalid SNMP data type "${instruction.type}".` });
          }
          type = snmp.ObjectType.Integer;
        }
        let value = payloadHelper.render(instruction.valueTemplate, payload);
        if ((isNil(value) && type !== snmp.ObjectType.Null) || !this.isValidWriteValue(value)) {
          throw errors.Validation({ message: `Invalid SNMP Value: ${instruction.valueTemplate}` });
        }
        if (type === snmp.ObjectType.Integer && typeof value !== 'number') {
          if (isNaN(value)) {
            throw errors.Validation({ message: `Invalid integer value for SNMP write: "${value}".` });
          }
          value = Number(value);
        } else if (type === snmp.ObjectType.OctetString) {
          value = String(value);
        } else if (type === snmp.ObjectType.Boolean) {
          value = niceBooleanCast(value);
        }
        if (instruction.resultKey) {
          if (instruction.resultKey === 'errors' || instruction.resultKey.startsWith('errors.')) {
            throw errors.Validation({ message: 'Keys cannot contain the special path errors.' });
          }
          instructionMap[oid] = instruction.resultKey;
        }
        return { oid, type, value };
      });
    }
    const deferred = defer();
    const session = await getSnmpSession(this, payload, context.externalTimeout);
    let result = {};
    const snmpErrors = [];
    session.on('close', () => {
      deferred.resolve();
    });
    session.on('error', (error) => {
      snmpErrors.push({ type: 'SNMP_WRITE_ERROR', message: error.message });
      result = buildResult(session, snmpErrors, result);
    });
    session.set(renderedInstructions, (error, varbinds) => {
      if (error) {
        if (error.message === 'argument must be a buffer') {
          error.message = 'argument must be a string';
        }
        snmpErrors.push({ type: 'SNMP_WRITE_ERROR', message: error.message });
        result = buildResult(session, snmpErrors, result);
      } else {
        varbinds.forEach((varbind) => {
          if (snmp.isVarbindError(varbind)) {
            snmpErrors.push({ type: 'SNMP_WRITE_ERROR', message: snmp.varbindError(varbind), oid: varbind.oid });
          } else {
            if (Buffer.isBuffer(varbind.value)) {
              varbind.value = String(varbind.value);
            }
            if (instructionMap[varbind.oid]) {
              result = payloadHelper.set(instructionMap[varbind.oid], varbind.value, result);
            }
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

export default SnmpWriteNode;
