import { renderToString, lookup, set } from 'losant-handlebars';
import errors from 'losant-nodejs-utils/src/errors.js';
import { renderAndValidateClientConfig } from '../lib/beckhoff-utils.js';
import { cleanClients, queueInstructions } from '../lib/connections/beckhoff.js';
import { isNil } from 'omnibelt';

const validateReadInstruction = ({ type, name, key }) => {
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
  return { type, name: `${name}`, key: key || name };
};

const validateReadInstructions = (node, payload) => {
  let instructions;
  if (node.readInstructionsType === 'array') {
    if (!Array.isArray(node.readInstructions)) {
      throw errors.Validation({ message: 'Instructions must be an array.' });
    }
    instructions = node.readInstructions.map(({ type, nameTemplate, key }) => {
      return validateReadInstruction({ type, name: renderToString(nameTemplate, payload), key });
    });
  } else if (node.readInstructionsType === 'payloadPath') {
    instructions = lookup(node.readInstructions, payload);
    if (!Array.isArray(instructions)) {
      throw errors.Validation({ message: 'Instructions must be an array.' });
    }
    instructions = instructions.map((instruct) => {
      if (!instruct || typeof instruct !== 'object' || isNil(instruct)) {
        throw errors.Validation({ message: 'Each read instruction must be an object.' });
      }
      const { type, name, key } = instruct;
      return validateReadInstruction({ type: type || 'symbol', name, key });
    });
  } else {
    throw errors.Validation({ message: `${node.readInstructionsType} is an invalid type.` });
  }
  if (!instructions.length) {
    throw errors.Validation({ message: 'At least one read instruction is required.' });
  }
  if (instructions.length > 256) {
    throw errors.Validation({ message: 'Cannot do more than 256 reads at one time.' });
  }
  return instructions;
};


class BeckhoffReadNode {

  /* Example Config:
  {
    localAmsNetIdTemplate: <String - Required: local AmsNetId, exactly 6 dot-separated octets of 0-255, e.g. 192.168.200.217.1.1>,
    localAdsPortTemplate: <Integer - Optional: local ADS port. If given it must be a valid port (1-65535)>,
    targetAmsNetIdTemplate: <String - Required: target system AmsNetId, exactly 6 dot-separated octets of 0-255>,
    targetAdsPortTemplate: <Integer - Optional: target system ADS port. Default 851>,
    routerHostTemplate: <String - Required: target ADS router IP address or host name>,
    routerTcpPortTemplate: <Integer - Optional: target ADS router TCP port. Default 48898>,
    timeoutTemplate: <String - Optional: timeout in ms. Defaults to context.externalTimeout (normally 30 seconds) and cannot be greater than it>,
    readInstructionsType: <String - Optional: how readInstructions is provided (array|payloadPath). Default array; any other value throws a validation error>,
    readInstructions: <[Object]|String - Required: for array, the list of read instructions to complete (1-256). For payloadPath, a payload path to that list>,
    readInstructions.key: <String - Optional: key at which to place the result within the destination object. Defaults to the name. Cannot start with errors>,
    readInstructions.type: <String - Required in array mode (optional in payloadPath mode, where it defaults to symbol): the instruction type. Must be symbol>,
    readInstructions.nameTemplate: <String - Required: template for the name of the symbol to read>,
    destinationPath: <String - Required: payload path at which to place the results of the reads>
  }
  Notes:
    In array mode the name is nameTemplate and the type is the unsuffixed type key. In
    payloadPath mode each instruction uses unsuffixed keys: type, name, and key
    (not nameTemplate).
    The result at destinationPath is { <key>: { value, symbol }, ... } plus
    errors: [ { type: 'BECKHOFF_READ_ERROR', message, key? } ] when a read or the
    connection failed. Invalid configuration or instructions throw a validation error,
    while read and connection failures are written to errors and do not throw.
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

    this.readInstructionsType = config.readInstructionsType || 'array';
    this.readInstructions = config.readInstructions;

    this.timeoutTemplate = config.timeoutTemplate;
    this.destinationPath = config.destinationPath;
  }

  async run(context, payload) {
    const clientConfig = await renderAndValidateClientConfig(this, context, payload);
    const instructions = validateReadInstructions(this, payload);
    if (!this.destinationPath) {
      throw errors.Validation({ message: 'Destination path is required.' });
    }
    const results = await queueInstructions(clientConfig, instructions, 'READ');
    payload = set(this.destinationPath, results, payload);
    return [this.outputIds, payload];
  }

  static async shutdown() {
    return cleanClients();
  }
}

export default BeckhoffReadNode;
