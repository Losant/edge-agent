// Handles all modbus connections and running of each set of instructions one at a time
import ModbusRTU from 'modbus-serial';
import {
  forEachSerialP, isNotNil,
  defer, timeoutP,
  assoc, any, curry, take, noop
} from 'omnibelt';
import * as payloadHelper from 'losant-handlebars';
import {
  FUNCTION_MAPS,
  IDLE_MODBUS_CLEANUP_INTERVAL,
  MAX_INSTRUCTION_SIZE
} from '../modbus-constants.js';
import verifyHosts from 'losant-nodejs-utils/src/utils/verify-hosts.js';
import connectionManager, { TIMEDOUT_MESSAGE } from '../connections-manager.js';

const writeResultsTransform = (resp) => {
  return isNotNil(resp);
};

export const readResultsTransformCurry = curry((endianness, areUnsignedInts, resp, functionName, args) => {
  if (functionName === 'readDeviceIdentification') {
    return resp;
  }
  if (isNotNil(resp)) {
    let values = [];
    if (functionName === 'readHoldingRegisters' || functionName === 'readInputRegisters') {
      const readFuncName = areUnsignedInts ? 'readUInt16' : 'readInt16';
      const func = endianness === 'big' ? `${readFuncName}BE` : `${readFuncName}LE`;
      let count = 0;
      while (count < resp.buffer.length) {
        values.push(resp.buffer[func](count));
        count = count + 2;
      }
    } else {
      values = resp.data.map((data) => { return Number(data); });
      values = take(args.length, values);
    }
    return values;
  }
});

const makeConnection = async (client, config) => {
  client.setTimeout(config.timeout);
  if (config.connectionType === 'serial') {
    await client.connectRTUBuffered(config.path, {
      baudRate: config.baudRate,
      parity: config.parity,
      stopBits: config.stopBits,
      dataBits: config.dataBits,
      lock: false
    });
  } else if (config.connectionType === 'asciiSerial') {
    await client.connectAsciiSerial(config.path, {
      baudRate: config.baudRate,
      parity: config.parity,
      stopBits: config.stopBits,
      dataBits: config.dataBits,
      lock: false,
      startOfSlaveFrameChar: Buffer.from(config.startOfFrameChar)
    });
  } else {
    await verifyHosts(config.host);
    await client.connectTCP(config.host, { port: config.port });
  }
};

const clientConfigChange = (oldConfig, newConfig) => {
  // this will short circuit if any parts of the config do not match
  return (oldConfig.connectionType === 'serial' || oldConfig.connectionType === 'asciiSerial') && any((prop) => {
    return oldConfig[prop] !== newConfig[prop];
  }, [ 'baudRate', 'parity', 'stopBits', 'dataBits', 'startOfFrameChar' ]);
};

const getCacheKey = (config) => {
  if (config.connectionType === 'serial' || config.connectionType === 'asciiSerial') {
    return `${config.connectionType}-${config.path}`;
  } else {
    return `${config.host}-${config.port}`;
  }
};

const getClientPromise = (cachedConfig, resetClient, clientCache) => {
  const client = new ModbusRTU();
  client.on('error', () => {
    const cacheClient = clientCache.get(cachedConfig.cacheKey);
    if (!cacheClient) { return; }
    const errorListeners = client.listeners('error');
    // if already running and the error listener is already attached
    if (!cacheClient.isRunning || errorListeners.length === 1) {
      resetClient(cachedConfig.cacheKey);
    }
  });
  const makeWrapper = (error) => {
    return { client, error };
  };
  const promise = makeConnection(client, cachedConfig.config).then(makeWrapper).catch(makeWrapper);
  return promise;
};

const terminateClient = async (cachedClient, clientP) => {
  const clientObj = await(clientP || cachedClient.clientP);
  const waitForClose = defer();
  // for the error listener attached on creation
  clientObj.client.removeAllListeners();
  clientObj.client.on('error', noop);
  try {
    clientObj.client.close(waitForClose.resolve);
    await timeoutP(cachedClient.config.timeout, waitForClose.promise);
  } catch {
    try {
      const waitForDestroy = defer();
      clientObj.client.destroy(waitForDestroy.resolve);
      await timeoutP(cachedClient.config.timeout, waitForDestroy.promise);
    } catch {
      // purposefully don't care
    }
    // purposefully don't care
    // maybe log that it did not successfully close...
  } finally {
    clientObj.client._port?.removeAllListeners('error');
  }
};

