import CustomNodeExecuteNode from '../../src/custom-node-execute-node.js';
import CustomNodeCapNode from '../../src/custom-node-cap-node.js';
export default function(contextify) {

  it('should correctly evaluate each kind of field', async () => {
    const node = new CustomNodeExecuteNode('id', [[4], [5]], {
      customNodeId: 'a',
      customNodeVersion: 'b',
      resultPath: 'c',
      fields: [
        { id: 'f-checkbox', value: true },
        { id: 'f-select', value: 'zero' },
        { id: 'f-string', value: '{{one}}' },
        { id: 'f-number', value: '{{two}}' },
        { id: 'f-json1', value: '{ "a": "{{three}}" }' },
        { id: 'f-json2', value: '' },
        { id: 'f-json3', value: '{{nothing}}' },
        { id: 'f-json4', value: '{{blank}}' },
        { id: 'f-json5', value: '{{four}}' },
        { id: 'f-json6', value: '' },
        { id: 'f-path', value: 'four' },
        { id: 'f-section', value: 'five' } // will be ignored
      ]
    });

    const capNode = new CustomNodeCapNode('nodeId', [], {
      resultSourcePath: 'data'
    });

    const context = contextify({
      loadCustomNode: async (c, flowId, flowVersion) => {
        flowId.should.equal('a');
        flowVersion.should.equal('b');
        return {
          name: 'theCustomNode',
          flowId: '1234',
          flowVersion: 'develop',
          flowVersionId: '',
          triggers: [{
            key: 'customNodeStart',
            type: 'customNodeStart',
            outputIds: ['nodeId'],
            meta: {}
          }],
          nodes: {
            nodeId: capNode
          },
          globals: {},
          etag: '1',
          customNodeConfig: {
            outputCount: 1,
            resultMode: 'required',
            fields: [
              { type: 'checkbox', id: 'f-checkbox' },
              { type: 'select', id: 'f-select', options: [{ value: 'zero', label: 'ZERO!' }] },
              { type: 'stringTemplate', id: 'f-string' },
              { type: 'numberTemplate', id: 'f-number' },
              { type: 'jsonTemplate', id: 'f-json1' },
              { type: 'jsonTemplate', id: 'f-json2', defaultValue: '' },
              { type: 'jsonTemplate', id: 'f-json3' },
              { type: 'jsonTemplate', id: 'f-json4' },
              { type: 'jsonTemplate', id: 'f-json5' },
              { type: 'jsonTemplate', id: 'f-json6', defaultValue: '{ "a": "b" }' },
              { type: 'payloadPath', id: 'f-path' },
              { type: 'section', id: 'f-section' }
            ]
          },
          startTrigger: {
            key: 'customNodeStart',
            type: 'customNodeStart',
            outputIds: ['nodeId'],
            meta: {}
          }
        };
      },
      originalPayload: { time: new Date() },
      runStart: Date.now(),
      flowStatsAggregator: () => {}
    });

    const [oids, payload] = await node.run(context, {
      one: 'strOne',
      two: '22',
      three: '3Three',
      blank: '',
      four: [1, 2, {}, 3, 4]
    }, []);
    oids.should.deepEqual([[4], [5]]);
    payload.should.deepEqual({
      one: 'strOne',
      two: '22',
      three: '3Three',
      blank: '',
      four: [ 1, 2, {}, 3, 4 ],
      c: {
        'f-checkbox': true,
        'f-select': 'zero',
        'f-string': 'strOne',
        'f-number': 22,
        'f-json1': { a: '3Three' },
        'f-json2': undefined,
        'f-json3': undefined,
        'f-json4': undefined,
        'f-json5': [ 1, 2, {}, 3, 4 ],
        'f-json6': { a: 'b' },
        'f-path': [ 1, 2, {}, 3, 4 ]
      }
    });
  });

  it('should correctly branch', async () => {
    const node = new CustomNodeExecuteNode('id', [[4], [5]], {
      customNodeId: 'a',
      customNodeVersion: 'b',
      fields: [{ id: 'numberGuy', value: '{{source}}' }]
    });

    const capNode = new CustomNodeCapNode('nodeId', [], {
      branchIndexTemplate: '{{data.numberGuy}}'
    });

    const context = contextify({
      loadCustomNode: async (c, flowId, flowVersion) => {
        flowId.should.equal('a');
        flowVersion.should.equal('b');
        return {
          name: 'theCustomNode',
          flowId: '1234',
          flowVersion: 'develop',
          flowVersionId: '',
          triggers: [{
            key: 'customNodeStart',
            type: 'customNodeStart',
            outputIds: ['nodeId'],
            meta: {}
          }],
          nodes: {
            nodeId: capNode
          },
          globals: {},
          etag: '1',
          customNodeConfig: {
            outputCount: 2,
            resultMode: 'required',
            fields: [{ type: 'numberTemplate', id: 'numberGuy' }]
          },
          startTrigger: {
            key: 'customNodeStart',
            type: 'customNodeStart',
            outputIds: ['nodeId'],
            meta: {}
          }
        };
      },
      originalPayload: { time: new Date() },
      runStart: Date.now(),
      flowStatsAggregator: () => {}
    });

    let [oids, payload] = await node.run(context, { source: 0 }, []);
    oids.should.deepEqual([4]);
    payload.should.deepEqual({ source: 0 });

    [oids, payload] = await node.run(context, { source: 1 }, []);
    oids.should.deepEqual([5]);
    payload.should.deepEqual({ source: 1 });

    await node.run(context, { source: -1 }, [])
      .should.be.rejectedWith('The custom node failed to return a valid branch path.');
  });

  it('should correctly apply default version', async () => {
    const node = new CustomNodeExecuteNode('id', [[4], [5]], {
      customNodeId: 'a',
      defaultVersionId: 'b',
      resultPath: 'c',
      fields: [
        { id: 'f-checkbox', value: true },
        { id: 'f-select', value: 'zero' },
        { id: 'f-string', value: '{{one}}' },
        { id: 'f-number', value: '{{two}}' },
        { id: 'f-json', value: '{ "a": "{{three}}" }' },
        { id: 'f-path', value: 'four' },
        { id: 'f-section', value: 'five' } // will be ignored
      ]
    });
    const capNode = new CustomNodeCapNode('nodeId', [], {
      resultSourcePath: 'data'
    });

    const context = contextify({
      loadCustomNode: async (c, flowId, flowVersion) => {
        flowId.should.equal('a');
        flowVersion.should.equal('default');
        return {
          name: 'theCustomNode',
          flowId: '1234',
          flowVersion: 'b',
          flowVersionId: '',
          triggers: [{
            key: 'customNodeStart',
            type: 'customNodeStart',
            outputIds: ['nodeId'],
            meta: {}
          }],
          nodes: {
            nodeId: capNode
          },
          globals: {},
          etag: '1',
          customNodeConfig: {
            outputCount: 1,
            resultMode: 'required',
            fields: [
              { type: 'checkbox', id: 'f-checkbox' },
              { type: 'select', id: 'f-select', options: [{ value: 'zero', label: 'ZERO!' }] },
              { type: 'stringTemplate', id: 'f-string' },
              { type: 'numberTemplate', id: 'f-number' },
              { type: 'jsonTemplate', id: 'f-json' },
              { type: 'payloadPath', id: 'f-path' },
              { type: 'section', id: 'f-section' }
            ]
          },
          startTrigger: {
            key: 'customNodeStart',
            type: 'customNodeStart',
            outputIds: ['nodeId'],
            meta: {}
          }
        };
      },
      originalPayload: { time: new Date() },
      runStart: Date.now(),
      flowStatsAggregator: () => {}
    });

    const [oids, payload] = await node.run(context, {
      one: 'strOne',
      two: '22',
      three: '3Three',
      four: [1, 2, {}, 3, 4]
    }, []);
    oids.should.deepEqual([[4], [5]]);
    payload.should.deepEqual({
      one: 'strOne',
      two: '22',
      three: '3Three',
      four: [ 1, 2, {}, 3, 4 ],
      c: {
        'f-checkbox': true,
        'f-select': 'zero',
        'f-string': 'strOne',
        'f-number': 22,
        'f-json': { a: '3Three' },
        'f-path': [ 1, 2, {}, 3, 4 ]
      }
    });
  });

  it('should correctly ignore default version when a version is specified', async () => {
    const node = new CustomNodeExecuteNode('id', [[4], [5]], {
      customNodeId: 'a',
      defaultVersionId: 'b',
      customNodeVersion: 'd',
      resultPath: 'c',
      fields: [
        { id: 'f-checkbox', value: true },
        { id: 'f-select', value: 'zero' },
        { id: 'f-string', value: '{{one}}' },
        { id: 'f-number', value: '{{two}}' },
        { id: 'f-json', value: '{ "a": "{{three}}" }' },
        { id: 'f-path', value: 'four' },
        { id: 'f-section', value: 'five' } // will be ignored
      ]
    });
    const capNode = new CustomNodeCapNode('nodeId', [], {
      resultSourcePath: 'data'
    });

    const context = contextify({
      loadCustomNode: async (c, flowId, flowVersion) => {
        flowId.should.equal('a');
        flowVersion.should.equal('d');
        return {
          name: 'theCustomNode',
          flowId: '1234',
          flowVersion: 'd',
          flowVersionId: '',
          triggers: [{
            key: 'customNodeStart',
            type: 'customNodeStart',
            outputIds: ['nodeId'],
            meta: {}
          }],
          nodes: {
            nodeId: capNode
          },
          globals: {},
          etag: '1',
          customNodeConfig: {
            outputCount: 1,
            resultMode: 'required',
            fields: [
              { type: 'checkbox', id: 'f-checkbox' },
              { type: 'select', id: 'f-select', options: [{ value: 'zero', label: 'ZERO!' }] },
              { type: 'stringTemplate', id: 'f-string' },
              { type: 'numberTemplate', id: 'f-number' },
              { type: 'jsonTemplate', id: 'f-json' },
              { type: 'payloadPath', id: 'f-path' },
              { type: 'section', id: 'f-section' }
            ]
          },
          startTrigger: {
            key: 'customNodeStart',
            type: 'customNodeStart',
            outputIds: ['nodeId'],
            meta: {}
          }
        };
      },
      originalPayload: { time: new Date() },
      runStart: Date.now(),
      flowStatsAggregator: () => {}
    });

    const [oids, payload] = await node.run(context, {
      one: 'strOne',
      two: '22',
      three: '3Three',
      four: [1, 2, {}, 3, 4]
    }, []);
    oids.should.deepEqual([[4], [5]]);
    payload.should.deepEqual({
      one: 'strOne',
      two: '22',
      three: '3Three',
      four: [ 1, 2, {}, 3, 4 ],
      c: {
        'f-checkbox': true,
        'f-select': 'zero',
        'f-string': 'strOne',
        'f-number': 22,
        'f-json': { a: '3Three' },
        'f-path': [ 1, 2, {}, 3, 4 ]
      }
    });

  });

  it('should have a correct initial payload', async () => {
    const node = new CustomNodeExecuteNode('id', [[4], [5]], {
      customNodeId: 'a',
      customNodeVersion: 'b',
      resultPath: 'c',
      fields: [ ]
    });

    const time = new Date();

    const capNode = new CustomNodeCapNode('nodeId', [], {
      resultSourcePath: '.'
    });

    const context = contextify({
      applicationId: '123412341234432143214321',
      loadCustomNode: async (c, flowId, flowVersion) => {
        flowId.should.equal('a');
        flowVersion.should.equal('b');

        const flowIdParts = context.getCurrentAgentConfig ?
          {
            customNodeId: '1234',
            customNodeVersion: 'myVersion',
            versionId: '5678'
          } : {
            flowId: '1234',
            flowVersion: 'myVersion',
            flowVersionId: '5678'
          };

        return {
          name: 'theCustomNode',
          ...flowIdParts,
          triggers: [{
            key: 'customNodeStart',
            type: 'customNodeStart',
            outputIds: ['nodeId'],
            meta: {}
          }],
          nodes: {
            nodeId: capNode
          },
          globals: {},
          etag: '1',
          customNodeConfig: {
            outputCount: 1,
            resultMode: 'required',
            fields: [ ]
          },
          startTrigger: {
            key: 'customNodeStart',
            type: 'customNodeStart',
            outputIds: ['nodeId'],
            meta: {}
          }
        };
      },
      originalPayload: { time },
      runStart: Date.now(),
      flowStatsAggregator: () => {}
    });

    const [oids, payload] = await node.run(context, { }, []);
    oids.should.deepEqual([[4], [5]]);
    payload.should.deepEqual({
      c: {
        data: {},
        customNodeId: '1234',
        customNodeName: 'theCustomNode',
        customNodeVersion: 'myVersion',
        applicationId: '123412341234432143214321',
        time,
        triggerId: 'customNodeStart',
        triggerType: 'customNodeStart'
      }
    });
  });
}
