import * as payloadHelper from 'losant-handlebars';
import errors from 'losant-nodejs-utils/src/errors.js';
import cleanError from 'losant-nodejs-utils/src/utils/clean-error.js';
import LJSON from 'losant-nodejs-utils/src/ljson.js';
import ScopedStore from './lib/scoped-key-value-store.js';
import RE2 from 'losant-handlebars/src/get-re2.js';
import { timeoutP, keyBy, prop, isNil, isNilOrEmpty, toString, any } from 'omnibelt';

const MAX_CUSTOM_NODE_DEPTH = 20;

const fieldEval = {
  checkbox: (fieldConfig, fieldInput) => {
    // required does not apply to this field type
    if (isNilOrEmpty(fieldInput)) { fieldInput = fieldConfig.defaultValue || false; }
    return Boolean(fieldInput);
  },
  select: (fieldConfig, fieldInput) => {
    // required does not apply to this field type
    if (isNilOrEmpty(fieldInput) && !isNilOrEmpty(fieldConfig.defaultValue)) { fieldInput = fieldConfig.defaultValue; }
    fieldInput = toString(fieldInput);
    if (!any((opt) => { return opt.value === fieldInput; }, fieldConfig.options || [])) {
      throw errors.Validation({ message: `Value ${fieldInput} is not a valid value for ${fieldConfig.label}` });
    }
    return fieldInput;
  },
  stringTemplate: (fieldConfig, fieldInput, outerPayload) => {
    fieldInput = payloadHelper.renderToString(fieldInput, outerPayload);
    if (isNilOrEmpty(fieldInput)) {
      if (fieldConfig.required) { throw errors.MissingField({ title: fieldConfig.label }); }
      const defaultVal = toString(fieldConfig.defaultValue);
      if (!isNilOrEmpty(defaultVal)) { fieldInput = defaultVal; }
    }
    if (fieldConfig.validRegExp) {
      let regExp;
      try {
        regExp = new RE2(fieldConfig.validRegExp);
      } catch {}
      if (!regExp || !fieldInput.match(regExp)) {
        throw errors.Validation({ message: `Value ${fieldInput} is not a valid value for ${fieldConfig.label}` });
      }
    }
    return fieldInput;
  },
  numberTemplate: (fieldConfig, fieldInput, outerPayload) => {
    fieldInput = payloadHelper.render(fieldInput, outerPayload);
    if (isNilOrEmpty(fieldInput)) {
      if (fieldConfig.required) { throw errors.MissingField({ title: fieldConfig.label }); }
      const defaultVal = Number(fieldConfig.defaultValue);
      if (isFinite(defaultVal)) { fieldInput = defaultVal; }
    }
    const castFieldInput = Number(fieldInput);
    const isValid = isFinite(castFieldInput) &&
      (isNil(fieldConfig.validMin) || castFieldInput >= fieldConfig.validMin) &&
      (isNil(fieldConfig.validMax) || castFieldInput <= fieldConfig.validMax);
    if (!isValid) {
      throw errors.Validation({ message: `Value ${fieldInput} is not a valid value for ${fieldConfig.label}` });
    }
    return castFieldInput;
  },
  jsonTemplate: (fieldConfig, fieldInput, outerPayload) => {
    fieldInput = payloadHelper.render(fieldInput, outerPayload);
    if (isNilOrEmpty(fieldInput)) {
      if (fieldConfig.required) { throw errors.MissingField({ title: fieldConfig.label }); }
      const defaultVal = toString(fieldConfig.defaultValue);
      fieldInput = isNilOrEmpty(defaultVal) ? undefined : defaultVal;
    }

    if (typeof(fieldInput) === 'string') {
      try {
        fieldInput = LJSON.parse(fieldInput);
      } catch {
        throw errors.InvalidJsonTemplate({ title: fieldConfig.label });
      }
    }

    return fieldInput;
  },
  payloadPath: (fieldConfig, fieldInput, outerPayload) => {
    // payloadPath fields have no default value. required is only checked
    // against the raw configured value, not the looked-up payload value.
    if (fieldConfig.required && isNilOrEmpty(fieldInput)) {
      throw errors.MissingField({ title: fieldConfig.label });
    }
    return payloadHelper.lookup(fieldInput, outerPayload);
  }
};

const getCustomNodeIdAndVersion = (customNode, isEdge=false) => {
  let customNodeId, customNodeVersion, customNodeVersionId;
  if (isEdge) {
    customNodeId = customNode.customNodeId;
    customNodeVersion = customNode.customNodeVersion;
    customNodeVersionId = customNode.versionId;
  } else {
    customNodeId = customNode.flowId;
    customNodeVersion = customNode.flowVersion;
    customNodeVersionId = customNode.flowVersionId;
  }
  return { customNodeId, customNodeVersion, customNodeVersionId };
};

class CustomNodeExecuteNode {

