import { defer, omit } from 'omnibelt';
import errors  from 'losant-nodejs-utils/src/errors.js';

const NODE_INFO_MAX = 200;
const NODE_INFO_SLICE = -98;
const MERGED_ID = '$$MERGED$$';

export const isTimedOut = (nodeStart, runStart, maxFlowRunTime) => {
  return nodeStart - runStart > maxFlowRunTime;
};

export const getTimeoutError = (isCustomNode) => {
  return isCustomNode ? errors.CustomNodeTimeout() : errors.FlowTimeout();
};

export const getFlowErrorMessage = (isCustomNode) => {
  return `Error running ${isCustomNode ? 'custom node' : 'workflow'}`;
};

export const customNodeifyPayload = (payload, customNode) => {
  payload = omit(['relayId', 'relayType', 'flowVersion', 'flowId'], payload);
  payload = {
    ...payload,
    customNodeId: customNode.flowId || customNode.id,
    customNodeName: customNode.name,
    customNodeVersion: customNode.flowVersion || customNode.version,
    applicationId: payload.applicationId || customNode.applicationId
    // no globals
  };
  return payload;
};

export const addToPreviousNodeInfo = (nodeId, duration, cloneNodeInfo, prevNodeInfo) => {
  if (!prevNodeInfo) { return null; }

  if (prevNodeInfo.ids.length > NODE_INFO_MAX) {
    let groupedDuration = 0;
    const groupedCount = prevNodeInfo.ids.length + NODE_INFO_SLICE;
    for (let i=0; i < groupedCount; i++) {
      groupedDuration += prevNodeInfo.durations[i];
    }

    const ids = prevNodeInfo.ids.slice(NODE_INFO_SLICE);
    const durations = prevNodeInfo.durations.slice(NODE_INFO_SLICE);
    ids.unshift(MERGED_ID);
    durations.unshift(groupedDuration);

    prevNodeInfo = { ids, durations };
  } else if (cloneNodeInfo) {
    prevNodeInfo = {
      ids: [...prevNodeInfo.ids],
      durations: [...prevNodeInfo.durations]
    };
  }

  prevNodeInfo.durations.push(duration);
  prevNodeInfo.ids.push(nodeId);

  return prevNodeInfo;
};

export const settleRunNodePromises = async (runNodePromises) => {
  const results = await Promise.all(runNodePromises);
  let pathsCompleted = 0;
  let errAry = [];
  for (const result of results) {
    pathsCompleted += result.pathsCompleted;
    if (result.errors.length) { errAry = [...errAry, ...result.errors]; }
  }
  return { pathsCompleted, errors: errAry };
};

export const freeConcurrentNode = (context) => {
  if (context.scopedConcurrent) {
    const waiting = context.scopedConcurrent.awaiting.shift();
    if (waiting) {
      setImmediate(waiting.resolve);
      return;
    }

    if (context.scopedConcurrent.slotInUse) {
      context.scopedConcurrent.slotInUse = false;
      return;
    }
  }

  const waiting = context.concurrent.awaiting.shift();
  if (waiting) {
    setImmediate(waiting.resolve);
  } else {
    context.concurrent.count--;
  }
};

export const requestNewConcurrentNode = (context) => {
  const deferred = defer();
  if (context.concurrent.count < context.maxConcurrentNodes) {
    context.concurrent.count++;
    setImmediate(deferred.resolve);
  } else if (context.scopedConcurrent) {
    if (context.scopedConcurrent.slotInUse) {
      context.scopedConcurrent.awaiting.push(deferred);
    } else {
      context.scopedConcurrent.slotInUse = true;
      setImmediate(deferred.resolve);
    }
  } else {
    context.concurrent.awaiting.push(deferred);
  }
  return deferred.promise;
};
