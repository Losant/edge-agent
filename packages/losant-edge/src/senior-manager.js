import { compose, isNil, curry } from 'omnibelt';
import { AGENT_VERSION } from './constants.js';
import {
  GatewayConf,
  HealthCheckConf,
  LocalBrokerConfig,
  LevelManagerConf,
  LoggerConf,
  OtelReportingConf,
  OtlpCollectorConf,
  TriggerConf,
  UdpConf,
  WebserverConf,
  WorkflowConf
} from './types/index.js';
import normalizeArgs from './lib/normalize-args.js';
import Gateway from './gateway/index.js';
import LocalBroker from './local-broker/index.js';
import LevelManager from './level/manager.js';
import WorkflowManager from './workflow-manager.js';
import TimerManager from './timer-manager.js';
import UdpManager from './udp-manager.js';
import NodeRunner from './node-runner.js';
import Webserver from './webserver.js';
import BeckhoffManager from './beckhoff-manager.js';
import FileTailManager from './file-tail-manager.js';
import FileWatchManager from './file-watch-manager.js';
import FlowErrorManager from './flow-error-manager.js';
import RedisManager from './redis-manager.js';
import SerialManager from './serial-manager.js';
import OpcUaManager from './opcua-manager.js';
import OnEventManager from './on-event-manager.js';
import MqttClientManager from './mqtt-client-manager.js';
import logger from './logger/index.js';
import rollbar from './rollbar.js';
import debugBatcher from './lib/debug-batcher.js';
import logBuffer from './logger/log-buffer.js';
import HealthCheckManager from './health-check-manager.js';
import OtlpCollectorManager from './otlp-collector-manager.js';

const state = {
  gateway: null,
  localBroker: null,
  workflowManager: null,
  timerManager: null,
  udpManager: null,
  fileTailManager: null,
  fileWatchManager: null,
  flowErrorManager: null,
  redisManager: null,
  webserver: null,
  serialManager: null,
  opcuaManager: null,
  onEventManager: null,
  levelManager: null,
  mqttClientManager: null,
  nodeRunner: null,
  healthCheckManager: null,
  beckhoffManager: null,
  otlpCollectorManager: null,
  loadInProgress: false
};

const managers = {
  get gateway() { return state.gateway; },
  get nodeRunner() { return state.nodeRunner; },
  get localBroker() { return state.localBroker; },
  get workflowManager() { return state.workflowManager; },
  get timerManager() { return state.timerManager; },
  get udpManager() { return state.udpManager; },
  get fileTailManager() { return state.fileTailManager; },
  get fileWatchManager() { return state.fileWatchManager; },
  get flowErrorManager() { return state.flowErrorManager; },
  get redisManager() { return state.redisManager; },
  get webserver() { return state.webserver; },
  get serialManager() { return state.serialManager; },
  get opcuaManager() { return state.opcuaManager; },
  get onEventManager() { return state.onEventManager; },
  get levelManager() { return state.levelManager; },
  get mqttClientManager() { return state.mqttClientManager; },
  get healthCheckManager() { return state.healthCheckManager; },
  get beckhoffManager() { return state.beckhoffManager; },
  get otlpCollectorManager() { return state.otlpCollectorManager; }
};

// :: MqttMessage -> Promise<Nil>
const onFlowsMessage = curry(async (message) => {
  try {
    const { flowsResponse, deviceChanged, appChanged } = await managers.workflowManager.applyFlowMessage(message);
    await Promise.all([
      managers.mqttClientManager.update(managers.workflowManager.subscriptionInfo),
      managers.timerManager.update(managers.workflowManager.timerInfo),
      managers.udpManager.update(managers.workflowManager.udpInfo),
      managers.fileTailManager.update(managers.workflowManager.fileTailInfo),
      managers.fileWatchManager.update(managers.workflowManager.fileWatchInfo),
      managers.flowErrorManager.update(managers.workflowManager.flowErrorInfo),
      managers.redisManager.update(managers.workflowManager.redisInfo),
      managers.webserver.update(managers.workflowManager.requestInfo),
      managers.serialManager.update(managers.workflowManager.serialInfo),
      managers.opcuaManager.update(managers.workflowManager.opcuaInfo),
      managers.beckhoffManager.update(managers.workflowManager.beckhoffInfo),
      managers.onEventManager.update(managers.workflowManager.onEventInfo)
    ]);
    await managers.gateway.updateTriggerSubscriptions(managers.workflowManager.subscriptionInfo);
    await managers.localBroker.updateTriggerSubscriptions(managers.workflowManager.subscriptionInfo);

    await managers.gateway.publish('flows', flowsResponse, { qos: 0 });

    if (deviceChanged) {
      await state.onEventManager.fireOnSync({ syncType: 'device' });
    }
    if (appChanged) {
      await state.onEventManager.fireOnSync({ syncType: 'application' });
    }

    logger.info('Workflows received from Losant and applied.');
  } catch (e) {
    logger.exception('Error processing workflows received from Losant:', e);
  }
});

