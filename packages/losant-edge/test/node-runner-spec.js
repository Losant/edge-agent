import { levelManager, stubLogger } from './common.js';
import { toString, omit } from 'omnibelt';
import CustomNodeCapNode from 'losant-nodes/src/custom-node-cap-node.js';
import DebugNode from 'losant-nodes/src/debug-node.js';
import DelayNode from 'losant-nodes/src/delay-node.js';
import NodeRunner from '../src/node-runner.js';
import WorkflowManager from '../src/workflow-manager.js';
import MqttMessageNode from '../src/nodes/mqtt-message-node.js';
import FiredTrigger from '../src/types/fired-trigger.js';
import FindTriggeredFlowsResponse from '../src/types/find-triggered-flows-response.js';
import agentEnvironment from '../src/lib/flow-env-vars.js';
import { AGENT_VERSION } from '../src/constants.js';
import { CustomNodeExecuteNode } from 'losant-nodes';
import { guardPath, guardFileReadPath, loadGuardedFile } from '../src/lib/protected-path-utils.js';
const agentVersion = AGENT_VERSION.version;

const debugMessages = [];
const mqttMessages = [];
const statsMessages = [];

const flowErrorManager = { fireOnError: () => { return; } };

const sendMqttMessage = async ({ brokerType, topic, message }) => {
  if (brokerType === 'losant') {
    mqttMessages.push({ topic, msg: toString(message) });
  }
};

const isConnectedToLosant = () => { return false; };

const sendDebugMessage = async (msg) => {
  debugMessages.push(msg);
};

const sendStatsMessage = async (msg) => {
  statsMessages.push(msg);
};

const getCurrentAgentConfig = () => { return {}; };
const getOtlpCollectorConfig = () => { return {}; };
let nodeRunner;
let workflowManager;

