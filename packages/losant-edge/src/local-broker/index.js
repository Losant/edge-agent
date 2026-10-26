import { Aedes } from 'aedes'; // eslint-disable-line import/no-unresolved
import logger from '../logger/index.js';
import errors from 'losant-nodejs-utils/src/errors.js';
import LocalBrokerConfig from '../types/local-broker-config.js';
import MqttMessage from '../types/mqtt-message.js';
import PromiseType from '../types/promise-type.js';
import FiredTrigger from '../types/fired-trigger.js';
import SubscriptionConfigs from '../types/subscription-configs.js';
import t from 'tcomb';
import { defer, test, isNilOrEmpty, difference, omit, mapP } from 'omnibelt';
import { createServer as tlsCreateServer } from 'tls';
import { createServer as netCreateServer } from 'net';

const isUnsafeTopic = test(/^$|^\$SYS/i);

const getClientString = (client) => {
  if (!client) { return 'Local Broker'; }
  let clientString = `Local broker client ${client.id}`;
  if (client._parser.settings.username) {
    clientString = `Local broker client ${client._parser.settings.username}:${client.id}`;
  }
  return clientString;
};

const LocalBrokerType = t.struct({
  config: LocalBrokerConfig,
  initialize: t.func([SubscriptionConfigs, t.Function], PromiseType/*<Nil>*/),
  publish: t.func([t.String, MqttMessage, t.maybe(t.Object)], PromiseType),
  shutdown: t.func([], PromiseType/*<Nil>*/),
  updateTriggerSubscriptions: t.func([SubscriptionConfigs], t.Object)
}, {
  name: 'LocalBrokerType'
});
const BrokerFunc = t.func([LocalBrokerConfig], LocalBrokerType);
const LocalBroker = BrokerFunc.of((config) => {
  let aedesInstance;
  let server;
  let onMqttTopic;
  let subscriptions = {};

  const setUpAedesInstance = async () => {
    aedesInstance = await Aedes.createBroker({ id: 'broker' });
    /**
     * Intercepting Aedes' internal publish flow so we can push clientId onto the packet
     * be aware of this override when updating aedes
     * https://github.com/moscajs/aedes/blob/v1.0.2/aedes.js#L214
     * https://github.com/moscajs/aedes/blob/v1.0.2/aedes.js#L396
     */
    const series = aedesInstance._series;
    aedesInstance._series = (env, funcs, start, cb) => {
    // packets published from the broker are expected to be aedes-packet type
    // so we need to make sure there's a client defined
      if (env.constructor.name === 'PublishState' && env.client) {
        start.clientId = env.client.id;
      }
      series(env, funcs, start, cb);
    };

    // Auth
    aedesInstance.authenticate = async (client, username, password, done) => {
      if (
        (isNilOrEmpty(config.username) || username === config.username) &&
      (isNilOrEmpty(config.password) || String(password) === config.password)
      ) {
        done(null, true);
      } else {
        done(null, false);
      }
    };

    aedesInstance.authorizePublish = (client, pub, done) => {
      if (isUnsafeTopic(pub.topic)) {
        return done(errors.Validation({ message: `Invalid local broker publish topic: ${pub.topic}` }));
      }
      done(null);
    };

    // Events
    aedesInstance.on('clientError', async (client, error) => {
      let loggerFunc = logger.errorNoRollbar;
      const clientString = getClientString(client);
      if (error.message === 'not authorized') { loggerFunc = logger.warn; }
      loggerFunc(`${clientString} encountered error: ${error.message}`);
    });

    aedesInstance.on('client', async (client) => {
      const clientString = getClientString(client);
      logger.verbose(`${clientString} connected`);
    });

    aedesInstance.on('clientDisconnect', async (client) => {
      const clientString = getClientString(client);
      logger.verbose(`${clientString} disconnected`);
    });

    aedesInstance.on('subscribe', async (subs, client) => {
      const clientString = getClientString(client);
      logger.verbose(`${clientString} subscribed: ${subs}`);
    });

    aedesInstance.on('unsubscribe', async (subs, client) => {
      const clientString = getClientString(client);
      logger.verbose(`${clientString} unsubscribed: ${subs}`);
    });
  };

  const fireTrigger = (packet, topic) => {
    const data = {
      message: Buffer.isBuffer(packet.payload) ? packet.payload.toString('binary') : packet.payload,
      topic: Buffer.isBuffer(packet.topic) ? packet.topic.toString('binary') : packet.topic
    };
    if (packet.clientId) { data.clientId = Buffer.isBuffer(packet.clientId) ? packet.clientId.toString('binary') : packet.clientId; }
    onMqttTopic(
      FiredTrigger({
        integrationId: 'local',
        triggerId: topic,
        triggerType: 'mqttTopic',
        payload: {
          time: new Date(),
          data
        }
      }));
  };

  const updateTriggerSubscriptions = async (subscriptionConfigs) => {
    if (!config.enabled || !onMqttTopic) { return; }

    const expectedSubscriptions = SubscriptionConfigs.getLocalBrokerSubs(subscriptionConfigs);

    const toSubscribe = difference(expectedSubscriptions, Object.keys(subscriptions));
    const toUnsubscribe = difference(Object.keys(subscriptions), expectedSubscriptions);

    await mapP(async (topic) => {
      const subDefer = defer();
      subscriptions[topic] = (packet, done) => {
        fireTrigger(packet, topic);
        done();
      };
      aedesInstance.subscribe(topic, subscriptions[topic], () => {
        subDefer.resolve();
      });
      return subDefer.promise;
    }, toSubscribe);

    await mapP(async (topic) => {
      const unSubDefer = defer();
      aedesInstance.unsubscribe(topic, subscriptions[topic], () => {
        unSubDefer.resolve();
      });
      return unSubDefer.promise;
    }, toUnsubscribe);

    subscriptions = omit(toUnsubscribe, subscriptions);
    return subscriptions;
  };

  const initialize = async (subscriptionInfo, onFire) => {
    if (!config.enabled) {
      logger.info('Local broker not enabled, not starting');
      return;
    }

    if (onMqttTopic) { throw new Error('Initialize has already been called'); }
    onMqttTopic = onFire;

    await setUpAedesInstance();

    await updateTriggerSubscriptions(subscriptionInfo);

    if (!isNilOrEmpty(config.ssl)) {
      const options = {
        key: config.ssl.key,
        cert: `${config.ssl.certificate}\n${config.ssl.bundle}`
      };
      server = await tlsCreateServer(options, aedesInstance.handle);
    } else {
      server = await netCreateServer(aedesInstance.handle);
    }

    server.on('error', (err) => {
      logger.errorNoRollbar(`Local broker: ${err.message}`);
    });

    server.listen(config.port, config.address, () => {
      logger.info(`Local broker listening on ${config.address}:${config.port}`);
    });
  };

  const publish = async (topic, message, options) => {
    if (!config.enabled) {
      throw errors.Validation({ message: 'Local Broker is not enabled' });
    }
    if (!onMqttTopic || aedesInstance?.closed || !server?.listening) {
      throw errors.Validation({ message: 'Failed to publish message, local broker has been disconnected' });
    }
    if (isUnsafeTopic(topic)) {
      throw errors.Validation({ message: `Invalid local broker publish topic: ${topic}` });
    }
    await aedesInstance.publish({ topic, payload: message, ...options });
  };

  const shutdown = async () => {
    if (aedesInstance) {
      const deferred = defer();
      aedesInstance.close(() => {
        if (!server) { return deferred.resolve(); }
        server.close(() => {
          deferred.resolve();
        });
      });
      await deferred.promise;
    }
    aedesInstance = null;
    server = null;
    onMqttTopic = null;
    subscriptions = {};
  };

  return {
    config,
    publish,
    initialize,
    shutdown,
    updateTriggerSubscriptions
  };
});

export default LocalBroker;
