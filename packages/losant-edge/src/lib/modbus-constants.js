import errors from 'losant-nodejs-utils/src/errors.js';
import { isNil, within } from 'omnibelt';
import { clampPositiveEnv } from '../utils.js';

export const MIN_ADDRESS = -1;
export const MAX_ADDRESS = 65536;
export const MAX_INSTRUCTION_SIZE = 1000;
export const IDLE_MODBUS_CLEANUP_INTERVAL = clampPositiveEnv('IDLE_MODBUS_CLEANUP_INTERVAL', 10 * 1000);

const withinAddress = within(MIN_ADDRESS)(MAX_ADDRESS);

export const READ_FUNCTION_MAP = {
  'coil': 'readCoils',
  'discrete-input': 'readDiscreteInputs',
  'holding-register': 'readHoldingRegisters',
  'input-register': 'readInputRegisters',
  'read-device-identification': 'readDeviceIdentification'
};

export const WRITE_FUNCTION_MAP = {
  'coil': 'writeCoil',
  'holding-register': 'writeRegister',
  'holding-registers': 'writeRegisters'
};
export const FUNCTION_MAPS = {
  READ: READ_FUNCTION_MAP,
  WRITE: WRITE_FUNCTION_MAP
};

const validateAddress = (args) => {
  args.address = parseInt(args.address, 10);
  if (isNaN(args.address) || isNil(args.address)) {
    throw errors.Validation({ message: 'Address must be a number.' });
  }
  if (!withinAddress(args.address)) {
    throw errors.Validation({ message: `Address must be greater than ${MIN_ADDRESS} and less than ${MAX_ADDRESS}.` });
  }
};

export const READ_VALIDATION_MAP = {
  '__default': (args) => {
    validateAddress(args);
    args.length = parseInt(args.length, 10);
    if (isNaN(args.length) || isNil(args.length)) {
      throw errors.Validation({ message: 'Length must be a number.' });
    }
    if (!withinAddress(args.address + args.length)) {
      throw errors.Validation({ message: 'Length will push address index out of bounds.' });
    }
    if (args.length <= 0) {
      throw errors.Validation({ message: 'Length template must be greater than 0.' });
    }
  },
  'read-device-identification': (args) => {
    args.deviceIdCode = parseInt(args.deviceIdCode, 10);
    args.objectId = parseInt(args.objectId, 10);
    if (!isFinite(args.deviceIdCode) || args.deviceIdCode < 1 || args.deviceIdCode > 4) {
      throw errors.Validation({ message: 'Device ID Code must be a number between 1 and 4.' });
    }
    if (!isFinite(args.objectId) || args.objectId < 0 || args.objectId > 255) {
      throw errors.Validation({ message: 'Object ID must be a number between 0 and 255.' });
    }
  }
};

export const WRITE_VALIDATION_MAP = {
  '__default': (args) => {
    validateAddress(args);
    args.value = parseInt(args.value, 10);
    if (!isFinite(args.value)) {
      throw errors.Validation({ message: 'Value must be a number.' });
    }
  },
  'coil': (args) => {
    WRITE_VALIDATION_MAP.__default(args);
    if (args.value !== 0 && args.value !== 1) {
      throw errors.Validation({ message: 'coil can only hold a single bit.' });
    }
  },
  'holding-register': (args) => {
    WRITE_VALIDATION_MAP.__default(args);
    if (!within(-1, 65536, args.value)) {
      throw errors.Validation({ message: 'holding registers can only hold up to 16 bits of unsigned integers.' });
    }
  },
  'holding-registers': (args) => {
    validateAddress(args);
    if (!Array.isArray(args.value)) {
      throw errors.Validation({ message: 'Value for holding-registers must be an array of numbers from a payload path.' });
    }
    if (args.value.length > 100) {
      throw errors.Validation({ message: 'Cannot write to more than 100 registers at one time.' });
    }
    args.value = args.value.map((val, index) => {
      val = parseInt(val, 10);
      if (!isFinite(val)) {
        throw errors.Validation({ message: `Value at ${index} must be a number.` });
      }
      if (!within(-1, 65536, val)) {
        throw errors.Validation({ message: 'holding register can only hold up to 16 bits of unsigned integers.' });
      }
      return val;
    });
  }
};
