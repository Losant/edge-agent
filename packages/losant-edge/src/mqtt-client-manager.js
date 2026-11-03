import t from 'tcomb';
import { resetTo } from './utils.js';
import logger from './logger/index.js';
import { MqttClientTriggerTomlConfigMap, FiredTrigger, SubscriptionConfigs } from './types/index.js';
import mqtt from 'mqtt';
import { MQTT_HUMAN_ERROR_MSG_MAP, PLATFORM_TOPIC_BASE } from './constants.js';
import errors from 'losant-nodejs-utils/src/errors.js';
import { isNotEmpty } from 'omnibelt';

const FAILED_SUBSCRIBE_QOS = 0x80; // just part of the mqtt spec

const stateDefault = () => ({
  onFire: null,
  clients: new Map()
});

const MqttClientManager = (tomlConfigMap = {}, deviceId) => {
  tomlConfigMap = MqttClientTriggerTomlConfigMap(tomlConfigMap);
  const state = stateDefault();

  const buildMqttClient = (config) => {
    let loggingUrl = `${config.protocol}${config.protocol.endsWith('/') ? '' : '://'}${config.host}`;
    if (config.port) { loggingUrl += `:${config.port}`; }

    const [mainHost, ...pathParts] = config.host.split('/');
    const urlPath = pathParts.join('/');

    const clientId = config.clientId || `${PLATFORM_TOPIC_BASE}_${deviceId}`;

    const clientOpts = {
      rejectUnauthorized: !config.disableSSLVerification,
      clientId,
      // lib expects protocols like `wss`, we have protocols like `wss://`
      protocol: config.protocol.split(':')[0],
      port: config.port,
      hostname: mainHost,
      clean: config.clean
    };
    if (urlPath) { clientOpts.path = `/${urlPath}`; }
    if (config.username) { clientOpts.username = config.username; }
    if (config.password) { clientOpts.password = config.password; }
    if (config.protocolVersion) {
      if (config.protocolVersion === '5') {
        clientOpts.protocolVersion = 5;
      } else {
        clientOpts.protocolVersion = 4;
      }
    }
    if (config.caCertificate) { clientOpts.ca = config.caCertificate; }
    if (config.clientSsl?.certificate) { clientOpts.cert = config.clientSsl.certificate; }
    if (config.clientSsl?.key) {
      clientOpts.key = config.clientSsl.key;
      clientOpts.requestCert = true;
    }

    const client = mqtt.connect(clientOpts);

    client.on('error', (error) => {
      const humanMsg = MQTT_HUMAN_ERROR_MSG_MAP[error && error.code];
      if (humanMsg) {
        logger.warn(`MQTT Client (${config.name}) unable to connect to ${loggingUrl}, ${humanMsg}.`);
      } else {
        logger.warn(`MQTT Client (${config.name}) error:`, error);
      }
    });

    client.on('reconnect', () => {
      logger.info(`MQTT Client (${config.name}) attempting to reconnect to ${loggingUrl} ...`);
    });

    client.on('offline', () => {
      logger.warn(`MQTT Client (${config.name}) disconnected from ${loggingUrl}`);
    });

    client.on('connect', () => {
      logger.info(`MQTT Client (${config.name}) connected to ${loggingUrl}`);
    });

    if (clientOpts.protocolVersion === 5) {
      client.on('disconnect', (packet) => {
        logger.info(`MQTT Client (${config.name}) disconnecting with reason code ${packet.reasonCode}`);
      });
    }

    const onMessage = (topic, message, packet) => {
      let dataMsg;
      if (Buffer.isBuffer(message)) {
        dataMsg = packet?.properties?.payloadFormatIndicator ? message.toString() : message.toString('binary');
      } else {
        dataMsg = message;
      }
      const payload = {
        time: new Date(),
        data: {
          message: dataMsg,
          topic: Buffer.isBuffer(topic) ? topic.toString('binary') : topic,
          brokerUrl: loggingUrl
        }
      };

      if (packet.properties && isNotEmpty(packet.properties)) {
        const properties = packet.properties;
        if (properties?.correlationData && Buffer.isBuffer(properties.correlationData)) {
          properties.correlationData = properties.correlationData.toString('binary');
        }
        if (properties.userProperties) {
          properties.userProperties = { ...properties.userProperties };
        }
        payload.data.properties = properties;
      }

      state.onFire(FiredTrigger({
        integrationId: 'external',
        triggerId: config.name,
        triggerType: 'mqttTopic',
        payload
      }));
    };

    return {
      isSubscribed: false,
      client,
      config,
      onMessage
    };
  };

  const closeClient = async (clientWrapper) => {
    if (clientWrapper.isSubscribed) {
      clientWrapper.client.removeListener('message', clientWrapper.onMessage);
      clientWrapper.isSubscribed = false;
    }
    // force if we aren't connected, because there is no point in waiting
    // to send queued packets, it will never succeed
    return new Promise((resolve) => {
      clientWrapper.client.end(!clientWrapper.client.connected, resolve);
    });
  };

  const updateSubscriptionState = (toSubscribe) => {
    const allConfigs = new Set([...state.clients.keys(), ...toSubscribe]);
    toSubscribe = new Set(toSubscribe);
    allConfigs.forEach((configName) => {
      const clientWrapper = state.clients.get(configName);
      if (!clientWrapper) {
        logger.errorNoRollbar(`MQTT Client trigger config, ${configName}, was not found.`);
        return;
      }

      const shouldBeSubscribed = toSubscribe.has(configName);
      if (shouldBeSubscribed && !clientWrapper.isSubscribed) {
        clientWrapper.client.on('message', clientWrapper.onMessage);
        if (clientWrapper.config.subscriptions.length) {
          clientWrapper.client.subscribe(clientWrapper.config.subscriptions, { qos: 1 }, (error, result) => {
            if (error) {
              logger.warn(`MQTT Client (${clientWrapper.config.name}) failed to subscribe:`, error);
            } else {
              result.forEach((sub) => {
                if (sub.qos === FAILED_SUBSCRIBE_QOS) {
                  logger.warn(`MQTT Client (${clientWrapper.config.name}) failed to subscribe to topic '${sub.topic}'`);
                } else {
                  logger.info(`MQTT Client (${clientWrapper.config.name}) subscribed to topic '${sub.topic}'`);
                }
              });
            }
          });
        }
        clientWrapper.isSubscribed = true;
      } else if (!shouldBeSubscribed && clientWrapper.isSubscribed) {
        clientWrapper.client.removeListener('message', clientWrapper.onMessage);
        if (clientWrapper.config.subscriptions.length) {
          clientWrapper.client.unsubscribe(clientWrapper.config.subscriptions);
        }
        clientWrapper.isSubscribed = false;
      }
    });
  };

  const initialize = async (subscriptionConfigs, onFire) => {
    if (state.onFire) { throw new Error('Initialize has already been called.'); }
    const toSubscribe = SubscriptionConfigs.getExternalConfigNames(subscriptionConfigs);
    t.Function(onFire);

    state.onFire = onFire;
    Object.keys(tomlConfigMap).forEach((configName) => {
      state.clients.set(configName, buildMqttClient(tomlConfigMap[configName]));
    });

    updateSubscriptionState(toSubscribe);
  };

  const update = async (subscriptionConfigs) => {
    if (!state.onFire) { throw new Error('MQTT Client manager must be initialized first.'); }
    const toSubscribe = SubscriptionConfigs.getExternalConfigNames(subscriptionConfigs);
    updateSubscriptionState(toSubscribe);
  };

  const shutdown = async () => {
    const closing = [];
    state.clients.forEach((clientWrapper) => {
      closing.push(closeClient(clientWrapper));
    });
    resetTo(stateDefault, state);
    await Promise.all(closing);
  };

  const publish = async (configName, topic, message, options) => {
    if (!state.onFire) { throw new Error('MQTT Client manager must be initialized first.'); }

    const clientWrapper = state.clients.get(configName);
    if (!clientWrapper) {
      throw errors.Validation({ message: `Invalid MQTT Client config name: ${configName}` });
    }

    const client = clientWrapper.client;
    if (client.disconnecting || client.disconnected || client.reconnecting) {
      throw errors.Validation({ message: `MQTT Client "${configName}" is not currently connected.` });
    }

    logger.verbose(`Sending MQTT message (${configName}) from workflow`, { topic, message });

    // intentionally not awaiting publish
    client.publish(topic, message, options);
  };

  return {
    // :: (MqttClientTriggerConfigs, (FiredTrigger -> *)) -> Promise<Nil>
    initialize,

    // :: MqttClientTriggerConfigs -> Promise<Nil>
    update,

    // :: (configName, topic, message, options) -> Promise<Nil>
    publish,

    // SE: State is reset to default, manager will need to be reinitialized
    // :: -> Nil
    shutdown
  };

};

export default MqttClientManager;
