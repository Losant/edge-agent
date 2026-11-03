import { curry, isNil, isNilOrEmpty } from 'omnibelt';
import verifyHosts from 'losant-nodejs-utils/src/utils/verify-hosts.js';
import errors from 'losant-nodejs-utils/src/errors.js';
import * as payloadHelper from 'losant-handlebars';
import niceBooleanCast from 'losant-nodejs-utils/src/utils/nice-boolean-cast.js';
import { getTimeoutTemplate, renderToNetworkPort } from 'losant-nodes/src/lib/common.js';
import {
  MAX_INSTRUCTION_SIZE,
  S7_BUFFER_LENGTHS,
  S7_DATA_TYPES,
  S7_WORDLENS,
  S7_DATA_TYPE_UPPER_LIMITS,
  S7_DATA_TYPE_LOWER_LIMITS
} from './s7-constants.js';
import * as s7Connections from './s7-connections.js';

const BASE_DATE = '01/01/1990';
const HEX_REGEX = /^[0-9A-Fa-f]{2}$/;

const getBoolBuffer = (value) => {
  const bytesToWrite = Math.ceil(value.length / 8);
  const buffer = Buffer.alloc(S7_BUFFER_LENGTHS.BOOL * bytesToWrite);
  for (let i = 0; i < bytesToWrite; i++) {
    let binaryString = '';
    for (let j = 0; j < 8; j++) {
      const offset = i * 8 + j;
      const val = niceBooleanCast(value[offset]) ? '1' : '0';
      binaryString = val + binaryString;
    }
    const hex = parseInt(binaryString, 2);
    buffer.writeUInt8(hex, i);
  }
  return buffer;
};

const commonNumberCast = (value, dataType) => {
  const numberValue = Number(value);
  if (isNaN(numberValue) || !isFinite(numberValue)) {
    throw errors.Validation({ message: `Invalid value provided for ${dataType} data type. Must be a valid number.` });
  }
  switch (dataType) {
    case 'INT':
    case 'WORD':
    case 'DINT':
    case 'TIME':
    case 'DWORD':
      if (!Number.isInteger(numberValue)) {
        throw errors.Validation({ message: `Invalid value provided for ${dataType} data type. Must be an integer.` });
      }
      break;
    default:
  }
  const lowerLimit = S7_DATA_TYPE_LOWER_LIMITS[dataType];
  const upperLimit = S7_DATA_TYPE_UPPER_LIMITS[dataType];
  if (!isNil(lowerLimit) && !isNil(upperLimit)) {
    if (numberValue > upperLimit || numberValue < lowerLimit) {
      throw errors.Validation({ message: `Invalid value provided for ${dataType} data type. Must be between ${lowerLimit} and ${upperLimit}.` });
    }
  }

  return numberValue;
};

