import FiredTrigger from '../src/types/fired-trigger.js';
import FindTriggeredFlowsResponse from '../src/types/find-triggered-flows-response.js';
import MqttMessageNode from '../src/nodes/mqtt-message-node.js';
import MutateNode from 'losant-nodes/src/mutate-node.js';
import FlowErrorManager from '../src/flow-error-manager.js';
import { levelManager } from './common.js';
import tk from 'timekeeper';
import NodeRunner from '../src/node-runner.js';
import { ThrowErrorNode } from 'losant-nodes';

const sendMqttMessage = () => {};
const sendDebugMessage = () => {};
const sendStatsMessage = () => {};
const isConnectedToLosant = () => { return false; };

const flowErrorManager = FlowErrorManager();
let nodeRunner; // defined in before...
const baseFlow = {
  debuggingEnabled: true,
  id: '5a6b563972a4998fc022ad6b',
  versionId: '5a6b569172a4998fc022ad6c',
  version: 'flowVersion',
  name: 'flowName',
  globals: { },
  triggers: [],
  nodes: {},
  minimumAgentVersion: '0.0.0'
};

const fireTrigger = async (nodeData, payload) => {
  const flowData = { ...baseFlow, ...nodeData };
  const starterTrigger = flowData.triggers[0];
  await nodeRunner.runFlows(
    FiredTrigger({
      triggerId: starterTrigger.key,
      triggerType: starterTrigger.type,
      payload: payload || { foo: 'hi', bar: 'bye' }
    }),
    FindTriggeredFlowsResponse({
      flows: [flowData],
      device: {
        name: 'deviceName',
        id: '5a6b58e2fa016b90d970c97c',
        tags: {}
      },
      app: {
        name: 'appName',
        id: '5a6b58e2fa016b90d970c97b',
        globals: {}
      },
      peripherals: {}
    })
  );
};

let fires = [];
const fakeFires = (fireData) => {
  fires.push(fireData);
};

const resetFires = () => {
  tk.travel(Number(new Date()) + 5000);
  fires = [];
};

