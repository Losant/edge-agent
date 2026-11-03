import ads from 'ads-client';
import { forEachSerialP, pick, find, timeoutP, replace, keys } from 'omnibelt';
import { clampPositiveEnv } from '../../utils.js';
import { set } from 'losant-handlebars';
import logger from '../../logger/index.js';
import connectionManager, { TIMEDOUT_MESSAGE } from '../connections-manager.js';
import { isTimeoutError } from 'losant-nodes/src/lib/common.js';
import verifyHosts from 'losant-nodejs-utils/src/utils/verify-hosts.js';

export const IDLE_BECKHOFF_CLEANUP_INTERVAL = clampPositiveEnv('IDLE_BECKHOFF_CLEANUP_INTERVAL', 10 * 1000);
const REFRESH_ERRORED_CLIENT = clampPositiveEnv('REFRESH_BECKHOFF_ERRORED_CLIENT', 60 * 1000);
const TERMINATE_TIMEOUT = 5000;

const pickSymbolInfo = pick([ 'name', 'comment', 'type', 'size', 'indexOffset', 'indexGroup' ]);

export const getCacheKey = ({
  routerTcpPort,
  routerAddress
}) => {
  return [
    routerTcpPort,
    routerAddress
  ].join('-');
};

export const terminateClient = async (cacheClient, clientP) => {
  const { client } = await(clientP || cacheClient.clientP) || {};
  if (!client) { return; }
  try {
    client.removeAllListeners();
    await timeoutP(TERMINATE_TIMEOUT, client.disconnect());
  } catch {
    try {
      await timeoutP(TERMINATE_TIMEOUT, client.disconnect(true));
    } catch {
      // do not care this can throw an error when it never connected
    }
  }
};

let fireTrigger, beckhoffConnectionManager;
export const setFireTrigger = (_beckhoffManagerFireTrigger) => {
  fireTrigger = _beckhoffManagerFireTrigger;
};

export const subscribeToSymbol = async (client, name, cycleTime, cacheKey) => {
  try {
    const subscribeResult = await client.subscribeValue(name, (result, subscription) => {
      const { subscriptions } = beckhoffConnectionManager.clientCache.get(cacheKey) || {};
      const cycleTimesToTriggers = subscriptions?.get(name);
      if (!cycleTimesToTriggers) { return; }
      const { triggerIds } = cycleTimesToTriggers[cycleTime] || { triggerIds: [] };
      if (!triggerIds.length) { return; }
      const output = {
        value: result.value,
        timestamp: result.timestamp,
        symbol: pickSymbolInfo(subscription.symbol)
      };
      const data = set(name, output, {});
      fireTrigger({ time: new Date(), data }, triggerIds);
    }, cycleTime, true);
    logger.verbose(`Beckhoff successfully subscribed to ${name}`);
    return subscribeResult;
  } catch (e) {
    logger.errorNoRollbar(`Beckhoff unable to subscribe to ${name} - ${e.message}`);
  }
};

const refreshClientSubscriptions = async (client, subscriptions, cacheKey) => {
  if (!subscriptions.size) { return; }
  await forEachSerialP(async (name) => {
    const cycleTimesToInfo = subscriptions.get(name);
    const cycleTimes = Object.keys(cycleTimesToInfo);
    await forEachSerialP(async (cycleTime) => {
      cycleTimesToInfo[cycleTime].subscription = await subscribeToSymbol(client, name, cycleTime, cacheKey);
    }, cycleTimes);
  }, Array.from(subscriptions.keys()));
};

const errorHandlerByType = (listenerType, client, cacheKey, resetClient) => {
  return async () => {
    const clientInfo = beckhoffConnectionManager.clientCache.get(cacheKey);
    if (!clientInfo) { return; }
    const listenerCount = client.listeners(listenerType).length;
    if (!clientInfo.isRunning || listenerCount === 1) {
      resetClient(cacheKey);
    }
  };
};

const getClientPromise = async (cachedConfig, resetClient) => {
  if (!cachedConfig.subscriptions) {
    cachedConfig.subscriptions = new Map();
  }
  if (cachedConfig.subscriptions.size) {
    logger.warn(`Refreshing beckhoff client connection ${cachedConfig.config.routerAddress}:${cachedConfig.config.routerTcpPort}; subscriptions will be re-initialized.`);
  }
  let client;
  try {
    client = new ads.Client({
      hideConsoleWarnings: true,
      autoReconnect: false,
      ...cachedConfig.config
    });
    client.on('client-error', (err) => {
      logger.errorNoRollbar(`Beckhoff client received a notification it cannot handle. - ${err.message}`);
    });
    await verifyHosts(cachedConfig.config.routerAddress);
    await client.connect();
    client.on('disconnect', errorHandlerByType('disconnect', client, cachedConfig.cacheKey, resetClient));
    await refreshClientSubscriptions(client, cachedConfig.subscriptions, cachedConfig.cacheKey);
    return { client };
  } catch (error) {
    if (cachedConfig.subscriptions.size) {
      logger.errorNoRollbar(`Beckhoff unable to subscribe to ${cachedConfig.config.routerAddress}:${cachedConfig.config.routerTcpPort} (client is not connected) - ${error}`);
    }
    return { client, error: error.message };
  }
};

