import DEBUG_LEVEL from '../constants/debug-level.js';

export default (msgObj, flowContext) => {
  msgObj.time = new Date();
  msgObj.runStart = new Date(flowContext.runStart);
  msgObj.flowId = flowContext.flowId;
  msgObj.triggerUiIds = flowContext.triggerUiIds;
  msgObj.runId = flowContext.runId;
  msgObj.flowVersionId = flowContext.flowVersionId;
  msgObj.flowVersion = flowContext.flowVersion;
  msgObj.level = DEBUG_LEVEL[msgObj.level] || DEBUG_LEVEL.default;
  if (flowContext.iterationStart) {
    msgObj.iterationStart = new Date(flowContext.iterationStart);
  }
  if (flowContext.etag) {
    msgObj.etag = flowContext.etag;
  }
  return msgObj;
};
