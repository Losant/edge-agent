import {
  forEachSerialP, defer, timeoutP, prop, includes,
  equals, noop, clamp
} from 'omnibelt';
import { resolve as pathResolve } from 'node:path';
import fs from 'fs-extra';
import { resetTo, clampPositiveEnv } from './utils.js';
import t from 'tcomb';
import { SerialPort, DelimiterParser, ByteLengthParser } from 'serialport';
import logger from './logger/index.js';
import FiredTrigger from './types/fired-trigger.js';
import SerialConfigs from './types/serial-configs.js';
import unescapeStr from 'losant-nodejs-utils/src/utils/unescape-str.js';
import { PARITY, DATA_BITS, STOP_BITS } from './constants.js';
import { slowWriteToPort } from './lib/serial-utils.js';
const maxSerialReadyTime = clampPositiveEnv('MAX_SERIAL_READY_TIME', 60000);
const waitToWriteOnOpenTime = clampPositiveEnv('SERIAL_START_WRITE_WAIT', 1000);
const serialCheckExistsTime = clampPositiveEnv('SERIAL_CHECK_EXISTS_TIME', 1000);
// in seconds
const clampRetryWaitTime = clamp(1, 30);

const stateDefault = () => {
  return {
    onSerialFire: null,
    serialById: new Map() // Map<serialId, { port, config }
  };
};

