import {
  isNil, keys, union, has, fromPairs, mapRejectNil, forEachSerialP, equals, mergeRight,
  map, filter, identity, pipe, reduce, objOf, compose, prop, pickBy, clone, pick, find
} from 'omnibelt';
import semver from 'losant-nodejs-utils/src/utils/semver.js';
import { nodeFromConfig } from './node-manager.js';
import { AGENT_VERSION, PLATFORM_TOPIC_BASE, GATEWAY_ID_DEFAULT } from './constants.js';
import {
  FlowsMessage,
  Flow,
  TimerConfig,
  TimerConfigs,
  FiredTrigger,
  SubscriptionConfig,
  FlowsResponse,
  DebugMessage,
  FindTriggeredFlowsResponse,
  SubscriptionConfigs,
  WorkflowConf,
  UdpConfig,
  UdpConfigs,
  FileTailConfig,
  FileTailConfigs,
  FileWatchConfig,
  FileWatchConfigs,
  FlowErrorConfig,
  FlowErrorConfigs,
  RawFlow,
  RedisConfig,
  RedisConfigs,
  SerialConfig,
  SerialConfigs,
  OpcuaConfig,
  OpcuaConfigs,
  OpcuaNamedConfig,
  OnEventConfig,
  OnEventConfigs,
  PeripheralDict,
  PeripheralsMessage,
  RequestTriggerConfig,
  RequestTriggerConfigs,
  BeckhoffConfig,
  BeckhoffConfigs,
  BeckhoffNamedConfig
}  from './types/index.js';
import fs from 'fs-extra';
import path from 'node:path';
import logger from './logger/index.js';
import { resetTo } from './utils.js';
import { isValidObjectId } from 'losant-nodejs-utils/src/bson.js';

const flowPick = pick(Object.keys(RawFlow.meta.props));
const validDiskFormatVersion = '1.0';

const stateDefault = () => ({
  rawInfo: FlowsMessage({ mode: 'complete' }),
  restoredFlows: new Map(), // Map<flowId, Flow>
  peripherals: PeripheralDict({}),
  byTrigger: new Map(), // Map<triggerType, Map<triggerId, Set<flowId>>>
  timerInfo: TimerConfigs([]),
  subscriptionInfo: SubscriptionConfigs([]),
  udpInfo: UdpConfigs([]),
  fileTailInfo: FileTailConfigs([]),
  fileWatchInfo: FileWatchConfigs([]),
  flowErrorInfo: FlowErrorConfigs([]),
  redisInfo: RedisConfigs([]),
  requestInfo: RequestTriggerConfigs([]),
  serialInfo: SerialConfigs([]),
  opcuaInfo: OpcuaConfigs([]),
  beckhoffInfo: BeckhoffConfigs([]),
  onEventInfo: OnEventConfigs([])
});

const reconstituteFlow = (rawInfo, flowId) => {
  const flow = rawInfo.flows[flowId];
  const nodePairs = map((nodeInfo) => {
    return [nodeInfo.id, nodeFromConfig(nodeInfo)];
  }, flow.nodes);

  const restoredFlow = {
    ...flow,
    id: flowId,
    nodes: fromPairs(nodePairs),
    globals: {
      ...rawInfo.application.globals,
      ...flow.globals
    },
    debuggingEnabled: Boolean(rawInfo.debugging[flowId]),
    customNodeDebug: Boolean(rawInfo.debugging[`${flowId}-cn`])
  };

  if (flow.flowClass === 'customNode' || flow.flowClass === 'instanceCustomNode') {
    const startTrigger = find((trigger) =>
      trigger.key === 'customNodeStart' && trigger.type === 'customNodeStart'
    )(flow.triggers);
    restoredFlow.startTrigger = startTrigger;
  }

  return Flow(restoredFlow);
};

