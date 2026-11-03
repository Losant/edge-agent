import * as payloadHelper from 'losant-handlebars';
import errors from 'losant-nodejs-utils/src/errors.js';
import { isNil, isNilOrEmpty, curry, capitalize } from 'omnibelt';
import { validateSerialConfig } from '../lib/serial-utils.js';
import * as modbusConnections from './connections/modbus.js';
import {
  READ_VALIDATION_MAP, WRITE_VALIDATION_MAP, READ_FUNCTION_MAP, WRITE_FUNCTION_MAP
} from './modbus-constants.js';

const validateRenderInstructions = curry((nodeType, functionMap, instructions, payload, instructionsType) => {
  const isRead = nodeType === 'read';
  const isWrite = !isRead;
  if (instructionsType === 'payloadPath') {
    instructions = payloadHelper.lookup(instructions, payload) || [];
    if (!Array.isArray(instructions)) {
      throw errors.Validation({ message: `${capitalize(nodeType)} instructions must be an array.` });
    }
    instructions = instructions.map((instruct) => {
      if (!instruct || typeof instruct !== 'object' || isNil(instruct)) {
        throw errors.Validation({ message: `Each ${nodeType} instruction must be an object.` });
      }
      const { type, key, ...args } = instruct;
      return { type, key, args };
    });
  } else {
    if (!Array.isArray(instructions)) {
      throw errors.Validation({ message: `${capitalize(nodeType)} instructions must be an array.` });
    }
    instructions = (instructions || []).map((instruct) => {
      if (!instruct || typeof instruct !== 'object' || isNil(instruct)) {
        throw errors.Validation({ message: `Each ${nodeType} instruction must be an object.` });
      }
      const {
        addressTemplate,
        typeTemplate,
        lengthTemplate,
        valueTemplate,
        key,
        deviceIdCodeTemplate,
        objectIdTemplate
      } = instruct;
      if (!typeTemplate) {
        throw errors.Validation({ message: `Type Template is required for ${nodeType} instructions.` });
      }
      const type = payloadHelper.renderToString(typeTemplate, payload);
      const address = payloadHelper.renderToString(addressTemplate, payload);
      if (isRead) {
        const deviceIdCode = payloadHelper.renderToString(deviceIdCodeTemplate, payload);
        const objectId = payloadHelper.renderToString(objectIdTemplate, payload);
        const length = payloadHelper.renderToString(lengthTemplate, payload) || 1;
        return { type, key, args: { address, length, deviceIdCode, objectId } };
      }
      // since writing to holding registers **requires** an array forcing "valueTemplates" to really be "valuePath"
      const value = payloadHelper[type === 'holding-registers' ? 'lookup' : 'render'](valueTemplate, payload);
      return { type, key, args: { address, value } };
    });
  }

  if (isNilOrEmpty(instructions)) {
    throw errors.Validation({ message: `${capitalize(nodeType)} instructions are required for Modbus ${nodeType}` });
  }

  if (instructions.length > 250) {
    throw errors.Validation({ message: 'Cannot perform more than 250 instructions at once.' });
  }
  return instructions.map(({
    type, args, key
  } = {}) => {
    if (!functionMap[type]) {
      throw errors.Validation({ message: `${capitalize(nodeType)} type must be one of the following ${Object.keys(functionMap).join(', ')}, not ${type}.` });
    }

    if (isRead) {
      if (!key) {
        throw errors.Validation({ message: 'Key is required for read.' });
      }
      const validationFunction = READ_VALIDATION_MAP[type] || READ_VALIDATION_MAP.__default;
      validationFunction(args);
    }

    if (isWrite) {
      if (!key) { key = `addr-${args.address}`; }
      const validationFunction = WRITE_VALIDATION_MAP[type] || WRITE_VALIDATION_MAP.__default;
      validationFunction(args);
    }

    if (key === 'errors' || key.startsWith('errors.')) {
      throw errors.Validation({ message: 'Keys cannot contain the special path errors.' });
    }
    return { type, key, args };
  });
});

export const validateRenderReadInstructions = validateRenderInstructions('read', READ_FUNCTION_MAP);
export const validateRenderWriteInstructions = validateRenderInstructions('write', WRITE_FUNCTION_MAP);

