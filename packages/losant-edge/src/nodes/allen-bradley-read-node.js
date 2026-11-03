import {
  queueInstructions,
  cleanClients
} from '../lib/connections/allen-bradley.js';
import {
  validateRenderReadInstructions,
  validateAllenBradleyConfig
} from '../lib/allen-bradley-utils.js';
import { set } from 'losant-handlebars';

class AllenBradleyReadNode {

  /* Example Config:
  {
    hostTemplate: <String - Required: host for the EtherNet/IP connection>,
    slotTemplate: <String - Optional: slot for the EtherNet/IP connection, integer 0-255. Default 0>,
    keepRateTemplate: <String - Optional: keep alive rate in seconds for the EtherNet/IP connection, integer 0-300 where 0 is off. Default 0>,
    timeoutTemplate: <String - Optional: timeout in ms. Defaults to context.externalTimeout (normally 30 seconds) and cannot be greater than it>,
    destinationPath: <String - Required: payload path at which to place the results of the reads>,
    readInstructionsType: <String - Optional: how readInstructions is provided (array|payloadPath). Default array; any value other than payloadPath is treated as array>,
    readInstructions: <[Object]|String - Required: for array, the list of read instructions to complete. For payloadPath, a payload path to that list>,
    readInstructions.tagTemplate: <String - Required: a template that is the tag of the register to read>,
    readInstructions.programTemplate: <String - Optional: a template that is the program of the register to read>,
    readInstructions.lengthTemplate: <Integer - Optional: number of items in the array to read, 1 up to the maximum length (ALLENBRADLEY_MAX_LENGTH, default 255). If omitted, only the first item is read>,
    readInstructions.key: <String - Optional: key at which to place the result of the read within the destination object. Treated as a payload path underneath the destination. Defaults to the tag. Cannot be errors or plcProperties (or start with them)>
  }
  Notes:
    In payloadPath mode each instruction uses unsuffixed keys: tag, program, length,
    and key (not tagTemplate, programTemplate, lengthTemplate).
    A tag cannot be read twice (for the same program) in one run.
    The result at destinationPath is { plcProperties: { ... }, <key>: <value>, ... }
    plus errors: [ { type: 'Allen-Bradley_READ_ERROR', message, key?, tag? } ] if any
    instruction or the connection failed. Invalid configuration or instructions throw
    a validation error. Connection and tag read failures are written to errors and do not throw.
  */

  constructor(id, outputIds, config) {
    this.id = id;
    this.outputIds = outputIds;
    this.hostTemplate = config.hostTemplate;
    this.slotTemplate = config.slotTemplate || 0;
    this.timeoutTemplate = config.timeoutTemplate;
    this.keepRateTemplate = config.keepRateTemplate || 0;
    this.destinationPath = config.destinationPath;
    this.readInstructionsType = config.readInstructionsType || 'array';
    this.readInstructions = config.readInstructions;
  }

  async run(context, payload) {
    const readInstructions = validateRenderReadInstructions(this.readInstructions, payload, this.readInstructionsType);
    const clientConfig = await validateAllenBradleyConfig(payload, this, context);
    const results = await queueInstructions(clientConfig, readInstructions, 'READ');
    payload = set(this.destinationPath, results, payload);
    return [this.outputIds, payload];
  }

  static shutdown() {
    return cleanClients();
  }

}

export default AllenBradleyReadNode;

