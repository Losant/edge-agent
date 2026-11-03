import { levelManager, sinon, pathToDiskFlows, should } from './common.js';
import MqttMessageNode from '../src/nodes/mqtt-message-node.js';
import DebugNode from 'losant-nodes/src/debug-node.js';
import CustomNodeExecuteNode from 'losant-nodes/src/custom-node-execute-node.js';
import TimerConfigs from '../src/types/timer-configs.js';
import FlowsResponse from '../src/types/flows-response.js';
import FindTriggeredFlowsResponse from '../src/types/find-triggered-flows-response.js';
import FlowsMessage from '../src/types/flows-message.js';
import SubscriptionConfigs from '../src/types/subscription-configs.js';
import path from 'node:path';
import WorkflowManager from '../src/workflow-manager.js';
import logger from '../src/logger/index.js';
import { defer } from 'omnibelt';

describe('Edge Workflow Manager', function() {

  it('should properly apply flow messages', async () => {
    const workflowManager = WorkflowManager({}, levelManager.globalStore);
    let result = workflowManager.findTriggeredFlows({
      triggerId: 'myTriggerId',
      triggerType: 'timer'
    });
    should(result).be.undefined();

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
    const triggers = [{
      type: 'timer',
      key: '1234',
      meta: { uiId: '3456' },
      config: { seconds: 10 },
      outputIds: [['node-1']]
    }];

    result = await workflowManager.applyFlowMessage({
      time: Date.now(),
      mode: 'complete',
      application,
      device,
      flows: {
        '5a6b563972a4998fc022ad6b': {
          name: 'fName1',
          globals: { global1: -1, global3: 3 },
          triggers,
          nodes: [{
            id: 'node-1',
            type: 'MqttMessageNode',
            config: { topicTemplate: '1', messageTemplate: '2' }
          }],
          version: 'vName1',
          versionId: '4a6b563972a4998fc022ad6b',
          minimumAgentVersion: '0.0.0',
          etag: 'v1etag'
        },
        '5a6b563972a4998fc022ad6c': {
          name: 'fName2',
          globals: { global1: -2, global3: 4 },
          triggers: [],
          nodes: [],
          version: 'vName2',
          versionId: '4a6b563972a4998fc022ad6c',
          minimumAgentVersion: '99.99.99',
          etag: 'v2etag'
        },
        '5a6b563972a4998fc022ad6d': null,
        '5a6b563972a4998fc022ad6e': {
          name: 'fName3',
          globals: { },
          triggers: [],
          nodes: [],
          version: 'vName3',
          versionId: '4a6b563972a4998fc022ad6c',
          minimumAgentVersion: '0.0.1',
          etag: 'honk'
        },
        '5a6b563972a4998fc022ad6f': {
          name: 'fName4',
          globals: { },
          triggers: [],
          nodes: [],
          version: 'vName4',
          versionId: '4a6b563972a4998fc022ad6d',
          minimumAgentVersion: '0.0.2',
          etag: 'bonk'
        }
      }
    });

    result.should.deepEqual({
      flowsResponse: FlowsResponse({
        '5a6b563972a4998fc022ad6b': { previousVersion: null, newVersion: 'vName1', newEtag: 'v1etag' },
        '5a6b563972a4998fc022ad6c': {
          previousVersion: null,
          newVersion: null,
          attemptedVersion: 'vName2',
          attemptedEtag: 'v2etag',
          error: 'Unable to update workflow, failed agent requirement'
        },
        '5a6b563972a4998fc022ad6d': { previousVersion: null, newVersion: null },
        '5a6b563972a4998fc022ad6e': { previousVersion: null, newVersion: 'vName3', newEtag: 'honk' },
        '5a6b563972a4998fc022ad6f': { previousVersion: null, newVersion: 'vName4', newEtag: 'bonk' }
      }),
      deviceChanged: true,
      appChanged: true
    });

    workflowManager.timerInfo.should.deepEqual(TimerConfigs([{
      timerId: '1234',
      cron: undefined,
      seconds: 10,
      tz: undefined
    }]));

    workflowManager.findTriggeredFlows({
      triggerId: '1234',
      triggerType: 'timer'
    }).should.deepEqual(FindTriggeredFlowsResponse({
      app: application,
      device,
      peripherals: {},
      flows: [{
        id: '5a6b563972a4998fc022ad6b',
        name: 'fName1',
        globals: { global1: -1, global2: 2, global3: 3 },
        triggers,
        nodes: {
          'node-1': new MqttMessageNode('node-1', undefined, {
            topicTemplate: '1',
            messageTemplate: '2'
          })
        },
        version: 'vName1',
        versionId: '4a6b563972a4998fc022ad6b',
        debuggingEnabled: false,
        customNodeDebug: false,
        etag: 'v1etag',
        minimumAgentVersion: '0.0.0'
      }]
    }));

    await workflowManager.applyDebugMessage({
      '5a6b563972a4998fc022ad6f': true,
      '5a6b563972a4998fc022ad6b': true
    });

    let storedVal = await levelManager.globalStore.get('workflowStore', FlowsMessage);
    storedVal.should.deepEqual(FlowsMessage({
      time: storedVal.time,
      mode: 'complete',
      application,
      device,
      debugging: {
        '5a6b563972a4998fc022ad6b': true,
        '5a6b563972a4998fc022ad6f': true
      },
      flows: {
        '5a6b563972a4998fc022ad6b': {
          name: 'fName1',
          globals: { global1: -1, global3: 3 },
          triggers,
          nodes: [{
            id: 'node-1',
            type: 'MqttMessageNode',
            config: { topicTemplate: '1', messageTemplate: '2' }
          }],
          version: 'vName1',
          versionId: '4a6b563972a4998fc022ad6b',
          etag: 'v1etag',
          minimumAgentVersion: '0.0.0'
        },
        '5a6b563972a4998fc022ad6e': {
          name: 'fName3',
          globals: {},
          triggers: [],
          nodes: [],
          version: 'vName3',
          versionId: '4a6b563972a4998fc022ad6c',
          minimumAgentVersion: '0.0.1',
          etag: 'honk'
        },
        '5a6b563972a4998fc022ad6f': {
          name: 'fName4',
          globals: { },
          triggers: [],
          nodes: [],
          version: 'vName4',
          versionId: '4a6b563972a4998fc022ad6d',
          minimumAgentVersion: '0.0.2',
          etag: 'bonk'
        }
      }
    }));

    result = await workflowManager.applyFlowMessage({
      time: Date.now(),
      mode: 'partial',
      device,
      flows: {}
    });
    storedVal = await levelManager.globalStore.get('workflowStore', FlowsMessage);
    storedVal.application.should.deepEqual(FlowsMessage({ application }).application);
    result.should.deepEqual({
      flowsResponse: FlowsResponse({ }),
      deviceChanged: false,
      appChanged: false
    });

    const newApp = { name: 'aNewName', id: '5a6b58e2fa016b90d970c97c', globals: { global1: 1, global2: true } };
    result = await workflowManager.applyFlowMessage({
      time: Date.now(),
      mode: 'partial',
      application: newApp,
      flows: {
        '5a6b563972a4998fc022ad6e': null,
        '5a6b563972a4998fc022ad6b': {
          name: 'fName1',
          globals: { global1: -2, global3: 3 },
          triggers,
          nodes: [{ id: 'node-1', type: 'DebugNode', config: { } }],
          version: 'vName1-changed',
          versionId: '6a6b563972a4998fc022ad6b',
          etag: 'honkibonki',
          minimumAgentVersion: '0.0.0'
        },
        '5a6b563972a4998fc022ad6f': {
          name: 'fName4-changed',
          globals: {},
          triggers: [],
          nodes: [],
          version: 'vName4-changed',
          etag: 'honkhonk',
          versionId: '4a6b563972a4998fc022ad6d',
          minimumAgentVersion: '99.0.2'
        }
      }
    });

    result.should.deepEqual({
      flowsResponse: FlowsResponse({
        '5a6b563972a4998fc022ad6e': { previousVersion: 'vName3', newVersion: null, previousEtag: 'honk' },
        '5a6b563972a4998fc022ad6b': { previousVersion: 'vName1', newVersion: 'vName1-changed', newEtag: 'honkibonki', previousEtag: 'v1etag' },
        '5a6b563972a4998fc022ad6f': {
          previousVersion: 'vName4',
          newEtag: 'bonk',
          previousEtag: 'bonk',
          newVersion: 'vName4',
          attemptedVersion: 'vName4-changed',
          attemptedEtag: 'honkhonk',
          error: 'Unable to update workflow, failed agent requirement'
        }
      }),
      deviceChanged: false,
      appChanged: true
    });

    workflowManager.findTriggeredFlows({
      triggerId: '1234',
      triggerType: 'timer'
    }).should.deepEqual(FindTriggeredFlowsResponse({
      app: newApp,
      device: device,
      peripherals: {},
      flows: [{
        id: '5a6b563972a4998fc022ad6b',
        name: 'fName1',
        globals: { global1: -2, global2: true, global3: 3 },
        triggers,
        nodes: { 'node-1': new DebugNode('node-1', undefined, { }) },
        version: 'vName1-changed',
        versionId: '6a6b563972a4998fc022ad6b',
        debuggingEnabled: true,
        customNodeDebug: false,
        etag: 'honkibonki',
        minimumAgentVersion: '0.0.0'
      }]
    }));

    await workflowManager.applyDebugMessage({
      '5a6b563972a4998fc022ad6b': false
    });

    workflowManager.findTriggeredFlows({
      triggerId: '1234',
      triggerType: 'timer'
    }).should.deepEqual(FindTriggeredFlowsResponse({
      app: newApp,
      device: device,
      peripherals: {},
      flows: [{
        id: '5a6b563972a4998fc022ad6b',
        name: 'fName1',
        globals: { global1: -2, global2: true, global3: 3 },
        triggers,
        nodes: { 'node-1': new DebugNode('node-1', undefined, { }) },
        version: 'vName1-changed',
        versionId: '6a6b563972a4998fc022ad6b',
        debuggingEnabled: false,
        customNodeDebug: false,
        etag: 'honkibonki',
        minimumAgentVersion: '0.0.0'
      }]
    }));

    storedVal = await levelManager.globalStore.get('workflowStore', FlowsMessage);
    storedVal.should.deepEqual(FlowsMessage({
      time: storedVal.time,
      mode: 'complete',
      application: newApp,
      device,
      debugging: { '5a6b563972a4998fc022ad6f': true },
      flows: {
        '5a6b563972a4998fc022ad6b': {
          name: 'fName1',
          globals: { global1: -2, global3: 3 },
          triggers,
          nodes: [{
            id: 'node-1',
            type: 'DebugNode',
            config: { }
          }],
          version: 'vName1-changed',
          versionId: '6a6b563972a4998fc022ad6b',
          minimumAgentVersion: '0.0.0',
          etag: 'honkibonki'
        },
        '5a6b563972a4998fc022ad6f': {
          name: 'fName4',
          globals: { },
          triggers: [],
          nodes: [],
          version: 'vName4',
          versionId: '4a6b563972a4998fc022ad6d',
          minimumAgentVersion: '0.0.2',
          etag: 'bonk'
        }
      }
    }));
  });

  it('should properly apply flow messages for develop flow deployments', async () => {
    const workflowManager = WorkflowManager({}, levelManager.globalStore);
    let result = workflowManager.findTriggeredFlows({
      triggerId: 'myTriggerId',
      triggerType: 'timer'
    });
    should(result).be.undefined();

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
    const triggers = [{
      type: 'timer',
      key: '1234',
      meta: { uiId: '3456' },
      config: { seconds: 10 },
      outputIds: [['node-1']]
    }];

    result = await workflowManager.applyFlowMessage({
      time: Date.now(),
      mode: 'complete',
      application,
      device,
      flows: {
        '5a6b563972a4998fc022ad6b': {
          name: 'fName1',
          globals: { global1: -1, global3: 3 },
          triggers,
          nodes: [{
            id: 'node-1',
            type: 'MqttMessageNode',
            config: { topicTemplate: '1', messageTemplate: '2' }
          }],
          version: 'develop',
          versionId: null,
          etag: '484-yGOvktDbjOnoUKNVxPuDyMIYD0c',
          minimumAgentVersion: '1.39.0'
        },
        '5a6b563972a4998fc022ad6c': {
          name: 'fName2',
          globals: { global1: -2, global3: 4 },
          triggers: [],
          nodes: [],
          version: 'vName2',
          etag: '484-yGOvktDbjOnoUKNVxPuDyMIYD0d',
          versionId: '4a6b563972a4998fc022ad6c',
          minimumAgentVersion: '99.99.99'
        },
        '5a6b563972a4998fc022ad6d': null,
        '5a6b563972a4998fc022ad6e': {
          name: 'fName3',
          globals: {},
          triggers: [],
          nodes: [],
          version: 'vName3',
          etag: '484-yGOvktDbjOnoUKNVxPuDyMIYD0f',
          versionId: '4a6b563972a4998fc022ad6c',
          minimumAgentVersion: '0.0.1'
        },
        '5a6b563972a4998fc022ad6f': {
          name: 'fName4',
          globals: {},
          triggers: [],
          nodes: [],
          version: 'vName4',
          etag: '484-yGOvktDbjOnoUKNVxPuDyMIYD0g',
          versionId: '4a6b563972a4998fc022ad6d',
          minimumAgentVersion: '0.0.2'
        }
      }
    });

    result.should.deepEqual({
      appChanged: true,
      deviceChanged: true,
      flowsResponse: FlowsResponse({
        '5a6b563972a4998fc022ad6b': { previousVersion: null, newVersion: 'develop', newEtag: '484-yGOvktDbjOnoUKNVxPuDyMIYD0c' },
        '5a6b563972a4998fc022ad6c': {
          previousVersion: null,
          newVersion: null,
          attemptedVersion: 'vName2',
          attemptedEtag: '484-yGOvktDbjOnoUKNVxPuDyMIYD0d',
          error: 'Unable to update workflow, failed agent requirement'
        },
        '5a6b563972a4998fc022ad6d': { previousVersion: null, newVersion: null },
        '5a6b563972a4998fc022ad6e': { previousVersion: null, newVersion: 'vName3', newEtag: '484-yGOvktDbjOnoUKNVxPuDyMIYD0f' },
        '5a6b563972a4998fc022ad6f': { previousVersion: null, newVersion: 'vName4', newEtag: '484-yGOvktDbjOnoUKNVxPuDyMIYD0g' }
      })
    });
  });

  it('should properly apply flow messages with an edge custom node', async () => {
    const workflowManager = WorkflowManager({}, levelManager.globalStore);

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
    const triggers = [{
      type: 'timer',
      key: '1234',
      meta: { uiId: '3456' },
      config: { seconds: 10 },
      outputIds: [['node-1']]
    }];
    const result = await workflowManager.applyFlowMessage({
      time: Date.now(),
      mode: 'complete',
      application,
      device,
      flows: {
        '5a6b563972a4998fc022ad6b': {
          name: 'fName1',
          globals: { global1: -1, global3: 3 },
          triggers,
          nodes: [{
            id: 'node-1',
            type: 'CustomNodeExecuteNode',
            config: { customNodeId: '5a6b563972a4998fc022ad7c', customNodeVersion: 'honk' }
          }],
          version: 'vName1',
          versionId: '4a6b563972a4998fc022ad6b',
          minimumAgentVersion: '1.41.0',
          etag: 'v1etag'
        },
        '5a6b563972a4998fc022ad7c-honk': {
          name: 'ecnName1',
          version: 'honk',
          globals: {},
          versionId: '4a6b563972a4998fc022ad7d',
          minimumAgentVersion: '1.41.0',
          triggers: [{
            type: 'customNodeStart',
            key: 'customNodeStart',
            meta: { uiId: 'SywHdN5P6W' },
            outputIds: [['exrWDKuMpm']]
          }],
          nodes: [{
            type: 'CustomNodeCapNode',
            meta: {
              category: 'customNodeEnd', name: 'custom-node-end-single', label: 'Output', x: 260, y: 480, description: 'End the custom node run'
            },
            config: { branchIndexTemplate: 0, resultSourcePath: '' },
            id: 'exrWDKuMpm',
            outputIds: [['lix4s7lQmZ']]
          }, {
            type: 'DelayNode',
            meta: {
              category: 'logic', name: 'delay', label: 'Delay', x: 260, y: 320, description: ''
            },
            config: { delay: '0' },
            id: 'lix4s7lQmZ',
            outputIds: []
          }]
        }
      }
    });
    result.should.deepEqual({
      flowsResponse: FlowsResponse({
        '5a6b563972a4998fc022ad6b': { previousVersion: null, newVersion: 'vName1', newEtag: 'v1etag' }
      }),
      deviceChanged: true,
      appChanged: true
    });

    workflowManager.timerInfo.should.deepEqual(TimerConfigs([{
      timerId: '1234',
      cron: undefined,
      seconds: 10,
      tz: undefined
    }]));

    workflowManager.findTriggeredFlows({
      triggerId: '1234',
      triggerType: 'timer'
    }).should.deepEqual(FindTriggeredFlowsResponse({
      app: application,
      device,
      peripherals: {},
      flows: [{
        id: '5a6b563972a4998fc022ad6b',
        name: 'fName1',
        globals: { global1: -1, global2: 2, global3: 3 },
        triggers,
        nodes: {
          'node-1': new CustomNodeExecuteNode('node-1', undefined, {
            customNodeId: '5a6b563972a4998fc022ad7c',
            customNodeVersion: 'honk',
            fields: {},
            resultPath: undefined,
            customNode: undefined
          })
        },
        version: 'vName1',
        versionId: '4a6b563972a4998fc022ad6b',
        debuggingEnabled: false,
        customNodeDebug: false,
        etag: 'v1etag',
        minimumAgentVersion: '1.41.0'
      }]
    }));

    await workflowManager.applyDebugMessage({
      '5a6b563972a4998fc022ad6b': true
    });

    const storedVal = await levelManager.globalStore.get('workflowStore', FlowsMessage);
    storedVal.should.deepEqual(FlowsMessage({
      time: storedVal.time,
      mode: 'complete',
      application,
      device,
      debugging: {
        '5a6b563972a4998fc022ad6b': true
      },
      flows: {
        '5a6b563972a4998fc022ad6b': {
          name: 'fName1',
          globals: { global1: -1, global3: 3 },
          triggers,
          nodes: [{
            id: 'node-1',
            type: 'CustomNodeExecuteNode',
            config: { customNodeId: '5a6b563972a4998fc022ad7c', customNodeVersion: 'honk' }
          }],
          version: 'vName1',
          versionId: '4a6b563972a4998fc022ad6b',
          etag: 'v1etag',
          minimumAgentVersion: '1.41.0'
        },
        '5a6b563972a4998fc022ad7c-honk': {
          minimumAgentVersion: '1.41.0',
          name: 'ecnName1',
          globals: {},
          nodes: [{
            type: 'CustomNodeCapNode',
            meta: {
              category: 'customNodeEnd', name: 'custom-node-end-single', label: 'Output', x: 260, y: 480, description: 'End the custom node run'
            },
            config: { branchIndexTemplate: 0, resultSourcePath: '' },
            id: 'exrWDKuMpm',
            outputIds: [['lix4s7lQmZ']]
          }, {
            type: 'DelayNode',
            meta: {
              category: 'logic', name: 'delay', label: 'Delay', x: 260, y: 320, description: ''
            },
            config: { delay: '0' },
            id: 'lix4s7lQmZ',
            outputIds: []
          }],
          triggers: [{
            key: 'customNodeStart',
            meta: { uiId: 'SywHdN5P6W' },
            outputIds: [['exrWDKuMpm']],
            type: 'customNodeStart'
          }],
          version: 'honk',
          versionId: '4a6b563972a4998fc022ad7d'
        }
      }
    }));
  });

  it('should properly initialize store', async () => {
    const workflowManager = WorkflowManager({}, levelManager.globalStore);
    await workflowManager.initialize();

    let result = workflowManager.findTriggeredFlows({
      triggerId: 'aTimerKey',
      triggerType: 'timer'
    });
    should(result).be.undefined();

    workflowManager.timerInfo.should.deepEqual(TimerConfigs([]));

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
    const triggers = [
      {
        type: 'timer',
        key: 'aTimerKey',
        meta: { uiId: '3456' },
        config: { seconds: 10 },
        outputIds: [['node-2']]
      },
      {
        type: 'mqttTopic',
        key: 'foo/bar/hello',
        meta: { uiId: '0000' },
        config: { },
        outputIds: [['node-2']]
      },
      {
        type: 'deviceCommand',
        key: 'deviceCommand',
        meta: { uiId: '1111' },
        config: { },
        outputIds: [['node-2']]
      }
    ];

    await levelManager.globalStore.set('workflowStore', {
      mode: 'complete',
      application,
      device,
      debugging: { '5a6b563972a4998fc022ad6f': true },
      flows: {
        '5a6b563972a4998fc022ad6f': {
          name: 'fName4',
          globals: { },
          triggers,
          nodes: [],
          version: 'vName4',
          versionId: '4a6b563972a4998fc022ad6d',
          minimumAgentVersion: '0.0.2'
        }
      }
    });

    await workflowManager.initialize();

    result = workflowManager.findTriggeredFlows({
      triggerId: 'aTimerKey',
      triggerType: 'timer'
    });
    result.should.deepEqual(FindTriggeredFlowsResponse({
      flows: [{
        id: '5a6b563972a4998fc022ad6f',
        name: 'fName4',
        globals: { global1: 1, global2: 2 },
        triggers,
        nodes: {},
        version: 'vName4',
        versionId: '4a6b563972a4998fc022ad6d',
        debuggingEnabled: true,
        customNodeDebug: false,
        minimumAgentVersion: '0.0.2'
      }],
      app: application,
      device,
      peripherals: {}

    }));

    workflowManager.timerInfo.should.deepEqual(TimerConfigs([{
      timerId: 'aTimerKey',
      cron: undefined,
      seconds: 10,
      tz: undefined
    }]));

    workflowManager.subscriptionInfo.should.deepEqual(SubscriptionConfigs([
      {
        mqttTopic: 'foo/bar/hello',
        triggerType: 'mqttTopic'
      },
      {
        mqttTopic: 'losant/5a6b58e2fa016b90d970c97d/command',
        triggerType: 'deviceCommand'
      }
    ]));
  });

  it('should properly load flows from disk', async () => {
    const logs = [];
    const deferred = defer();
    const stub = sinon.stub(logger, 'warn').callsFake((...params) => {
      logs.push(String(params.join(' ')));
      if (logs.length >= 6) { deferred.resolve(); }
    });

    const badFlowPath = path.resolve(pathToDiskFlows, 'bad-flow.txt');
    const nonExistent = path.resolve(pathToDiskFlows, 'gone');

    let workflowManager = WorkflowManager({ directory: badFlowPath }, levelManager.globalStore);
    await workflowManager.initialize();
    workflowManager = WorkflowManager({ directory: nonExistent }, levelManager.globalStore);
    await workflowManager.initialize();
    workflowManager = WorkflowManager({ directory: pathToDiskFlows }, levelManager.globalStore);
    await workflowManager.initialize();
    await deferred.promise;

    logs.should.deepEqual([
      `Unable to load flows from disk. Workflow path: ${badFlowPath} must be a directory`,
      `Unable to load flows from disk. Workflow path: ${nonExistent} must be a directory`,
      'Failed to load bad-flow.txt from disk: invalid JSON',
      'Failed to load invalid-flow-2.json from disk: Edge Agent version must be 5.0.0 or greater',
      'Failed to load invalid-flow-3.json from disk: ID is required',
      'Failed to load invalid-flow.json from disk: onDiskFormatVersion must be 1.0'
    ]);
    stub.restore();
  });
});
