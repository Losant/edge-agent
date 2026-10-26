import { runS7ReadInstructions, validateRenderReadInstructions } from '../lib/s7-utils.js';
import { cleanS7Clients } from '../lib/s7-connections.js';

class S7ReadNode {
  /* Example Config:
  {
    hostTemplate: <String - Required: IPV4 address or host name of the S7 PLC. A host name is resolved to an IP address>,
    portTemplate: <String - Optional: Port for the S7 PLC. Default 102>,
    rackTemplate: <Number - Required: Rack value for the S7 PLC, an integer from 0 to 7>,
    slotTemplate: <Number - Required: Slot value for the S7 PLC, an integer from 0 to 31>,
    timeoutTemplate: <String - Optional: Timeout for the S7 connection and reads. Default the externalTimeout (normally 30 seconds), cannot be longer than the externalTimeout>,
    readInstructionsType: <String - Optional: array|payloadPath. Default array. Only payloadPath changes behavior, any other value is treated as array>,
    readInstructions: <[Object] || String - Required: if readInstructionsType is array, the list of read instructions to complete. If payloadPath, a payload path to an array of read instruction objects. At most 20 instructions per run>,
    readInstructions.key: <String - Required: the key to access the result of the read at within the destination object,
      will be treated as a payload path underneath the destination. Cannot be 'errors' or start with 'errors.'>,
    readInstructions.dbTemplate: <Integer - Required: the DB number to read from, 0 to 65535>,
    readInstructions.offsetTemplate: <Integer - Required: the offset within the DB where the value is located, 0 to 2147483646>,
    readInstructions.dataTypeTemplate: <String - Required: the data type to read, case insensitive. One of BOOL|BYTE|INT|WORD|DINT|DWORD|REAL|CHAR|TIME|TIME_OF_DAY|DATE>,
    readInstructions.arrayLengthTemplate: <Integer - Optional: The length of the array you wish to read. If blank, a single value is read>,
    destinationPath: <String - Required: payload path to store the result. If blank, the result is discarded>
  }
  Notes:
    If readInstructionsType = payloadPath, each object in the array uses the unsuffixed keys
    key, db, offset, dataType, and arrayLength. Their values are used as-is, they are not rendered as templates.
    The result written to destinationPath is an object keyed by each instruction's key. If any
    read fails, an errors array is added containing entries of { key, type: 'S7_READ_ERROR', message }.
    Invalid configuration (missing host, bad rack/slot, invalid instructions) throws.
  */

  constructor(id, outputIds, config) {
    this.id = id;
    this.outputIds = outputIds;
    this.hostTemplate = config.hostTemplate;
    this.portTemplate = config.portTemplate || 102;
    this.rackTemplate = config.rackTemplate;
    this.slotTemplate = config.slotTemplate;
    this.timeoutTemplate = config.timeoutTemplate;
    this.readInstructionsType = config.readInstructionsType;
    this.readInstructions = config.readInstructions;
    this.destinationPath = config.destinationPath;
  }

  async run(context, payload) {
    const reads = validateRenderReadInstructions(this.readInstructions, payload, this.readInstructionsType);
    payload = await runS7ReadInstructions(payload, this, context.externalTimeout, reads);
    return [this.outputIds, payload];
  }

  static shutdown() {
    return cleanS7Clients();
  }
}

export default S7ReadNode;
