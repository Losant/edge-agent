import { contextify, kvStore } from './common.js';
import GetValueNodeNode from '../src/get-value-node.js';

describe('GetValueNode', () => {

  it('should get the requested value', async () => {
    const payload = { a: 'b' };
    const outputIds = [['nid1']];
    const context = contextify({ applicationId: 'anAppId', flowId: 'aflowId' });

    const nodeData = {
      keyName: 'aKey',
      valuePath: 'foo.bar'
    };

    await kvStore.set('anAppId', 'aflowId', 'aKey', JSON.stringify(['1', 1]));

    const node = new GetValueNodeNode('id', outputIds, nodeData);
    const [oids, p] = await node.run(context, payload);
    oids.should.deepEqual(outputIds);
    p.should.deepEqual({ a: 'b', foo: { bar: ['1', 1] } });
  });

  it('should get the requested value, and it does not exist - legacy', async () => {
    const payload = { a: 'b' };
    const outputIds = [['nid1']];
    const context = contextify({ applicationId: 'anAppId', flowId: 'bflowId' });

    const nodeData = {
      keyName: 'aKey',
      valuePath: 'foo.bar',
      defaultValue: '0'
    };

    const node = new GetValueNodeNode('id', outputIds, nodeData);
    const [oids, p] = await node.run(context, payload);
    oids.should.deepEqual(outputIds);
    p.should.deepEqual({ a: 'b', foo: { bar: '0' } });
  });

  it('should get the requested value, and it does not exist - template', async () => {
    const payload = { a: 'b' };
    const outputIds = [['nid1']];
    const context = contextify({ applicationId: 'anAppId', flowId: 'bflowId' });

    const nodeData = {
      keyName: 'aKey',
      valuePath: 'foo.bar',
      defaultValueType: 'template',
      defaultValue: 'one {{a}}'
    };

    const node = new GetValueNodeNode('id', outputIds, nodeData);
    const [oids, p] = await node.run(context, payload);
    oids.should.deepEqual(outputIds);
    p.should.deepEqual({ a: 'b', foo: { bar: 'one b' } });
  });

  it('should get the requested value, and it does not exist - json', async () => {
    const payload = { a: 'b' };
    const outputIds = [['nid1']];
    const context = contextify({ applicationId: 'anAppId', flowId: 'bflowId' });

    const nodeData = {
      keyName: 'aKey',
      valuePath: 'foo.bar',
      defaultValueType: 'json',
      defaultValue: '[1,"2"]'
    };

    const node = new GetValueNodeNode('id', outputIds, nodeData);
    const [oids, p] = await node.run(context, payload);
    oids.should.deepEqual(outputIds);
    p.should.deepEqual({ a: 'b', foo: { bar: [1, '2'] } });
  });

  it('should get the requested value, and it does not exist - path', async () => {
    const payload = { a: 'b' };
    const outputIds = [['nid1']];
    const context = contextify({ applicationId: 'anAppId', flowId: 'bflowId' });

    const nodeData = {
      keyName: 'aKey',
      valuePath: 'foo.bar',
      defaultValueType: 'path',
      defaultValue: 'a'
    };

    const node = new GetValueNodeNode('id', outputIds, nodeData);
    const [oids, p] = await node.run(context, payload);
    oids.should.deepEqual(outputIds);
    p.should.deepEqual({ a: 'b', foo: { bar: 'b' } });
  });

  it('should get all values', async () => {
    const payload = { a: 'b' };
    const outputIds = [['nid1']];
    const context = contextify({ applicationId: 'anAppId', flowId: 'bflowId' });

    const nodeData = {
      getAll: true,
      valuePath: 'foo.bar'
    };

    const node = new GetValueNodeNode('id', outputIds, nodeData);
    (await node.run(context, payload)).should.deepEqual([
      [ [ 'nid1' ] ],
      { a: 'b', foo: { bar: { } } }
    ]);

    await kvStore.set('anAppId', 'aflowId', 'aKey', JSON.stringify(['1', 1]));
    await kvStore.set('anAppId', 'bflowId', 'bKey', JSON.stringify(['2', 2]));
    await kvStore.set('anAppId', 'bflowId', 'cKey', JSON.stringify('hello'));

    (await node.run(context, payload)).should.deepEqual([
      [ [ 'nid1' ] ],
      { a: 'b', foo: { bar: { bKey: [ '2', 2 ], cKey: 'hello' } } }
    ]);

  });

});