// rejections are not always Errors (e.g. a string), so fall back to stringifying
const errorMessage = (e) => { return e?.message ?? String(e); };

const buildErrors = (nodeType, message, errors = [], key) => {
  if (message?.includes('()')) {
    // attempting to clear out function names in error messages
    // e.g. connectToTarget(): Connecting to 127.0.0.1:48898 failed
    message = (replace(/^.*\(\):/, '', message)).trim();
  }
  const errorObj = { type: `BECKHOFF_${nodeType}_ERROR`, message };
  if (key) {
    errorObj.key = key;
  }
  errors.push(errorObj);
  return errors;
};

const CONFIG_FIELDS_TO_MATCH = [
  'localAmsNetId',
  'localAdsPort',
  'targetAmsNetId',
  'targetAdsPort'
];
export const configDoesNotMatch = (existingClientConfig, newConfig) => {
  return !!find((prop) => {
    return existingClientConfig[prop] !== newConfig[prop];
  }, CONFIG_FIELDS_TO_MATCH);
};

const runReadInstructions = async (instructions, client, errorInfo) => {
  const symbolInfoByKey = {};
  const commands = [];
  let timeout, results = {};
  await forEachSerialP(async ({ key, name }) => {
    if (errorInfo.hasTimedOut) {
      buildErrors('READ', errorInfo.errors.at(-1).message, errorInfo.errors, key);
      return;
    }
    if (errorInfo.clientError) {
      buildErrors('READ', errorInfo.clientError.message, errorInfo.errors, key);
      return;
    }
    timeout = errorInfo.getNewTimeout();
    if (timeout <= 0) {
      buildErrors('READ', TIMEDOUT_MESSAGE, errorInfo.errors, key);
      errorInfo.hasTimedOut = true;
      return;
    }
    try {
      const symbolInfo = await timeoutP(timeout, client.getSymbol(name));
      symbolInfoByKey[key] = pickSymbolInfo(symbolInfo);
      commands.push({
        indexGroup: symbolInfo.indexGroup,
        indexOffset: symbolInfo.indexOffset,
        size: symbolInfo.size,
        key
      });
      errorInfo.commandSucceeded = true;
    } catch (e) {
      if (errorMessage(e).includes('not connected')) {
        errorInfo.clientError = e;
      }
      errorInfo.hasTimedOut = isTimeoutError(e);
      buildErrors('READ', errorInfo.hasTimedOut ? TIMEDOUT_MESSAGE : errorMessage(e), errorInfo.errors, key);
    }
  }, instructions);
  if (!commands.length) { return results; }
  timeout = errorInfo.getNewTimeout();
  if (timeout <= 0) {
    keys(symbolInfoByKey).forEach((key) => {
      buildErrors('READ', TIMEDOUT_MESSAGE, errorInfo.errors, key);
    });
    errorInfo.hasTimedOut = true;
    return results;
  }
  let rawResults;
  try {
    rawResults = await timeoutP(timeout, client.readRawMulti(commands));
  } catch (e) {
    if (errorMessage(e).includes('not connected')) {
      errorInfo.clientError = e;
    }
    errorInfo.hasTimedOut = isTimeoutError(e);
    keys(symbolInfoByKey).forEach((key) => {
      buildErrors('READ', errorInfo.hasTimedOut ? TIMEDOUT_MESSAGE : errorMessage(e), errorInfo.errors, key);
    });
  }
  await forEachSerialP(async (res) => {
    const key = res.command.key;
    if (res.error) {
      buildErrors('READ', res.errorStr, errorInfo.errors, key);
      return;
    }
    timeout = errorInfo.getNewTimeout();
    if (timeout <= 0) {
      buildErrors('READ', TIMEDOUT_MESSAGE, errorInfo.errors, key);
      errorInfo.hasTimedOut = true;
      return;
    }
    let value;
    const symbolInfo = symbolInfoByKey[key];
    try {
      value = await client.convertFromRaw(res.value, symbolInfo.type);
    } catch (e) {
      errorInfo.hasTimedOut = isTimeoutError(e);
      buildErrors('READ', errorInfo.hasTimedOut ? TIMEDOUT_MESSAGE : errorMessage(e), errorInfo.errors, key);
      return;
    }
    results = set(key, { value, symbol: symbolInfo }, results);
  }, rawResults);
  return results;
};

