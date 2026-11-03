import {
  concat, difference, keys, map, prop, has, compose,
  equals, omit, test, anyPass, reject, isEmpty, startsWith
} from 'omnibelt';
import mqtt from 'mqtt';
import LJSON from 'losant-nodejs-utils/src/ljson.js';
import {
  GatewayConf,
  FiredTrigger,
  SubscriptionConfigs
} from '../types/index.js';
import logger from '../logger/index.js';
import {
  AGENT_VERSION,
  MAX_MESSAGE_SIZE,
  GATEWAY_ID_DEFAULT,
  BROADCAST_UPDATE_TOPIC_BASE,
  PLATFORM_TOPIC_BASE,
  MQTT_HUMAN_ERROR_MSG_MAP
} from '../constants.js';
import buildMqttOptions from './build-mqtt-options.js';
import errors from 'losant-nodejs-utils/src/errors.js';
import mqttMatch from 'losant-nodejs-utils/src/utils/mqtt-match.js';

const invalidSubscriptionTriggerTopic = anyPass([
  isEmpty,
  test(/[\0]/),
  startsWith('$')
]);

const subConfigsToTopics = compose(
  reject(invalidSubscriptionTriggerTopic),
  map(prop('mqttTopic'))
);

const ljsonInflateWrap = (onMsg) => {
  return async (topic, payload) => {
    payload = await LJSON.inflate(payload, { safe: true });
    logger.verbose('Received Agent System Message', { topic, payload });
    onMsg(payload);
  };
};

const toCommandTriggerFire = (subConfig, msg) => {
  try { msg = LJSON.parse(msg); } catch { return; }
  return FiredTrigger({
    triggerId: 'deviceCommand',
    triggerType: 'deviceCommand',
    payload: {
      time: new Date(),
      data: msg
    }
  });
};

const toMqttTriggerFire = (subConfig, msg, publishedTopic) => {
  return FiredTrigger({
    integrationId: 'losant',
    triggerId: subConfig.mqttTopic,
    triggerType: subConfig.triggerType,
    payload: {
      triggerId: publishedTopic,
      time: new Date(),
      data: Buffer.isBuffer(msg) ? msg.toString('binary') : msg
    }
  });
};