describe('Workflow Error Trigger', () => {
  const msgNode = new MqttMessageNode('node-1', [], {
    topicTemplate: '',
    messageTemplate: ''
  });
  const msgNode2 = new MqttMessageNode('node-2', [], {
    topicTemplate: 'hi.you',
    messageTemplate: '{{bar}} + {{foo}} + WHAT'
  });

  const throwErrorNode = new ThrowErrorNode('node-3', [], {
    messageTemplate: 'Something is wrong.'
  });

  before(() => {
    nodeRunner = NodeRunner(levelManager.keyValueStore, flowErrorManager, {}, {}, {
      sendMqttMessage, sendDebugMessage, sendStatsMessage, isConnectedToLosant
    });
  });

  afterEach(() => {
    resetFires();
    flowErrorManager.shutdown();
  });

  it('should properly limit flow error triggers', async () => {
    await flowErrorManager.initialize([{ triggerId: '5a6b563972a4998fc022ad6b-flowError' }], fakeFires);

    const nodeData = {
      triggers: [
        { type: 'timer', key: '1234', meta: { uiId: '3456' }, outputIds: [['node-1']] },
        { type: 'flowError', key: '5a6b563972a4998fc022ad6b-flowError', outputIds: [['node-2']] }
      ],
      nodes: {
        'node-1': msgNode,
        'node-2': msgNode2
      }
    };

    for (let i = 0; i < 15; i++) {
      // eslint-disable-next-line no-await-in-loop
      await fireTrigger(nodeData);
    }
    fires.length.should.equal(10);

    resetFires();
    for (let i = 0; i < 25; i++) {
      // eslint-disable-next-line no-await-in-loop
      await fireTrigger(nodeData);
      if (i === 9) { tk.travel(Number(new Date()) + 5000); }
    }
    fires.length.should.equal(20);
  });

  it('should correctly prevent error triggers from chaining off each other', async () => {
    await flowErrorManager.initialize([{ triggerId: '5a6b563972a4998fc022ad6b-flowError' }], fakeFires);
    const nodeData = {
      triggers: [
        { type: 'flowError', key: '5a6b563972a4998fc022ad6b-flowError', outputIds: [['node-1']] },
        { type: 'flowError', key: '5a6b563972a4998fc022ad6b-flowError', outputIds: [['node-2']] }
      ],
      nodes: {
        'node-1': msgNode,
        'node-2': msgNode2
      }
    };

    await fireTrigger(nodeData);
    fires.length.should.equal(0);
  });

  it('should correctly handle errors when payload has been ruined', async () => {
    await flowErrorManager.initialize([{ triggerId: '5a6b563972a4998fc022ad6b-flowError' }], fakeFires);
    const mutateNode = new MutateNode('node-3', [['node-1']], {
      rules: [
        { type: 'set', valueTemplate: null, destination: '.' }
      ]
    });
    const nodeData = {
      triggers: [
        { type: 'timer', key: '1234', outputIds: [['node-3']] },
        { type: 'flowError', key: '5a6b563972a4998fc022ad6b-flowError', outputIds: [['node-2']] }
      ],
      nodes: {
        'node-1': msgNode,
        'node-2': msgNode2,
        'node-3': mutateNode
      }
    };

    await fireTrigger(nodeData, { data: { replyId: 'hi' }, what: 'where' });
    fires.length.should.equal(1);
    fires[0].should.deepEqual(FiredTrigger({
      payload: {
        time: fires[0].payload.time,
        data: {
          erroredPayload: null,
          errorInfo: {
            nodeType: 'MqttMessageNode',
            nodeId: 'node-1',
            error: { name: 'ValidationError', message: 'A topic must be provided.' }
          },
          replyId: 'hi'
        }
      },
      triggerId: '5a6b563972a4998fc022ad6b-flowError',
      triggerType: 'flowError'
    }));
  });

  it('should correctly delete trigger config from state', async () => {
    await flowErrorManager.initialize([{ triggerId: '5a6b563972a4998fc022ad6b-flowError' }], fakeFires);

    const nodeData = {
      triggers: [
        { type: 'timer', key: '1234', meta: { uiId: '3456' }, outputIds: [['node-1']] },
        { type: 'flowError', key: '5a6b563972a4998fc022ad6b-flowError', outputIds: [['node-2']] }
      ],
      nodes: {
        'node-1': msgNode,
        'node-2': msgNode2
      }
    };
    await fireTrigger(nodeData);
    fires.length.should.equal(1);

    await flowErrorManager.update([]);
    resetFires();
    await fireTrigger(nodeData);
    fires.length.should.equal(0);
  });

  it('should correctly trigger when any workflow on the device errors', async () => {
    await flowErrorManager.initialize([{ triggerId: 'global-flowError' }], fakeFires);
    const nodeData = {
      triggers: [
        { type: 'timer', key: '1234', meta: { uiId: '3456' }, outputIds: [['node-1']] }
      ],
      nodes: {
        'node-1': msgNode,
        'node-2': msgNode2
      }
    };
    await fireTrigger(nodeData);
    fires.length.should.equal(1);
    fires[0].triggerId.should.equal('global-flowError');
  });

  it('should correctly fire both a local error trigger and a global one', async () => {
    const triggers1 = [
      { type: 'timer', key: '1234', meta: { uiId: '3456' }, outputIds: [['node-1']] },
      { type: 'flowError', key: '5a6b563972a4998fc022ad6b-flowError', outputIds: [['node-2']], config: {} }
    ];

    await flowErrorManager.initialize([{ triggerId: '5a6b563972a4998fc022ad6b-flowError' }, { triggerId: 'global-flowError' }], fakeFires);

    const nodeData = {
      id: '5a6b563972a4998fc022ad6b',
      name: 'flow1',
      triggers: triggers1,
      nodes: {
        'node-1': msgNode,
        'node-2': msgNode2
      },
      version: 'v1',
      versionId: '4a6b563972a4998fc022ad6b',
      minimumAgentVersion: '0.0.0'
    };

    await fireTrigger(nodeData);
    fires.length.should.equal(2);
    fires[0].triggerId.should.equal('5a6b563972a4998fc022ad6b-flowError');
    fires[1].triggerId.should.equal('global-flowError');
  });
  it('should correctly fire error triggers when throw error node is used', async () => {
    const triggers1 = [
      { type: 'timer', key: '1234', meta: { uiId: '3456' }, outputIds: [['node-3']] },
      { type: 'flowError', key: '5a6b563972a4998fc022ad6b-flowError', outputIds: [['node-2']], config: {} }
    ];

    await flowErrorManager.initialize([{ triggerId: '5a6b563972a4998fc022ad6b-flowError' }], fakeFires);

    const nodeData = {
      id: '5a6b563972a4998fc022ad6b',
      name: 'flow1',
      triggers: triggers1,
      nodes: {
        'node-3': throwErrorNode,
        'node-2': msgNode2
      },
      version: 'v1',
      versionId: '4a6b563972a4998fc022ad6b',
      minimumAgentVersion: '0.0.0'
    };

    await fireTrigger(nodeData);
    fires.length.should.equal(1);
    fires[0].payload.data.errorInfo.should.deepEqual({
      nodeType: 'ThrowErrorNode',
      nodeId: 'node-3',
      error: { name: 'ThrownError', message: 'Something is wrong.' }
    });
  });
});
