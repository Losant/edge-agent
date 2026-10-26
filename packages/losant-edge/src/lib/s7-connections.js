import {
  forEachSerialP,
  defer, timeoutP, propEq, findIndex
} from 'omnibelt';
import snap7 from 'node-snap7';
import { nanoid } from 'nanoid';
import { IDLE_S7_CLEANUP_INTERVAL, MAX_INSTRUCTION_SIZE } from './s7-constants.js';

const clientCache = new Map();

const terminateClient = (client) => {
  client.Disconnect();
};

const makeConnection = async (client, config, timeout) => {
  const waitForConnection = defer();
  if (config.port) {
    client.SetParam(client.RemotePort, config.port);
  }
  client.ConnectTo(config.host, config.rack, config.slot, (error) => {
    if (error) {
      waitForConnection.reject(new Error(`Failed to connect. ${client.ErrorText(error)}`));
      return;
    }
    waitForConnection.resolve();
  });
  await timeoutP(timeout, waitForConnection.promise).catch((error) => {
    if (error.code === 'ETIMEDOUT') {
      terminateClient(client);
      throw new Error('Timed out trying to connect.');
    }
    throw error;
  });
};

const getCacheKey = (config) => {
  return `${config.host}-${config.port}-${config.rack}-${config.slot}`;
};

const getClientP = (config, timeout) => {
  const client = new snap7.S7Client();
  const makeWrapper = (error) => {
    return { client, error };
  };
  const promise = makeConnection(client, config, timeout).then(makeWrapper).catch(makeWrapper);
  return promise;
};

const getS7Client = (config, timeout) => {
  const cacheKey = getCacheKey(config);
  if (clientCache.has(cacheKey)) {
    return clientCache.get(cacheKey);
  }

  const cacheConfig = {
    lastUsedAt: Date.now(),
    instructionInfo: [],
    config,
    clientP: getClientP(config, timeout),
    cacheKey,
    running: false,
    timeout
  };
  clientCache.set(cacheKey, cacheConfig);

  return cacheConfig;
};

const cleanIdleClients = async () => {
  const now = Date.now();
  await forEachSerialP(async ([cacheKey, cacheClient]) => {
    if (now - cacheClient.lastUsedAt > IDLE_S7_CLEANUP_INTERVAL && !cacheClient.running) {
      const { client } = await cacheClient.clientP;
      clientCache.delete(cacheKey);
      terminateClient(client);
    }
  }, clientCache);
};

let cleanClientInterval = setInterval(cleanIdleClients, IDLE_S7_CLEANUP_INTERVAL);

const refreshClient = async (cacheKey, timeout) => {
  if (!cleanClientInterval) { return; }
  const cacheClient = clientCache.get(cacheKey);
  const { client } = await cacheClient.clientP;
  terminateClient(client);
  if (clientCache.has(cacheKey)) {
    cacheClient.clientP = getClientP(cacheClient.config, timeout);
  }
};