const Gateway = (conf, stores) => {
  conf = GatewayConf(conf);
  let client = null;
  let lastConnectTime = null;
  let lastDisconnectTime = null;
  let onSubscriptionTriggerFire;
  let subDict = {};
  let wildcardSubTopics = [];
  const preClientQueue = [];

  stores.outgoingStore.setReplayOrder(conf.offlineMessageReplayOrder);

  const appUpdateTopic = `${BROADCAST_UPDATE_TOPIC_BASE}/applicationUpdate`;
  const floatUpdateTopic = `${BROADCAST_UPDATE_TOPIC_BASE}/floatingUpdate`;
  const toAgentTopicBase = `${PLATFORM_TOPIC_BASE}/${conf.id}/toAgent/`;
  const fromAgentTopicBase = `${PLATFORM_TOPIC_BASE}/${conf.id}/fromAgent/`;

  const toAgentTopic = concat(toAgentTopicBase);
  const fromAgentTopic = concat(fromAgentTopicBase);

  const isAgentTopic = anyPass([
    equals(appUpdateTopic),
    equals(floatUpdateTopic),
    test(new RegExp(`^${toAgentTopicBase}`)),
    test(new RegExp(`^${fromAgentTopicBase}`))
  ]);

  const isConnected = () => {
    return !!(client && client.connected && !client.disconnecting && !client.disconnected);
  };

  const publish = async (topic, payload, options = { qos: 1 }) => {
    const fullTopic = fromAgentTopic(topic);
    if (topic !== 'logs') {
      logger.verbose('Sending Agent System Message', { topic: fullTopic, payload });
    }
    if (isConnected()) {
      // if this publish is missed we don't care since it's just a system message
      client.publish(fullTopic, await LJSON.deflate(payload, { detectCycles: true }), options);
    }
  };

  const initialize = async (onFire, fireOnConnect, fireOnDisconnect) => {
    if (conf.id === GATEWAY_ID_DEFAULT) {
      logger.warn(`No gateway configuration provided, booting without connecting to ${conf.url}`);
      return;
    }
    logger.info(`Connecting to: ${conf.url} ...`);
    if (onFire) {
      onSubscriptionTriggerFire = onFire;
    }

    client = mqtt.connect(
      conf.url,
      buildMqttOptions(conf, stores)
    );

    client.on('message', async (topic, payload) => {
      const toTrigger = wildcardSubTopics.length ? mqttMatch(wildcardSubTopics, topic) : [];
      if (has(topic, subDict)) { toTrigger.push(topic); }
      toTrigger.forEach((matchedTopic) => { subDict[matchedTopic](topic, payload); });

      if (!toTrigger.length) { logger.warn('Received message on unexpected topic:', { topic, payload }); }
    });

    client.on('error', (error) => {
      const humanMsg = MQTT_HUMAN_ERROR_MSG_MAP[error && error.code];
      if (humanMsg) {
        logger.warn(`Unable to connect to ${conf.url}, ${humanMsg}.`);
      } else {
        logger.warn('MQTT client error:', error);
      }
    });

    client.on('close', (streamErr) => {
      // this was a requested shutdown
      let reason;
      if (client.disconnecting) {
        reason = 'Close requested.';
      } else if (streamErr) {
        if (streamErr.message === 'premature close') {
          logger.warn(`Unable to connect to ${conf.url}, connection timeout.`);
        } else if (streamErr.code === 'ETIMEDOUT') {
          reason = 'Keepalive timeout';
          logger.warn(`Connection to ${conf.url} closed due to keepalive timeout.`);
        } else {
          reason = streamErr && streamErr.message || streamErr;
          // bunch of these duplicate the ones that go to error
          logger.verbose('Connection Stream Error:', streamErr);
        }
      } else {
        reason = 'Unexpected close';
      }
      if (reason && lastConnectTime && lastConnectTime > lastDisconnectTime) {
        lastDisconnectTime = new Date();
        fireOnDisconnect({ lastConnectTime, reason });
      }
    });

    client.on('reconnect', () => {
      logger.info(`Attempting to reconnect to ${conf.url}...`);
    });

    client.on('offline', () => {
      if (lastConnectTime && lastConnectTime > lastDisconnectTime) {
        lastDisconnectTime = new Date();
        fireOnDisconnect({ lastConnectTime, reason: 'MQTT offline' });
      }
      // fire here for on disconnect...
      logger.warn('MQTT client disconnected.');
    });
    if (preClientQueue.length) {
      // start publishing stuff that was trying to get published before the client initialized.
      preClientQueue.forEach(({ topic, payload, options }) => { client.publish(topic, payload, options); });
    }

    const onConnect = async (cb) => {
      lastConnectTime = new Date();
      logger.info(`Connected to: ${conf.url}`);

      const subscribeTopics = reject(isAgentTopic, keys(subDict));
      subscribeTopics.push(appUpdateTopic);

      if (conf.subscribeToPeripheralUpdates === true || conf.subscribeToPeripheralUpdates === 'floating') {
        subscribeTopics.push(floatUpdateTopic);
      }

      if (conf.subscribeToPeripheralUpdates === true || conf.subscribeToPeripheralUpdates === 'peripheral') {
        subscribeTopics.push(toAgentTopic('#')); // debug, flows, virtualButton, peripherals, logs
      } else {
        subscribeTopics.push(
          toAgentTopic('debug'),
          toAgentTopic('flows'),
          toAgentTopic('virtualButton'),
          toAgentTopic('logs')
        );
      }

      const subscribed = Promise.withResolvers();
      client.subscribe(subscribeTopics, { qos: 1 }, (err) => {
        if (err) {
          logger.warn('Error subscribing to topics on connect:', err);
        }
        subscribed.resolve();
      });
      await subscribed.promise;

      publish('hello', {
        service: 'edgeWorkflowAgent',
        version: AGENT_VERSION.version
      });
      await fireOnConnect({ lastDisconnectTime });
      return cb(/* this :( */);
    };
    return new Promise((resolve) => {
      client._onConnectOriginal = client._onConnect;
      client._onConnect = function(...args) {
        this._onConnectOriginal(...args);
        onConnect(resolve);
      };
    });
  };

  const disconnect = async (force = false) => {
    if (!client || client.disconnecting || client.disconnected) { return; }
    // force if we aren't connected, because there is no point in waiting
    // to send queued packets, it will never succeed
    if (!client.connected) { force = true; }
    return new Promise((resolve) => {
      client.end(force, resolve);
    });
  };

  const subscribeFlows = (onFlows) => {
    subDict[toAgentTopic('flows')] = ljsonInflateWrap(onFlows);
    subDict[appUpdateTopic] = ljsonInflateWrap(onFlows);
  };

  const subscribePeripherals = (onPeripherals) => {
    subDict[toAgentTopic('peripherals')] = ljsonInflateWrap(onPeripherals);
    subDict[floatUpdateTopic] = ljsonInflateWrap(onPeripherals);
  };

  const subscribeDebug = (onDebug) => {
    subDict[toAgentTopic('debug')] = ljsonInflateWrap(onDebug);
  };

  const subscribeLogRequest = (onLogRequest) => {
    subDict[toAgentTopic('logs')] = ljsonInflateWrap(onLogRequest);
  };

  const subscribeButtons = () => {
    subDict[toAgentTopic('virtualButton')] = (topic, mqttPayload) => {
      try { mqttPayload = LJSON.parse(mqttPayload); } catch { return; }
      if (!mqttPayload || !mqttPayload.triggerId) {
        logger.warn('Invalid payload for virtual button:', { topic, mqttPayload });
        return;
      }
      const workflowPayload = {
        time: new Date(),
        data: mqttPayload.data,
        flowVersion: mqttPayload.flowVersion
      };
      if (mqttPayload.meta) { workflowPayload.meta = mqttPayload.meta; }
      const fireData = FiredTrigger({
        triggerId: mqttPayload.triggerId,
        triggerType: 'virtualButton',
        payload: workflowPayload
      });
      logger.verbose('Received Workflow Triggering Message', { topic, payload: fireData.payload });
      onSubscriptionTriggerFire(fireData);
    };
  };

  const updateTriggerSubscriptions = (subscriptionConfigs) => {
    const incomingSubscriptions = SubscriptionConfigs.getLosantBrokerSubs(subscriptionConfigs);
    const existingSubscriptions = reject(isAgentTopic, keys(subDict));
    const expectedSubscriptions = subConfigsToTopics(incomingSubscriptions);

    const toSubscribe = difference(expectedSubscriptions, existingSubscriptions);
    const toUnsubscribe = difference(existingSubscriptions, expectedSubscriptions);

    incomingSubscriptions.forEach((subConfig) => {
      if (subDict[subConfig.mqttTopic]) { return; } // already hooked up

      // technically, the server should never have allowed anything invalid here
      // but we double check anyway
      if (invalidSubscriptionTriggerTopic(subConfig.mqttTopic)) {
        logger.warn(`Invalid topic for subscription trigger: ${subConfig.mqttTopic}`);
        return;
      }

      const toTriggerFire = subConfig.triggerType === 'deviceCommand'
        ? toCommandTriggerFire : toMqttTriggerFire;

      subDict[subConfig.mqttTopic] = (topic, payload) => {
        const triggerFire = toTriggerFire(subConfig, payload, topic);
        if (triggerFire) {
          logger.verbose('Received Workflow Triggering Message', { topic, payload: triggerFire.payload.data });
          onSubscriptionTriggerFire(triggerFire);
        } else {
          logger.warn('Invalid payload for subscription trigger:', { topic, payload });
        }
      };
    });

    // we don't wait for either the subscribe or unsubscribe call
    // because if we aren't connected right now, we could
    // be waiting for a long time
    if (toSubscribe.length > 0) {
      client?.subscribe(toSubscribe, { qos: 1 });
    }
    if (toUnsubscribe.length > 0) {
      client?.unsubscribe(toUnsubscribe);
      // technically, we are removing the handlers before
      // we know we are unsubscribed, but if we wait till
      // the unsubscribe is processed, and more flow changes
      // come in while that is happening, we can easily get
      // into a race condition and have a set of invalid handlers
      subDict = omit(toUnsubscribe, subDict);
    }
    wildcardSubTopics = Object.keys(subDict).filter(test(/[#+]/));
  };

  const _publish = (topic, payload, options) => {
    if (Buffer.byteLength(payload, 'utf8') > MAX_MESSAGE_SIZE) {
      throw errors.Validation({ message: `Payload size cannot exceed ${MAX_MESSAGE_SIZE}` });
    }
    let logMsg = 'Sending MQTT message from workflow';
    if (!conf.queueOfflineMessages && !isConnected()) {
      logMsg = 'Offline and queueing disabled, discarding MQTT message from workflow';
    } else {
      if (!isConnected()) {
        logMsg = 'Offline, queueing MQTT message from workflow for later send';
      }
      // there is a small window of time where the workflow initialize and start running
      // and the client has not been created
      // when this happens start pushing items onto a queue and once the client is ready publish them.
      // we *cannot* miss these messages it could be a loss of state data.
      if (!client) {
        preClientQueue.push({ topic, payload, options });
      } else {
        client.publish(topic, payload, options);
      }
    }
    logger.verbose(logMsg, { topic, payload });
  };

  return {
    conf,
    appUpdateTopic,
    floatUpdateTopic,
    toAgentTopicBase,
    fromAgentTopicBase,
    toAgentTopic,
    fromAgentTopic,
    initialize,
    disconnect,
    subscribeFlows,
    subscribePeripherals,
    subscribeDebug,
    subscribeLogRequest,
    subscribeButtons,
    updateTriggerSubscriptions,
    publish,
    isConnected,
    get lastConnectTime() { return lastConnectTime; },
    get lastDisconnectTime() { return lastDisconnectTime; },
    _publish
  };
};

export default Gateway;