// :: MqttMessage -> Promise<Nil>
const onPeripheralsMessage = async (message) => {
  try {
    const peripheralsChanged =
      await managers.workflowManager.applyPeripheralsMessage(message, managers.gateway.conf.id);
    if (peripheralsChanged) {
      await state.onEventManager.fireOnSync({ syncType: 'peripheral' });
    }
    logger.info('Peripheral device updates received from Losant and applied.');
  } catch (e) {
    logger.exception('Error processing peripheral device updates from Losant:', e);
  }
};

// :: MqttMessage -> Promise<Nil>
const onDebugMessage = async (message) => {
  try {
    await managers.workflowManager.applyDebugMessage(message);
    logger.info('Debugging status changes received from Losant and applied.');
  } catch (e) {
    logger.exception('Error processing debugging status change from Losant:', e);
  }
};

const onLogsRequest = async (message) => {
  try {
    await logBuffer.onLogsRequest(managers.gateway, message);
    logger.verbose('Logging stream request received from Losant.');
  } catch (e) {
    logger.exception('Error processing logging stream request from Losant:', e);
  }
};

// :: FiredTrigger -> Promise<Nil>
const triggerRouter = async (firedTrigger) => {
  try {
    const triggeredFlows = managers.workflowManager.findTriggeredFlows(firedTrigger);
    if (isNil(triggeredFlows)) {
      logger.verbose('No workflows found for trigger:', firedTrigger);
      return;
    }
    logger.verbose('Running workflows for trigger:', firedTrigger);

    const result = await managers.nodeRunner.runFlows(firedTrigger, triggeredFlows);
    logger.verbose('Completed running workflow(s):', result);
  } catch (e) {
    logger.exception('Error processing fired trigger:', e);
  }
};

// :: Args -> CallbackObject
const buildNodeRunnerCallbacks = (args) => ({
  sendMqttMessage: ({ brokerType, configName, topic, message }) => {
    switch (brokerType) {
      case 'losant':
        return managers.gateway._publish(topic, message, { qos: 1 });
      case 'local':
        return managers.localBroker.publish(topic, message, { qos: 1 });
      case 'external':
        return managers.mqttClientManager.publish(configName, topic, message, { qos: 1 });
      default:
        throw new Error(`Invalid publish broker type: ${brokerType}`);
    }
  },
  sendDebugMessage: debugBatcher((messages) => {
    return managers.gateway.publish('debug', messages, { qos: 0 });
  }),
  sendStatsMessage: (messages) => {
    return managers.gateway.publish('flowStats', messages, { qos: 1 });
  },
  isConnectedToLosant: managers.gateway.isConnected,
  flowHttpResponse: managers.webserver.flowResponse,
  getCurrentAgentConfig: () => { return args; },
  getOtlpCollectorConfig: () => managers.otlpCollectorManager.get()
});

const shutdown = async () => {
  await managers.timerManager.shutdown();
  await managers.webserver.shutdown();
  await managers.udpManager.shutdown();
  await managers.fileTailManager.shutdown();
  await managers.fileWatchManager.shutdown();
  await managers.flowErrorManager.shutdown();
  await managers.redisManager.shutdown();
  await managers.serialManager.shutdown();
  await managers.opcuaManager.shutdown();
  await managers.beckhoffManager.shutdown();
  await managers.otlpCollectorManager?.shutdown();
  await managers.onEventManager.shutdown();
  await managers.mqttClientManager.shutdown();
  await managers.localBroker.shutdown();
  await managers.workflowManager.shutdown();
  // these three always last, in this order
  await managers.nodeRunner.shutdown();
  await managers.gateway.disconnect();
  await managers.levelManager.shutdown();
  // and finally
  await managers.healthCheckManager.shutdown();
};