const WorkflowManager = (conf, globalStore) => {
  const state = stateDefault();
  conf = WorkflowConf(conf);

  const reconstituteFlows = (rawInfo) => {
    return compose(
      reduce((out, flowId) => {
        const reconstituted = reconstituteFlow(rawInfo, flowId);
        out.restoredFlows.set(flowId, reconstituted);

        reconstituted.triggers.forEach(({ type, key, config }) => {
          if (type === 'customNodeStart') { return; }
          // ensure Map exists for type
          if (!out.byTrigger.has(type)) { out.byTrigger.set(type, new Map()); }

          // ensure Set exists for key
          const byType = out.byTrigger.get(type);
          if (!byType.has(key)) { byType.set(key, new Set()); }

          // add flowId to Map<triggerType, Map<triggerId, Set<flowId>>>
          byType.get(key).add(flowId);

          if (type === 'timer' && config) {
            out.timerInfo.push(TimerConfig({
              timerId: key,
              cron: config.cron,
              seconds: config.seconds,
              tz: config.tz
            }));
          } else if (type === 'snmpTrap') {
            out.udpInfo.push(UdpConfig({
              udpPort: config.udpPort,
              key,
              snmpTrapConfig: config.snmpTrapConfig
            }));
          } else if (type === 'udp') {
            out.udpInfo.push(UdpConfig({
              udpPort: key
            }));
          } else if (type === 'fileTail' && config) {
            out.fileTailInfo.push(FileTailConfig({
              tailId: key,
              path: config.path,
              encoding: config.encoding,
              delimiter: config.delimiter,
              byteLength: config.byteLength
            }));
          } else if (type === 'fileWatch' && config) {
            out.fileWatchInfo.push(FileWatchConfig({
              watchId: key,
              path: config.path,
              fileAdded: config.fileAdded,
              fileChanged: config.fileChanged,
              fileRemoved: config.fileRemoved,
              directoryAdded: config.directoryAdded,
              directoryRemoved: config.directoryRemoved
            }));
          } else if (type === 'flowError' && config) {
            out.flowErrorInfo.push(FlowErrorConfig({
              triggerId: key
            }));
          } else if (type === 'deviceCommand' && rawInfo.device) {
            out.subscriptionInfo.push(SubscriptionConfig({
              mqttTopic: `${PLATFORM_TOPIC_BASE}/${rawInfo.device.id}/command`,
              triggerType: 'deviceCommand'
            }));
          } else if (type === 'mqttTopic') { // local broker / losant / mqtt client
            out.subscriptionInfo.push(SubscriptionConfig({
              mqttTopic: key,
              integrationId: config.integrationId,
              triggerType: 'mqttTopic'
            }));
          } else if (type === 'redis' && config) {
            out.redisInfo.push(RedisConfig({
              triggerId: key,
              host: config.host,
              port: config.port,
              password: config.password,
              topic: config.topic
            }));
          } else if (type === 'request') {
            out.requestInfo.push(RequestTriggerConfig({
              triggerId: key,
              method: config?.method,
              route: config?.route
            }));
          } else if (type === 'serial' && config) {
            out.serialInfo.push(SerialConfig({
              serialId: key,
              path: config.path,
              delimiter: config.delimiter,
              delimiterEncoding: config.delimiterEncoding,
              encoding: config.encoding,
              baudRate: config.baudRate,
              dataBits: config.dataBits,
              parity: config.parity,
              rtscts: config.rtscts,
              stopBits: config.stopBits,
              byteLength: config.byteLength,
              writeOnOpen: config.writeOnOpen,
              writeOnOpenEncoding: config.writeOnOpenEncoding
            }));
          } else if (type === 'beckhoff' && config) {
            if (config.configName) {
              out.beckhoffInfo.push(BeckhoffNamedConfig({
                triggerId: key,
                configName: config.configName
              }));
            } else {
              out.beckhoffInfo.push(BeckhoffConfig({
                triggerId: key,
                localAmsNetId: config.localAmsNetId,
                localAdsPort: config.localAdsPort,
                targetAmsNetId: config.targetAmsNetId,
                targetAdsPort: config.targetAdsPort,
                routerHost: config.routerHost,
                routerTcpPort: config.routerTcpPort,
                cycleTimeMs: config.cycleTimeMs,
                subscriptionItems: config.subscriptions
              }));
            }
          } else if (type === 'opcua' && config) {
            if (config.configName) {
              out.opcuaInfo.push(OpcuaNamedConfig({
                opcuaId: key,
                configName: config.configName
              }));
            } else {
              out.opcuaInfo.push(OpcuaConfig({
                opcuaId: key,
                uri: config.uri,
                username: config.username,
                password: config.password,
                securityPolicy: config.securityPolicy,
                securityMode: config.securityMode,
                cert: config.cert,
                privateKey: config.privateKey,
                nameSpace: config.nameSpace,
                identifier: config.identifier,
                samplingInterval: config.samplingInterval,
                eventFilter: config.eventFilter
              }));
            }
          } else if (type === 'onConnect' || type === 'onDisconnect' || type === 'onBoot' || type === 'onSync') {
            out.onEventInfo.push(OnEventConfig({
              eventId: key,
              event: type,
              syncTypes: config.syncTypes
            }));
          }
        });

        return out;
      }, {
        restoredFlows: new Map(),
        peripherals: {},
        byTrigger: new Map(),
        timerInfo: [],
        subscriptionInfo: [],
        udpInfo: [],
        fileTailInfo: [],
        fileWatchInfo: [],
        flowErrorInfo: [],
        redisInfo: [],
        requestInfo: [],
        serialInfo: [],
        opcuaInfo: [],
        beckhoffInfo: [],
        onEventInfo: []
      }),
      keys,
      prop('flows')
    )(rawInfo);
  };

  const writeWorkflowsToStore = async () => {
    const rawInfo = clone(state.rawInfo);
    Object.entries(rawInfo.flows).forEach(([flowId, flow]) => {
      if (flow.fileName) { delete rawInfo.flows[flowId]; }
    });

    return globalStore.set('workflowStore', rawInfo);
  };

  const updateInProcessStore = async (rawInfo) => {
    rawInfo = FlowsMessage(rawInfo);
    const {
      timerInfo,
      byTrigger,
      restoredFlows,
      subscriptionInfo,
      udpInfo,
      fileTailInfo,
      fileWatchInfo,
      flowErrorInfo,
      redisInfo,
      requestInfo,
      serialInfo,
      opcuaInfo,
      beckhoffInfo,
      onEventInfo
    } = reconstituteFlows(rawInfo);

    state.rawInfo = rawInfo;
    state.restoredFlows = restoredFlows;
    state.byTrigger = byTrigger;
    state.timerInfo = TimerConfigs(timerInfo);
    state.udpInfo = UdpConfigs(udpInfo);
    state.fileTailInfo = FileTailConfigs(fileTailInfo);
    state.fileWatchInfo = FileWatchConfigs(fileWatchInfo);
    state.flowErrorInfo = FlowErrorConfigs(flowErrorInfo);
    state.redisInfo = RedisConfigs(redisInfo);
    state.requestInfo = RequestTriggerConfigs(requestInfo);
    state.serialInfo = SerialConfigs(serialInfo);
    state.subscriptionInfo = SubscriptionConfigs(subscriptionInfo);
    state.opcuaInfo = OpcuaConfigs(opcuaInfo);
    state.beckhoffInfo = BeckhoffConfigs(beckhoffInfo);
    state.onEventInfo = OnEventConfigs(onEventInfo);

    await writeWorkflowsToStore();
  };

  const applyFlowMessage = async (flowMessage) => {
    flowMessage = FlowsMessage(flowMessage);

    const newFlows = {};

    const allFlowIds = union(
      keys(flowMessage.flows),
      keys(state.rawInfo.flows)
    );
    const isComplete = flowMessage.mode === 'complete';

    const results = mapRejectNil((flowId) => {
      const newFlow = flowMessage.flows[flowId];
      const oldFlow = state.rawInfo.flows[flowId];
      const oldFlowVersion = oldFlow ? oldFlow.version : null;
      const oldFlowEtag = oldFlow?.etag;
      const oldFlowFileName = oldFlow?.fileName;

      if (oldFlowFileName) {
        //oldFlow is a flow from disk
        newFlows[flowId] = oldFlow;
        return [flowId, {
          previousVersion: oldFlowVersion,
          newVersion: oldFlowVersion,
          fileName: oldFlowFileName
        }];
      }

      const baseFlowData = {
        previousVersion: oldFlowVersion
      };

      if (oldFlowEtag) {
        baseFlowData.previousEtag = oldFlowEtag;
      }

      if (isNil(newFlow)) {
        if (isComplete || has(flowId, flowMessage.flows)) {
          // this is a removal, either explicitly,
          // or because it was not included in a 'complete' message
          return [flowId, {
            ...baseFlowData,
            newVersion: null
          }];
        } else {
          // the message didn't tell us anything about this flow,
          // so just keep the old one, no reply message needed
          if (oldFlow) { newFlows[flowId] = oldFlow; }
          return;
        }
      }

      const attemptedVersion = newFlow.version;
      const attemptedEtag = newFlow.etag;
      const newFlowData = {
        newVersion: newFlow.version
      };

      if (newFlow.etag) {
        newFlowData.newEtag = newFlow.etag;
      }

      const getNewFlowData = (error) => {
        if (error) {
          const toReturn = {
            newVersion: oldFlowVersion,
            attemptedVersion,
            error
          };
          if (oldFlowEtag) {
            toReturn.newEtag = oldFlowEtag;
          }
          if (attemptedEtag) {
            toReturn.attemptedEtag = attemptedEtag;
          }
          return toReturn;
        }
        return newFlowData;
      };

      const requiredVersion = semver.parse(newFlow.minimumAgentVersion);
      if (semver.lt(AGENT_VERSION, requiredVersion)) {
        // the version required by the new flow is too damn high
        // keep the old flow, if we had one
        if (oldFlow) { newFlows[flowId] = oldFlow; }
        return [flowId, {
          ...baseFlowData,
          ...getNewFlowData('Unable to update workflow, failed agent requirement')
        }];
      }

      newFlows[flowId] = newFlow;
      if (!isValidObjectId(flowId)) { return; }
      return [flowId, {
        ...baseFlowData,
        ...getNewFlowData()
      }];
    }, allFlowIds);

    let deviceChanged = false;
    let device = state.rawInfo.device;
    if (flowMessage.device) {
      device = flowMessage.device;
      deviceChanged = !equals(state.rawInfo.device, device);
    }

    let appChanged = false;
    let application = state.rawInfo.application;
    if (flowMessage.application && flowMessage.application.id !== GATEWAY_ID_DEFAULT) {
      application = flowMessage.application;
      appChanged = !equals(state.rawInfo.application, application);
    }

    await updateInProcessStore({
      mode: 'complete',
      time: flowMessage.time || Date.now(),
      application,
      device,
      flows: newFlows,
      debugging: state.rawInfo.debugging
    });

    return {
      flowsResponse: FlowsResponse(fromPairs(results)),
      deviceChanged,
      appChanged
    };
  };

  const applyDebugMessage = async (message) => {
    message = DebugMessage(message);
    return pipe(
      mergeRight(state.rawInfo.debugging),
      filter(identity),
      objOf('debugging'),
      mergeRight(state.rawInfo),
      updateInProcessStore
    )(message);
  };

  const applyPeripheralsMessage = async (message, gatewayId) => {
    const peripheralsMessage = PeripheralsMessage(message);
    if (peripheralsMessage.ignore === gatewayId) { return false; }
    const isComplete = peripheralsMessage.mode === 'complete';

    const oldPeripherals = state.peripherals;
    if (isComplete) {
      state.peripherals = peripheralsMessage.peripherals;
    } else {
      state.peripherals = pickBy((p) => { return !!p; },
        { ...state.peripherals, ...peripheralsMessage.peripherals });
    }
    await globalStore.set('peripheralStore', state.peripherals);

    return !equals(oldPeripherals, state.peripherals);
  };

  const findTriggeredFlows = (firedTrigger) => {
    const {
      triggerId,
      triggerType
    } = FiredTrigger(firedTrigger);

    const byType = state.byTrigger.get(triggerType);
    if (!byType) { return; }
    const flowIds = byType.get(triggerId);
    if (!flowIds) { return; }
    const flows = map((x) => state.restoredFlows.get(x), [...flowIds]);
    return FindTriggeredFlowsResponse({
      flows,
      app: state.rawInfo.application,
      device: state.rawInfo.device,
      peripherals: state.peripherals
    });
  };

  const loadEdgeCustomNode = (applicationId, customNodeId, customNodeVersion, isInstance) => {
    const triggerId = isInstance ? `instance-${customNodeId}` : `${customNodeId}-${customNodeVersion}`;

    const ecn = state.restoredFlows.get(triggerId);
    if (!ecn) { return null; }

    return { ...ecn, customNodeId, customNodeVersion };
  };

  const loadFlowsFromDisk = async (rawInfo) => {
    if (!conf.directory) { return rawInfo; }
    const flows = {};
    let flowFiles = [];
    let stats;
    try { stats = await fs.stat(conf.directory); } catch {}
    if (!stats || !stats.isDirectory()) {
      logger.warn(`Unable to load flows from disk. Workflow path: ${conf.directory} must be a directory`);
      return rawInfo;
    }

    try {
      flowFiles = await fs.readdir(conf.directory);
    } catch {
      logger.warn(`Failed to read directory: ${conf.directory}`);
      return rawInfo;
    }

    await forEachSerialP(async (flow) => {
      try {
        const flowJson = await fs.readJson(path.resolve(conf.directory, flow), 'utf8');
        const requiredVersion = semver.parse(flowJson.minimumAgentVersion);
        if (flowJson.onDiskFormatVersion !== validDiskFormatVersion) {
          logger.warn(`Failed to load ${flow} from disk: onDiskFormatVersion must be ${validDiskFormatVersion}`);
        } else if (semver.lt(AGENT_VERSION, requiredVersion)) {
          logger.warn(`Failed to load ${flow} from disk: Edge Agent version must be ${requiredVersion} or greater`);
        } else if (!flowJson.id) {
          logger.warn(`Failed to load ${flow} from disk: ID is required`);
        } else {
          flowJson.fileName = flow;
          flows[flowJson.id] = RawFlow(flowPick(flowJson));
          logger.verbose(`Successfully loaded flow from ${flow}`);
        }
      } catch {
        logger.warn(`Failed to load ${flow} from disk: invalid JSON`);
      }
    }, flowFiles);

    const clonedInfo = clone(rawInfo);
    clonedInfo.flows = { ...clonedInfo.flows, ...flows };
    return clonedInfo;
  };

  const initialize = async () => {
    const rawInfo = await loadFlowsFromDisk(await globalStore.get('workflowStore', FlowsMessage));
    state.peripherals = await globalStore.get('peripheralStore', PeripheralDict);
    await updateInProcessStore(rawInfo);
  };

  const shutdown = async () => {
    resetTo(stateDefault, state);
  };

  return {
    // :: -> Promise<Nil>
    initialize,

    // :: -> Promise<Nil>
    shutdown,

    // FlowsMessage -> Promise<FlowsResponse>
    applyFlowMessage,

    // DebugMessage -> Promise<Nil>
    applyDebugMessage,

    // :: (PeripheralsMessage, gatewayId) => Promise<Boolean>
    applyPeripheralsMessage,

    // :: FiredTrigger -> FindTriggeredFlowsResponse | Nil
    findTriggeredFlows,

    // :: applicationId, customNodeId, customNodeVersion, isInstance ->
    // { ...Flow, startTrigger: { type, key, meta, outputIds }, customNodeId: ObjectIdStr, customNodeVersion: String } | Nil
    loadEdgeCustomNode,

    // :: -> TimerConfigs
    get timerInfo() { return state.timerInfo; },

    // :: -> UdpConfigs
    get udpInfo() { return state.udpInfo; },

    // :: -> FileTailConfigs
    get fileTailInfo() { return state.fileTailInfo; },

    // :: -> FileWatchConfigs
    get fileWatchInfo() { return state.fileWatchInfo; },

    // :: -> FlowErrorConfigs
    get flowErrorInfo() { return state.flowErrorInfo; },

    // :: -> RedisConfigs
    get redisInfo() { return state.redisInfo; },

    // :: -> RequestConfigs
    get requestInfo() { return state.requestInfo; },

    // :: -> SubscriptionConfigs
    get subscriptionInfo() { return state.subscriptionInfo; },

    // :: -> SerialConfigs
    get serialInfo() { return state.serialInfo; },

    // :: -> OpcuaConfigs
    get opcuaInfo() { return state.opcuaInfo; },

    // :: -> BeckhoffConfigs
    get beckhoffInfo() { return state.beckhoffInfo; },

    // :: -> OnEventConfigs
    get onEventInfo() { return state.onEventInfo; }
  };
};

// :: (WorkflowConf, GlobalStore) -> WorkflowManager
export default WorkflowManager;
