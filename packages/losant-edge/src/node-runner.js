import {
  uniq, flatten, toString, clampPositive, upperFirst,
  isNilOrEmpty, map, fromPairs, timeoutP, toNumber, clamp
} from 'omnibelt';
import errors from 'losant-nodejs-utils/src/errors.js';
import cleanError from 'losant-nodejs-utils/src/utils/clean-error.js';
import cleanFlowStats from 'losant-nodejs-utils/src/utils/clean-flow-stats.js';
import { ObjectId } from 'losant-nodejs-utils/src/bson.js';
import logger from './logger/index.js';
import rollbar from './rollbar.js';
import FiredTrigger from './types/fired-trigger.js';
import FindTriggeredFlowsResponse from './types/find-triggered-flows-response.js';
import { AGENT_VERSION, PLATFORM_TOPIC_BASE, MAX_EXTERNAL_CALL_TIME as maxExternalCallTime } from './constants.js';
import DEBUG_LEVEL from 'losant-nodejs-utils/src/constants/debug-level.js';
import buildDebugMessage from 'losant-nodejs-utils/src/utils/build-debug-message.js';
import {
  addToPreviousNodeInfo,
  settleRunNodePromises,
  freeConcurrentNode,
  requestNewConcurrentNode,
  isTimedOut,
  getTimeoutError,
  getFlowErrorMessage,
  customNodeifyPayload
} from 'losant-nodes/src/lib/node-runner-helpers.js';
import { guardPath, guardFileReadPath, loadGuardedFile } from './lib/protected-path-utils.js';

const isConnectToLosantName = `isConnectedTo${upperFirst(PLATFORM_TOPIC_BASE)}`;

import agentEnvironment from './lib/flow-env-vars.js';
const statsReportTime     = clamp(5*60*1000, Infinity,
  toNumber(process.env.STATS_REPORT_TIME) || 30*60*1000);
const maxFlowRunTime      = clampPositive(toNumber(process.env.MAX_FLOW_RUN_TIME) || 60000);
const maxConcurrentNodes  = clampPositive(toNumber((process.env.MAX_CONCURRENT_NODES)) || 5);
const rollbarErrors       = new Set([
  // these are the set of core node errors - if these occur, it is either a problem
  // in our code, or we forgot to wrap something to throw a different more useful error
  'AssertionError', 'Error', 'RangeError', 'ReferenceError', 'SyntaxError', 'TypeError',

  // things that seem to occur super rarely and we would like more info on them
  // might add more things to this list over time
  'InternalFailure', 'NetworkingError', 'UnrecognizedClientException', 'UnknownError'
]);
const diskUtils = { guardPath, guardFileReadPath, loadGuardedFile };

// most of this is to get things out of the tcomb structure and get
// it to nice plain objects again, without lots of `undefined` props
const deviceToPayloadForm = (device, application) => {
  const deviceObj = {
    id: device.id,
    deviceId: device.id,
    applicationId: application.id,
    name: device.name,
    tags: {},
    attributes: {},
    deviceClass: 'edgeCompute'
  };

  if (device.tags) {
    Object.keys(device.tags).forEach((tagKey) => {
      const tagValues = device.tags[tagKey];
      deviceObj.tags[tagKey] = tagValues.slice();
    });
  }

  if (device.parentId) {
    deviceObj.parentId = device.parentId;
  }

  if (device.creationDate) {
    deviceObj.creationDate = device.creationDate;
  }

  if (device.attributes?.length) {
    device.attributes.forEach((attrStruct) => {
      const attr = {
        name: attrStruct.name,
        dataType: attrStruct.dataType,
        attributeTags: attrStruct.attributeTags ? { ...attrStruct.attributeTags } : {}
      };
      if (attrStruct.contentType) {
        attr.contentType = attrStruct.contentType;
      }
      deviceObj.attributes[attr.name] = attr;
    });
  }

  return deviceObj;
};

const rollbarIfNeeded = (err, custom) => {
  if (!err || !rollbarErrors.has(err.name)) { return; }
  rollbar.error(err, null, { custom });
};