export const validateRenderWriteValue = (value, valueType, dataType) => {
  if (isNilOrEmpty(value)) {
    throw errors.Validation({ message: 'Value is required for write.' });
  }
  if (valueType === 'arrayOfValues') {
    if (!Array.isArray(value)) { throw errors.Validation({ message: 'Value must be an array.' }); }
  } else {
    if (Array.isArray(value)) { throw errors.Validation({ message: 'Value cannot be an array.' }); }
    value = [value];
  }
  if (dataType === 'BOOL') {
    return getBoolBuffer(value);
  }
  const numberOfValues = value.length;
  const bytes = S7_BUFFER_LENGTHS[dataType];
  const buffer = Buffer.alloc(bytes*numberOfValues);
  for (let i = 0; i < numberOfValues; i++) {
    const bufferOffset = i * bytes;
    let currentValue = value[i];
    switch (dataType) {
      case 'BYTE':
        if (typeof currentValue !== 'string') {
          throw errors.Validation({ message: 'Invalid value provided for BYTE data type. Must be a string.' });
        }
        if (!currentValue.match(HEX_REGEX)) {
          throw errors.Validation({ message: 'Invalid value provided for BYTE data type. Must be valid hex characters.' });
        }
        buffer.write(currentValue, bufferOffset, bytes, 'hex');
        break;
      case 'CHAR':
        if (typeof currentValue !== 'string') {
          throw errors.Validation({ message: 'Invalid value provided for CHAR data type. Must be a string.' });
        }
        if (currentValue.length > 1 || Buffer.from(currentValue).length > 1) {
          throw errors.Validation({ message: 'Invalid value provided for CHAR data type. Must be a single ascii character.' });
        }
        buffer.write(currentValue, bufferOffset, bytes);
        break;
      case 'INT':
        currentValue = commonNumberCast(currentValue, dataType);
        buffer.writeInt16BE(currentValue, bufferOffset);
        break;
      case 'WORD':
        currentValue = commonNumberCast(currentValue, dataType);
        buffer.writeUInt16BE(currentValue, bufferOffset);
        break;
      case 'DINT':
      case 'TIME':
        currentValue = commonNumberCast(currentValue, dataType);
        buffer.writeInt32BE(currentValue, bufferOffset);
        break;
      case 'DWORD':
        currentValue = commonNumberCast(currentValue, dataType);
        buffer.writeUInt32BE(currentValue, bufferOffset);
        break;
      case 'REAL':
        currentValue = commonNumberCast(currentValue, dataType);
        buffer.writeFloatBE(currentValue, bufferOffset);
        break;
      case 'DATE': {
        let daysSince1990;
        const numberValue = Number(currentValue);
        if (typeof currentValue === 'object' || isNaN(numberValue)) { // we have a date string
          const baseDate = new Date(BASE_DATE);
          const newDate = new Date(currentValue);
          if (isNaN(newDate.getTime())) {
            throw errors.Validation({ message: 'Invalid value provided for DATE data type. Must be a valid date or integer.' });
          }
          daysSince1990 = Math.round((newDate.getTime() - baseDate.getTime())/ 1000 / 3600 / 24);
        } else { // assume value given in days since 01/01/1990
          daysSince1990 = numberValue;
        }
        if (daysSince1990 < 0 || daysSince1990 > 65378 || !Number.isInteger(daysSince1990)) {
          throw errors.Validation({ message: `Out of range value provided for DATE data type. Must be a date between ${BASE_DATE} and 12/31/2168 or an integer between 0 and 65378.` });
        }
        buffer.writeUInt16BE(daysSince1990, bufferOffset);
        break;
      }
      case 'TIME_OF_DAY': {
        let timeInMS;
        if (typeof currentValue === 'object') {
          const dateObj = new Date(currentValue);
          timeInMS = dateObj.getTime();
        } else {
          const numberTime = Number(currentValue);
          if (isNaN(numberTime)) {
            timeInMS = Date.parse(`01 Jan 1970 ${currentValue} GMT`);
            // eslint-disable-next-line max-depth
            if (isNaN(timeInMS)) { // user could have passed in a full date string such as 01/17/2023 11:43:21
              const fullDate = new Date(currentValue);
              timeInMS = fullDate.getTime();
            }
          } else {
            timeInMS = numberTime;
          }
        }
        timeInMS = timeInMS % 86400000;
        if (isNaN(timeInMS) || timeInMS < 0) {
          throw errors.Validation({ message: 'Invalid value provided for TIME_OF_DAY data type. Must be a valid time.' });
        }
        buffer.writeInt32BE(timeInMS, bufferOffset);
        break;
      }
      default:
        throw errors.Validation({ message: `Unknown dataType "${dataType}".` });
    }
  }

  return buffer;
};

const getValueFromBuffer = (buffer, dataType) => {
  if (!Buffer.isBuffer(buffer)) { return; }
  switch (dataType) {
    case 'BOOL': {
      // eslint-disable-next-line no-bitwise
      return !!(buffer.readUInt8() & 1);
    }
    case 'BYTE':
      return buffer.toString('hex');
    case 'CHAR':
      return buffer.toString('ascii');
    case 'INT':
      return buffer.readInt16BE();
    case 'WORD':
      return buffer.readUInt16BE();
    case 'DINT':
    case 'TIME':
      return buffer.readInt32BE();
    case 'DWORD':
      return buffer.readUInt32BE();
    case 'REAL':
      return buffer.readFloatBE();
    case 'DATE': {
      // value returned is the number of days since January 1st, 1990
      const baseDate = new Date(BASE_DATE);
      const daysSince1990 = buffer.readUInt16BE();
      return new Date(baseDate.getTime() + daysSince1990 * 1000 * 3600 * 24).toISOString().substring(0, 10);
    }
    case 'TIME_OF_DAY': {
      let timeInMs;
      timeInMs = buffer.readInt32BE();
      const ms = timeInMs % 1000;
      timeInMs = (timeInMs - ms) / 1000;
      const secs = timeInMs % 60;
      timeInMs = (timeInMs - secs) / 60;
      const mins = timeInMs % 60;
      const hrs = (timeInMs - mins) / 60;
      return `${hrs}:${mins}:${secs}.${ms}`;
    }
    default:
  }
  return;
};

