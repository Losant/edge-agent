import '../common.js';
import { sleep } from 'omnibelt';
import connectionManager from '../../src/lib/connections-manager.js';

describe('Connections Manager', () => {
  let manager;
  const build = (runInternal) => {
    manager = connectionManager({
      getCacheKey: ({ id }) => id,
      terminateClient: async () => {},
      getClientPromise: async () => ({}),
      runInternal,
      transformError: (instruction, message) => [{ message }],
      cleanUpInterval: 100000
    });
    return manager;
  };
  afterEach(async () => {
    await manager.shutdown();
  });

  it('should run queued instructions one at a time and mark the client idle', async () => {
    const ran = [];
    build(async ({ name }) => {
      ran.push(name);
      return { name };
    });
    const results = await Promise.all([
      manager.queueInstruction({ id: 'a' }, { name: 'first' }, 1000),
      manager.queueInstruction({ id: 'a' }, { name: 'second' }, 1000)
    ]);
    results.should.deepEqual([ { name: 'first' }, { name: 'second' } ]);
    ran.should.deepEqual([ 'first', 'second' ]);
    await sleep(10);
    manager.clientCache.get('a').isRunning.should.be.false();
  });

  it('should not throw when the client is removed from the cache while an instruction runs', async () => {
    build(async () => {
      manager.clientCache.delete('a');
      return {};
    });
    await manager.queueInstruction({ id: 'a' }, { name: 'first' }, 1000);
    // the next run() call fires after the result resolves; an unhandled rejection fails the test
    await sleep(50);
    manager.clientCache.has('a').should.be.false();
  });
});
