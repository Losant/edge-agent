import { contextify, kvStore } from './common.js';
import should from 'should';
import LJSON from 'losant-nodejs-utils/src/ljson.js';
import BranchOnChangeNode from '../src/branch-on-change-node.js';

describe('BranchOnChangeNode', () => {

  it('should generate the right compare func for percent', () => {
    const node = new BranchOnChangeNode('id', [], { });
    node.compareFunc('percent', 10, 200, 200).should.deepEqual([false, false]);
    node.compareFunc('percent', 10, 200, 219).should.deepEqual([false, false]);
    node.compareFunc('percent', 10, 200, 220).should.deepEqual([true, true]);
    node.compareFunc('percent', 10, 200, 221).should.deepEqual([true, true]);
    node.compareFunc('percent', 10, 200, 181).should.deepEqual([false, false]);
    node.compareFunc('percent', 10, 200, 180).should.deepEqual([true, true]);
    node.compareFunc('percent', 10, 200, 179).should.deepEqual([true, true]);
  });

  it('should generate the right compare func for percentInc', () => {
    const node = new BranchOnChangeNode('id', [], { });
    node.compareFunc('percentInc', 10, 200, 200).should.deepEqual([false, false]);
    node.compareFunc('percentInc', 10, 200, 219).should.deepEqual([false, false]);
    node.compareFunc('percentInc', 10, 200, 220).should.deepEqual([true, true]);
    node.compareFunc('percentInc', 10, 200, 221).should.deepEqual([true, true]);
    node.compareFunc('percentInc', 10, 200, 181).should.deepEqual([false, true]);
    node.compareFunc('percentInc', 10, 200, 180).should.deepEqual([false, true]);
    node.compareFunc('percentInc', 10, 200, 179).should.deepEqual([false, true]);
  });

  it('should generate the right compare func for percentDec', () => {
    const node = new BranchOnChangeNode('id', [], { });
    node.compareFunc('percentDec', 10, 200, 200).should.deepEqual([false, false]);
    node.compareFunc('percentDec', 10, 200, 219).should.deepEqual([false, true]);
    node.compareFunc('percentDec', 10, 200, 220).should.deepEqual([false, true]);
    node.compareFunc('percentDec', 10, 200, 221).should.deepEqual([false, true]);
    node.compareFunc('percentDec', 10, 200, 181).should.deepEqual([false, false]);
    node.compareFunc('percentDec', 10, 200, 180).should.deepEqual([true, true]);
    node.compareFunc('percentDec', 10, 200, 179).should.deepEqual([true, true]);
  });

  it('should generate the right compare func for value', () => {
    const node = new BranchOnChangeNode('id', [], { });
    node.compareFunc('value', 20, 200, 200).should.deepEqual([false, false]);
    node.compareFunc('value', 20, 200, 219).should.deepEqual([false, false]);
    node.compareFunc('value', 20, 200, 220).should.deepEqual([true, true]);
    node.compareFunc('value', 20, 200, 221).should.deepEqual([true, true]);
    node.compareFunc('value', 20, 200, 181).should.deepEqual([false, false]);
    node.compareFunc('value', 20, 200, 180).should.deepEqual([true, true]);
    node.compareFunc('value', 20, 200, 179).should.deepEqual([true, true]);
  });

  it('should generate the right compare func for valueInc', () => {
    const node = new BranchOnChangeNode('id', [], { });
    node.compareFunc('valueInc', 20, 200, 200).should.deepEqual([false, false]);
    node.compareFunc('valueInc', 20, 200, 219).should.deepEqual([false, false]);
    node.compareFunc('valueInc', 20, 200, 220).should.deepEqual([true, true]);
    node.compareFunc('valueInc', 20, 200, 221).should.deepEqual([true, true]);
    node.compareFunc('valueInc', 20, 200, 181).should.deepEqual([false, true]);
    node.compareFunc('valueInc', 20, 200, 180).should.deepEqual([false, true]);
    node.compareFunc('valueInc', 20, 200, 179).should.deepEqual([false, true]);
  });

  it('should generate the right compare func for valueDec', () => {
    const node = new BranchOnChangeNode('id', [], { });
    node.compareFunc('valueDec', 20, 200, 200).should.deepEqual([false, false]);
    node.compareFunc('valueDec', 20, 200, 219).should.deepEqual([false, true]);
    node.compareFunc('valueDec', 20, 200, 220).should.deepEqual([false, true]);
    node.compareFunc('valueDec', 20, 200, 221).should.deepEqual([false, true]);
    node.compareFunc('valueDec', 20, 200, 181).should.deepEqual([false, false]);
    node.compareFunc('valueDec', 20, 200, 180).should.deepEqual([true, true]);
    node.compareFunc('valueDec', 20, 200, 179).should.deepEqual([true, true]);
  });

  it('should generate the right compare func for any', () => {
    const node = new BranchOnChangeNode('id', [], { });
    node.compareFunc('any', Infinity, 200, 200).should.deepEqual([false, false]);
    node.compareFunc('any', Infinity, 200, 219).should.deepEqual([true, true]);
    node.compareFunc('any', Infinity, 200, 220).should.deepEqual([true, true]);
    node.compareFunc('any', Infinity, 200, 221).should.deepEqual([true, true]);
    node.compareFunc('any', Infinity, 200, 181).should.deepEqual([true, true]);
    node.compareFunc('any', Infinity, 200, 180).should.deepEqual([true, true]);
    node.compareFunc('any', Infinity, 200, 179).should.deepEqual([true, true]);
  });

  it('should run false path if valuePath does not exist (for non "any")', async () => {
    const node = new BranchOnChangeNode('id', [['2'], ['1']], {
      changeType:    'percent',
      valuePath:     'a.b',
      prevValuePath: 'a.c'
    });

    await kvStore.del('appId', 'flowId', 'onchange/id');
    const [oids, p] = await node.run(
      contextify({ applicationId: 'appId', flowId: 'flowId' }),
      { }
    );
    oids.should.deepEqual(['2']);
    p.should.deepEqual({});
    const val = await kvStore.get('appId', 'flowId', 'onchange/id');
    should(val).be.null();
  });

  it('should run false path if valuePath is not a number (for non "any")', async () => {
    const node = new BranchOnChangeNode('id', [['2'], ['1']], {
      changeType:    'percent',
      valuePath:     'a.b',
      prevValuePath: 'a.c'
    });

    const oldVal = { value: 1, time: Date.now() };
    await kvStore.set('appId', 'flowId', 'onchange/id', LJSON.stringify(oldVal));
    const [oids, p] = await node.run(
      contextify({ applicationId: 'appId', flowId: 'flowId' }),
      { a: { b: 'what' } }
    );
    oids.should.deepEqual(['2']);
    p.should.deepEqual({ a: { c: oldVal, b: 'what' } });
    const val = await kvStore.get('appId', 'flowId', 'onchange/id');
    val.should.equal(LJSON.stringify(oldVal));
  });

  it('should run correctly if valuePath is not a number for "any"', async () => {
    const node = new BranchOnChangeNode('id', [['2'], ['1']], {
      changeType:    'any',
      valuePath:     'a.b',
      prevValuePath: 'a.c'
    });

    const oldVal = { value: 'hello', time: Date.now() };
    await kvStore.set('appId', 'flowId', 'onchange/id', LJSON.stringify(oldVal));
    const [oids, p] = await node.run(
      contextify({ applicationId: 'appId', flowId: 'flowId' }),
      { a: { b: 'goodbye' } }
    );
    oids.should.deepEqual(['1']);
    p.should.deepEqual({ a: { c: oldVal, b: 'goodbye' } });
    let val = await kvStore.get('appId', 'flowId', 'onchange/id');
    val = LJSON.parse(val);
    val.value.should.equal('goodbye');
  });

  it('should run false path if old value does not exist - but sets value', async () => {
    const node = new BranchOnChangeNode('id', [['2'], ['1']], {
      changeType:    'any',
      valuePath:     'a.b',
      prevValuePath: 'a.c'
    });

    await kvStore.del('appId', 'flowId', 'onchange/id');
    const [oids, p] = await node.run(
      contextify({ applicationId: 'appId', flowId: 'flowId' }),
      { a: { b: 1 } }
    );
    oids.should.deepEqual(['2']);
    p.should.deepEqual({ a: { b: 1 } });
    let val = await kvStore.get('appId', 'flowId', 'onchange/id');
    val = LJSON.parse(val);
    val.value.should.equal(1);
  });

  it('should run false path if compare does not trigger threshold', async () => {
    const node = new BranchOnChangeNode('id', [['2'], ['1']], {
      changeType:    'any',
      valuePath:     'a.b',
      prevValuePath: 'a.c'
    });

    const oldVal = { value: 1, time: Date.now() };
    await kvStore.set('appId', 'flowId', 'onchange/id', LJSON.stringify(oldVal));
    const [oids, p] = await node.run(
      contextify({ applicationId: 'appId', flowId: 'flowId' }),
      { a: { b: 1 } }
    );
    oids.should.deepEqual(['2']);
    p.should.deepEqual({ a: { c: oldVal, b: 1 } });
    const val = await kvStore.get('appId', 'flowId', 'onchange/id');
    val.should.equal(LJSON.stringify(oldVal));
  });

  it('should run true path if compare does trigger threshold', async () => {
    const node = new BranchOnChangeNode('id', [['2'], ['1']], {
      changeType:    'any',
      valuePath:     'a.b',
      prevValuePath: 'a.c'
    });

    const oldVal = { value: 1, time: Date.now() };
    await kvStore.set('appId', 'flowId', 'onchange/id', LJSON.stringify(oldVal));
    const [oids, p] = await node.run(
      contextify({ applicationId: 'appId', flowId: 'flowId' }),
      { a: { b: 2 } }
    );
    oids.should.deepEqual(['1']);
    p.should.deepEqual({ a: { c: oldVal, b: 2 } });
    let val = await kvStore.get('appId', 'flowId', 'onchange/id');
    val = LJSON.parse(val);
    (val.time >= oldVal.time).should.equal(true);
    val.value.should.equal(2);
  });

  it('should run true path if compare does trigger threshold (non any)', async () => {
    const node = new BranchOnChangeNode('id', [['2'], ['1']], {
      changeType:    '{{a.e}}',
      valuePath:     'a.b',
      changeThreshold: '{{a.d}}',
      prevValuePath: 'a.c'
    });

    const oldVal = { value: 1, time: Date.now() };
    await kvStore.set('appId', 'flowId', 'onchange/id', LJSON.stringify(oldVal));
    const [oids, p] = await node.run(
      contextify({ applicationId: 'appId', flowId: 'flowId' }),
      { a: { b: 2, d: 1, e: 'valueInc' } }
    );
    oids.should.deepEqual(['1']);
    p.should.deepEqual({ a: { c: oldVal, b: 2, d: 1, e: 'valueInc' } });
    let val = await kvStore.get('appId', 'flowId', 'onchange/id');
    val = LJSON.parse(val);
    (val.time >= oldVal.time).should.equal(true);
    val.value.should.equal(2);
  });

  it('should allow custom ids', async () => {
    const node = new BranchOnChangeNode('id', [['2'], ['1']], {
      changeType:    'any',
      valuePath:     'a.b',
      prevValuePath: 'a.c',
      onChangeIdTemplate: '{{a.b}}b'
    });

    const oldVal = { value: 1, time: Date.now() };
    await kvStore.set('appId', 'flowId', 'onchange/id/2b', LJSON.stringify(oldVal));
    const [oids, p] = await node.run(
      contextify({ applicationId: 'appId', flowId: 'flowId' }),
      { a: { b: 2 } }
    );
    oids.should.deepEqual(['1']);
    p.should.deepEqual({ a: { c: oldVal, b: 2 } });
    let val = await kvStore.get('appId', 'flowId', 'onchange/id/2b');
    val = LJSON.parse(val);
    (val.time >= oldVal.time).should.equal(true);
    val.value.should.equal(2);
  });

});