const validateModbusConfig = async (payload, nodeInst) => {
  const connectionType = payloadHelper.renderToString(nodeInst.connectionTypeTemplate, payload);
  let unitId = Number(payloadHelper.renderToString(nodeInst.unitIdTemplate, payload) || 1);
  if (unitId === 0 && !nodeInst.unitIdAllowZeros) {
    unitId = 1;
  }
  if (!isFinite(unitId)) {
    throw errors.Validation({ message: 'Unit ID must be a number.' });
  }
  if (connectionType === 'tcp') {
    const port = payloadHelper.renderToString(nodeInst.portTemplate, payload);
    const host = payloadHelper.renderToString(nodeInst.hostTemplate, payload);
    if (!host) {
      throw errors.Validation({ message: 'Host is required.' });
    }
    if (!port) {
      throw errors.Validation({ message: 'Port is required.' });
    }
    return { connectionType, port, host, unitId };
  } else if (connectionType === 'serial' || connectionType === 'asciiSerial') {
    const path = payloadHelper.renderToString(nodeInst.pathTemplate, payload);
    const baudRate = Number(payloadHelper.renderToString(nodeInst.baudRateTemplate, payload));
    const parity = payloadHelper.renderToString(nodeInst.parityTemplate, payload);
    const dataBits = Number(payloadHelper.renderToString(nodeInst.dataBitsTemplate, payload));
    const stopBits = Number(payloadHelper.renderToString(nodeInst.stopBitsTemplate, payload));
    validateSerialConfig({
      path, baudRate, parity, dataBits, stopBits, type: 'modbus serial connection'
    });
    let startOfFrameChar;
    if (connectionType === 'asciiSerial') {
      startOfFrameChar = payloadHelper.renderToString(nodeInst.startOfFrameCharTemplate, payload) || ':';
      if (Buffer.from(startOfFrameChar).length > 1) {
        throw errors.Validation({ message: 'startOfFrameCharTemplate is not valid, should be a single ASCII character.' });
      }
    }
    return {
      connectionType, path, unitId, baudRate, parity, dataBits, stopBits, startOfFrameChar
    };
  } else {
    throw errors.Validation({ message: `Connection type ${connectionType} is not valid.` });
  }
};

// properties used from nodeInst which are shared by read & write -> hostTemplate, portTemplate, unitIdTemplate, destinationPath
const runModbusInstructions = (nodeType) => {
  return async (payload, instructions, nodeInst, timeout, endianness) => {
    const clientConfig = await validateModbusConfig(payload, nodeInst);
    const results = await modbusConnections.queueInstructions(
      clientConfig,
      instructions,
      nodeType,
      timeout,
      { endianness, areUnsignedInts: nodeInst.areUnsignedInts }
    );
    payload = payloadHelper.set(nodeInst.destinationPath, results, payload);
    return payload;
  };
};

const curryConstructor = curry((type, inst, id, outputIds, config) => {
  inst.id = id;
  inst.outputIds = outputIds;
  inst.connectionTypeTemplate = config.connectionTypeTemplate || 'tcp';
  // tcp client
  inst.hostTemplate = config.hostTemplate;
  inst.portTemplate = config.portTemplate || 502;
  inst.unitIdTemplate = config.unitIdTemplate;
  inst.unitIdAllowZeros = config.unitIdAllowZeros || false;
  // serial client
  inst.pathTemplate = config.pathTemplate;
  inst.baudRateTemplate = config.baudRateTemplate || 9600;
  inst.parityTemplate = config.parityTemplate || 'none';
  inst.dataBitsTemplate = config.dataBitsTemplate || 8;
  inst.stopBitsTemplate = config.stopBitsTemplate || 1;

  inst.startOfFrameCharTemplate = config.startOfFrameCharTemplate || ':';

  inst.timeoutTemplate = config.timeoutTemplate;
  inst.destinationPath = config.destinationPath;
  inst[`${type}InstructionsType`] = config[`${type}InstructionsType`] || 'array';
  inst[`${type}Instructions`] = config[`${type}Instructions`];
});

export const runModbusReadInstructions = runModbusInstructions('READ');
export const runModbusWriteInstructions = runModbusInstructions('WRITE');
export const readConstructor = curryConstructor('read');
export const writeConstructor = curryConstructor('write');
