import {
  writeConstructor,
  runModbusWriteInstructions,
  validateRenderWriteInstructions
} from '../lib/modbus-utils.js';
import { cleanClients } from '../lib/connections/modbus.js';
import { getTimeoutTemplate } from 'losant-nodes/src/lib/common.js';

class ModbusWriteNode {

  /* Example Config:
  {
    connectionTypeTemplate: <String - Optional: template for the connection type (tcp|serial|asciiSerial). Default tcp>,
    // tcp connection
    hostTemplate: <String - Required for tcp connections: template for the host>,
    portTemplate: <Number|String - Optional: template for the port. Default 502>,
    // serial connection (serial and asciiSerial)
    pathTemplate: <String - Required for serial connections: template for the serial path>,
    baudRateTemplate: <Number|String - Optional: baud rate of the serial connection. Default 9600>,
    parityTemplate: <String - Optional: parity type (none|even|mark|odd|space). Default none>,
    dataBitsTemplate: <Number|String - Optional: data bits (8|7|6|5). Default 8>,
    stopBitsTemplate: <Number|String - Optional: stop bits (1|2). Default 1>,
    // serial ascii connection (asciiSerial only, in addition to the serial options)
    startOfFrameCharTemplate: <String - Optional: single ASCII character that signals the start of a frame. Default ':'>,

    unitIdTemplate: <Number|String - Optional: template for the Modbus unit id of the target device. Default 1>,
    unitIdAllowZeros: <Boolean - Optional: Defaults to false. When false, a unit id of 0 is treated as 1 (kept for backwards compatibility with versions before 1.28.0). Set true to send unit id 0 as-is.>,
    timeoutTemplate: <String - Optional: template for the timeout of the modbus connection and writes. Default is the externalTimeout (normally 30 seconds). Cannot be longer than the externalTimeout>,
    destinationPath: <String - Required: payload path at which to place the results of the writes>,
    writeInstructionsType: <String - Optional: how writeInstructions is provided (array|payloadPath). Default array>,
    writeInstructions: <[Object] | String - Required: the write instructions (1 to 250). An array of instruction objects, or when writeInstructionsType is payloadPath, a payload path that resolves to such an array>,
    // each write instruction (array mode uses the Template-suffixed keys below)
    writeInstructions.addressTemplate: <String|Number - Required: template or number for the address of the register to write>,
    writeInstructions.typeTemplate: <String - Required: template or string for the write type (coil|holding-register|holding-registers)>,
    writeInstructions.valueTemplate: <String - Required: the value to write. For coil (0 or 1) and holding-register (0 - 65535) it is a template. For holding-registers (up to 100 registers) it is a payload path that must resolve to an array of numbers, because that type requires an array>,
    writeInstructions.key: <String - Optional: payload path, relative to the destination object, at which the result of this write is placed. Default addr-<address>. Cannot be 'errors' or start with 'errors.'>
  }
  Notes:
    When writeInstructionsType is payloadPath, each instruction object found at the path uses the unsuffixed keys
    (type, key, address, value) with literal values instead of templates. For holding-registers, value is the array itself.
    Result placed at destinationPath is an object keyed by each instruction key, whose value is true for a successful write.
    Invalid configuration (connection, instructions) throws a Validation error. Connection, timeout, and per-instruction
    device errors do not throw: they are collected in an errors array of { type: 'MODBUS_WRITE_ERROR', message }
    on the result object at destinationPath, alongside any successful results.
  */

  constructor(id, outputIds, config) {
    writeConstructor(this, id, outputIds, config);
  }

  async run(context, payload) {
    const writes = validateRenderWriteInstructions(this.writeInstructions, payload, this.writeInstructionsType);
    const timeout = getTimeoutTemplate(this, payload, context.externalTimeout);
    payload = await runModbusWriteInstructions(payload, writes, this, timeout);
    return [this.outputIds, payload];
  }

  static shutdown() {
    return cleanClients();
  }

}

export default ModbusWriteNode;
