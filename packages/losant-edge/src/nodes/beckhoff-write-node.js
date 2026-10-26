import { renderToString, lookup, set } from 'losant-handlebars';
import errors from 'losant-nodejs-utils/src/errors.js';
import { renderAndValidateClientConfig } from '../lib/beckhoff-utils.js';
import { cleanClients, queueInstructions } from '../lib/connections/beckhoff.js';
import resolveValueByLookupType from 'losant-nodes/src/lib/resolve-value-by-lookup-type.js';
import { isNil } from 'omnibelt';

const validateWriteInstruction = ({ type, name, key, data, autoFill = true }) => {
  if (type !== 'symbol') {
    throw errors.Validation({ message: 'Type must be symbol.' });
  }
  if (!name) {
    throw errors.Validation({ message: 'Name is required.' });
  }
  key = key || `${name}`;
  if (key.startsWith('errors')) {
    throw errors.Validation({ message: 'Keys cannot contain the special path errors.' });
  }
  if (data === undefined) {
    throw errors.Validation({ message: 'Data is required.' });
  }
  if (typeof autoFill !== 'boolean') {
    throw errors.Validation({ message: 'autoFill must be a boolean.' });
  }
  return { type, name: `${name}`, key, data, autoFill };
};

const validateWriteInstructions = (node, payload) => {
  let instructions;
  if (node.writeInstructionsType === 'array') {
    if (!Array.isArray(node.writeInstructions)) {
      throw errors.Validation({ message: 'Instructions must be an array.' });
    }
    instructions = node.writeInstructions.map(({
      type, nameTemplate, key, dataMethod, dataTemplate, autoFill
    }) => {
      const name = renderToString(nameTemplate, payload);
      const data = resolveValueByLookupType({
        lookupType: dataMethod,
        inputValue: dataTemplate,
        payload,
        title: 'Data Template',
        blankJsonToUndefined: true,
        errorOnMissing: true
      });
      return validateWriteInstruction({ type, name, key, data, autoFill });
    });
  } else if (node.writeInstructionsType === 'payloadPath') {
    instructions = lookup(node.writeInstructions, payload);
    if (!Array.isArray(instructions)) {
      throw errors.Validation({ message: 'Instructions must be an array.' });
    }
    instructions = instructions.map((instr) => {
      if (!instr || typeof instr !== 'object' || isNil(instr)) {
        throw errors.Validation({ message: 'Each write instruction must be an object.' });
      }
      const { type, name, key, data, autoFill } = instr;
      return validateWriteInstruction({ type: type || 'symbol', name, key, data, autoFill });
    });
  } else {
    throw errors.Validation({ message: `${node.writeInstructionsType} is an invalid type.` });
  }
  if (!instructions.length) {
    throw errors.Validation({ message: 'At least one write instruction is required.' });
  }
  if (instructions.length > 256) {
    throw errors.Validation({ message: 'Cannot do more than 256 writes at one time.' });
  }
  return instructions;
};


class BeckhoffWriteNode {

  /* Example Config:
  {
    localAmsNetIdTemplate: <String - Required: local AmsNetId, exactly 6 dot-separated octets of 0-255, e.g. 192.168.200.217.1.1>,
    localAdsPortTemplate: <Integer - Optional: local ADS port. If given it must be a valid port (1-65535)>,
    targetAmsNetIdTemplate: <String - Required: target system AmsNetId, exactly 6 dot-separated octets of 0-255>,
    targetAdsPortTemplate: <Integer - Optional: target system ADS port. Default 851>,
    routerHostTemplate: <String - Required: target ADS router IP address or host name>,
    routerTcpPortTemplate: <Integer - Optional: target ADS router TCP port. Default 48898>,
    timeoutTemplate: <String - Optional: timeout in ms. Defaults to context.externalTimeout (normally 30 seconds) and cannot be greater than it>,
    writeInstructionsType: <String - Optional: how writeInstructions is provided (array|payloadPath). Default array; any other value throws a validation error>,
    writeInstructions: <[Object]|String - Required: for array, the list of write instructions to complete (1-256). For payloadPath, a payload path to that list>,
    writeInstructions.key: <String - Optional: key at which to place the result within the destination object. Defaults to the name. Cannot start with errors>,
    writeInstructions.type: <String - Required in array mode (optional in payloadPath mode, where it defaults to symbol): the instruction type. Must be symbol>,
    writeInstructions.nameTemplate: <String - Required: template for the name of the symbol to write>,
    writeInstructions.dataMethod: <String - Optional: how dataTemplate is turned into the data to write (jsonTemplate|payloadPath|stringTemplate|json|path|render|string|template|payload|workflowPayload|none). Default stringTemplate; unknown values are treated as the default>,
    writeInstructions.dataTemplate: <String - Required: the data to write to the symbol, interpreted according to dataMethod. Not required for the payload, workflowPayload, or none methods>,
    writeInstructions.autoFill: <Boolean - Optional: if true and the data type is a container (STRUCT, FUNCTION_BLOCK, etc.), missing properties are automatically set to the current values read from the target. Default true>,
    destinationPath: <String - Required: payload path at which to place the results of the writes. Not validated; results are discarded when blank>
  }
  Notes:
    In array mode the name is nameTemplate and the type is the unsuffixed type key. In
    payloadPath mode each instruction uses unsuffixed keys: type, name, key, data, and
    autoFill (not nameTemplate, dataMethod, or dataTemplate). They carry no Template
    suffix because the instructions are read from the payload as-is: nothing is rendered
    against the payload, so name and data are used exactly as found.
    The result at destinationPath is { <key>: { success: true|false }, ... } plus
    errors: [ { type: 'BECKHOFF_WRITE_ERROR', message, key? } ] when a write or the
    connection failed. Invalid configuration or instructions throw a validation error,
    while write and connection failures are written to errors and do not throw.
  */

  constructor(id, outputIds, config) {
    this.id = id;
    this.outputIds = outputIds;
    this.localAmsNetIdTemplate = config.localAmsNetIdTemplate;
    this.localAdsPortTemplate = config.localAdsPortTemplate;

    this.targetAmsNetIdTemplate = config.targetAmsNetIdTemplate;
    this.targetAdsPortTemplate = config.targetAdsPortTemplate || 851;

    this.routerHostTemplate = config.routerHostTemplate;
    this.routerTcpPortTemplate = config.routerTcpPortTemplate || 48898;

    this.writeInstructionsType = config.writeInstructionsType || 'array';
    this.writeInstructions = config.writeInstructions;

    this.timeoutTemplate = config.timeoutTemplate;
    this.destinationPath = config.destinationPath;
  }

  async run(context, payload) {
    const clientConfig = await renderAndValidateClientConfig(this, context, payload);
    const instructions = validateWriteInstructions(this, payload);
    const results = await queueInstructions(clientConfig, instructions, 'WRITE');
    payload = set(this.destinationPath, results, payload);
    return [this.outputIds, payload];
  }

  static async shutdown() {
    return cleanClients();
  }
}

export default BeckhoffWriteNode;