const buildDebugPublisher = (flowData, sendDebugMessage) => {
  if (!flowData.debuggingEnabled) { return null; }
  return async function(msgObj, prevNodeInfo) {
    // NOTE 'this' is the workflow context object
    msgObj = buildDebugMessage(msgObj, this);
    if (prevNodeInfo) {
      // since the object is not serialized *now* we have to slice these cause
      // the raw refs will continue to be manipulated
      msgObj.prevNodes = prevNodeInfo.ids.slice();
      msgObj.prevNodeDurations = prevNodeInfo.durations.slice();
    } else {
      msgObj.prevNodes = [];
      msgObj.prevNodeDurations = [];
    }
    return sendDebugMessage(msgObj);
  };
};

const runNodeError = async ({
  nodeId, nodeType = 'missing', context, prevNodeInfo, payload, error
}) => {
  rollbarIfNeeded(error, { nodeId, nodeType, context, payload });
  error = cleanError(error);
  context.flowErrorManager.fireOnError({
    errorInfo: { nodeType, nodeId, error },
    triggerId: `${context.flowId}-flowError`,
    context,
    payload
  });
  await context.publishDebugMessage?.({
    message: 'Error running node',
    sourceNode: nodeId,
    payload,
    error,
    level: DEBUG_LEVEL.fatal
  }, prevNodeInfo);
  return { pathsCompleted: 0, errors: [{ nodeId, error }] };
};

let runNextNodes;
const runNode = async (payload, context, prevNodeInfo, cloneNodeInfo, nodeId) => {
  const node = context.nodes[nodeId];
  if (!node) {
    return runNodeError({
      nodeId, context, prevNodeInfo, payload, error: errors.MissingNode({ title: nodeId })
    });
  }

  const nodeType = node.constructor.name;
  const nodeStart = Date.now();
  if (isTimedOut(nodeStart, context.runStart, context.maxFlowRunTime)) {
    return runNodeError({
      nodeId, nodeType, context, prevNodeInfo, payload, error: getTimeoutError(context.isCustomNode)
    });
  }

  let newOutputIds, newPayload, deepErrors, error;
  await requestNewConcurrentNode(context);
  try {
    [newOutputIds, newPayload, deepErrors] = await node.run(context, payload, prevNodeInfo);
  } catch (e) {
    error = e;
  }
  freeConcurrentNode(context);
  const duration = Date.now() - nodeStart;

  if (error) {
    return runNodeError({
      nodeId, nodeType, context, prevNodeInfo, payload, error
    });
  }

  // used for loop nodes
  if (deepErrors?.length) { return { pathsCompleted: 0, errors: deepErrors }; }

  newOutputIds = newOutputIds ? flatten(newOutputIds) : [];
  if (!newOutputIds.length) { return { pathsCompleted: 1, errors: [] }; }

  prevNodeInfo = addToPreviousNodeInfo(nodeId, duration, cloneNodeInfo, prevNodeInfo);
  return runNextNodes(newOutputIds, newPayload, context, prevNodeInfo);
};

runNextNodes = (nodeIds, payload, context, prevNodeInfo) => {
  nodeIds = uniq(nodeIds);
  if (nodeIds.length > 1) {
    return settleRunNodePromises(nodeIds.map(runNode.bind(null, payload, context, prevNodeInfo, true)));
  } else {
    return runNode(payload, context, prevNodeInfo, false, nodeIds[0]);
  }
};

const runNodes = (nodeIds, payload, context) => {
  nodeIds = nodeIds ? flatten(nodeIds) : [];
  if (!nodeIds.length) { return Promise.resolve({ pathsCompleted: 1, errors: [] }); }

  const prevNodeInfo = context.publishDebugMessage ? { ids: [], durations: [] } : null;
  return runNextNodes(nodeIds, payload, context, prevNodeInfo);
};