describe('Edge NodeRunner', function() {
  before(async function() {
    workflowManager = WorkflowManager({}, levelManager.globalStore);
    await workflowManager.initialize();
    nodeRunner = NodeRunner(levelManager.keyValueStore, flowErrorManager, {}, workflowManager,
      {
        sendMqttMessage,
        sendDebugMessage,
        sendStatsMessage,
        isConnectedToLosant,
        getCurrentAgentConfig,
        getOtlpCollectorConfig
      });
  });

  beforeEach(async function() {
    await nodeRunner.initialize();
    // reset these arrays
    debugMessages.length = 0;
    mqttMessages.length = 0;
    statsMessages.length = 0;
  });

  afterEach(async function() {
    await nodeRunner.shutdown();
  });


  it('should properly build basic context', () => {
    const result = nodeRunner.contextify({});

    omit(['runNodes', 'loadCustomNode', 'loadCredential'], result).should.deepEqual({
      kvStore: levelManager.keyValueStore,
      getCurrentAgentConfig,
      getOtlpCollectorConfig,
      sendMqttMessage,
      concurrent: {
        awaiting: [],
        count: 0
      },
      externalTimeout: 10000,
      maxConcurrentNodes: 5,
      maxFlowRunTime: 1000,
      gatewayConf: {},
      diskUtils: { guardPath, guardFileReadPath, loadGuardedFile }
    });
  });

  it('should properly build context for edge custom node', () => {
    const result = nodeRunner.contextify({ isCustomNode: true });
    omit(['runNodes', 'loadCustomNode', 'loadCredential'], result).should.deepEqual({
      kvStore: levelManager.keyValueStore,
      getCurrentAgentConfig,
      getOtlpCollectorConfig,
      sendMqttMessage,
      concurrent: {
        awaiting: [],
        count: 0
      },
      externalTimeout: 10000,
      maxConcurrentNodes: 5,
      maxFlowRunTime: 1000,
      gatewayConf: {},
      isCustomNode: true,
      diskUtils: { guardPath, guardFileReadPath, loadGuardedFile }
    });
  });

  it('should properly run a workflow', async () => {
    const msgNode = new MqttMessageNode('node-1', [['node-2', 'node-3']], {
      topicTemplate: 'foo/{{bar}}',
      messageTemplate: '{{bar}} + {{foo}} + WHAT'
    });

    const debugNode = new DebugNode('node-2', [], { message: 'Hello' });
    const debugNode2 = new DebugNode('node-3', [], { message: 'Goodbye' });

    const flowData = {
      debuggingEnabled: true,
      id: '5a6b563972a4998fc022ad6b',
      versionId: '5a6b569172a4998fc022ad6c',
      version: 'flowVersion',
      name: 'flowName',
      etag: '5a6b58e2fa016b90d970c97z',
      globals: {},
      triggers: [
        { type: 'mqttTopic', key: 'a/#', meta: { uiId: '3456' }, outputIds: [['node-1']] }
      ],
      nodes: {
        'node-1': msgNode,
        'node-2': debugNode,
        'node-3': debugNode2
      },
      minimumAgentVersion: '0.0.0'
    };

    const result = await nodeRunner.runFlows(
      FiredTrigger({
        triggerId: 'a/#',
        triggerType: 'mqttTopic',
        payload: { triggerId: 'a/specific/topic', foo: 'hi', bar: 'bye' }
      }),
      FindTriggeredFlowsResponse({
        flows: [flowData],
        device: {
          name: 'deviceName',
          id: '5a6b58e2fa016b90d970c97c',
          tags: { a: ['b'] },
          parentId: '5a6b58e2fa016b90d970c97d',
          attributes: [
            { name: 'a', dataType: 'number', attributeTags: { x: 'y' } }
          ],
          creationDate: '2022-07-29T13:22:27.296Z'
        },
        app: {
          name: 'appName',
          id: '5a6b58e2fa016b90d970c97b',
          globals: {}
        },
        peripherals: {}
      })
    );

    result.should.deepEqual({
      [flowData.id]: {
        errors: [],
        pathsCompleted: 2,
        wallTime: result[flowData.id].wallTime
      }
    });

    const expectedPayload = {
      applicationName: 'appName',
      applicationId: '5a6b58e2fa016b90d970c97b',
      deviceId: '5a6b58e2fa016b90d970c97c',
      device: {
        name: 'deviceName',
        id: '5a6b58e2fa016b90d970c97c',
        deviceId: '5a6b58e2fa016b90d970c97c',
        applicationId: '5a6b58e2fa016b90d970c97b',
        tags: { a: ['b'] },
        parentId: '5a6b58e2fa016b90d970c97d',
        attributes: {
          a: { name: 'a', dataType: 'number', attributeTags: { x: 'y' } }
        },
        creationDate: '2022-07-29T13:22:27.296Z',
        deviceClass: 'edgeCompute'
      },
      deviceTags: { a: ['b'] },
      deviceName: 'deviceName',
      bar: 'bye',
      flowId: flowData.id,
      flowName: flowData.name,
      flowVersion: flowData.version,
      foo: 'hi',
      globals: {},
      triggerId: 'a/specific/topic',
      triggerType: 'mqttTopic',
      isConnectedToLosant: false,
      agentEnvironment,
      agentVersion
    };

    mqttMessages.should.deepEqual([{ msg: 'bye + hi + WHAT', topic: 'foo/bye' }]);
    debugMessages.should.deepEqual([{
      etag: flowData.etag,
      flowId: flowData.id,
      flowVersion: flowData.version,
      flowVersionId: flowData.versionId,
      message: 'Hello',
      level: 'verbose',
      payload: expectedPayload,
      prevNodeDurations: [debugMessages[0].prevNodeDurations[0]],
      prevNodes: ['node-1'],
      runId: debugMessages[0].runId,
      sourceNode: 'node-2',
      time: debugMessages[0].time,
      runStart: debugMessages[0].runStart,
      triggerUiIds: ['3456']
    },
    {
      etag: '5a6b58e2fa016b90d970c97z',
      flowId: flowData.id,
      flowVersion: flowData.version,
      flowVersionId: flowData.versionId,
      message: 'Goodbye',
      level: 'verbose',
      payload: expectedPayload,
      prevNodeDurations: [debugMessages[1].prevNodeDurations[0]],
      prevNodes: ['node-1'],
      runId: debugMessages[1].runId,
      sourceNode: 'node-3',
      time: debugMessages[1].time,
      runStart: debugMessages[1].runStart,
      triggerUiIds: ['3456']
    }]);

    await nodeRunner.shutdown();

    statsMessages.should.deepEqual([[{
      flowId: flowData.id,
      flowVersionId: flowData.versionId,
      stats: {
        time: statsMessages[0][0].stats.time,
        runCount: 1,
        wallTime: statsMessages[0][0].stats.wallTime,
        pathsCompleted: 2
      }
    }]]);
  });

  it('should properly run a develop workflow', async () => {
    const msgNode = new MqttMessageNode('node-1', [['node-2', 'node-3']], {
      topicTemplate: 'foo/{{bar}}',
      messageTemplate: '{{bar}} + {{foo}} + WHAT'
    });

    const debugNode = new DebugNode('node-2', [], { message: 'Hello' });
    const debugNode2 = new DebugNode('node-3', [], { message: 'Goodbye' });

    const flowData = {
      debuggingEnabled: true,
      id: '5a6b563972a4998fc022ad6b',
      versionId: '5a6b563972a4998fc022ad6b',
      version: 'develop',
      name: 'flowName',
      etag: '5a6b58e2fa016b90d970c97z',
      globals: {},
      triggers: [
        { type: 'mqttTopic', key: 'a/#', meta: { uiId: '3456' }, outputIds: [['node-1']] }
      ],
      nodes: {
        'node-1': msgNode,
        'node-2': debugNode,
        'node-3': debugNode2
      },
      minimumAgentVersion: '0.0.0'
    };

    await nodeRunner.runFlows(
      FiredTrigger({
        triggerId: 'a/#',
        triggerType: 'mqttTopic',
        payload: { triggerId: 'a/specific/topic', foo: 'honk', bar: 'bonk' }
      }),
      FindTriggeredFlowsResponse({
        flows: [flowData],
        device: {
          name: 'deviceName',
          id: '5a6b58e2fa016b90d970c97c',
          tags: { a: ['b'] },
          parentId: '5a6b58e2fa016b90d970c97d',
          attributes: [
            { name: 'a', dataType: 'number', attributeTags: { x: 'y' } }
          ],
          creationDate: '2022-07-29T13:22:27.296Z'
        },
        app: {
          name: 'appName',
          id: '5a6b58e2fa016b90d970c97b',
          globals: {}
        },
        peripherals: {}
      })
    );

    const result = await nodeRunner.runFlows(
      FiredTrigger({
        triggerId: 'a/#',
        triggerType: 'mqttTopic',
        payload: { triggerId: 'a/specific/topic', foo: 'hi', bar: 'bye' }
      }),
      FindTriggeredFlowsResponse({
        flows: [flowData],
        device: {
          name: 'deviceName',
          id: '5a6b58e2fa016b90d970c97c',
          tags: { a: ['b'] },
          parentId: '5a6b58e2fa016b90d970c97d',
          attributes: [
            { name: 'a', dataType: 'number', attributeTags: { x: 'y' } }
          ],
          creationDate: '2022-07-29T13:22:27.296Z'
        },
        app: {
          name: 'appName',
          id: '5a6b58e2fa016b90d970c97b',
          globals: {}
        },
        peripherals: {}
      })
    );

    result.should.deepEqual({
      [flowData.id]: {
        errors: [],
        pathsCompleted: 2,
        wallTime: result[flowData.id].wallTime
      }
    });

    const getExpectedPayload = ({ foo, bar }) => {
      return {
        applicationName: 'appName',
        applicationId: '5a6b58e2fa016b90d970c97b',
        deviceId: '5a6b58e2fa016b90d970c97c',
        device: {
          name: 'deviceName',
          id: '5a6b58e2fa016b90d970c97c',
          deviceId: '5a6b58e2fa016b90d970c97c',
          applicationId: '5a6b58e2fa016b90d970c97b',
          tags: { a: ['b'] },
          parentId: '5a6b58e2fa016b90d970c97d',
          attributes: {
            a: { name: 'a', dataType: 'number', attributeTags: { x: 'y' } }
          },
          creationDate: '2022-07-29T13:22:27.296Z',
          deviceClass: 'edgeCompute'
        },
        deviceTags: { a: ['b'] },
        deviceName: 'deviceName',
        bar,
        flowId: flowData.id,
        flowName: flowData.name,
        flowVersion: flowData.version,
        foo,
        globals: {},
        triggerId: 'a/specific/topic',
        triggerType: 'mqttTopic',
        isConnectedToLosant: false,
        agentEnvironment,
        agentVersion
      };
    };

    mqttMessages.should.deepEqual([{ msg: 'bonk + honk + WHAT', topic: 'foo/bonk' }, { msg: 'bye + hi + WHAT', topic: 'foo/bye' }]);
    debugMessages.length.should.equal(4);
    debugMessages[0].should.deepEqual({
      flowId: flowData.id,
      flowVersion: flowData.version,
      flowVersionId: flowData.versionId,
      etag: flowData.etag,
      message: 'Hello',
      level: 'verbose',
      payload: getExpectedPayload({ foo: 'honk', bar: 'bonk' }),
      prevNodeDurations: [debugMessages[0].prevNodeDurations[0]],
      prevNodes: ['node-1'],
      runId: debugMessages[0].runId,
      sourceNode: 'node-2',
      time: debugMessages[0].time,
      runStart: debugMessages[0].runStart,
      triggerUiIds: ['3456']
    });
    debugMessages[1].should.deepEqual({
      etag: '5a6b58e2fa016b90d970c97z',
      flowId: flowData.id,
      flowVersion: flowData.version,
      flowVersionId: flowData.versionId,
      message: 'Goodbye',
      level: 'verbose',
      payload: getExpectedPayload({ foo: 'honk', bar: 'bonk' }),
      prevNodeDurations: [debugMessages[1].prevNodeDurations[0]],
      prevNodes: ['node-1'],
      runId: debugMessages[1].runId,
      sourceNode: 'node-3',
      time: debugMessages[1].time,
      runStart: debugMessages[1].runStart,
      triggerUiIds: ['3456']
    });
    debugMessages[2].should.deepEqual({
      etag: '5a6b58e2fa016b90d970c97z',
      flowId: flowData.id,
      flowVersion: flowData.version,
      flowVersionId: flowData.versionId,
      message: 'Hello',
      level: 'verbose',
      payload: getExpectedPayload({ foo: 'hi', bar: 'bye' }),
      prevNodeDurations: [debugMessages[2].prevNodeDurations[0]],
      prevNodes: ['node-1'],
      runId: debugMessages[2].runId,
      sourceNode: 'node-2',
      time: debugMessages[2].time,
      runStart: debugMessages[2].runStart,
      triggerUiIds: ['3456']
    });
    debugMessages[3].should.deepEqual({
      etag: '5a6b58e2fa016b90d970c97z',
      flowId: flowData.id,
      flowVersion: flowData.version,
      flowVersionId: flowData.versionId,
      message: 'Goodbye',
      level: 'verbose',
      payload: getExpectedPayload({ foo: 'hi', bar: 'bye' }),
      prevNodeDurations: [debugMessages[3].prevNodeDurations[0]],
      prevNodes: ['node-1'],
      runId: debugMessages[3].runId,
      sourceNode: 'node-3',
      time: debugMessages[3].time,
      runStart: debugMessages[3].runStart,
      triggerUiIds: ['3456']
    });

    await nodeRunner.shutdown();

    statsMessages.should.deepEqual([[{
      flowId: flowData.id,
      flowVersionId: flowData.versionId,
      stats: {
        time: statsMessages[0][0].stats.time,
        runCount: 2,
        wallTime: statsMessages[0][0].stats.wallTime,
        pathsCompleted: 4
      }
    }]]);
  });

  it('should properly run a develop custom node', async () => {
    const msgNode = new MqttMessageNode('node-1', [['node-2']], {
      topicTemplate: 'foo/{{bar}}',
      messageTemplate: '{{bar}} + {{foo}} + WHAT'
    });

    const debugNode = new DebugNode('node-2', [['exrWDKuMpm']], { message: 'Hello' });
    const debugNode2 = new DebugNode('node-3', [['exrWDKuMpm']], { message: 'Goodbye' });
    const customNodeCap = new CustomNodeCapNode('exrWDKuMpm', [], { branchIndexTemplate: '{{what}}', resultSourcePath: 'hello' });

    const flowData = {
      debuggingEnabled: true,
      id: '5a6b563972a4998fc022ad6b',
      versionId: '5a6b563972a4998fc022ad6c',
      version: 'develop',
      flowClass: 'customNode',
      name: 'flowName',
      etag: '5a6b58e2fa016b90d970c97z',
      globals: {},
      triggers: [
        {
          type: 'customNodeStart',
          meta: {
            category: 'trigger', name: 'customNodeStart', label: 'Start: CustomNode1', x: 260, y: 180, uiId: 'SywHdN5P6W', description: 'The custom node fires here ...'
          },
          config: {},
          key: 'customNodeStart',
          outputIds: [['node-1', 'node-3']]
        }
      ],
      nodes: {
        'node-1': msgNode,
        'node-2': debugNode,
        'node-3': debugNode2,
        'exrWDKuMpm': customNodeCap
      },
      minimumAgentVersion: '1.41.0'
    };

    await nodeRunner.runFlows(
      FiredTrigger({
        triggerId: 'customNodeStart',
        triggerType: 'customNodeStart',
        payload: { triggerId: 'a/specific/topic', foo: 'honk', bar: 'bonk' }
      }),
      FindTriggeredFlowsResponse({
        flows: [flowData],
        device: {
          name: 'deviceName',
          id: '5a6b58e2fa016b90d970c97c',
          tags: { a: ['b'] },
          parentId: '5a6b58e2fa016b90d970c97d',
          attributes: [
            { name: 'a', dataType: 'number', attributeTags: { x: 'y' } }
          ],
          creationDate: '2022-07-29T13:22:27.296Z'
        },
        app: {
          name: 'appName',
          id: '5a6b58e2fa016b90d970c97b',
          globals: {}
        },
        peripherals: {}
      })
    );

    const result = await nodeRunner.runFlows(
      FiredTrigger({
        triggerId: 'customNodeStart',
        triggerType: 'customNodeStart',
        payload: { triggerId: 'a/specific/topic', foo: 'hi', bar: 'bye' }
      }),
      FindTriggeredFlowsResponse({
        flows: [flowData],
        device: {
          name: 'deviceName',
          id: '5a6b58e2fa016b90d970c97c',
          tags: { a: ['b'] },
          parentId: '5a6b58e2fa016b90d970c97d',
          attributes: [
            { name: 'a', dataType: 'number', attributeTags: { x: 'y' } }
          ],
          creationDate: '2022-07-29T13:22:27.296Z'
        },
        app: {
          name: 'appName',
          id: '5a6b58e2fa016b90d970c97b',
          globals: {}
        },
        peripherals: {}
      })
    );

    result.should.deepEqual({
      [flowData.id]: {
        errors: [],
        pathsCompleted: 2,
        wallTime: result[flowData.id].wallTime
      }
    });

    const getExpectedPayload = ({ foo, bar }) => {
      return {
        applicationName: 'appName',
        applicationId: '5a6b58e2fa016b90d970c97b',
        deviceId: '5a6b58e2fa016b90d970c97c',
        device: {
          name: 'deviceName',
          id: '5a6b58e2fa016b90d970c97c',
          deviceId: '5a6b58e2fa016b90d970c97c',
          applicationId: '5a6b58e2fa016b90d970c97b',
          tags: { a: ['b'] },
          parentId: '5a6b58e2fa016b90d970c97d',
          attributes: {
            a: { name: 'a', dataType: 'number', attributeTags: { x: 'y' } }
          },
          creationDate: '2022-07-29T13:22:27.296Z',
          deviceClass: 'edgeCompute'
        },
        deviceTags: { a: ['b'] },
        deviceName: 'deviceName',
        bar,
        customNodeId: flowData.id,
        customNodeName: flowData.name,
        customNodeVersion: flowData.version,
        foo,
        triggerId: 'a/specific/topic',
        triggerType: 'customNodeStart',
        isConnectedToLosant: false,
        agentEnvironment,
        agentVersion
      };
    };

    mqttMessages.should.deepEqual([{ msg: 'bonk + honk + WHAT', topic: 'foo/bonk' }, { msg: 'bye + hi + WHAT', topic: 'foo/bye' }]);
    debugMessages.length.should.equal(4);
    debugMessages.sort();
    debugMessages[0].should.deepEqual({
      flowId: flowData.id,
      flowVersion: flowData.version,
      flowVersionId: flowData.versionId,
      etag: flowData.etag,
      message: 'Goodbye',
      level: 'verbose',
      payload: getExpectedPayload({ foo: 'honk', bar: 'bonk' }),
      prevNodeDurations: [],
      prevNodes: [],
      runId: debugMessages[0].runId,
      sourceNode: 'node-3',
      time: debugMessages[0].time,
      runStart: debugMessages[0].runStart,
      triggerUiIds: ['SywHdN5P6W']
    });
    debugMessages[1].should.deepEqual({
      etag: '5a6b58e2fa016b90d970c97z',
      flowId: flowData.id,
      flowVersion: flowData.version,
      flowVersionId: flowData.versionId,
      message: 'Hello',
      level: 'verbose',
      payload: getExpectedPayload({ foo: 'honk', bar: 'bonk' }),
      prevNodeDurations: [debugMessages[1].prevNodeDurations[0]],
      prevNodes: ['node-1'],
      runId: debugMessages[1].runId,
      sourceNode: 'node-2',
      time: debugMessages[1].time,
      runStart: debugMessages[1].runStart,
      triggerUiIds: ['SywHdN5P6W']
    });
    debugMessages[2].should.deepEqual({
      etag: '5a6b58e2fa016b90d970c97z',
      flowId: flowData.id,
      flowVersion: flowData.version,
      flowVersionId: flowData.versionId,
      message: 'Goodbye',
      level: 'verbose',
      payload: getExpectedPayload({ foo: 'hi', bar: 'bye' }),
      prevNodeDurations: [],
      prevNodes: [],
      runId: debugMessages[2].runId,
      sourceNode: 'node-3',
      time: debugMessages[2].time,
      runStart: debugMessages[2].runStart,
      triggerUiIds: ['SywHdN5P6W']
    });
    debugMessages[3].should.deepEqual({
      etag: '5a6b58e2fa016b90d970c97z',
      flowId: flowData.id,
      flowVersion: flowData.version,
      flowVersionId: flowData.versionId,
      message: 'Hello',
      level: 'verbose',
      payload: getExpectedPayload({ foo: 'hi', bar: 'bye' }),
      prevNodeDurations: [debugMessages[3].prevNodeDurations[0]],
      prevNodes: ['node-1'],
      runId: debugMessages[3].runId,
      sourceNode: 'node-2',
      time: debugMessages[3].time,
      runStart: debugMessages[3].runStart,
      triggerUiIds: ['SywHdN5P6W']
    });

    await nodeRunner.shutdown();

    statsMessages.should.deepEqual([[{
      flowId: flowData.id,
      flowVersionId: flowData.versionId,
      stats: {
        time: statsMessages[0][0].stats.time,
        runCount: 2,
        wallTime: statsMessages[0][0].stats.wallTime,
        pathsCompleted: 4
      }
    }]]);
  });

  it('should properly run a flow that references an edge custom node', async () => {
    const customNode = new CustomNodeExecuteNode('ex-ecn', [['node-3']], { customNodeId: '5a6b563972a4998fc022ad7c', customNodeVersion: 'honk' });

    const debugNode = new DebugNode('node-2', [], { message: 'Hello' });
    const debugNode2 = new DebugNode('node-3', [], { message: 'Goodbye' });

    const flowData = {
      debuggingEnabled: true,
      customNodeDebug: true,
      id: '5a6b563972a4998fc022ad6b',
      versionId: '5a6b569172a4998fc022ad6c',
      version: 'flowVersion',
      name: 'flowName',
      etag: '5a6b58e2fa016b90d970c97z',
      globals: {},
      triggers: [
        { type: 'mqttTopic', key: 'a/#', meta: { uiId: '3456' }, outputIds: [['ex-ecn', 'node-2']] }
      ],
      nodes: {
        'ex-ecn': customNode,
        'node-2': debugNode,
        'node-3': debugNode2
      },
      minimumAgentVersion: '1.41.0'
    };

    const application = { name: 'aName', id: '5a6b58e2fa016b90d970c97c', globals: { global1: 1, global2: 2 } };
    const device = {
      name: 'dName',
      id: '5a6b58e2fa016b90d970c97d',
      tags: { tag1: ['val1', 'val2' ] },
      parentId: '5a6b58e2fa016b90d970c97e',
      creationDate: '2022-07-29T00:32:34.181Z',
      attributes: [
        {
          name: 'num1',
          dataType: 'number',
          attributeTags: {
            attrTag1: 'aVal1'
          }
        },
        {
          name: 'blob2',
          dataType: 'blob',
          attributeTags: {
            attrTag2: 'aVal2'
          },
          contentType: 'text/plain'
        }
      ]
    };

    await workflowManager.applyFlowMessage({
      time: Date.now(),
      mode: 'partial',
      application,
      device,
      flows: {
        '5a6b563972a4998fc022ad7c-honk': {
          name: 'ecnName1',
          globals: {},
          version: 'honk',
          versionId: '4a6b563972a4998fc022ad7d',
          flowClass: 'customNode',
          minimumAgentVersion: '1.41.0',
          triggers: [{
            type: 'customNodeStart',
            key: 'customNodeStart',
            meta: { uiId: 'SywHdN5P6W' },
            outputIds: [['node-1']]
          }],
          nodes: [{
            type: 'CustomNodeCapNode',
            meta: {
              category: 'customNodeEnd', name: 'custom-node-end-single', label: 'Output', x: 260, y: 480, description: 'End the custom node run'
            },
            config: { branchIndexTemplate: 0, resultSourcePath: '' },
            id: 'exrWDKuMpm',
            outputIds: []
          },
          {
            config: {
              topicTemplate: 'foo/bar',
              messageTemplate: 'HELLO WHAT'
            },
            type: 'MqttMessageNode',
            outputIds: [['ecn-debug']],
            id: 'node-1'
          },
          {
            type: 'DebugNode',
            meta: {},
            config: { message: 'i am in the matrix' },
            outputIds: [['exrWDKuMpm']],
            id: 'ecn-debug'
          }],
          customNodeConfig: {
            outputCount: 1,
            resultMode: 'optional',
            fields: [
              { type: 'checkbox', id: 'f-checkbox', defaultValue: true, label: 'l0' },
              { type: 'select', id: 'f-select', defaultValue: 'zero', options: [{ value: 'zero', label: 'ZERO!' }], label: 'l1' },
              { type: 'stringTemplate', id: 'f-string', defaultValue: 'hi', validRegExp: '.*h.*', label: 'l2' },
              {
                type: 'numberTemplate', id: 'f-number', defaultValue: 1, validMin: 0, validMax: 2, label: 'l3'
              },
              { type: 'jsonTemplate', id: 'f-json', defaultValue: '{}', label: 'l4' },
              { type: 'section', id: 'f-section', label: 'l6' }
            ]
          }
        }
      }
    });
    const time = new Date();

    const result = await nodeRunner.runFlows(
      FiredTrigger({
        triggerId: 'a/#',
        triggerType: 'mqttTopic',
        payload: { triggerId: 'a/specific/topic', foo: 'hi', bar: 'bye', time }
      }),
      FindTriggeredFlowsResponse({
        flows: [flowData],
        device: {
          name: 'deviceName',
          id: '5a6b58e2fa016b90d970c97c',
          tags: { a: ['b'] },
          parentId: '5a6b58e2fa016b90d970c97d',
          attributes: [
            { name: 'a', dataType: 'number', attributeTags: { x: 'y' } }
          ],
          creationDate: '2022-07-29T13:22:27.296Z'
        },
        app: {
          name: 'appName',
          id: '5a6b58e2fa016b90d970c97b',
          globals: {}
        },
        peripherals: {}
      })
    );
    result.should.deepEqual({
      [flowData.id]: {
        errors: [],
        pathsCompleted: 2,
        wallTime: result[flowData.id].wallTime
      }
    });
    mqttMessages.should.deepEqual([{ msg: 'HELLO WHAT', topic: 'foo/bar' }]);
    debugMessages.length.should.equal(3);
    debugMessages.sort();

    const getExpectedPayload = ({ foo='hi', bar='bye' }) => {
      return {
        applicationName: 'appName',
        applicationId: '5a6b58e2fa016b90d970c97b',
        deviceId: '5a6b58e2fa016b90d970c97c',
        device: {
          name: 'deviceName',
          id: '5a6b58e2fa016b90d970c97c',
          deviceId: '5a6b58e2fa016b90d970c97c',
          applicationId: '5a6b58e2fa016b90d970c97b',
          tags: { a: ['b'] },
          parentId: '5a6b58e2fa016b90d970c97d',
          attributes: {
            a: { name: 'a', dataType: 'number', attributeTags: { x: 'y' } }
          },
          creationDate: '2022-07-29T13:22:27.296Z',
          deviceClass: 'edgeCompute'
        },
        deviceTags: { a: ['b'] },
        deviceName: 'deviceName',
        bar,
        flowId: flowData.id,
        flowName: flowData.name,
        flowVersion: flowData.version,
        foo,
        globals: {},
        triggerId: 'a/specific/topic',
        triggerType: 'mqttTopic',
        isConnectedToLosant: false,
        agentEnvironment,
        agentVersion,
        time
      };
    };
    debugMessages[0].should.deepEqual({
      flowId: flowData.id,
      flowVersion: flowData.version,
      flowVersionId: flowData.versionId,
      etag: flowData.etag,
      message: 'Hello',
      level: 'verbose',
      payload: getExpectedPayload({}),
      prevNodeDurations: [],
      prevNodes: [],
      runId: debugMessages[0].runId,
      sourceNode: 'node-2',
      time: debugMessages[0].time,
      runStart: debugMessages[0].runStart,
      triggerUiIds: ['3456']
    });
    debugMessages[1].should.deepEqual({
      etag: '5a6b58e2fa016b90d970c97z',
      flowId: flowData.id,
      flowVersion: flowData.version,
      flowVersionId: flowData.versionId,
      message: 'i am in the matrix',
      level: 'verbose',
      payload: {
        customNodeId: '5a6b563972a4998fc022ad7c',
        customNodeName: 'ecnName1',
        customNodeVersion: 'honk',
        applicationId: '5a6b58e2fa016b90d970c97b',
        data: {
          'f-checkbox': true,
          'f-json': {},
          'f-number': 1,
          'f-select': 'zero',
          'f-string': 'hi'
        },
        time,
        triggerId: 'customNodeStart',
        triggerType: 'customNodeStart'
      },
      prevNodeDurations: [],
      prevNodes: [],
      runId: debugMessages[1].runId,
      sourceNode: 'ex-ecn',
      time: debugMessages[1].time,
      runStart: debugMessages[1].runStart,
      triggerUiIds: ['3456'],
      error: undefined,
      customNode: {
        customNodeId: '5a6b563972a4998fc022ad7c',
        customNodeVersion: 'honk',
        customNodeVersionId: '4a6b563972a4998fc022ad7d',
        prevNodeDurations: debugMessages[1].customNode.prevNodeDurations,
        prevNodes: [
          'node-1',
          'ecn-debug'
        ],
        sourceNode: 'ecn-debug'
      }
    });
    debugMessages[2].should.deepEqual({
      etag: '5a6b58e2fa016b90d970c97z',
      flowId: flowData.id,
      flowVersion: flowData.version,
      flowVersionId: flowData.versionId,
      message: 'Goodbye',
      level: 'verbose',
      payload: getExpectedPayload({}),
      prevNodeDurations: debugMessages[2].prevNodeDurations,
      prevNodes: ['ex-ecn'],
      runId: debugMessages[2].runId,
      sourceNode: 'node-3',
      time: debugMessages[2].time,
      runStart: debugMessages[2].runStart,
      triggerUiIds: ['3456']
    });

    await nodeRunner.shutdown();

    statsMessages.should.deepEqual([[{
      flowId: '5a6b563972a4998fc022ad7c',
      flowVersionId: '4a6b563972a4998fc022ad7d',
      stats: {
        pathsCompleted: 1,
        runCount: 1,
        time: statsMessages[0][0].stats.time,
        wallTime: statsMessages[0][0].stats.wallTime
      }
    }, {
      flowId: flowData.id,
      flowVersionId: flowData.versionId,
      stats: {
        time: statsMessages[0][1].stats.time,
        runCount: 1,
        wallTime: statsMessages[0][1].stats.wallTime,
        pathsCompleted: 2
      }
    }]]);
  });

  it('should properly run a flow that references an edge instance custom node', async () => {
    const customNode = new CustomNodeExecuteNode('ex-ecn', [['node-3']], { customNodeId: '5a6b563972a4998fc022ad7c', isInstance: 'true' });

    const debugNode = new DebugNode('node-2', [], { message: 'Hello' });
    const debugNode2 = new DebugNode('node-3', [], { message: 'Goodbye' });

    const flowData = {
      debuggingEnabled: true,
      customNodeDebug: true,
      id: '5a6b563972a4998fc022ad6b',
      versionId: '5a6b569172a4998fc022ad6c',
      version: 'flowVersion',
      name: 'flowName',
      etag: '5a6b58e2fa016b90d970c97z',
      globals: {},
      triggers: [
        { type: 'mqttTopic', key: 'a/#', meta: { uiId: '3456' }, outputIds: [['ex-ecn', 'node-2']] }
      ],
      nodes: {
        'ex-ecn': customNode,
        'node-2': debugNode,
        'node-3': debugNode2
      },
      minimumAgentVersion: '1.46.0'
    };

    const application = { name: 'aName', id: '5a6b58e2fa016b90d970c97c', globals: { global1: 1, global2: 2 } };
    const device = {
      name: 'dName',
      id: '5a6b58e2fa016b90d970c97d',
      tags: { tag1: ['val1', 'val2' ] },
      parentId: '5a6b58e2fa016b90d970c97e',
      creationDate: '2022-07-29T00:32:34.181Z',
      attributes: [
        {
          name: 'num1',
          dataType: 'number',
          attributeTags: {
            attrTag1: 'aVal1'
          }
        },
        {
          name: 'blob2',
          dataType: 'blob',
          attributeTags: {
            attrTag2: 'aVal2'
          },
          contentType: 'text/plain'
        }
      ]
    };

    await workflowManager.applyFlowMessage({
      time: Date.now(),
      mode: 'partial',
      application,
      device,
      flows: {
        'instance-5a6b563972a4998fc022ad7c': {
          name: 'ecnName1',
          globals: {},
          version: 'honk',
          flowClass: 'instanceCustomNode',
          minimumAgentVersion: '1.46.0',
          triggers: [{
            type: 'customNodeStart',
            key: 'customNodeStart',
            meta: { uiId: 'SywHdN5P6W' },
            outputIds: [['node-1']]
          }],
          nodes: [{
            type: 'CustomNodeCapNode',
            meta: {
              category: 'customNodeEnd', name: 'custom-node-end-single', label: 'Output', x: 260, y: 480, description: 'End the custom node run'
            },
            config: { branchIndexTemplate: 0, resultSourcePath: '' },
            id: 'exrWDKuMpm',
            outputIds: []
          },
          {
            config: {
              topicTemplate: 'foo/bar',
              messageTemplate: 'HELLO WHAT'
            },
            type: 'MqttMessageNode',
            outputIds: [['ecn-debug']],
            id: 'node-1'
          },
          {
            type: 'DebugNode',
            meta: {},
            config: { message: 'i am in the matrix' },
            outputIds: [['exrWDKuMpm']],
            id: 'ecn-debug'
          }],
          customNodeConfig: {
            outputCount: 1,
            resultMode: 'optional',
            fields: [
              { type: 'checkbox', id: 'f-checkbox', defaultValue: true, label: 'l0' },
              { type: 'select', id: 'f-select', defaultValue: 'zero', options: [{ value: 'zero', label: 'ZERO!' }], label: 'l1' },
              { type: 'stringTemplate', id: 'f-string', defaultValue: 'hi', validRegExp: '.*h.*', label: 'l2' },
              {
                type: 'numberTemplate', id: 'f-number', defaultValue: 1, validMin: 0, validMax: 2, label: 'l3'
              },
              { type: 'jsonTemplate', id: 'f-json', defaultValue: '{}', label: 'l4' },
              { type: 'section', id: 'f-section', label: 'l6' }
            ]
          }
        }
      }
    });
    const time = new Date();

    const result = await nodeRunner.runFlows(
      FiredTrigger({
        triggerId: 'a/#',
        triggerType: 'mqttTopic',
        payload: { triggerId: 'a/specific/topic', foo: 'hi', bar: 'bye', time }
      }),
      FindTriggeredFlowsResponse({
        flows: [flowData],
        device: {
          name: 'deviceName',
          id: '5a6b58e2fa016b90d970c97c',
          tags: { a: ['b'] },
          parentId: '5a6b58e2fa016b90d970c97d',
          attributes: [
            { name: 'a', dataType: 'number', attributeTags: { x: 'y' } }
          ],
          creationDate: '2022-07-29T13:22:27.296Z'
        },
        app: {
          name: 'appName',
          id: '5a6b58e2fa016b90d970c97b',
          globals: {}
        },
        peripherals: {}
      })
    );
    result.should.deepEqual({
      [flowData.id]: {
        errors: [],
        pathsCompleted: 2,
        wallTime: result[flowData.id].wallTime
      }
    });
    mqttMessages.should.deepEqual([{ msg: 'HELLO WHAT', topic: 'foo/bar' }]);
    debugMessages.length.should.equal(2);
    debugMessages.sort();

    const getExpectedPayload = ({ foo='hi', bar='bye' }) => {
      return {
        applicationName: 'appName',
        applicationId: '5a6b58e2fa016b90d970c97b',
        deviceId: '5a6b58e2fa016b90d970c97c',
        device: {
          name: 'deviceName',
          id: '5a6b58e2fa016b90d970c97c',
          deviceId: '5a6b58e2fa016b90d970c97c',
          applicationId: '5a6b58e2fa016b90d970c97b',
          tags: { a: ['b'] },
          parentId: '5a6b58e2fa016b90d970c97d',
          attributes: {
            a: { name: 'a', dataType: 'number', attributeTags: { x: 'y' } }
          },
          creationDate: '2022-07-29T13:22:27.296Z',
          deviceClass: 'edgeCompute'
        },
        deviceTags: { a: ['b'] },
        deviceName: 'deviceName',
        bar,
        flowId: flowData.id,
        flowName: flowData.name,
        flowVersion: flowData.version,
        foo,
        globals: {},
        triggerId: 'a/specific/topic',
        triggerType: 'mqttTopic',
        isConnectedToLosant: false,
        agentEnvironment,
        agentVersion,
        time
      };
    };
    debugMessages[0].should.deepEqual({
      flowId: flowData.id,
      flowVersion: flowData.version,
      flowVersionId: flowData.versionId,
      etag: flowData.etag,
      message: 'Hello',
      level: 'verbose',
      payload: getExpectedPayload({}),
      prevNodeDurations: [],
      prevNodes: [],
      runId: debugMessages[0].runId,
      sourceNode: 'node-2',
      time: debugMessages[0].time,
      runStart: debugMessages[0].runStart,
      triggerUiIds: ['3456']
    });
    debugMessages[1].should.deepEqual({
      etag: '5a6b58e2fa016b90d970c97z',
      flowId: flowData.id,
      flowVersion: flowData.version,
      flowVersionId: flowData.versionId,
      message: 'Goodbye',
      level: 'verbose',
      payload: getExpectedPayload({}),
      prevNodeDurations: debugMessages[1].prevNodeDurations,
      prevNodes: ['ex-ecn'],
      runId: debugMessages[1].runId,
      sourceNode: 'node-3',
      time: debugMessages[1].time,
      runStart: debugMessages[1].runStart,
      triggerUiIds: ['3456']
    });

    await nodeRunner.shutdown();

    statsMessages.should.deepEqual([[{
      flowId: '5a6b563972a4998fc022ad7c',
      flowVersionId: 'instance',
      stats: {
        pathsCompleted: 1,
        runCount: 1,
        time: statsMessages[0][0].stats.time,
        wallTime: statsMessages[0][0].stats.wallTime
      }
    }, {
      flowId: flowData.id,
      flowVersionId: flowData.versionId,
      stats: {
        time: statsMessages[0][1].stats.time,
        runCount: 1,
        wallTime: statsMessages[0][1].stats.wallTime,
        pathsCompleted: 2
      }
    }]]);
  });

  it('should correctly not send edge custom node debug messages when custom node debugging is off', async () => {
    const customNode = new CustomNodeExecuteNode('ex-ecn', [['node-3']], { customNodeId: '5a6b563972a4998fc022ad7c', customNodeVersion: 'honk' });

    const debugNode = new DebugNode('node-2', [], { message: 'Hello' });
    const debugNode2 = new DebugNode('node-3', [], { message: 'Goodbye' });

    const flowData = {
      debuggingEnabled: true,
      customNodeDebug: false,
      id: '5a6b563972a4998fc022ad6b',
      versionId: '5a6b569172a4998fc022ad6c',
      version: 'flowVersion',
      name: 'flowName',
      etag: '5a6b58e2fa016b90d970c97z',
      globals: {},
      triggers: [
        { type: 'mqttTopic', key: 'a/#', meta: { uiId: '3456' }, outputIds: [['ex-ecn', 'node-2']] }
      ],
      nodes: {
        'ex-ecn': customNode,
        'node-2': debugNode,
        'node-3': debugNode2
      },
      minimumAgentVersion: '1.41.0'
    };

    const application = { name: 'aName', id: '5a6b58e2fa016b90d970c97c', globals: { global1: 1, global2: 2 } };
    const device = {
      name: 'dName',
      id: '5a6b58e2fa016b90d970c97d',
      tags: { tag1: ['val1', 'val2' ] },
      parentId: '5a6b58e2fa016b90d970c97e',
      creationDate: '2022-07-29T00:32:34.181Z',
      attributes: [
        {
          name: 'num1',
          dataType: 'number',
          attributeTags: {
            attrTag1: 'aVal1'
          }
        },
        {
          name: 'blob2',
          dataType: 'blob',
          attributeTags: {
            attrTag2: 'aVal2'
          },
          contentType: 'text/plain'
        }
      ]
    };

    await workflowManager.applyFlowMessage({
      time: Date.now(),
      mode: 'partial',
      application,
      device,
      flows: {
        '5a6b563972a4998fc022ad7c-honk': {
          name: 'ecnName1',
          globals: {},
          version: 'honk',
          versionId: '4a6b563972a4998fc022ad7d',
          flowClass: 'customNode',
          minimumAgentVersion: '1.41.0',
          triggers: [{
            type: 'customNodeStart',
            key: 'customNodeStart',
            meta: { uiId: 'SywHdN5P6W' },
            outputIds: [['node-1']]
          }],
          nodes: [{
            type: 'CustomNodeCapNode',
            meta: {
              category: 'customNodeEnd', name: 'custom-node-end-single', label: 'Output', x: 260, y: 480, description: 'End the custom node run'
            },
            config: { branchIndexTemplate: 0, resultSourcePath: '' },
            id: 'exrWDKuMpm',
            outputIds: []
          },
          {
            config: {
              topicTemplate: 'foo/bar',
              messageTemplate: 'HELLO WHAT'
            },
            type: 'MqttMessageNode',
            outputIds: [['ecn-debug']],
            id: 'node-1'
          },
          {
            type: 'DebugNode',
            meta: {},
            config: { message: 'i am in the matrix' },
            outputIds: [['exrWDKuMpm']],
            id: 'ecn-debug'
          }],
          customNodeConfig: {
            outputCount: 1,
            resultMode: 'optional',
            fields: [
              { type: 'checkbox', id: 'f-checkbox', defaultValue: true, label: 'l0' },
              { type: 'select', id: 'f-select', defaultValue: 'zero', options: [{ value: 'zero', label: 'ZERO!' }], label: 'l1' },
              { type: 'stringTemplate', id: 'f-string', defaultValue: 'hi', validRegExp: '.*h.*', label: 'l2' },
              {
                type: 'numberTemplate', id: 'f-number', defaultValue: 1, validMin: 0, validMax: 2, label: 'l3'
              },
              { type: 'jsonTemplate', id: 'f-json', defaultValue: '{}', label: 'l4' },
              { type: 'section', id: 'f-section', label: 'l6' }
            ]
          }
        }
      }
    });
    const time = new Date();

    const result = await nodeRunner.runFlows(
      FiredTrigger({
        triggerId: 'a/#',
        triggerType: 'mqttTopic',
        payload: { triggerId: 'a/specific/topic', foo: 'hi', bar: 'bye', time }
      }),
      FindTriggeredFlowsResponse({
        flows: [flowData],
        device: {
          name: 'deviceName',
          id: '5a6b58e2fa016b90d970c97c',
          tags: { a: ['b'] },
          parentId: '5a6b58e2fa016b90d970c97d',
          attributes: [
            { name: 'a', dataType: 'number', attributeTags: { x: 'y' } }
          ],
          creationDate: '2022-07-29T13:22:27.296Z'
        },
        app: {
          name: 'appName',
          id: '5a6b58e2fa016b90d970c97b',
          globals: {}
        },
        peripherals: {}
      })
    );
    result.should.deepEqual({
      [flowData.id]: {
        errors: [],
        pathsCompleted: 2,
        wallTime: result[flowData.id].wallTime
      }
    });
    mqttMessages.should.deepEqual([{ msg: 'HELLO WHAT', topic: 'foo/bar' }]);
    debugMessages.length.should.equal(2);
    debugMessages.sort();

    const getExpectedPayload = ({ foo='hi', bar='bye' }) => {
      return {
        applicationName: 'appName',
        applicationId: '5a6b58e2fa016b90d970c97b',
        deviceId: '5a6b58e2fa016b90d970c97c',
        device: {
          name: 'deviceName',
          id: '5a6b58e2fa016b90d970c97c',
          deviceId: '5a6b58e2fa016b90d970c97c',
          applicationId: '5a6b58e2fa016b90d970c97b',
          tags: { a: ['b'] },
          parentId: '5a6b58e2fa016b90d970c97d',
          attributes: {
            a: { name: 'a', dataType: 'number', attributeTags: { x: 'y' } }
          },
          creationDate: '2022-07-29T13:22:27.296Z',
          deviceClass: 'edgeCompute'
        },
        deviceTags: { a: ['b'] },
        deviceName: 'deviceName',
        bar,
        flowId: flowData.id,
        flowName: flowData.name,
        flowVersion: flowData.version,
        foo,
        globals: {},
        triggerId: 'a/specific/topic',
        triggerType: 'mqttTopic',
        isConnectedToLosant: false,
        agentEnvironment,
        agentVersion,
        time
      };
    };
    debugMessages[0].should.deepEqual({
      flowId: flowData.id,
      flowVersion: flowData.version,
      flowVersionId: flowData.versionId,
      etag: flowData.etag,
      message: 'Hello',
      level: 'verbose',
      payload: getExpectedPayload({}),
      prevNodeDurations: [],
      prevNodes: [],
      runId: debugMessages[0].runId,
      sourceNode: 'node-2',
      time: debugMessages[0].time,
      runStart: debugMessages[0].runStart,
      triggerUiIds: ['3456']
    });

    debugMessages[1].should.deepEqual({
      etag: '5a6b58e2fa016b90d970c97z',
      flowId: flowData.id,
      flowVersion: flowData.version,
      flowVersionId: flowData.versionId,
      message: 'Goodbye',
      level: 'verbose',
      payload: getExpectedPayload({}),
      prevNodeDurations: debugMessages[1].prevNodeDurations,
      prevNodes: ['ex-ecn'],
      runId: debugMessages[1].runId,
      sourceNode: 'node-3',
      time: debugMessages[1].time,
      runStart: debugMessages[1].runStart,
      triggerUiIds: ['3456']
    });
  });

  it('should do nothing on no trigger match', async () => {
    const flowData = {
      debuggingEnabled: true,
      id: '5a6b563972a4998fc022ad6b',
      versionId: '5a6b569172a4998fc022ad6c',
      version: 'flowVersion',
      name: 'flowName',
      globals: {},
      triggers: [{ type: 'timer', key: '1234', meta: { uiId: '3456' }, outputIds: [['node-1']] }],
      nodes: {},
      minimumAgentVersion: '0.0.0'
    };

    const result = await nodeRunner.runFlows(
      FiredTrigger({
        triggerType: 'timer',
        triggerId: 'notAnId',
        payload: { foo: 'hi', bar: 'bye' }
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

    result.should.deepEqual({
      [flowData.id]: {
        errors: [],
        pathsCompleted: 0,
        wallTime: result[flowData.id].wallTime
      }
    });

    await nodeRunner.shutdown();

    statsMessages.should.deepEqual([[{
      flowId: flowData.id,
      flowVersionId: flowData.versionId,
      stats: {
        time: statsMessages[0][0].stats.time,
        runCount: 1,
        wallTime: statsMessages[0][0].stats.wallTime,
        pathsCompleted: 0
      }
    }]]);
  });

  it('should log the deployed flow version when the requested version does not match', async () => {
    const loggerCalls = stubLogger(['warn']);
    const flowData = {
      debuggingEnabled: true,
      id: '5a6b563972a4998fc022ad6b',
      versionId: '5a6b569172a4998fc022ad6c',
      version: 'flowVersion',
      name: 'flowName',
      globals: {},
      triggers: [{ type: 'timer', key: '1234', meta: { uiId: '3456' }, outputIds: [['node-1']] }],
      nodes: {},
      minimumAgentVersion: '0.0.0'
    };

    const result = await nodeRunner.runFlows(
      FiredTrigger({
        triggerType: 'timer',
        triggerId: '1234',
        payload: { flowVersion: 'otherVersion' }
      }),
      FindTriggeredFlowsResponse({
        flows: [flowData],
        device: { name: 'deviceName', id: '5a6b58e2fa016b90d970c97c', tags: {} },
        app: { name: 'appName', id: '5a6b58e2fa016b90d970c97b', globals: {} },
        peripherals: {}
      })
    );

    result[flowData.id].errors.should.deepEqual([]);
    result[flowData.id].pathsCompleted.should.equal(0);
    loggerCalls.should.deepEqual([[
      'warn',
      'Requested workflow version is not deployed to this agent:',
      { requested: 'otherVersion', actual: 'flowVersion' }
    ]]);
  });

  it('should correctly error on missing node', async () => {
    const flowData = {
      debuggingEnabled: false,
      id: '5a6b563972a4998fc022ad6b',
      versionId: '5a6b569172a4998fc022ad6c',
      version: 'flowVersion',
      name: 'flowName',
      globals: {},
      triggers: [{ type: 'timer', key: '1234', meta: { uiId: '3456' }, outputIds: [['node-1']] }],
      nodes: {},
      minimumAgentVersion: '0.0.0'
    };

    const result = await nodeRunner.runFlows(
      FiredTrigger({
        triggerType: 'timer',
        triggerId: '1234',
        payload: { foo: 'hi', bar: 'bye' }
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

    result.should.deepEqual({
      [flowData.id]: {
        errors: [ {
          error: { message: 'Missing Node ID node-1', name: 'MissingNodeError' },
          nodeId: 'node-1'
        } ],
        pathsCompleted: 0,
        wallTime: result[flowData.id].wallTime
      }
    });

    // no debug messages cause debugging is not enabled
    debugMessages.should.deepEqual([]);

    await nodeRunner.shutdown();

    statsMessages.should.deepEqual([[{
      flowId: flowData.id,
      flowVersionId: flowData.versionId,
      stats: {
        time: statsMessages[0][0].stats.time,
        runCount: 1,
        wallTime: statsMessages[0][0].stats.wallTime,
        pathsCompleted: 0,
        pathsFailed: 1,
        errors: [
          {
            nodeId: 'node-1',
            error: { name: 'MissingNodeError', message: 'Missing Node ID node-1' }
          }
        ]
      }
    }]]);
  });

  it('should properly timeout a workflow', async () => {
    const delayNode = new DelayNode('node-1', [['node-2', 'node-3']], {
      delay: 5
    });

    const debugNode = new DebugNode('node-2', [], { message: 'Hello' });
    const debugNode2 = new DebugNode('node-3', [], { message: 'Goodbye' });

    const flowData = {
      debuggingEnabled: true,
      id: '5a6b563972a4998fc022ad6b',
      versionId: '5a6b569172a4998fc022ad6c',
      version: 'flowVersion',
      name: 'flowName',
      etag: '5a6b58e2fa016b90d970c97z',
      globals: {},
      triggers: [
        { type: 'timer', key: '1234', meta: { uiId: '3456' }, outputIds: [['node-1']] }
      ],
      nodes: {
        'node-1': delayNode,
        'node-2': debugNode,
        'node-3': debugNode2
      },
      minimumAgentVersion: '0.0.0'
    };

    const result = await nodeRunner.runFlows(
      FiredTrigger({
        triggerId: '1234',
        triggerType: 'timer',
        payload: { foo: 'hi', bar: 'bye' }
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

    result.should.deepEqual({
      [flowData.id]: {
        errors: [{
          nodeId: null,
          error: { name: 'FlowTimeoutError', message: 'Timeout running workflow' }
        }],
        pathsCompleted: 0,
        wallTime: result[flowData.id].wallTime
      }
    });

    const expectedPayload = {
      applicationName: 'appName',
      applicationId: '5a6b58e2fa016b90d970c97b',
      deviceId: '5a6b58e2fa016b90d970c97c',
      device: {
        name: 'deviceName',
        id: '5a6b58e2fa016b90d970c97c',
        deviceId: '5a6b58e2fa016b90d970c97c',
        applicationId: '5a6b58e2fa016b90d970c97b',
        tags: {},
        attributes: {},
        deviceClass: 'edgeCompute'
      },
      deviceTags: {},
      deviceName: 'deviceName',
      bar: 'bye',
      flowId: flowData.id,
      flowName: flowData.name,
      flowVersion: flowData.version,
      foo: 'hi',
      globals: {},
      triggerId: '1234',
      triggerType: 'timer',
      isConnectedToLosant: false,
      agentEnvironment,
      agentVersion
    };

    debugMessages.should.deepEqual([{
      error: { name: 'FlowTimeoutError', message: 'Timeout running workflow' },
      level: 'fatal',
      flowId: flowData.id,
      flowVersion: flowData.version,
      flowVersionId: flowData.versionId,
      etag: flowData.etag,
      message: 'Error running workflow',
      payload: expectedPayload,
      prevNodeDurations: [],
      prevNodes: [],
      runId: debugMessages[0].runId,
      time: debugMessages[0].time,
      runStart: debugMessages[0].runStart,
      triggerUiIds: ['3456']
    }]);

    await nodeRunner.shutdown();

    statsMessages.should.deepEqual([[{
      flowId: flowData.id,
      flowVersionId: flowData.versionId,
      stats: {
        time: statsMessages[0][0].stats.time,
        runCount: 1,
        wallTime: statsMessages[0][0].stats.wallTime,
        pathsCompleted: 0,
        pathsFailed: 1,
        errors: [{
          error: { name: 'FlowTimeoutError', message: 'Timeout running workflow' }
        }]
      }
    }]]);
  });

  it('should properly timeout a custom node and report it correctly to flow', async () => {
    const customNode = new CustomNodeExecuteNode('ex-ecn', [['node-3']], { customNodeId: '5a6b563972a4998fc022ad7c', customNodeVersion: 'honk' });
    const debugNode = new DebugNode('node-2', [], { message: 'Hello' });
    const debugNode2 = new DebugNode('node-3', [], { message: 'Goodbye' });

    const flowData = {
      debuggingEnabled: true,
      id: '5a6b563972a4998fc022ad6b',
      versionId: '5a6b569172a4998fc022ad6c',
      version: 'flowVersion',
      name: 'flowName',
      etag: '5a6b58e2fa016b90d970c97z',
      globals: {},
      triggers: [
        { type: 'timer', key: '1234', meta: { uiId: '3456' }, outputIds: [['node-1']] }
      ],
      nodes: {
        'node-1': customNode,
        'node-2': debugNode,
        'node-3': debugNode2
      },
      minimumAgentVersion: '1.41.0'
    };

    const application = { name: 'aName', id: '5a6b58e2fa016b90d970c97c', globals: { global1: 1, global2: 2 } };
    const device = {
      name: 'dName',
      id: '5a6b58e2fa016b90d970c97d',
      tags: { tag1: ['val1', 'val2' ] },
      parentId: '5a6b58e2fa016b90d970c97e',
      creationDate: '2022-07-29T00:32:34.181Z',
      attributes: [
        {
          name: 'num1',
          dataType: 'number',
          attributeTags: {
            attrTag1: 'aVal1'
          }
        },
        {
          name: 'blob2',
          dataType: 'blob',
          attributeTags: {
            attrTag2: 'aVal2'
          },
          contentType: 'text/plain'
        }
      ]
    };

    await workflowManager.applyFlowMessage({
      time: Date.now(),
      mode: 'partial',
      application,
      device,
      flows: {
        '5a6b563972a4998fc022ad7c-honk': {
          name: 'ecnName1',
          globals: {},
          version: 'honk',
          versionId: '4a6b563972a4998fc022ad7d',
          flowClass: 'customNode',
          minimumAgentVersion: '1.41.0',
          triggers: [{
            type: 'customNodeStart',
            key: 'customNodeStart',
            meta: { uiId: 'SywHdN5P6W' },
            outputIds: [['node-1']]
          }],
          nodes: [{
            type: 'CustomNodeCapNode',
            meta: {
              category: 'customNodeEnd', name: 'custom-node-end-single', label: 'Output', x: 260, y: 480, description: 'End the custom node run'
            },
            config: { branchIndexTemplate: 0, resultSourcePath: '' },
            id: 'exrWDKuMpm',
            outputIds: []
          },
          {
            config: { delay: 5 },
            type: 'DelayNode',
            outputIds: [['ecn-debug']],
            id: 'node-1'
          },
          {
            type: 'DebugNode',
            meta: {},
            config: { message: 'i am in the matrix' },
            outputIds: [['exrWDKuMpm']],
            id: 'ecn-debug'
          }],
          customNodeConfig: {
            outputCount: 1,
            resultMode: 'optional',
            fields: []
          }
        }
      }
    });

    const result = await nodeRunner.runFlows(
      FiredTrigger({
        triggerId: '1234',
        triggerType: 'timer',
        payload: { foo: 'hi', bar: 'bye' }
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

    const err = result[flowData.id].errors[0];

    err.should.be.oneOf([
      { nodeId: 'node-1', error: { name: 'CustomNodeTimeoutError', message: 'Timeout running custom node' } },
      { nodeId: null, error: { name: 'FlowTimeoutError', message: 'Timeout running workflow' } }
    ]);

    result.should.deepEqual({
      [flowData.id]: {
        errors: [err],
        pathsCompleted: 0,
        wallTime: result[flowData.id].wallTime
      }
    });
  });
});
