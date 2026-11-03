import { tk, levelManager } from '../common.js';
import ThrottleNode from '../../src/nodes/throttle-node.js';
let kvStore;

describe('ThrottleNode', () => {
  before(() => {
    kvStore = levelManager.keyValueStore;
  });
  it('should run true path if never seen before', async () => {
    const now = Date.now();
    tk.freeze(now);

    const node = new ThrottleNode('node-1', [['2'], ['1']],
      { timeSincePath: 'a.b', ratePerMinute: 1 });

    await kvStore.del('appId', 'flowId', 'throttle/node-1');
    const [oids, p] = await node.run({ kvStore, applicationId: 'appId', flowId: 'flowId' }, {});
    oids.should.deepEqual(['1']);
    p.should.deepEqual({ a: { b: now } });
    const val = await kvStore.get('appId', 'flowId', 'throttle/node-1');
    Number(val).should.equal(now);
  });

  it('should throttle correctly', async () => {
    const now = Date.now();

    const node = new ThrottleNode('node-1', [['2'], ['1']], {
      timeSincePath: 'a.b',
      ratePerMinute: 2,
      throttleIdTemplate: '1{{q}}'
    });

    await kvStore.set('appId', 'flowId', 'throttle/node-1/1w', now);
    tk.freeze(now + 1);
    let [oids, p] = await node.run(
      { kvStore, applicationId: 'appId', flowId: 'flowId' },
      { q: 'w' }
    );
    oids.should.deepEqual(['2']);
    p.should.deepEqual({ a: { b: 1 }, q: 'w' });
    let val = await kvStore.get('appId', 'flowId', 'throttle/node-1/1w');
    Number(val).should.equal(now);
    tk.freeze(now + 30000);
    [oids, p] = await node.run(
      { kvStore, applicationId: 'appId', flowId: 'flowId' },
      { q: 'w' }
    );
    oids.should.deepEqual(['1']);
    p.should.deepEqual({ a: { b: 30000 }, q: 'w' });
    val = await kvStore.get('appId', 'flowId', 'throttle/node-1/1w');
    Number(val).should.equal(now + 30000);
    tk.freeze(now + 40000);
    [oids, p] = await node.run(
      { kvStore, applicationId: 'appId', flowId: 'flowId' },
      { q: 'w' }
    );
    oids.should.deepEqual(['2']);
    p.should.deepEqual({ a: { b: 10000 }, q: 'w' });
    val = await kvStore.get('appId', 'flowId', 'throttle/node-1/1w');
    Number(val).should.equal(now + 30000);
  });

});
