import should from 'should';
import { levelManager, restoreEnv } from './common.js';
import KVStore from '../src/level/key-value-store.js';
import abstractKVStoreTests from 'losant-nodes/test/abstract/key-value-store-spec.js';
import { sleep } from 'omnibelt';
describe('Edge (Level DB) KeyValueStore Spec', function() {

  abstractKVStoreTests(() => {
    return levelManager.keyValueStore;
  });

  it('should save values properly across shutdown/startup', async () => {
    const kvStore = levelManager.keyValueStore;
    await kvStore.set('a', 'b', 'key1', 'one');
    (await kvStore.incr('a', 'b', 'key2', 2)).should.equal('2');
    await kvStore.shutdown();
    await kvStore.initialize();
    (await kvStore.del('a', 'b', 'key1')).should.equal('one');
    (await kvStore.incr('a', 'b', 'key2', 2)).should.equal('4');
    await kvStore.set('a', 'b', 'key3', 'three');
    await kvStore.shutdown();
    await kvStore.initialize();
    should(await kvStore.get('a', 'b', 'key1')).be.null();
    (await kvStore.get('a', 'b', 'key2')).should.equal('4');
    (await kvStore.get('a', 'b', 'key3')).should.equal('three');
  });

  describe('save testing', () => {
    restoreEnv('KVSTORE_SAVE_INTERVAL');
    beforeEach(() => {
      process.env.KVSTORE_SAVE_INTERVAL = 500;
    });

    it('should properly save every interval', async () => {
      const batchCalls = [];
      let callCount = 0;
      const events = [
        [ 'a/b/key1', 'val1' ],
        [ 'a/b/key2', 'val2' ],
        [ 'a/b/key3', 'val3' ],
        [ 'a/b/key4', '4' ]
      ];
      const fakeLevelDb = {
        promisify: () => { return fakeLevelDb; },
        batch: (args) => {
          batchCalls.push(args);
        },
        iterator: () => {
          const next = async () => {
            const returnMe = events[callCount];
            callCount++;
            return Promise.resolve(returnMe);
          };
          const close = async () => {
            return true;
          };
          return { next, close };
        },
        open: () => {
          return true;
        }
      };

      const kvStore = KVStore(fakeLevelDb);
      await kvStore.initialize();

      (await kvStore.get('a', 'b', 'key1')).should.equal('val1');
      await kvStore.set('a', 'b', 'key2', 'changedVal');
      (await kvStore.del('a', 'b', 'key3')).should.equal('val3');
      (await kvStore.incr('a', 'b', 'key4', 1)).should.equal('5');
      await kvStore.set('a', 'b', 'key5', 'newVal');

      await sleep(520);

      batchCalls.should.deepEqual([[
        { key: 'a/b/key2', value: 'changedVal', type: 'put' },
        { key: 'a/b/key3', type: 'del' },
        { key: 'a/b/key4', value: '5', type: 'put' },
        { key: 'a/b/key5', value: 'newVal', type: 'put' }
      ]]);

      (await kvStore.incr('a', 'b', 'key4', 1)).should.equal('6');
      should(await kvStore.del('a', 'b', 'key3')).be.null();

      await kvStore.shutdown();

      batchCalls.should.deepEqual([
        [
          { key: 'a/b/key2', value: 'changedVal', type: 'put' },
          { key: 'a/b/key3', type: 'del' },
          { key: 'a/b/key4', value: '5', type: 'put' },
          { key: 'a/b/key5', value: 'newVal', type: 'put' }
        ],
        [ { key: 'a/b/key4', value: '6', type: 'put' } ]
      ]);
    });
  });
});
