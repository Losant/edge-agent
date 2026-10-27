import { defer, sleep, includes } from 'omnibelt';
import { clampPositiveEnv } from '../utils.js';
import { checkProtectedPath } from './protected-path-utils.js';
import { PARITY, DATA_BITS, STOP_BITS } from '../constants.js';
import errors from 'losant-nodejs-utils/src/errors.js';
const waitToWriteBetweenBytesTime = clampPositiveEnv('SERIAL_BYTE_WRITE_WAIT', 25);

export const slowWriteToPort = async (port, buffer, index = 0) => {
  if (!port.isOpen) {
    throw new Error('Port closed before write was finished.');
  }

  const writeDefer = defer();
  if (index >= buffer.length) {
    // if it's done writing drain
    // drain will ensure that data has arrived to the serial port
    port.drain((err) => {
      if (err) { return writeDefer.reject(err); }
      return writeDefer.resolve();
    });

    return writeDefer.promise;
  }

  port.write(buffer.slice(index, index+1), async (err) => {
    if (err) {
      return writeDefer.reject(err);
    }
    writeDefer.resolve();
  });
  await writeDefer.promise;

  await sleep(waitToWriteBetweenBytesTime);

  return slowWriteToPort(port, buffer, index+1);
};

export const validateSerialConfig = ({
  path, baudRate, parity, dataBits, stopBits, rtscts = false, type = 'Serial Write Node'
}) => {
  if (!path) {
    throw errors.Validation({ message: `Path Template is required for ${type}.` });
  }
  checkProtectedPath(path);
  if (!baudRate) {
    throw errors.Validation({ message: 'Baud Rate is required.' });
  }
  if (!Number.isSafeInteger(baudRate) || baudRate < 1) {
    throw errors.Validation({ message: `Baud Rate ${baudRate} is not valid, must be a positive integer.` });
  }
  if (!includes(parity, PARITY)) {
    throw errors.Validation({ message: `Parity Template ${parity} is not valid, valid parity values include ${PARITY.join(', ')}.` });
  }
  if (!includes(dataBits, DATA_BITS)) {
    throw errors.Validation({ message: `Data Bits Template ${dataBits} is not valid, valid data bits include ${DATA_BITS.join(', ')}.` });
  }
  if (!includes(stopBits, STOP_BITS)) {
    throw errors.Validation({ message: `Stop Bits Template ${stopBits} is not valid, valid stop bits include ${STOP_BITS.join(', ')}.` });
  }
  if (typeof rtscts !== 'boolean') {
    throw errors.Validation( { message: `RTSCTS Template ${rtscts} is not valid, must be boolean.` } );
  }
};