const SerialManager = () => {
  const state = stateDefault();

  const getPorts = () => {
    return Array.from(state.serialById.values(), prop('port'));
  };

  const closePort = async (port, path) => {
    const waitToClose = defer();
    port.removeAllListeners();
    port.on('error', noop);
    if (port.losTimeout) {
      clearTimeout(port.losTimeout);
      port.losTimeout = null;
    }
    try {
      port.close(waitToClose.resolve);
    } catch { }
    await timeoutP(maxSerialReadyTime, waitToClose.promise).catch(() => {
      logger.errorNoRollbar(`Timeout closing serial for path ${path}`);
    });
    port.removeAllListeners();
    logger.info(`No longer waiting for serial data on path ${path}`);
  };

  const buildPort = async (path, config) => {
    let deferToOpen = defer();
    let retryCount = 0;
    let portExistsIntervalCheck;

    const port = new SerialPort({
      path,
      baudRate: config.baudRate,
      dataBits: config.dataBits,
      parity: config.parity,
      rtscts: config.rtscts,
      stopBits: config.stopBits,
      autoOpen: false,
      lock: false // lock false allows other processes to open the same port
    });

    const retryOpen = () => {
      if (port.losTimeout) { return; }
      // 6 retries before it reaches 30 seconds.
      const waitTime = clampRetryWaitTime(retryCount * 5 || 1);
      logger.warn(`Serial path will retry to open in ${waitTime} seconds.`);
      port.losTimeout = setTimeout(() => {
        retryCount++;
        port.losTimeout = null;
        port.open();
        logger.warn(`Serial path ${path} is attempting to reopen...`);
      }, waitTime * 1000);
    };

    // serial port lib does not do well if the path disappears
    const checkPathExists = async () => {
      if (!port.isOpen) {
        clearTimeout(portExistsIntervalCheck);
        portExistsIntervalCheck = null;
        return;
      }
      if (await fs.pathExists(path)) { return; }
      port.close(noop);
      logger.warn(`Error in serial manager while listening at ${path}: path no longer exists`);
    };

    port.on('error', (err) => {
      if (deferToOpen) {
        // this is for the first time you try to open it.
        deferToOpen.resolve();
        logger.errorNoRollbar(`Error initializing serial manager for path ${path} - ${err.name}: ${err.message}`);
      } else {
        logger.warn(`Error in serial manager while listening at ${path} - ${err.name}: ${err.message}`);
      }
      // tried to open but failed. let's retry.
      if (!port.isOpen) { retryOpen(); }
    });

    // something other than us tried to close you, reopen please.
    port.on('close', retryOpen);

    let transform;
    if (config.delimiter) {
      const delimiter = Buffer.from(unescapeStr(config.delimiter), config.delimiterEncoding || 'utf8');
      transform = new DelimiterParser({ delimiter });
    } else {
      transform = new ByteLengthParser({ length: Number(config.byteLength) });
    }

    const parser = port.pipe(transform);
    parser.on('data', async (data) => {
      const now = new Date();

      return state.onSerialFire(FiredTrigger({
        triggerId: config.serialId,
        triggerType: 'serial',
        payload: {
          time: now,
          data: {
            serial: data.toString(config.encoding),
            path
          }
        }
      }));
    });

    port.on('open', () => {
      if (!portExistsIntervalCheck) {
        portExistsIntervalCheck = setInterval(checkPathExists, serialCheckExistsTime);
      }
      // reset everything on GREAT SUCCESS
      retryCount = 0;
      if (deferToOpen) { deferToOpen.resolve(); }
      if (config.writeOnOpen) {
        const writeOnOpenEncoding = config.writeOnOpenEncoding || 'utf8';
        const bufferToWrite = Buffer.from(unescapeStr(config.writeOnOpen), writeOnOpenEncoding);
        setTimeout(async () => {
          if (!port.isOpen) { return; }
          try {
            await slowWriteToPort(port, bufferToWrite);
            logger.info(`Successfully wrote ${config.writeOnOpen} (${writeOnOpenEncoding}) to ${config.path}`);
          } catch (e) {
            logger.warn(`An error occurred when trying to write ${config.writeOnOpen} (${writeOnOpenEncoding}) to ${config.path}: ${e.message}`);
          }
        }, waitToWriteOnOpenTime);
      }
      logger.info(`Now listening on serial ${path}`);
    });

    port.open();

    await timeoutP(maxSerialReadyTime, deferToOpen.promise).catch(() => {
      logger.errorNoRollbar(`Timeout initializing serial for path ${path}`);
    });
    deferToOpen = null;
    return port;
  };

  const toSerialByIds = async (serialConfigs, oldById) => {
    const newById = new Map();
    await forEachSerialP(async (config) => {
      if (config.delimiter && config.byteLength) {
        logger.errorNoRollbar(`Error in serial manager while initializing for path ${config.path}: cannot parse by both byteLength and delimiter`);
        return;
      }
      if (!Number.isSafeInteger(config.baudRate) || config.baudRate < 1) {
        logger.errorNoRollbar(`Error in serial manager ${config.baudRate} is not a valid baudRate, must be a positive integer.`);
        return;
      }
      if (!(includes(config.parity, PARITY))) {
        logger.errorNoRollbar(`Error in serial manager ${config.parity} is not a valid parity (${PARITY.join(',')}).`);
        return;
      }
      if (!(includes(config.dataBits, DATA_BITS))) {
        logger.errorNoRollbar(`Error in serial manager ${config.dataBits} is not a valid value for data bits (${DATA_BITS.join(',')}).`);
        return;
      }
      if (!(includes(config.stopBits, STOP_BITS))) {
        logger.errorNoRollbar(`Error in serial manager ${config.stopBits} is not a valid value for stop bits (${STOP_BITS.join(',')}).`);
        return;
      }
      if (typeof config.rtscts !== 'boolean') {
        logger.errorNoRollbar(`Error in serial manager ${config.rtscts} is not a valid boolean value for rtscts.`);
        return;
      }
      const fullPath = pathResolve(config.path);
      const oldSerialPair = oldById && oldById.get(config.serialId);
      let port = oldSerialPair && oldSerialPair.port;
      // if config has changed...SHUT IT DOWN...
      if (port && !equals(oldSerialPair.config, config)) {
        await closePort(port, config.path);
        port = null;
      }
      if (!port) {
        port = await buildPort(fullPath, config);
      }
      newById.set(config.serialId, { port, config });
    }, serialConfigs);
    return newById;
  };

  const initialize = async (serialConfigs = [], onSerialFire) => {
    if (state.onSerialFire) { throw new Error('Initialize has already been called'); }
    serialConfigs = SerialConfigs(serialConfigs);
    t.Function(onSerialFire);
    state.onSerialFire = onSerialFire;
    state.serialById = await toSerialByIds(serialConfigs);
  };

  const update = async (serialConfigs) => {
    if (!state.onSerialFire) { throw new Error('Serial Manager must be initialized first.'); }
    serialConfigs = SerialConfigs(serialConfigs);
    const oldById = state.serialById;
    state.serialById = await toSerialByIds(serialConfigs, oldById);

    const closing = [];
    oldById.forEach(({ port, config }, serialId) => {
      if (state.serialById.has(serialId)) { return; }
      closing.push(closePort(port, config.path));
    });
    return Promise.all(closing);
  };

  const shutdown = () => {
    const closing = [];
    state.serialById.forEach(({ port, config }) => {
      closing.push(closePort(port, config.path));
    });
    resetTo(stateDefault, state);
    return Promise.all(closing);
  };

  return {
    // :: (SerialConfigs, (FiredTrigger -> *)) -> Promise<Nil>
    initialize,

    // :: SerialConfigs -> Promise<Nil>
    update,

    // SE: State is reset to default, manager will need to be reinitialized
    // :: -> Nil
    shutdown,

    getPorts
  };

};

// :: () -> SerialManager
export default SerialManager;