const rootRunNodes = async (context, payload, outputIds) => {
  return timeoutP(context.maxFlowRunTime, context.runNodes(outputIds, payload, context))
    .catch(async (error) => {
      if (error.code === 'ETIMEDOUT') {
        error = getTimeoutError(context.isCustomNode);
      }
      rollbarIfNeeded(error, { context, payload });
      error = cleanError(error);
      const message = getFlowErrorMessage(context.isCustomNode);
      await context.publishDebugMessage?.({
        message,
        payload,
        error,
        level: DEBUG_LEVEL.fatal
      });
      return { errors: [{ nodeId: null, error }], pathsCompleted: 0 };
    });
};

const NodeRunner = (kvStore, flowErrorManager, gatewayConf, workflowManager, {
  sendMqttMessage, sendDebugMessage,
  sendStatsMessage, flowHttpResponse, isConnectedToLosant,
  getCurrentAgentConfig,
  getOtlpCollectorConfig
}) => {
  const currentlyRunning = new Set();
  let flowStats = new Map();
  let lastStatsReport;
  let statsReportIntervalId;

  const contextify = (obj) => {
    return {
      getCurrentAgentConfig,
      getOtlpCollectorConfig,
      sendMqttMessage,
      kvStore,
      runNodes,
      externalTimeout: maxExternalCallTime,
      maxConcurrentNodes,
      maxFlowRunTime,
      concurrent: { awaiting: [], count: 0 },
      gatewayConf,
      loadCustomNode: workflowManager.loadEdgeCustomNode,
      loadCredential: async () => {
        throw errors.Validation({ message: 'Using credentials on edge nodes is not valid.' });
      },
      diskUtils,
      ...obj
    };
  };

  const reportFlowStats = async () => {
    const currentStats = flowStats;
    flowStats = new Map();

    const results = [];
    let runCount = 0;
    currentStats.forEach((versionMap, flowId) => {
      versionMap.forEach((stats, flowVersionId) => {
        stats = cleanFlowStats(stats, false);
        if (!stats) { return; }
        results.push({
          flowId,
          flowVersionId,
          stats
        });
        runCount += stats.runCount;
      });
    });

    logger.info(`${runCount} workflow(s) run since ${lastStatsReport || 'agent startup'}.`);
    lastStatsReport = new Date();

    if (results.length > 0) {
      await sendStatsMessage(results);
    }
  };

  const commonApplyStats = (id, versionId, runStart, results) => {
    if (!flowStats.has(id)) { flowStats.set(id, new Map()); }
    const versionMap = flowStats.get(id);

    if (!versionMap.has(versionId)) {
      versionMap.set(versionId, {
        time: 0,
        errors: [],
        runCount: 0,
        wallTime: 0,
        pathsCompleted: 0
        // pathsFailed filled in later from error array length
      });
    }
    const stats = versionMap.get(versionId);

    if (runStart > stats.time) { stats.time = runStart; }
    stats.runCount++;
    stats.wallTime += results.wallTime;
    stats.pathsCompleted += results.pathsCompleted;
    if (results.errors.length) {
      stats.errors = [...stats.errors, ...results.errors];
    }
  };

  const applyFlowStats = (flow, runStart, results) => {
    const flowVersionId = flow.versionId || 'develop';
    commonApplyStats(flow.id, flowVersionId, runStart, results);
  };

  const applyCustomNodeStats = (ecn, runStart, results) => {
    const versionId = ecn.flowClass === 'instanceCustomNode' ? 'instance' : ecn.versionId;
    commonApplyStats(ecn.customNodeId, versionId, runStart, results);
  };

  const runFlow = async (flow, app, payloadDevice, peripherals, firedTrigger, runStart) => {
    const { payload: basePayload, triggerId, triggerType } = firedTrigger;

    if (basePayload.flowVersion && basePayload.flowVersion !== flow.version) {
      logger.warn('Requested workflow version is not deployed to this agent:', {
        requested: basePayload.flowVersion, actual: flow.version
      });
      return { errors: [], pathsCompleted: 0 }; // nothing to do
    }

    const triggerUiIds = new Set();
    const outputIds = [];
    flow.triggers.forEach((flowPair) => {
      if (triggerId !== flowPair.key || triggerType !== flowPair.type) { return; }

      // check to make sure the mqttTopic trigger is for the right broker type
      if (triggerType === 'mqttTopic' &&
        (firedTrigger.integrationId || 'losant') !== (flowPair.config?.integrationId || 'losant')) { return; }

      // for UI debugging display use only
      if (flowPair.meta?.uiId) { triggerUiIds.add(flowPair.meta.uiId); }
      outputIds.push(flowPair.outputIds);
    });

    if (isNilOrEmpty(outputIds)) {
      return { errors: [], pathsCompleted: 0 }; // nothing to do
    }

    let payload = {
      triggerId,
      triggerType,
      applicationId: app.id,
      applicationName: app.name,
      device: payloadDevice,
      deviceId: payloadDevice.id,
      deviceName: payloadDevice.name,
      deviceTags: payloadDevice.tags,
      [isConnectToLosantName]: isConnectedToLosant(),
      agentEnvironment,
      agentVersion: AGENT_VERSION.version,
      ...basePayload
    };

    const isCustomNode = flow.flowClass === 'customNode';

    if (isCustomNode) {
      payload = customNodeifyPayload(payload, flow);
    } else {
      payload = {
        ...payload,
        flowVersion: flow.version,
        flowId: flow.id,
        flowName: flow.name,
        globals: flow.globals
      };
    }

    const context = contextify({
      publishDebugMessage: buildDebugPublisher(flow, sendDebugMessage),
      triggerUiIds: Array.from(triggerUiIds),
      nodes: flow.nodes,
      peripherals,
      flowId: flow.id,
      flowVersionId: flow.versionId || '',
      flowVersion: flow.version,
      etag: flow.etag,
      applicationId: app.id,
      runId: toString(new ObjectId()),
      originalPayload: payload,
      flowHttpResponse,
      runStart,
      flowErrorManager,
      isCustomNode,
      customNodeDebugOff: !flow.customNodeDebug,
      applyCustomNodeStats
    });

    return rootRunNodes(context, payload, outputIds);
  };

  const runFlows = async (firedTrigger, findTriggeredFlowsResponse) => {
    firedTrigger = FiredTrigger(firedTrigger);
    const { app, device, flows, peripherals } = FindTriggeredFlowsResponse(findTriggeredFlowsResponse);

    const payloadDevice = deviceToPayloadForm(device, app);

    const flowsPromise = Promise.all(map(async (flow) => {
      const runStart = Date.now();
      const result = await runFlow(flow, app, payloadDevice, peripherals, firedTrigger, runStart);
      result.wallTime = Date.now() - runStart;
      applyFlowStats(flow, runStart, result);
      return [flow.id, result];
    }, flows));

    currentlyRunning.add(flowsPromise);
    try {
      return fromPairs(await flowsPromise);
    } finally {
      currentlyRunning.delete(flowsPromise);
    }
  };

  const initialize = async () => {
    statsReportIntervalId = setInterval(reportFlowStats, statsReportTime);
  };

  const shutdown = async () => {
    clearTimeout(statsReportIntervalId);
    statsReportIntervalId = null;
    await Promise.all(Array.from(currentlyRunning));
    await reportFlowStats();
  };

  return {
    // for testing purposes only
    // :: (Object) -> Object
    contextify,

    // :: -> Promise<Nil>
    initialize,

    // :: (FiredTrigger, FindTriggeredFlowsResponse) -> Promise<Object>
    runFlows,

    // :: -> Promise<Nil>
    shutdown
  };
};

// :: (KeyValueStore, flowErrorManager, gatewayConf, workflowManager, {
//      sendMqttMessage: (({ brokerType, configName, topic, message }) -> Nil),
//      sendDebugMessage: (Message -> Nil),
//      sendStatsMessage: ([Messages] -> Nil),
//      flowHttpResponse: ((replyId, reply) -> Nil),
//      isConnectedToLosant: (() -> Boolean),
//      getCurrentAgentConfig: (() -> Object),
//      getOtlpCollectorConfig: (() -> Object)
//    }) -> NodeRunner
export default NodeRunner;
