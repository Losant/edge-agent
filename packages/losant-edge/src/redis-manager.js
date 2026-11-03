import { toInteger, timeoutP, forEachSerialP } from 'omnibelt';
import t from 'tcomb';
import { resetTo } from './utils.js';
import logger from './logger/index.js';
import RedisConfigs from './types/redis-configs.js';
import FiredTrigger from './types/fired-trigger.js';
import { Redis } from 'ioredis';

const isPatternTopic = (topic) => {
  return topic.includes('*') || topic.includes('?');
};

const stateDefault = () => ({
  onFire: null,
  // Map<clientKey, { client, topics: Map<topic, [triggerIds]> }>
  clients: new Map()
});

const RedisManager = () => {
  const state = stateDefault();

  const messageHandler = (clientKey, pattern, channel, message) => {
    const clientWrapper = state.clients.get(clientKey);
    if (!clientWrapper) { return; }

    const triggerIds = clientWrapper.topics.get(pattern);
    if (!triggerIds || triggerIds.size === 0) { return; }

    const payload = {
      time: new Date(),
      data: {
        message,
        channel,
        pattern
      }
    };

    triggerIds.forEach((triggerId) => {
      state.onFire(FiredTrigger({
        triggerId: triggerId,
        triggerType: 'redis',
        payload
      }));
    });
  };

  const buildRedisClient = async (clientKey, host, port, password) => {
    const client = new Redis({
      host,
      port,
      password,
      dropBufferSupport: true,
      lazyConnect: true
    });

    const errHandler = (err) => {
      logger.errorNoRollbar(`Unable to connect to Redis server at ${host}:${port} - ${err.name}: ${err.message}`);
    };

    client.on('error', errHandler);

    client.on('pmessage', (pattern, channel, message) => {
      messageHandler(clientKey, pattern, channel, message);
    });

    client.on('message', (channel, message) => {
      messageHandler(clientKey, channel, channel, message);
    });

    try {
      await timeoutP(60000, client.connect());
      logger.info(`Connected to Redis server at ${host}:${port}`);
    } catch (err) {
      errHandler(err);
    }

    return client;
  };

  const toClients = async (redisConfigs, oldClients) => {
    const newClients = new Map();

    await forEachSerialP(async (config) => {
      const redisPort = toInteger(config.port || 6379);
      if (redisPort < 1 || redisPort > 65535) {
        logger.warn(`Ignoring request to connect redis on invalid port ${redisPort}`);
        return newClients;
      }

      const clientKey = `${config.host}-${redisPort}-${config.password}`;
      const oldClientWrapper = oldClients && oldClients.get(clientKey);
      let clientWrapper = newClients.get(clientKey);
      if (!clientWrapper) {
        clientWrapper = {
          client: oldClientWrapper ? oldClientWrapper.client : await buildRedisClient(clientKey, config.host, redisPort, config.password),
          topics: new Map()
        };
        newClients.set(clientKey, clientWrapper);
      }

      if (!clientWrapper.topics.has(config.topic)) {
        if (!oldClientWrapper || !oldClientWrapper.topics.has(config.topic)) {
          try {
            if (isPatternTopic(config.topic)) {
              await clientWrapper.client.psubscribe(config.topic);
            } else {
              await clientWrapper.client.subscribe(config.topic);
            }
            logger.info(`Successfully subscribed to ${config.topic} on Redis server at ${config.host}:${redisPort}`);
          } catch (err) {
            logger.errorNoRollbar(`Unable to subscribe to ${config.topic} on Redis server at ${config.host}:${redisPort} - ${err.name}: ${err.message}`);
          }
        }
        clientWrapper.topics.set(config.topic, []);
      }

      clientWrapper.topics.get(config.topic).push(config.triggerId);
    }, redisConfigs);

    return newClients;
  };

  const closeClient = async (client) => {
    try { await client.disconnect(); } catch { }
    client.removeAllListeners();
  };

  const initialize = async (redisConfigs, onFire) => {
    if (state.onFire) { throw new Error('Initialize has already been called'); }
    redisConfigs = RedisConfigs(redisConfigs);
    t.Function(onFire);

    state.onFire = onFire;
    state.clients = await toClients(redisConfigs);
  };

  const update = async (redisConfigs) => {
    if (!state.onFire) { throw new Error('Redis manager must be initialized first'); }
    redisConfigs = RedisConfigs(redisConfigs);

    const oldClients = state.clients;
    state.clients = await toClients(redisConfigs, oldClients);

    // close now unused clients, unsubscribe from unused topics
    const promises = [];
    oldClients.forEach((oldWrapper, key) => {
      const newWrapper = state.clients.get(key);
      if (!newWrapper) {
        promises.push(closeClient(oldWrapper.client));
      } else {
        oldWrapper.topics.forEach((triggerIds, topic) => {
          if (newWrapper.topics.has(topic)) { return; }
          const unSubMethod = isPatternTopic(topic) ? 'punsubscribe' : 'unsubscribe';
          promises.push(oldWrapper.client[unSubMethod](topic));
        });
      }
    });
    return Promise.all(promises);
  };

  const shutdown = () => {
    const closing = [];
    state.clients.forEach((clientWrapper) => {
      closing.push(closeClient(clientWrapper.client));
    });
    resetTo(stateDefault, state);
    return Promise.all(closing);
  };

  return {
    // :: (RedisConfigs, (FiredTrigger -> *)) -> Promise<Nil>
    initialize,

    // :: RedisConfigs -> Promise<Nil>
    update,

    // SE: State is reset to default, manager will need to be reinitialized
    // :: -> Nil
    shutdown
  };

};

// :: () -> RedisManager
export default RedisManager;