const runWriteInstructions = async (instructions, client, errorInfo) => {
  let timeout, results = {};
  await forEachSerialP(async ({ key, name, data, autoFill }) => {
    if (errorInfo.hasTimedOut) {
      buildErrors('WRITE', errorInfo.errors.at(-1).message, errorInfo.errors, key);
      return;
    }
    if (errorInfo.clientError) {
      buildErrors('WRITE', errorInfo.clientError.message, errorInfo.errors, key);
      return;
    }
    timeout = errorInfo.getNewTimeout();
    if (timeout <= 0) {
      buildErrors('WRITE', TIMEDOUT_MESSAGE, errorInfo.errors, key);
      errorInfo.hasTimedOut = true;
      return;
    }
    let result;
    try {
      await timeoutP(timeout, client.writeValue(name, data, autoFill));
      errorInfo.commandSucceeded = true;
      result = { success: true };
    } catch (e) {
      result = { success: false };
      if (errorMessage(e).includes('not connected')) {
        errorInfo.clientError = e;
      }
      errorInfo.hasTimedOut = isTimeoutError(e);
      buildErrors('WRITE', errorInfo.hasTimedOut ? TIMEDOUT_MESSAGE : errorMessage(e), errorInfo.errors, key);
    }
    results = set(key, result, results);
  }, instructions);
  return results;
};

const BECKHOFF_FUNCTIONS_BY_NODE_TYPE = {
  READ: runReadInstructions,
  WRITE: runWriteInstructions
};

const runInternal = async (nextInstruction, clientInfo, clientCache, resetClient) => {
  const { instructions, nodeType, requestedTime, clientConfig } = nextInstruction;
  let client, error;
  if (configDoesNotMatch(clientInfo.config, clientConfig)) {
    if (clientInfo.subscriptions.size) {
      return { errors: buildErrors(nodeType, 'Client already in use for subscriptions for the same router host and router port.') };
    } else {
      clientInfo.config = clientConfig;
      resetClient(clientInfo.cacheKey);
      clientInfo = clientCache.get(clientInfo.cacheKey);
      ({ client, error } = await clientInfo.clientP);
    }
  } else {
    ({ client, error } = await clientInfo.clientP);
    if (error) {
      resetClient(clientInfo.cacheKey);
    }
  }
  if (error) {
    return { errors: buildErrors(nodeType, error) };
  }
  const { timeoutDelay } = clientConfig;
  const errorInfo = {
    errors: [],
    hasTimedOut: false,
    commandSucceeded: false,
    clientError: '',
    // this timeout variable will be depleted as reads or writes are handled
    getNewTimeout:  () => {
      return timeoutDelay - (Date.now() - requestedTime);
    }
  };
  const onDisconnectHandler = () => {
    if (errorInfo.clientError) { return; }
    errorInfo.clientError = { message: 'Client unexpectedly disconnected.' };
  };
  client.on('disconnect', onDisconnectHandler);
  try {
    client.settings.timeoutDelay = timeoutDelay;
    let results = await BECKHOFF_FUNCTIONS_BY_NODE_TYPE[nodeType](instructions, client, errorInfo);
    if (errorInfo.errors.length) {
      results = set('errors', errorInfo.errors, results);
    }
    if (errorInfo.clientError || (!errorInfo.commandSucceeded && errorInfo.hasTimedOut)) {
      resetClient(clientInfo.cacheKey);
    }
    return results;
  } finally {
    client.removeListener('disconnect', onDisconnectHandler);
  }
};

beckhoffConnectionManager = connectionManager({
  getCacheKey,
  terminateClient,
  getClientPromise,
  runInternal,
  transformError: (instruction, message) => {
    return buildErrors(instruction.nodeType, message);
  },
  cleanUpInterval: IDLE_BECKHOFF_CLEANUP_INTERVAL,
  refreshInterval: REFRESH_ERRORED_CLIENT,
  shouldTerminateIdleClient: (cachedClient) => {
    return !cachedClient.subscriptions.size;
  },
  shouldRefreshErroredClient: (cachedClient) => {
    return cachedClient.subscriptions.size;
  }
});


export const queueInstructions = (clientConfig, instructions, nodeType) => {
  return beckhoffConnectionManager.queueInstruction(
    clientConfig,
    { instructions, nodeType, clientConfig, requestedTime: Date.now() },
    clientConfig.timeoutDelay
  );
};

export const reset = beckhoffConnectionManager.reset;
export const clientCache = beckhoffConnectionManager.clientCache;
export const getClient = beckhoffConnectionManager.getClient;
export const cleanClients = beckhoffConnectionManager.shutdown;