  /* Example Config:
  {
    isInstance: <Boolean - Optional: if true, this is an instance custom node (reported as a node rather than a custom node in errors and debug output)>,
    customNodeId: <String - Required: id of the custom node to run>,
    customNodeVersion: <String - Optional: version of the custom node to run. Default 'default'>,
    resultPath: <String - Optional: payload path for the custom node's result. Only written when the custom node's result mode is not none. When blank the result is discarded>,
    fields: [
      ...zero or more of...
      {
        id: <String - Required: id of the custom node field>,
        value: <Any - Optional: value for the custom node field>
      }
    ]
  }
  Notes:
    The type of value depends on the field's type in the custom node's field config: checkbox (boolean), select (option value string), stringTemplate (template), numberTemplate (template), jsonTemplate (template), or payloadPath (payload path). Fields of type section are skipped.
    A missing or empty value falls back to the field's defaultValue for every type except payloadPath, which has no default.
    The field's required setting is enforced for stringTemplate, numberTemplate, and jsonTemplate fields after rendering. For payloadPath it is only checked against the raw configured value, and it does not apply to checkbox or select fields.
    Outputs: when the custom node has more than one output, the result branch index picks outputIds[branchIndex]. Otherwise all outputIds run.
    Errors in the custom node, timeouts, a missing result, or an invalid branch index throw.
    Custom nodes may be nested up to 20 levels deep.
  */

  constructor(id, outputIds, config) {
    this.id = id;
    this.outputIds = outputIds;
    this.customNodeId = config.customNodeId;
    this.customNodeVersion = config.customNodeVersion || 'default';
    this.resultPath = config.resultPath;
    this.fields = keyBy(prop('id'), config.fields || []);
    this.isInstance = config.isInstance;

    this.customNode = undefined;
  }

  generatePayload(outerContext, outerPayload) {
    const fieldData = {};
    this.customNode.customNodeConfig.fields.forEach((fieldConfig) => {
      if (fieldConfig.type === 'section') { return; }
      const fieldInput = (this.fields[fieldConfig.id] || {}).value;
      fieldData[fieldConfig.id] = fieldEval[fieldConfig.type](fieldConfig, fieldInput, outerPayload);
    });

    const { customNodeId, customNodeVersion } = getCustomNodeIdAndVersion(this.customNode, !!outerContext.getCurrentAgentConfig);

    return {
      // explicitly no applicationName / globals / relayId / relayType
      // flowId / flowName / flowVersion -> customNode
      data: fieldData,
      customNodeId,
      customNodeName: this.customNode.name,
      customNodeVersion,
      applicationId: outerContext.applicationId,
      time: new Date(outerContext.originalPayload.time),
      triggerId: 'customNodeStart',
      triggerType: 'customNodeStart'
    };
  }

  generateContext(outerContext, innerPayload, outerPrevNodeInfo) {
    const now = Date.now();
    const node = this;

    let publishDebugMessage = null;
    const { customNodeId, customNodeVersion, customNodeVersionId } = getCustomNodeIdAndVersion(this.customNode, !!outerContext.getCurrentAgentConfig);
    if (!this.isInstance && outerContext.publishDebugMessage && !outerContext.customNodeDebugOff) {
      publishDebugMessage = function(msgObj, innerPrevNodeInfo) {
        // NOTE 'this' is the custom node context object
        const wrappedMsgObj = {
          message: msgObj.message,
          payload: msgObj.payload,
          error: msgObj.error,
          level: msgObj.level,
          sourceNode: node.id,
          customNode: {
            sourceNode: msgObj.sourceNode,
            customNodeId,
            customNodeVersionId,
            customNodeVersion
          }
        };
        if (innerPrevNodeInfo) {
          wrappedMsgObj.customNode.prevNodes = innerPrevNodeInfo.ids;
          wrappedMsgObj.customNode.prevNodeDurations = innerPrevNodeInfo.durations;
        }
        if (msgObj.customNode) { wrappedMsgObj.customNode.customNode = msgObj.customNode; }

        return outerContext.publishDebugMessage(wrappedMsgObj, outerPrevNodeInfo);
      };
    }

    const innerContext = {
      kvStore: new ScopedStore(outerContext.kvStore, `${this.isInstance ? 'node' : 'customNode'}-${this.id}`),
      publishDebugMessage,
      runNodes: outerContext.runNodes,
      externalTimeout: outerContext.externalTimeout,
      customNodeDepth: (outerContext.customNodeDepth || 0) + 1,
      concurrent: outerContext.concurrent,
      scopedConcurrent: { awaiting: [], slotInUse: false },
      loadCustomNode: outerContext.loadCustomNode,
      maxConcurrentNodes: outerContext.maxConcurrentNodes,
      triggerUiIds: this.customNode.startTrigger.meta.uiId ? [this.customNode.startTrigger.meta.uiId] : [],
      nodes: this.customNode.nodes,
      isSandboxFlow: outerContext.isSandboxFlow,
      whitelabel: outerContext.whitelabel,
      hasErrorTrigger: false, // custom nodes never have error triggers
      // these are intentionally the root flow ids
      flowId: outerContext.flowId,
      flowVersionId: outerContext.flowVersionId,
      flowVersion: outerContext.flowVersion,
      flowClass: outerContext.flowClass,
      customNodeId: this.customNode.flowId,
      customNodeVersionId: this.customNode.flowVersionId,
      customNodeVersion: this.customNode.flowVersion,
      applicationId: outerContext.applicationId,
      runId: outerContext.runId,
      // intentionally the root original payload
      originalPayload: outerContext.originalPayload,
      customNodeOriginalPayload: innerPayload,
      customNodeResultMode: this.customNode.customNodeConfig.resultMode,
      runStart: now,
      // custom node's max time is minus any time already used
      maxFlowRunTime: outerContext.maxFlowRunTime - (now - outerContext.runStart),
      flowStatsAggregator: outerContext.flowStatsAggregator,
      isCustomNode: true,
      // edge custom node specific items
      sendMqttMessage: outerContext.sendMqttMessage,
      getCurrentAgentConfig: outerContext.getCurrentAgentConfig,
      gatewayConf: outerContext.gatewayConf,
      fireOnError: outerContext.fireOnError,
      applyCustomNodeStats: outerContext.applyCustomNodeStats,
      flowHttpResponse: outerContext.flowHttpResponse,
      flowErrorManager: outerContext.flowErrorManager,
      peripherals: outerContext.peripherals,
      loadCredential: outerContext.loadCredential,
      validateAgainstCredentialUri: outerContext.validateAgainstCredentialUri,
      diskUtils: outerContext.diskUtils
    };

    return innerContext;
  }

