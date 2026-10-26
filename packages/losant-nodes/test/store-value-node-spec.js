import { contextify, kvStore } from './common.js';
import StoreValueNodeNode from '../src/store-value-node.js';
import should from 'should';

describe('StoreValueNode', () => {

  it('should set the requested value - legacy', async () => {
    const payload = { a: ['2', 2] };
    const outputIds = [['nid1']];
    const context = contextify({ applicationId: 'anAppId', flowId: 'aflowId' });

    const nodeData = {
      keyName: 'aKey',
      valuePath: 'a',
      resultPath: 'c'
    };

    const node = new StoreValueNodeNode('id', outputIds, nodeData);
    const [oids, p] = await node.run(context, payload);
    oids.should.deepEqual(outputIds);
    p.should.deepEqual({ a: ['2', 2], c: ['2', 2] });
    const value = await kvStore.get('anAppId', 'aflowId', 'aKey');
    JSON.parse(value).should.deepEqual(['2', 2]);
  });

  it('should set the requested value, and it does not exist - legacy', async () => {
    const payload = { a: ['2', 2] };
    const outputIds = [['nid1']];
    const context = contextify({ applicationId: 'anAppId', flowId: 'bflowId' });

    const nodeData = {
      keyName: 'aKey',
      valuePath: 'b',
      resultPath: 'c'
    };

    const node = new StoreValueNodeNode('id', outputIds, nodeData);
    const [oids, p] = await node.run(context, payload);
    oids.should.deepEqual(outputIds);
    p.should.deepEqual({ a: ['2', 2], c: null });
    const val = await kvStore.get('anAppId', 'bflowId', 'aKey');
    should(val).be.null();
  });

  it('should set the requested value - path', async () => {
    const payload = { a: ['2', 2] };
    const outputIds = [['nid1']];
    const context = contextify({ applicationId: 'anAppId', flowId: 'aflowId' });

    const nodeData = {
      keyName: 'aKey',
      valueType: 'path',
      value: 'a',
      resultPath: 'c'
    };

    const node = new StoreValueNodeNode('id', outputIds, nodeData);
    const [oids, p] = await node.run(context, payload);
    oids.should.deepEqual(outputIds);
    p.should.deepEqual({ a: ['2', 2], c: ['2', 2] });
    const value = await kvStore.get('anAppId', 'aflowId', 'aKey');
    JSON.parse(value).should.deepEqual(['2', 2]);
  });

  it('should error on too long a value', async () => {
    const payload = { a: '' };
    const outputIds = [['nid1']];
    const context = contextify({ applicationId: 'anAppId', flowId: 'aflowId' });

    const nodeData = {
      keyName: 'aKey',
      valueType: 'path',
      value: 'a',
      resultPath: 'c'
    };
    for (let i =0; i < 1024*16; i++) { payload.a += '0'; }

    const node = new StoreValueNodeNode('id', outputIds, nodeData);
    await node.run(context, payload).should.be
      .rejectedWith('Size of Storage Value (16386) is greater than maximum allowed (16384)');
  });

  it('should set the requested value, and it does not exist - path', async () => {
    const payload = { a: ['2', 2] };
    const outputIds = [['nid1']];
    const context = contextify({ applicationId: 'anAppId', flowId: 'bflowId' });

    const nodeData = {
      keyName: 'aKey',
      valueType: 'path',
      value: 'b',
      resultPath: 'c'
    };

    const node = new StoreValueNodeNode('id', outputIds, nodeData);
    const [oids, p] = await node.run(context, payload);
    oids.should.deepEqual(outputIds);
    p.should.deepEqual({ a: ['2', 2], c: null });
    const val = await kvStore.get('anAppId', 'bflowId', 'aKey');
    should(val).be.null();
  });

  it('should set the requested value - template', async () => {
    const payload = { a: ['2', 2] };
    const outputIds = [['nid1']];
    const context = contextify({ applicationId: 'anAppId', flowId: 'aflowId' });

    const nodeData = {
      keyName: 'aKey',
      valueType: 'template',
      value: 'hello {{a}}',
      resultPath: 'c'
    };

    const node = new StoreValueNodeNode('id', outputIds, nodeData);
    const [oids, p] = await node.run(context, payload);
    oids.should.deepEqual(outputIds);
    p.should.deepEqual({ a: ['2', 2], c: 'hello 2,2' });
    const value = await kvStore.get('anAppId', 'aflowId', 'aKey');
    JSON.parse(value).should.deepEqual('hello 2,2');
  });

  it('should set the requested value - json', async () => {
    const payload = { what: '["2", 2]' };
    const outputIds = [['nid1']];
    const context = contextify({ applicationId: 'anAppId', flowId: 'aflowId' });

    const nodeData = {
      keyName: 'aKey',
      valueType: 'json',
      value: '{{what}}',
      resultPath: 'c'
    };

    const node = new StoreValueNodeNode('id', outputIds, nodeData);
    const [oids, p] = await node.run(context, payload);
    oids.should.deepEqual(outputIds);
    p.should.deepEqual({ c: ['2', 2], what: '["2", 2]' });
    const value = await kvStore.get('anAppId', 'aflowId', 'aKey');
    JSON.parse(value).should.deepEqual(['2', 2]);
  });

  it('should set the requested value - json, but already an object', async () => {
    const payload = { what: ['2', 2] };
    const outputIds = [['nid1']];
    const context = contextify({ applicationId: 'anAppId', flowId: 'aflowId' });

    const nodeData = {
      keyName: 'aKey',
      valueType: 'json',
      value: '{{what}}',
      resultPath: 'c'
    };

    const node = new StoreValueNodeNode('id', outputIds, nodeData);
    const [oids, p] = await node.run(context, payload);
    oids.should.deepEqual(outputIds);
    p.should.deepEqual({ c: ['2', 2], what: ['2', 2] });
    const value = await kvStore.get('anAppId', 'aflowId', 'aKey');
    JSON.parse(value).should.deepEqual(['2', 2]);
  });

  it('should set the requested value - number', async () => {
    const payload = { a: '1' };
    const outputIds = [['nid1']];
    const context = contextify({ applicationId: 'anAppId', flowId: 'aflowId' });

    const nodeData = {
      keyName: 'aKey',
      valueType: 'number',
      value: '3{{a}}.2',
      resultPath: 'c'
    };

    const node = new StoreValueNodeNode('id', outputIds, nodeData);
    const [oids, p] = await node.run(context, payload);
    oids.should.deepEqual(outputIds);
    p.should.deepEqual({ a: '1', c: 31.2 });
    const value = await kvStore.get('anAppId', 'aflowId', 'aKey');
    JSON.parse(value).should.deepEqual(31.2);
  });

  it('should set the requested value - clear', async () => {
    const payload = { };
    const outputIds = [['nid1']];
    const context = contextify({ applicationId: 'anAppId', flowId: 'bflowId' });

    const nodeData = {
      keyName: 'aKey',
      valueType: 'clear',
      resultPath: 'c'
    };

    const node = new StoreValueNodeNode('id', outputIds, nodeData);
    await kvStore.set('anAppId', 'bflowId', 'aKey', '["3", 4]');
    const [oids, p] = await node.run(context, payload);
    oids.should.deepEqual(outputIds);
    p.should.deepEqual({ c: ['3', 4] });
    const val = await kvStore.get('anAppId', 'bflowId', 'aKey');
    should(val).be.null();
  });

  it('should set the requested value - clear all', async () => {
    const payload = { };
    const outputIds = [['nid1']];
    const context = contextify({ applicationId: 'anAppId', flowId: 'bflowId' });

    const nodeData = {
      valueType: 'clear',
      resultPath: 'c'
    };

    const node = new StoreValueNodeNode('id', outputIds, nodeData);
    await kvStore.set('anAppId', 'bflowId', 'aKey', '["3", 4]');
    await kvStore.set('anAppId', 'bflowId', 'bKey', '1');
    (await node.run(context, payload)).should.deepEqual([outputIds, { c: { removed: 2 } }]);
    (await kvStore.getAllKeys('anAppId', 'bflowId')).should.deepEqual([]);
    (await node.run(context, payload)).should.deepEqual([outputIds, { c: { removed: 0 } }]);
  });

  it('should set the requested value - increment/decrement', async () => {
    const outputIds = [['nid1']];
    const context = contextify({ applicationId: 'anAppId', flowId: 'bflowId' });

    const incrNode = new StoreValueNodeNode('id', outputIds, {
      keyName: 'aKey',
      valueType: 'incr',
      value: '{{a}}',
      resultPath: 'c'
    });
    const decrNode = new StoreValueNodeNode('id', outputIds, {
      keyName: 'aKey',
      valueType: 'decr',
      value: '{{a}}',
      resultPath: 'c'
    });

    let [oids, p] = await incrNode.run(context, { a: 1 });
    oids.should.deepEqual(outputIds);
    p.should.deepEqual({ a: 1, c: 1 });
    let val = await kvStore.get('anAppId', 'bflowId', 'aKey');
    JSON.parse(val).should.equal(1);
    [oids, p] = await incrNode.run(context, { a: '-11.4' });
    oids.should.deepEqual(outputIds);
    p.should.deepEqual({ a: '-11.4', c: -10.4 });
    val = await kvStore.get('anAppId', 'bflowId', 'aKey');
    JSON.parse(val).should.equal(-10.4);
    [oids, p] = await decrNode.run(context, { a: '-1.5' });
    oids.should.deepEqual(outputIds);
    p.should.deepEqual({ a: '-1.5', c: -8.9 });
    val = await kvStore.get('anAppId', 'bflowId', 'aKey');
    JSON.parse(val).should.equal(-8.9);
  });

  it('should yell about non number stored values for incr/decr', async () => {
    const context = contextify({ applicationId: 'anAppId', flowId: 'bflowId' });

    const incrNode = new StoreValueNodeNode('id', [['nid1']], {
      keyName: 'aKey',
      valueType: 'incr',
      value: '{{a}}',
      resultPath: 'c'
    });
    const decrNode = new StoreValueNodeNode('id', [['nid1']], {
      keyName: 'aKey',
      valueType: 'decr',
      value: '{{a}}',
      resultPath: 'c'
    });

    await kvStore.set('anAppId', 'bflowId', 'aKey', '"hello"');
    await incrNode.run(context, { a: 1 }).should.be
      .rejectedWith('Value at aKey is not a number, cannot be incremented/decremented');
    await decrNode.run(context, { a: 1 }).should.be
      .rejectedWith('Value at aKey is not a number, cannot be incremented/decremented');
    const val = await kvStore.get('anAppId', 'bflowId', 'aKey');
    val.should.equal('"hello"');
  });

  it('should yell about non number values as the incr/decr', async () => {
    const context = contextify({ applicationId: 'anAppId', flowId: 'bflowId' });

    const incrNode = new StoreValueNodeNode('id', [['nid1']], {
      keyName: 'aKey',
      valueType: 'incr',
      value: '{{a}}',
      resultPath: 'c'
    });
    const decrNode = new StoreValueNodeNode('id', [['nid1']], {
      keyName: 'aKey',
      valueType: 'decr',
      value: '{{a}}',
      resultPath: 'c'
    });

    await incrNode.run(context, { a: 'hello' }).should.be
      .rejectedWith('Value \'hello\' is not a valid number');
    await decrNode.run(context, { a: 'hello' }).should.be
      .rejectedWith('Value \'hello\' is not a valid number');
    const val = await kvStore.get('anAppId', 'bflowId', 'aKey');
    should(val).be.null();
  });

  it('should yell about missing keys', async () => {
    const context = contextify({ applicationId: 'anAppId', flowId: 'bflowId' });

    const node = new StoreValueNodeNode('id', [['nid1']], {
      keyName: '{{b}}',
      valueType: 'template',
      value: '{{a}}',
      resultPath: 'c'
    });

    await node.run(context, { a: 'hello', b: null }).should.be
      .rejectedWith('Missing Storage Key');
  });

});
