import {
  readConstructor,
  runModbusReadInstructions,
  validateRenderReadInstructions
} from '../lib/modbus-utils.js';
import { cleanClients } from '../lib/connections/modbus.js';
import { getTimeoutTemplate } from 'losant-nodes/src/lib/common.js';
import * as payloadHelper from 'losant-handlebars';
import errors from 'losant-nodejs-utils/src/errors.js';
import { trim, toLower } from 'omnibelt';

class ModbusReadNode {

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
    endiannessTemplate: <String - Optional: template for the register endianness (big|little). Default big. Any other value throws a Validation error>,
    areUnsignedInts: <Boolean - Optional: how to convert register buffers to numbers when reading holding and input registers. Default false (signed 16-bit integers)>,
    timeoutTemplate: <String - Optional: template for the timeout of the modbus connection and reads. Default is the externalTimeout (normally 30 seconds). Cannot be longer than the externalTimeout>,
    destinationPath: <String - Required: payload path at which to place the results of the reads>,
    readInstructionsType: <String - Optional: how readInstructions is provided (array|payloadPath). Default array>,
    readInstructions: <[Object] | String - Required: the read instructions (1 to 250). An array of instruction objects, or when readInstructionsType is payloadPath, a payload path that resolves to such an array>,
    // each read instruction (array mode uses the Template-suffixed keys below)
    readInstructions.key: <String - Required: payload path, relative to the destination object, at which the result of this read is placed. Cannot be 'errors' or start with 'errors.'>,
    readInstructions.typeTemplate: <String - Required: template or string for the read type (coil|discrete-input|holding-register|input-register|read-device-identification)>,
    // all read types except read-device-identification require address and length
    readInstructions.addressTemplate: <String|Number - Required: template or number for the address of the register to read>,
    readInstructions.lengthTemplate: <String|Number - Optional: template or number for the count of registers to read. Default 1>,
    // only read-device-identification requires deviceIdCode and objectId
    readInstructions.deviceIdCodeTemplate: <String|Number - Required for read-device-identification: device code id (1|2|3|4) that defines the access type to the device identification metadata>,
    readInstructions.objectIdTemplate: <String|Number - Required for read-device-identification: first object id (0 - 255) to get from the device identification metadata>
  }
  Notes:
    When readInstructionsType is payloadPath, each instruction object found at the path uses the unsuffixed keys
    (type, key, address, length, deviceIdCode, objectId) with literal values instead of templates.
    Result placed at destinationPath is an object keyed by each instruction key. holding-register and input-register reads
    produce an array of numbers, coil and discrete-input reads produce an array of numbers (length entries), and
    read-device-identification produces the device identification response.
    Invalid configuration (connection, endianness, instructions) throws a Validation error. Connection, timeout, and
    per-instruction device errors do not throw: they are collected in an errors array of { type: 'MODBUS_READ_ERROR', message }
    on the result object at destinationPath, alongside any successful results.
  */

  constructor(id, outputIds, config) {
    readConstructor(this, id, outputIds, config);
    this.endiannessTemplate = config.endiannessTemplate || 'big'; // big or little
    this.areUnsignedInts = config.areUnsignedInts || false;
  }

  async run(context, payload) {
    const reads = validateRenderReadInstructions(this.readInstructions, payload, this.readInstructionsType);
    const endianness = toLower(trim(payloadHelper.renderToString(this.endiannessTemplate, payload)));

    if (endianness !== 'big' && endianness !== 'little') {
      throw errors.Validation({ message: `endianness cannot be ${endianness}, it must be big or little` });
    }
    const timeout = getTimeoutTemplate(this, payload, context.externalTimeout);
    payload = await runModbusReadInstructions(payload, reads, this, timeout, endianness);
    return [this.outputIds, payload];
  }

  static shutdown() {
    return cleanClients();
  }

}

export default ModbusReadNode;