  buildError(message) {
    if (this.isInstance) {
      return errors.NodeError({ message: `The node ${message}` });
    } else {
      return errors.CustomNodeError({ message: `The custom node ${message}` });
    }
  }

  async run(outerContext, outerPayload, prevNodeInfo) {
    if (this.customNode === undefined) {
      this.customNode = await outerContext.loadCustomNode(outerContext.applicationId, this.customNodeId, this.customNodeVersion, this.isInstance) || null;
    }

    if (!this.customNode) {
      throw errors.Validation({ message: `Requested ${this.isInstance ? '' : 'custom '}node was not found.` });
    }

    if (!this.customNode.startTrigger) {
      throw errors.Validation({ message: `Requested ${this.isInstance ? '' : 'custom '}node is not valid.` });
    }

    if (outerContext.customNodeDepth && outerContext.customNodeDepth > MAX_CUSTOM_NODE_DEPTH) {
      throw this.buildError('exceeded the maximum allowed depth.');
    }

    const innerPayload = this.generatePayload(outerContext, outerPayload);
    const innerContext = this.generateContext(outerContext, innerPayload, prevNodeInfo);

    let isTimeoutError = false;
    const flowResult = await timeoutP(
      innerContext.maxFlowRunTime,
      innerContext.runNodes(this.customNode.startTrigger.outputIds, innerPayload, innerContext)
    )
      .catch((error) => {
        if (error.code === 'ETIMEDOUT') {
          isTimeoutError = true;
          error = errors.CustomNodeTimeout();
        }
        error = cleanError(error);
        return {
          errors: [{ nodeId: null, error }],
          pathsCompleted: 0
        };
      });

    flowResult.wallTime = Date.now() - innerContext.runStart;
    flowResult.runStart = innerContext.runStart;

    if (innerContext.flowStatsAggregator) { // cloud custom node
      innerContext.flowStatsAggregator(outerContext.applicationId, this.customNode, flowResult);
    } else if (innerContext.applyCustomNodeStats) { // edge custom node
      innerContext.applyCustomNodeStats(this.customNode, innerContext.runStart, flowResult);
    }

    if (flowResult.errors.length > 0) {
      if (this.isInstance) {
        if (isTimeoutError) {
          throw errors.NodeTimeout();
        } else {
          throw errors.NodeError({ message: 'The node had one or more errors while executing.' });
        }
      } else if (isTimeoutError) {
        throw flowResult.errors[0].error;
      } else {
        const errObj = {
          name: 'CustomNodeError',
          message: 'The custom node had one or more errors while executing.',
          internalErrors: flowResult.errors
        };
        throw errObj;
      }
    }

    if (!innerContext.customNodeResult) {
      throw this.buildError('failed to create a result.');
    }

    if (this.customNode.customNodeConfig.resultMode !== 'none') {
      outerPayload = payloadHelper.set(
        this.resultPath,
        innerContext.customNodeResult.result,
        outerPayload
      );
    }

    let resultIds = this.outputIds;
    if (this.customNode.customNodeConfig.outputCount > 1) {
      const branchIndex = innerContext.customNodeResult.branchIndex;
      if (!isFinite(branchIndex) || branchIndex < 0 || branchIndex >= this.customNode.customNodeConfig.outputCount) {
        throw this.buildError('failed to return a valid branch path.');
      }
      resultIds = resultIds[branchIndex] || [];
    }

    return [resultIds, outerPayload];
  }

}

export default CustomNodeExecuteNode;
