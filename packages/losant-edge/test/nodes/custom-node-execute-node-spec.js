import { levelManager } from '../common.js';
import { toString } from 'omnibelt';
import NodeRunner from '../../src/node-runner.js';
import abstractCustomNodeExecuteNodeTests from 'losant-nodes/test/abstract/custom-node-execute-node-spec.js';
import CustomNodeExecuteNode from 'losant-nodes/src/custom-node-execute-node.js';

const flowErrorManager = { fireOnError: () => { return; } };

const debugMessages = [];
const mqttMessages = [];
const statsMessages = [];

const sendMqttMessage = async ({ topic, message }) => {
  mqttMessages.push({ topic, msg: toString(message) });
};

const isConnectedToLosant = () => { return false; };

const sendDebugMessage = async (msg) => {
  debugMessages.push(msg);
};

const sendStatsMessage = async (msg) => {
  statsMessages.push(msg);
};

const getCurrentAgentConfig = () => { return { honk: 1 }; };

const workflowManager = {
  loadCustomNode: () => {
    return {};
  }
};

let nodeRunner;
describe('CustomNodeExecuteNode Using Edge NodeRunner', function() {
  before(async function() {
    nodeRunner = NodeRunner(levelManager.keyValueStore, flowErrorManager, {}, workflowManager,
      {
        sendMqttMessage,
        sendDebugMessage,
        sendStatsMessage,
        isConnectedToLosant,
        getCurrentAgentConfig
      });
    await nodeRunner.initialize();
  });

  after(async function() {
    await nodeRunner.shutdown();
  });
  abstractCustomNodeExecuteNodeTests((obj) => {
    return nodeRunner.contextify(obj);
  });

  it('should correctly build inner context', async () => {

    const outerContext = nodeRunner.contextify({
      runId: 'the main honk',
      runStart: Date.now(),
      originalPayload: {
        original: 'honk'
      },
      publishDebugMessage: nodeRunner.sendDebugMessage,
      triggerUiIds: ['a', 'b'],
      nodes: [{ 'node-1': {} }],
      flowId: '54321',
      flowVersionId: '09876',
      flowVersion: 'outerBonk',
      applicationId: '1a2b3c4d',
      flowClass: 'edge',
      fireOnError: () => { return 'error'; },
      flowErrorManager: () => { return 'managing error no worries'; },
      applyCustomNodeStats: () => { return 'mathing the stats'; },
      flowHttpResponse: () => { return 'sending http response'; },
      flowStatsAggregator: () => { return 'aggregating flow stats'; }
    });
    const innerPayload = { honk: '123' };

    const node = new CustomNodeExecuteNode('id', [[4], [5]], {
      customNodeId: '12345',
      customNodeVersion: 'bonk',
      resultPath: 'eek',
      fields: []
    });

    node.customNode = {
      flowId: '12345',
      flowVersion: 'bonk',
      flowVersionId: '67890',
      customNode: {
        customNodeId: '12345',
        flowVersion: 'bonk',
        flowVersionId: '67890'
      },
      startTrigger: {
        meta: {
          uuid: '555'
        }
      },
      customNodeConfig: {
        resultMode: 'optional'
      }
    };

    outerContext.loadCustomNode = () => { return node.customNode; };

    const innerContext = node.generateContext(outerContext, innerPayload);

    innerContext.maxFlowRunTime.should.equal(outerContext.maxFlowRunTime - (innerContext.runStart - outerContext.runStart));

    innerContext.should.deepEqual({
      sendMqttMessage,
      runStart: Number(innerContext.runStart),
      runNodes: outerContext.runNodes,
      maxConcurrentNodes: 5,
      publishDebugMessage: null,
      maxFlowRunTime: innerContext.maxFlowRunTime,
      triggerUiIds: [],
      runId: 'the main honk',
      loadCustomNode: () => { return node.customNode; },
      scopedConcurrent: {
        awaiting: [],
        slotInUse: false
      },
      whitelabel: undefined,
      peripherals: undefined,
      nodes: undefined,
      originalPayload: {
        original: 'honk'
      },
      kvStore: innerContext.kvStore,
      isSandboxFlow: undefined,
      hasErrorTrigger: false,
      isCustomNode: true,
      gatewayConf: {},
      getCurrentAgentConfig,
      flowVersionId: '09876',
      flowVersion: 'outerBonk',
      flowId: '54321',
      customNodeOriginalPayload: { honk: '123' },
      concurrent: { awaiting: [], count: 0 },
      applicationId: '1a2b3c4d',
      customNodeDepth: 1,
      customNodeResultMode: 'optional',
      flowClass: 'edge',
      fireOnError: () => { return 'error'; },
      externalTimeout: 10000,
      flowErrorManager: () => { return 'managing error no worries'; },
      applyCustomNodeStats: () => { return 'mathing the stats'; },
      flowHttpResponse: () => { return 'sending http response'; },
      flowStatsAggregator: () => { return 'aggregating flow stats'; },
      loadCredential: outerContext.loadCredential,
      validateAgainstCredentialUri: outerContext.validateAgainstCredentialUri,
      diskUtils: outerContext.diskUtils,
      customNodeId: '12345',
      customNodeVersion: 'bonk',
      customNodeVersionId: '67890'
    });
  });
});