const getWriteResults = (results, instructions, client) => {
  const errorsList = [];
  const resultsObj = results.reduce((acc, { Result: result }, index) => {
    const key = instructions[index].key;
    if (!key) {
      return acc;
    }
    if (result !== 0) {
      errorsList.push({ key, type: 'S7_WRITE_ERROR', message: `Failed to write key ${key}. ${client.ErrorText(result)}` });
      return { ...acc, [key]: false };
    } else {
      return { ...acc, [key]: true };
    }
  }, {});
  if (errorsList.length) {
    return { ...resultsObj, errors: errorsList };
  }
  return resultsObj;
};

const getConvertedReadValues = (results, instructions, client) => {
  const errorsList = [];
  const resultsObj = results.reduce((acc, { Data: data, Result: result }, index) => {
    const key = instructions[index].key;
    if (result !== 0) {
      errorsList.push({ key, type: 'S7_READ_ERROR', message: `Failed to read key ${key}. ${client.ErrorText(result)}` });
    }
    const { Amount: amount, arrayLength, dataType } = instructions[index];

    if (!Buffer.isBuffer(data)) {
      return acc;
    }
    if (arrayLength) {
      if (dataType === 'BOOL') {
        let string = '';
        for (let i = data.length; i > 0; i--) {
          string += data.toString('hex', i - 1, i);
        }
        const bitArray = Array.from(parseInt(string, 16).toString(2)).reverse().map((value) => value === '1' );
        const remainingValues = new Array(arrayLength - bitArray.length).fill(false); // we wont pick up 0 values that may be at the end of the array
        return { ...acc, [key]: bitArray.concat(remainingValues) };
      }
      const valueArray = [];
      const itemLength = data.length / amount;
      for (let i = 0; i < data.length; i += itemLength) {
        const currentItem = data.slice(i, i + itemLength);
        valueArray.push(getValueFromBuffer(currentItem, dataType));
      }
      return { ...acc, [key]: valueArray };
    }
    return { ...acc, [key]: getValueFromBuffer(data, dataType) };
  }, {});
  if (errorsList.length) {
    return { ...resultsObj, errors: errorsList };
  }
  return resultsObj;
};

const validateS7Options = async (payload, node, externalTimeout) => {
  let host = payloadHelper.renderToString(node.hostTemplate, payload);
  const port = renderToNetworkPort({ template: node.portTemplate, payload, fieldName: 'S7 port', defaultValue: 102 });
  const rack = Number(payloadHelper.render(node.rackTemplate, payload));
  const slot = Number(payloadHelper.render(node.slotTemplate, payload));
  const timeout = getTimeoutTemplate(node, payload, externalTimeout);

  if (!host) {
    throw errors.Validation({ message: 'Host is required.' });
  }
  host = (await verifyHosts(host))[0]; // s7 library only accepts ips
  if (!Number.isInteger(rack) || rack < 0 || rack > 7) {
    throw errors.Validation({ message: `Rack "${rack}" is invalid, must be an integer between 0 and 7.` });
  }
  if (!Number.isInteger(slot) || slot < 0 || slot > 31) {
    throw errors.Validation({ message: `Slot "${slot}" is invalid, must be an integer between 0 and 31.` });
  }

  return {
    host, port, rack, slot, timeout
  };
};

