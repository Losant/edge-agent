import { runS7WriteInstructions, validateRenderWriteInstructions } from '../lib/s7-utils.js';
import { cleanS7Clients } from '../lib/s7-connections.js';

class S7WriteNode {
  /* Example Config:
  {
    hostTemplate: <String - Required: IPV4 address or host name of the S7 PLC. A host name is resolved to an IP address>,
    portTemplate: <String - Optional: Port for the S7 PLC. Default 102>,
    rackTemplate: <Number - Required: Rack value for the S7 PLC, an integer from 0 to 7>,
    slotTemplate: <Number - Required: Slot value for the S7 PLC, an integer from 0 to 31>,
    timeoutTemplate: <String - Optional: Timeout for the S7 connection and writes. Default the externalTimeout (normally 30 seconds), cannot be longer than the externalTimeout>,
    writeInstructionsType: <String - Optional: array|payloadPath. Default array. Only payloadPath changes behavior, any other value is treated as array>,
    writeInstructions: <[Object] || String - Required: if writeInstructionsType is array, the list of write instructions to complete. If payloadPath, a payload path to an array of write instruction objects. At most 20 instructions per run>,
    writeInstructions.valueTypeTemplate: <String - Optional: singleValue|arrayOfValues, as a template or a plain string. Default singleValue>,
    writeInstructions.valueTemplate: <String - Required: the value to write. If valueTypeTemplate is arrayOfValues then this is a payload path to an array of values>,
    writeInstructions.key: <String - Optional: the key to access the result of the write at within the destination object,
      will be treated as a payload path underneath the destination. Instructions without a key are written but not reported.
      Cannot be 'errors' or start with 'errors.'>,
    writeInstructions.dbTemplate: <Integer - Required: the DB number to write to, 0 to 65535>,
    writeInstructions.offsetTemplate: <Integer - Required: the offset within the DB where the value will be placed, 0 to 2147483646>,
    writeInstructions.dataTypeTemplate: <String - Required: the data type to write, case insensitive. One of BOOL|BYTE|INT|WORD|DINT|DWORD|REAL|CHAR|TIME|TIME_OF_DAY|DATE>,
    destinationPath: <String - Optional: payload path to store the result. If blank, the result is discarded>
  }
  Notes:
    If writeInstructionsType = payloadPath, each object in the array uses the unsuffixed keys
    key, db, offset, dataType, valueType, and value. Their values are used as-is, they are not rendered as templates.
    The result written to destinationPath is an object keyed by each instruction's key with true
    (written) or false (failed). If any write fails, an errors array is added containing entries of
    { key, type: 'S7_WRITE_ERROR', message }.
    Invalid configuration (missing host, bad rack/slot, invalid instructions or values) throws.
  */

  constructor(id, outputIds, config) {
    this.id = id;
    this.outputIds = outputIds;
    this.hostTemplate = config.hostTemplate;
    this.portTemplate = config.portTemplate || 102;
    this.rackTemplate = config.rackTemplate;
    this.slotTemplate = config.slotTemplate;
    this.timeoutTemplate = config.timeoutTemplate;
    this.writeInstructionsType = config.writeInstructionsType;
    this.writeInstructions = config.writeInstructions;
    this.destinationPath = config.destinationPath;
  }

  async run(context, payload) {
    const writes = validateRenderWriteInstructions(this.writeInstructions, payload, this.writeInstructionsType);
    payload = await runS7WriteInstructions(payload, this, context.externalTimeout, writes);
    return [this.outputIds, payload];
  }

  static shutdown() {
    return cleanS7Clients();
  }
}

export default S7WriteNode;