const arrangeArgsForModbus = (nodeType, type, args) => {
  if (nodeType === 'READ') {
    if (type === 'read-device-identification') {
      return [ args.deviceIdCode, args.objectId ];
    }
    return [ args.address, args.length ];
  }
  return [ args.address, args.value ];
};

const transformError = ({ nodeType }, message) => {
  return { type: `MODBUS_${nodeType}_ERROR`, message };
};

const runInternal = async (nextInstruction, clientInfo, clientCache, resetClient) => {
  const errorsList = [];
  let resultObj = {};
  const {
    instructions,
    timeout,
    nodeType,
    requestedTime,
    endianness,
    areUnsignedInts,
    clientConfig
  } = nextInstruction;
  const resolveInstr = () => {
    // just to ensure we are always handing back both
    if (errorsList.length) {
      resultObj = assoc('errors', errorsList, resultObj);
    }
    return resultObj;
  };
  if (clientConfigChange(clientInfo.config, clientConfig)) {
    clientInfo.config = { ...clientConfig };
    resetClient(clientInfo.cacheKey);
  }
  clientInfo = clientCache.get(clientInfo.cacheKey);
  const { error, client } = await clientInfo.clientP;
  if (error) {
    errorsList.push(transformError({ nodeType }, error.message || error.code));
    // if there is more in the queue try to reconnect otherwise just kill it
    resetClient(clientInfo.cacheKey);
    return resolveInstr();
  }

  // adjust the timeout to remove the wait time.
  const queueWaitTime = requestedTime - Date.now();
  if (queueWaitTime > timeout) {
    errorsList.push(transformError({ nodeType }, TIMEDOUT_MESSAGE));
    return resolveInstr();
  } else if (queueWaitTime > 1000) {
    client.setTimeout(timeout - queueWaitTime);
  } else {
    client.setTimeout(timeout);
  }

  if (isNotNil(clientConfig.unitId) && typeof clientConfig.unitId === 'number') {
    client.setID(clientConfig.unitId);
  }

  let clientError;
  const onErrorHandler = (err) => {
    if (clientError) { return; }
    clientError = err;
  };
  client.on('error', onErrorHandler);
  let hasTimedOut = false;
  const funcMap = FUNCTION_MAPS[nodeType];
  const transform = nodeType === 'READ' ? readResultsTransformCurry(endianness, areUnsignedInts) : writeResultsTransform;
  try {
    await forEachSerialP(async ({ type, key, args }) => {
      if (hasTimedOut) {
        errorsList.push(transformError({ nodeType }, errorsList[errorsList.length - 1].message ));
        return;
      }
      if (clientError) {
        errorsList.push(transformError({ nodeType }, clientError.message));
        return;
      }
      const functionName = funcMap[type];
      const modbusArgs = arrangeArgsForModbus(nodeType, type, args);
      let resp;
      try {
        resp = await client[functionName](...modbusArgs);
      } catch (err) {
        if (err.name === 'TransactionTimedOutError') {
          hasTimedOut = true;
        }
        errorsList.push(transformError({ nodeType }, err.message));
      }
      if (resp) {
        const result = transform(resp, functionName, args);
        if (isNotNil(result)) {
          resultObj = payloadHelper.set(key, result, resultObj);
        }
      } else if (clientError) {
        errorsList.push(transformError({ nodeType }, clientError.message ));
      }
    }, instructions);
  } finally {
    client.removeListener('error', onErrorHandler);
  }

  if (hasTimedOut || clientError) {
    // if it's timed out kill the client and create a new one on the next run
    resetClient(clientInfo.cacheKey);
  }
  return resolveInstr();
};

const modbusConnectionManager = connectionManager({
  getCacheKey,
  terminateClient,
  getClientPromise,
  runInternal,
  transformError,
  cleanUpInterval: IDLE_MODBUS_CLEANUP_INTERVAL,
  maxInstructionSize: MAX_INSTRUCTION_SIZE
});

export const queueInstructions = (clientConfig, instructions, nodeType, timeout, extraFields = {}) => {
  clientConfig.timeout = timeout;
  return modbusConnectionManager.queueInstruction(clientConfig,
    {
      instructions, nodeType, clientConfig, timeout, ...extraFields
    },
    timeout
  );
};

export const cleanClients = modbusConnectionManager.shutdown;

export const reset = modbusConnectionManager.reset;