const validateRenderInstructions = curry((nodeType, instructions, payload, instructionType) => {
  const payloadPath = instructionType === 'payloadPath';
  if (payloadPath) {
    instructions = payloadHelper.lookup(instructions, payload);
    if (!Array.isArray(instructions)) {
      throw errors.Validation({ message: `${nodeType} instructions must be an array.` });
    }
    if (instructions.length > MAX_INSTRUCTION_SIZE) {
      throw errors.Validation({ message: 'Cannot perform more than 20 instructions at once.' });
    }
    instructions = instructions.map((instruction) => {
      if (!instruction || typeof instruction !== 'object' || isNil(instruction)) {
        throw errors.Validation({ message: `Each ${nodeType} instruction must be an object.` });
      }
      return {
        arrayLengthTemplate: instruction.arrayLength,
        dataTypeTemplate: instruction.dataType,
        dbTemplate: instruction.db,
        offsetTemplate: instruction.offset,
        key: instruction.key,
        valueTypeTemplate: instruction.valueType,
        valueTemplate: instruction.value
      };
    });
  }

  if (isNilOrEmpty(instructions)) {
    throw errors.Validation({ message: `${nodeType}Instructions are required for S7 ${nodeType}.` });
  }

  return instructions.map(({
    dataTypeTemplate, dbTemplate, key, offsetTemplate, arrayLengthTemplate, valueTemplate, valueTypeTemplate
  } = {}) => {
    let dataType = payloadPath ? dataTypeTemplate : payloadHelper.renderToString(dataTypeTemplate, payload);
    const dbNumber = Number(payloadPath ? dbTemplate : payloadHelper.render(dbTemplate, payload));
    const offset = Number(payloadPath ? offsetTemplate : payloadHelper.render(offsetTemplate, payload));
    const valueType = payloadPath ? valueTypeTemplate : payloadHelper.renderToString(valueTypeTemplate, payload);
    const value = payloadPath ? valueTemplate : payloadHelper[valueType === 'arrayOfValues' ? 'lookup' : 'render'](valueTemplate, payload);
    let data, arrayLength;
    let convertedAmount = 1;

    if (!dataType) {
      throw errors.Validation({ message: 'Data Type is required.' });
    }
    if (typeof dataType !== 'string' || !S7_DATA_TYPES.includes(dataType.toUpperCase())) {
      throw errors.Validation({ message: `${dataType} is not a valid Data Type.` });
    }
    dataType = dataType.toUpperCase();
    if (isNilOrEmpty(dbTemplate)) {
      throw errors.Validation({ message: 'Database is required.' });
    }
    if (isNaN(dbNumber) || dbNumber < 0 || dbNumber > 65535) {
      throw errors.Validation({ message: 'Database must be an integer between 0 and 65535.' });
    }
    if (isNilOrEmpty(offsetTemplate)) {
      throw errors.Validation({ message: 'Offset is required.' });
    }
    if (isNaN(offset) || offset < 0 || offset > 2147483646) {
      throw errors.Validation({ message: 'Offset must be an integer between 0 and 2147483646.' });
    }
    if (key) {
      if (typeof key !== 'string') {
        throw errors.Validation({ message: 'Key must be a string.' });
      }
      if (key === 'errors' || key.startsWith('errors.')) {
        throw errors.Validation({ message: 'Keys cannot contain the special path errors.' });
      }
    }

    switch (nodeType) {
      case 'read':
        arrayLength = Number(payloadPath ? arrayLengthTemplate : payloadHelper.render(arrayLengthTemplate, payload));
        if (!key) {
          throw errors.Validation({ message: 'Key is required for read.' });
        }
        if (arrayLength && (isNaN(arrayLength) || arrayLength < 0)) {
          throw errors.Validation({ message: 'Array length must be an integer greater than 0.' });
        }
        break;
      case 'write':
        if (valueType === 'arrayOfValues' && Array.isArray(value)) {
          arrayLength = value.length;
        }
        data = validateRenderWriteValue(value, valueType, dataType);
        break;
      default:
        break;
    }

    if (arrayLength > 1) {
      convertedAmount = dataType === 'BOOL' ? Math.ceil(arrayLength / 8) : arrayLength;
    }

    return {
      key, DBNumber: dbNumber, dataType, Start: offset, WordLen: S7_WORDLENS[dataType], Area: 132, Amount: convertedAmount, arrayLength, Data: data
    };
  });
});

export const runS7Instructions = curry(async (nodeType, transform, payload, nodeInst, externalTimeout, instructions) => {
  const s7Options = await validateS7Options(payload, nodeInst, externalTimeout);
  const results = await s7Connections.queueRun(
    nodeType,
    s7Options,
    instructions,
    s7Options.timeout,
    transform
  );
  payload = payloadHelper.set(nodeInst.destinationPath, results, payload);

  return payload;
});

export const validateRenderReadInstructions = validateRenderInstructions('read');
export const runS7ReadInstructions = runS7Instructions('READ', getConvertedReadValues);
export const validateRenderWriteInstructions = validateRenderInstructions('write');
export const runS7WriteInstructions = runS7Instructions('WRITE', getWriteResults);
