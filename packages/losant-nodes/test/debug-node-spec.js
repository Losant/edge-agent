import { publishedDebugMessages, contextify } from './common.js';
import DebugNode from '../src/debug-node.js';

describe('DebugNode', () => {

  it('should record the debug message', async () => {
    const payload = { a: 'b' };
    const outputIds = [['nid1']];
    const context = contextify({ applicationId: 'dnAppId2', flowId: 'aflowId2', etag: 'screm' });
    const nodeData = { message: 'Hello' };

    const node = new DebugNode('id', outputIds, nodeData);

    publishedDebugMessages.length.should.equal(0);

    const [oids, p] = await node.run(context, payload, { ids: ['a'], durations: [2] });
    oids.should.deepEqual(outputIds);
    p.should.deepEqual({ a: 'b' });

    publishedDebugMessages.length.should.equal(1);

    publishedDebugMessages[0].should.deepEqual({
      applicationId: 'dnAppId2',
      flowId: 'aflowId2',
      etag: 'screm',
      prevNodeInfo: { ids: ['a'], durations: [2] },
      msgObj: {
        level: 'verbose',
        message: 'Hello',
        payload: { a: 'b' },
        sourceNode: 'id'
      }
    });
  });

  it('should apply the lookup property when given', async () => {
    const payload = { a: 'b', what: 'where' };
    const outputIds = [['nid1']];
    const context = contextify({ applicationId: 'dnAppId2', flowId: 'aflowId2', etag: 'beepbeep' });
    const nodeData = { message: 'Hello', property: 'what' };

    const node = new DebugNode('id', outputIds, nodeData);

    publishedDebugMessages.length.should.equal(0);

    const [oids, p] = await node.run(context, payload, { ids: ['a'], durations: [2] });
    oids.should.deepEqual(outputIds);
    p.should.deepEqual({ a: 'b', what: 'where' });

    publishedDebugMessages.length.should.equal(1);

    publishedDebugMessages[0].should.deepEqual({
      applicationId: 'dnAppId2',
      flowId: 'aflowId2',
      etag: 'beepbeep',
      prevNodeInfo: { ids: ['a'], durations: [2] },
      msgObj: {
        level: 'verbose',
        message: 'Hello',
        payload: 'where',
        payloadPath: 'what',
        sourceNode: 'id'
      }
    });
  });

  // dropping circular refs is done at a much higher level
  // in the node runners, to catch all possible debug messages
  // so test at this level was removed
});