const load = async (command, isReload = false) => {
  const args = await normalizeArgs(command);

  if (state.loadInProgress) {
    logger.warn('Failed to reload agent, load already in progress');
    return managers;
  }
  state.loadInProgress = true;

  try {
    if (isReload) { await shutdown(); }

    const triggerConfigs = {};
    (TriggerConf.fromArgs(args) || []).forEach((config) => {
      if (!triggerConfigs[config.type]) { triggerConfigs[config.type] = {}; }
      triggerConfigs[config.type][config.name] = config;
    });

    logger.reconfigure(LoggerConf.fromArgs(args));
    logger.info(isReload ? 'Reloading agent configuration...' : 'Agent Starting...');
    logger.info(`Agent Version: ${AGENT_VERSION.version}`);
    rollbar.configure({ payload: { deviceId: args.gateway.id } });

    state.healthCheckManager = HealthCheckManager(HealthCheckConf.fromArgs(args), managers);
    await managers.healthCheckManager.initialize();

    state.levelManager = compose(LevelManager, LevelManagerConf.fromArgs)(args);
    await managers.levelManager.initialize();

    const workflowConf = WorkflowConf.fromArgs(args);
    state.workflowManager = WorkflowManager(workflowConf, managers.levelManager.globalStore);
    await managers.workflowManager.initialize();

    const gatewayConf = GatewayConf.fromArgs(args);
    state.gateway = Gateway(gatewayConf, {
      incomingStore: managers.levelManager.mqttIncomingStore,
      outgoingStore: managers.levelManager.mqttOutgoingStore
    });

    state.localBroker = LocalBroker(LocalBrokerConfig.fromArgs(args));
    state.webserver = Webserver(WebserverConf.fromArgs(args));
    state.timerManager = TimerManager(managers.levelManager.globalStore);
    state.udpManager = UdpManager(UdpConf.fromArgs(args));
    state.fileTailManager = FileTailManager();
    state.fileWatchManager = FileWatchManager();
    state.flowErrorManager = FlowErrorManager();
    state.redisManager = RedisManager();
    state.otlpCollectorManager = OtlpCollectorManager(OtlpCollectorConf.fromArgs(args), OtelReportingConf.fromArgs(args));
    state.nodeRunner = NodeRunner(
      managers.levelManager.keyValueStore, managers.flowErrorManager, gatewayConf, managers.workflowManager,
      buildNodeRunnerCallbacks(args)
    );

    state.serialManager = SerialManager();
    state.opcuaManager = OpcUaManager(triggerConfigs.opcua);
    state.mqttClientManager = MqttClientManager(triggerConfigs.mqttClient, gatewayConf.id);
    state.onEventManager = OnEventManager();
    state.beckhoffManager = BeckhoffManager(triggerConfigs.beckhoff);

    managers.gateway.subscribeFlows(onFlowsMessage);
    managers.gateway.subscribeDebug(onDebugMessage);
    managers.gateway.subscribeLogRequest(onLogsRequest);
    managers.gateway.subscribePeripherals(onPeripheralsMessage);
    managers.gateway.subscribeButtons();

    await managers.nodeRunner.initialize();
    await managers.mqttClientManager.initialize(managers.workflowManager.subscriptionInfo, triggerRouter);
    await managers.timerManager.initialize(managers.workflowManager.timerInfo, triggerRouter);
    await managers.webserver.initialize(managers.workflowManager.requestInfo, triggerRouter);
    await managers.localBroker.initialize(managers.workflowManager.subscriptionInfo, triggerRouter);
    await managers.udpManager.initialize(managers.workflowManager.udpInfo, triggerRouter);
    await managers.fileTailManager.initialize(managers.workflowManager.fileTailInfo, triggerRouter);
    await managers.fileWatchManager.initialize(managers.workflowManager.fileWatchInfo, triggerRouter);
    await managers.flowErrorManager.initialize(managers.workflowManager.flowErrorInfo, triggerRouter);
    await managers.redisManager.initialize(managers.workflowManager.redisInfo, triggerRouter);
    await managers.serialManager.initialize(managers.workflowManager.serialInfo, triggerRouter);
    await managers.opcuaManager.initialize(managers.workflowManager.opcuaInfo, triggerRouter);
    await managers.beckhoffManager.initialize(managers.workflowManager.beckhoffInfo, triggerRouter);
    await managers.otlpCollectorManager.initialize();

    // this must happen after all other managers and before the gateway initializes
    // because onBoot needs to fire before the onConnect triggers fire which happens in the gateway.
    await managers.onEventManager.initialize(managers.workflowManager.onEventInfo, triggerRouter);

    logger.info('Workflows initialized and running...');
    // intentionally not awaiting
    // and intentionally connect *after* all other edge services have been started
    // that way we can always correctly process any incoming flows message
    managers.gateway.initialize(triggerRouter, managers.onEventManager.fireOnConnect, managers.onEventManager.fireOnDisconnect);
    await managers.gateway.updateTriggerSubscriptions(managers.workflowManager.subscriptionInfo);
  } finally {
    state.loadInProgress = false;
  }
};

export default {
  load,
  shutdown,
  managers
};
