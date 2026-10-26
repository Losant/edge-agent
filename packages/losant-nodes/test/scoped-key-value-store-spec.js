import { kvStore } from './common.js';
import ScopedStore from '../src/lib/scoped-key-value-store.js';
import abstractKeyValueStoreTests from './abstract/key-value-store-spec.js';

describe('Scoped KeyValueStore Spec', function() {
  const scopedStoreOne = new ScopedStore(kvStore, 'myScope');
  const scopedStoreTwo = new ScopedStore(scopedStoreOne, 'mySuperScope');

  describe('one level of scope', () => {
    abstractKeyValueStoreTests(() => scopedStoreOne);
  });

  describe('two levels of scope', () => {
    abstractKeyValueStoreTests(() => scopedStoreTwo);
  });

  it('should scope keys correctly', async () => {
    const appId = 'myApp';
    const flowId = 'myFlow';
    await kvStore.set(appId, flowId, 'key1', '1');
    await kvStore.set(appId, flowId, 'key2', '"hi"');
    await kvStore.set(appId, flowId, 'key3', '["a"]');
    await scopedStoreOne.set(appId, flowId, 'key1', '10');
    await scopedStoreOne.set(appId, flowId, 'key2', '"hello"');
    await scopedStoreOne.set(appId, flowId, 'key3', '["b"]');
    await scopedStoreTwo.set(appId, flowId, 'key1', '100');
    await scopedStoreTwo.set(appId, flowId, 'key2', '"foo"');
    await scopedStoreTwo.set(appId, flowId, 'key3', '["c"]');

    (await kvStore.get(appId, flowId, 'key1')).should.equal('1');
    (await scopedStoreOne.get(appId, flowId, 'key1')).should.equal('10');
    (await scopedStoreTwo.get(appId, flowId, 'key1')).should.equal('100');

    (await kvStore.incr(appId, flowId, 'key1', 1)).should.equal('2');
    (await scopedStoreOne.incr(appId, flowId, 'key1', 1)).should.equal('11');
    (await scopedStoreTwo.incr(appId, flowId, 'key1', 1)).should.equal('101');

    (await kvStore.getAll(appId, flowId)).should.deepEqual({
      'key1': 2,
      'key2': 'hi',
      'key3': ['a'],
      'myScope/key1': 11,
      'myScope/key2': 'hello',
      'myScope/key3': ['b'],
      'myScope/mySuperScope/key1': 101,
      'myScope/mySuperScope/key2': 'foo',
      'myScope/mySuperScope/key3': ['c']
    });
    (await scopedStoreOne.getAll(appId, flowId)).should.deepEqual({
      'key1': 11,
      'key2': 'hello',
      'key3': ['b'],
      'mySuperScope/key1': 101,
      'mySuperScope/key2': 'foo',
      'mySuperScope/key3': ['c']
    });
    (await scopedStoreTwo.getAll(appId, flowId)).should.deepEqual({
      key1: 101,
      key2: 'foo',
      key3: ['c']
    });

    (await kvStore.getAllKeys(appId, flowId)).should.deepEqual([
      'key1',
      'key2',
      'key3',
      'myScope/key1',
      'myScope/key2',
      'myScope/key3',
      'myScope/mySuperScope/key1',
      'myScope/mySuperScope/key2',
      'myScope/mySuperScope/key3'
    ]);

    (await scopedStoreOne.getAllKeys(appId, flowId)).should.deepEqual([
      'key1',
      'key2',
      'key3',
      'mySuperScope/key1',
      'mySuperScope/key2',
      'mySuperScope/key3'
    ]);

    (await scopedStoreTwo.getAllKeys(appId, flowId)).should.deepEqual([
      'key1',
      'key2',
      'key3'
    ]);

    await scopedStoreTwo.delMany(appId, flowId, ['key1', 'key3']);
    await scopedStoreOne.delMany(appId, flowId, ['key2']);

    (await kvStore.getAllKeys(appId, flowId)).should.deepEqual([
      'key1',
      'key2',
      'key3',
      'myScope/key1',
      'myScope/key3',
      'myScope/mySuperScope/key2'
    ]);

    await scopedStoreOne.delAll(appId, flowId);

    (await kvStore.getAllKeys(appId, flowId)).should.deepEqual([
      'key1',
      'key2',
      'key3'
    ]);

  });
});