const run = async (cacheKey) => {
  const cacheClient = clientCache.get(cacheKey);
  if (!cacheClient || !cleanClientInterval) { return; } // shutting down...
  if (!cacheClient.instructionInfo.length) {
    cacheClient.running = false;
    return;
  }
  cacheClient.running = true;
  cacheClient.lastUsedAt = Date.now();
  let resultObj = {};
  const {
    instructions,
    timeout,
    nodeType,
    deferredPromise,
    requestedTime,
    transform,
    timeoutTimer
  } = cacheClient.instructionInfo.shift();
  clearTimeout(timeoutTimer);
  const resolveInstr = () => {
    return deferredPromise.resolve(resultObj);
  };
  const { error, client } = await cacheClient.clientP;

  if (error) {
    resultObj = { errors: [{ message: error.message, type: `S7_${nodeType}_ERROR` } ] };
    // if there is more in the queue try to reconnect otherwise just kill it
    resolveInstr();
    await refreshClient(cacheKey, timeout);
    run(cacheKey);
    return;
  }

  // adjust the timeout to remove the wait time.
  const queueWaitTime = requestedTime - Date.now();
  if (queueWaitTime > timeout) {
    resultObj = { errors: [{ type: `S7_${nodeType}_ERROR`, message: 'Timed out.' }] };
    resolveInstr();
    run(cacheKey);
    return;
  }

  let clientError = false;
  let hasTimedOut = false;
  const waitForInstructions = defer();
  client[nodeType === 'READ' ? 'ReadMultiVars' : 'WriteMultiVars'](instructions, (err, instructionResult) => {
    if (err) {
      clientError = true;
      const errorText = client.ErrorText(err);
      if (errorText.toLowerCase().includes('timed out')) {
        hasTimedOut = true;
      }
      resultObj = { errors: [{ type: `S7_${nodeType}_ERROR`, message: errorText }] };
    } else {
      resultObj = transform(instructionResult, instructions, client);
    }
    waitForInstructions.resolve();
  });
  await timeoutP(timeout, waitForInstructions.promise).catch((err) => {
    if (err.code === 'ETIMEDOUT') {
      hasTimedOut = true;
      resultObj = { type: `S7_${nodeType}_ERROR`, message: 'Timed out.' };
    } else {
      resultObj = { type: `S7_${nodeType}_ERROR`, message: err.message };
    }
  });

  resolveInstr();
  if (hasTimedOut || clientError) {
    // if it's timed out kill the client and create a new one on the next run
    await refreshClient(cacheKey, timeout);
  }
  // any other ones that got added on...
  run(cacheKey);
};

export const queueRun = (nodeType, clientConfig, instructions, timeout, transform) => {
  if (!cleanClientInterval) { return { errors: [{ type: `S7_${nodeType}_ERROR`, message: 'Shutdown occurring.' }] }; }
  const deferredPromise = defer();
  const cacheConfig = getS7Client(clientConfig, timeout);
  if (cacheConfig.instructionInfo.length > MAX_INSTRUCTION_SIZE) {
    deferredPromise.resolve({
      errors: [{ type: `S7_${nodeType}_ERROR`, message: 'Queue is full.' }]
    });
    return deferredPromise.promise;
  }
  const instructionId = nanoid();
  const timeoutTimer = setTimeout(() => {
    const _cacheConfig = clientCache.get(cacheConfig.cacheKey);
    const instructionIndex = findIndex(propEq(instructionId, 'instructionId'), _cacheConfig.instructionInfo);
    if (instructionIndex < 0) {
      // was not found
      return;
    }
    const instruction = _cacheConfig.instructionInfo.splice(instructionIndex, 1)[0];
    instruction.deferredPromise.resolve({
      errors: [{ type: `S7_${nodeType}_ERROR`, message: 'Timed out.' }]
    });
  }, timeout);

  cacheConfig.instructionInfo.push({
    instructionId,
    nodeType,
    requestedTime: Date.now(),
    instructions,
    deferredPromise,
    timeout,
    timeoutTimer,
    transform,
    clientConfig
  });
  if (!cacheConfig.running) {
    run(cacheConfig.cacheKey);
  }
  return deferredPromise.promise;
};

export const cleanS7Clients = async function() {
  if (!cleanClientInterval) { return; }
  clearInterval(cleanClientInterval);
  cleanClientInterval = undefined;
  return forEachSerialP(async ([cacheKey, cacheClient]) => {
    clientCache.delete(cacheKey);
    cacheClient.instructionInfo.forEach((config) => {
      clearTimeout(config.timeoutTimer);
      config.deferredPromise.resolve({
        errors: [{ type: `S7_${config.nodeType}_ERROR`, message: 'Shutdown occurring.' }]
      });
    });
    const { client } = await cacheClient.clientP;
    return terminateClient(client);
  }, clientCache);
};

export const reset = () => {
  // use ONLY for testing
  if (!cleanClientInterval) {
    cleanClientInterval = setInterval(cleanIdleClients, IDLE_S7_CLEANUP_INTERVAL);
  }
};
