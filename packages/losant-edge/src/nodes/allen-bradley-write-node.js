import {
  queueInstructions,
  cleanClients
} from '../lib/connections/allen-bradley.js';
import {
  validateRenderWriteInstructions,
  validateAllenBradleyConfig
} from '../lib/allen-bradley-utils.js';
import { set } from 'losant-handlebars';

class AllenBradleyWriteNode {

  /* Example Config:
  {
    hostTemplate: <String - Required: host for the EtherNet/IP connection>,
    slotTemplate: <String - Optional: slot for the EtherNet/IP connection, integer 0-255. Default 0>,
    keepRateTemplate: <String - Optional: keep alive rate in seconds for the EtherNet/IP connection, integer 0-300 where 0 is off. Default 0>,
    timeoutTemplate: <String - Optional: timeout in ms. Defaults to context.externalTimeout (normally 30 seconds) and cannot be greater than it>,
    destinationPath: <String - Required: payload path at which to place the results of the writes. Not validated; results are discarded when blank>,
    writeInstructionsType: <String - Optional: how writeInstructions is provided (array|payloadPath). Default array; any value other than payloadPath is treated as array>,
    writeInstructions: <[Object]|String - Required: for array, the list of write instructions to complete. For payloadPath, a payload path to that list>,
    writeInstructions.tagTemplate: <String - Required: a template that is the tag of the register to write>,
    writeInstructions.programTemplate: <String - Optional: a template that is the program of the register to write>,
    writeInstructions.valueTemplate: <String - Required: template for the value to write to the tag. Array values cannot exceed the maximum length (ALLENBRADLEY_MAX_LENGTH, default 255)>
  }
  Notes:
    In payloadPath mode each instruction uses unsuffixed keys: tag, program, and
    value (not tagTemplate, programTemplate, valueTemplate).
    A tag cannot be written twice (for the same program) in one run.
    The result at destinationPath is always set: { plcProperties: { ... }, write: 'success'|'fail' }
    plus errors: [ { type: 'Allen-Bradley_WRITE_ERROR', message, tag? } ] when write is 'fail'.
    Invalid configuration or instructions throw a validation error. Connection and tag
    write failures are written to errors and do not throw.
  */

  constructor(id, outputIds, config) {
    this.id = id;
    this.outputIds = outputIds;
    this.hostTemplate = config.hostTemplate;
    this.slotTemplate = config.slotTemplate || 0;
    this.timeoutTemplate = config.timeoutTemplate;
    this.keepRateTemplate = config.keepRateTemplate || 0;
    this.destinationPath = config.destinationPath;
    this.writeInstructionsType = config.writeInstructionsType || 'array';
    this.writeInstructions = config.writeInstructions;
  }

  async run(context, payload) {
    const writes = validateRenderWriteInstructions(this.writeInstructions, payload, this.writeInstructionsType);
    const clientConfig = await validateAllenBradleyConfig(payload, this, context);
    const results = await queueInstructions(clientConfig, writes, 'WRITE');
    payload = set(this.destinationPath, results, payload);
    return [this.outputIds, payload];
  }

  static shutdown() {
    return cleanClients();
  }

}

export default AllenBradleyWriteNode;

