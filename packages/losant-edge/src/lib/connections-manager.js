import { defer, forEachSerialP, T, F } from 'omnibelt';
export const TIMEDOUT_MESSAGE = 'Timed out';
const SHUTDOWN_MESSAGE = 'Shutdown occurring';
const MAX_INSTRUCTION_SIZE = 1000;

export default ({
  getCacheKey,
  terminateClient,
  getClientPromise,
  runInternal,
  transformError,
  cleanUpInterval,
  refreshInterval,
  shouldTerminateIdleClient = T,
  shouldRefreshErroredClient = F,
  maxInstructionSize = MAX_INSTRUCTION_SIZE
} = {}) => {
  // a cache of the client and its queue
  const clientCache = new Map();

  let resetClient;
  const getClient = (config) => {
    const cacheKey = getCacheKey(config);
    let cachedConfig = clientCache.get(cacheKey);
    if (!cachedConfig) {
      cachedConfig = { cacheKey, config };
      cachedConfig.instructions = [];
      cachedConfig.lastUsedAt = Date.now();
      cachedConfig.isRunning = false;
      cachedConfig.clientP = getClientPromise(cachedConfig, resetClient, clientCache);
      clientCache.set(cacheKey, cachedConfig);
    }

    return cachedConfig;
  };
  const cleanIdleClients = async () => {
    const now = Date.now();
    await forEachSerialP(async ([ cacheKey, cachedClient ]) => {
      if (cachedClient.isRunning) { return; }
      if (refreshInterval && shouldRefreshErroredClient(cachedClient)) {
        const client = await cachedClient.clientP;
        if (client.error && now - cachedClient.lastUsedAt > refreshInterval) {
          cachedClient.lastUsedAt = now;
          resetClient(cacheKey);
        }
        return;
      }
      if (now - cachedClient.lastUsedAt > cleanUpInterval && shouldTerminateIdleClient(cachedClient)) {
        clientCache.delete(cacheKey);
        await terminateClient(cachedClient);
      }
    }, clientCache);
  };

  let cleanClientInterval = setInterval(cleanIdleClients, cleanUpInterval);

  resetClient = async (cacheKey) => {
    if (!cleanClientInterval) { return; }
    const clientInfo = clientCache.get(cacheKey);
    if (!clientInfo) { return; }
    const toTerminate = clientInfo.clientP;
    clientInfo.clientP = (async () => {
      await terminateClient(clientInfo, toTerminate);
      return getClientPromise(clientInfo, resetClient, clientCache);
    })();
  };

  const run = async (cacheKey) => {
    if (!cleanClientInterval) { return; }
    const clientInfo = clientCache.get(cacheKey);
    if (!clientInfo) { return; }
    if (!clientInfo.instructions.length) {
      clientInfo.isRunning = false;
      return;
    }
    clientInfo.isRunning = true;
    const nextInstruction = clientInfo.instructions.shift();
    if (nextInstruction.timeoutTimer) {
      clearTimeout(nextInstruction.timeoutTimer);
      const result = await runInternal(nextInstruction, clientInfo, clientCache, resetClient);
      nextInstruction.resultsPromise.resolve(result);
      clientInfo.lastUsedAt = Date.now();
    }
    run(cacheKey);
  };

  const queueInstruction = (clientConfig, newInstruction, timeout) => {
    if (!cleanClientInterval) { return { errors: transformError(newInstruction, SHUTDOWN_MESSAGE) }; }
    const clientInfo = getClient(clientConfig);
    if (clientInfo.instructions.length > maxInstructionSize) {
      return { errors: transformError(newInstruction, 'Queue is full.') };
    }
    const resultsPromise = defer();
    newInstruction.requestedTime = Date.now();
    newInstruction.resultsPromise = resultsPromise;
    newInstruction.timeoutTimer = setTimeout(() => {
      newInstruction.resultsPromise.resolve({ errors: transformError(newInstruction, TIMEDOUT_MESSAGE) });
      newInstruction.timeoutTimer = null;
    }, timeout);
    clientInfo.instructions.push(newInstruction);
    if (!clientInfo.isRunning) {
      run(clientInfo.cacheKey);
    }
    return resultsPromise.promise;
  };


  const reset = () => {
    // use ONLY for testing
    if (!cleanClientInterval) {
      cleanClientInterval = setInterval(cleanIdleClients, cleanUpInterval);
    }
  };

  const shutdown = () => {
    if (!cleanClientInterval) { return; }
    clearInterval(cleanClientInterval);
    cleanClientInterval = undefined;
    return forEachSerialP(async ([cacheKey, cachedClient]) => {
      clientCache.delete(cacheKey);
      cachedClient.instructions.forEach(({ timeoutTimer, resultsPromise, ...instrInfo }) => {
        clearTimeout(timeoutTimer);
        resultsPromise.resolve({ errors: transformError(instrInfo, SHUTDOWN_MESSAGE) });
      });
      await terminateClient(cachedClient);
    }, clientCache);
  };

  return {
    clientCache, queueInstruction, getClient, reset, shutdown, resetClient
  };
};
