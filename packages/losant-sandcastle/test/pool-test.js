import Pool from '../src/pool.js';
import { defer } from 'omnibelt';
import path from 'node:path';

const wrapScript = async (script, index) => {
  const deferred = defer();
  script.on('timeout', (...args) => deferred.resolve([index, 'timeout', args]));
  script.on('error', (...args) => deferred.resolve([index, 'error', args]));
  script.on('exit', (...args) => deferred.resolve([index, 'exit', args]));
  return deferred.promise;
};

describe('Pool', () => {
  let pool;

  afterEach(async () => {
    if (pool) {
      pool.shutdown();
      pool.runQueue.length.should.equal(0);
      pool = null;
    }
  });

  it('should run multiple scripts', async () => {
    pool = new Pool({ numberOfInstances: 5 }, { sandboxModulePath: path.resolve(import.meta.dirname, '../src/unsafe-sandbox.js') });
    await pool.waitForPoolReady();

    const promises = [];
    for (let i = 0; i < 10; ++i) {
      const script = pool.createScript(`payload.testGlobal += ${i};`, `owner-${i}`);
      promises.push(wrapScript(script, i));
      script.run({ testGlobal: 10 });
    }

    (await Promise.all(promises)).should.deepEqual([
      [0, 'exit', [ null, { testGlobal: 10 } ]],
      [1, 'exit', [ null, { testGlobal: 11 } ]],
      [2, 'exit', [ null, { testGlobal: 12 } ]],
      [3, 'exit', [ null, { testGlobal: 13 } ]],
      [4, 'exit', [ null, { testGlobal: 14 } ]],
      [5, 'exit', [ null, { testGlobal: 15 } ]],
      [6, 'exit', [ null, { testGlobal: 16 } ]],
      [7, 'exit', [ null, { testGlobal: 17 } ]],
      [8, 'exit', [ null, { testGlobal: 18 } ]],
      [9, 'exit', [ null, { testGlobal: 19 } ]]
    ]);
  });

  it('should run scripts on non blocking instances', async () => {
    pool = new Pool({ numberOfInstances: 2 }, { sandboxModulePath: path.resolve(import.meta.dirname, '../src/unsafe-sandbox.js') });
    await pool.waitForPoolReady();

    const promises = [];

    // Create blocking script.
    const blockingScript = pool.createScript('while(true);', 'blockingOwner', { timeout: 1000 });
    promises.push(wrapScript(blockingScript, -1));
    blockingScript.run();

    for (let i = 0; i < 10; ++i) {
      const script = pool.createScript(`return ${i};`, `owner-${i}`);
      promises.push(wrapScript(script, i));
      script.run();
    }

    (await Promise.all(promises)).should.deepEqual([
      [-1, 'timeout', []],
      [0, 'exit', [ null, 0 ]],
      [1, 'exit', [ null, 1 ]],
      [2, 'exit', [ null, 2 ]],
      [3, 'exit', [ null, 3 ]],
      [4, 'exit', [ null, 4 ]],
      [5, 'exit', [ null, 5 ]],
      [6, 'exit', [ null, 6 ]],
      [7, 'exit', [ null, 7 ]],
      [8, 'exit', [ null, 8 ]],
      [9, 'exit', [ null, 9 ]]
    ]);
  });

  it('should deal with scripts that error', async () => {
    pool = new Pool({ numberOfInstances: 1 }, { sandboxModulePath: path.resolve(import.meta.dirname, '../src/unsafe-sandbox.js') });
    await pool.waitForPoolReady();

    const script = pool.createScript('return 1;', 'owner');
    const resultPromise = wrapScript(script, 0);

    const ctx = {};
    ctx.ctx = ctx;

    script.run(ctx);

    const result = await resultPromise;
    result[1].should.equal('error');
    result[2][0].message.should.equal('Unserializable payload.');
  });

  it('should deal with scripts that timeout after waiting', async () => {
    pool = new Pool({ numberOfInstances: 1 }, { sandboxModulePath: path.resolve(import.meta.dirname, '../src/unsafe-sandbox.js') });
    await pool.waitForPoolReady();

    const promises = [];
    // Create blocking script.
    const script0 = pool.createScript('while(true);', 'owner1', { timeout: 1000 });
    promises.push(wrapScript(script0, 0));

    const script1 = pool.createScript('return 1;', 'owner2', { timeout: 500 });
    promises.push(wrapScript(script1, 1));

    script0.run();
    script1.run();

    (await Promise.all(promises)).should.deepEqual([
      [0, 'timeout', []],
      [1, 'timeout', []]
    ]);
  }).timeout(30000);

  it('should not let a single owner take all the resources', async () => {
    const exitTimes = [];

    const onExit = (args) => {
      exitTimes[args[0]] = Date.now();
      return args;
    };
    const runCountByOwner = new Map();
    const canRunCheck = ({ ownerId }) => {
      return (runCountByOwner.get(ownerId) || 0) < 1; // only allow one script from an owner to run at a time
    };
    const preScriptRunCallback = ({ ownerId }) => {
      const currentCount = runCountByOwner.get(ownerId) || 0;
      runCountByOwner.set(ownerId, currentCount + 1);
    };
    const postScriptRunCallback = ({ ownerId }) => {
      let currentCount = runCountByOwner.get(ownerId) || 0;
      if (--currentCount <= 0) {
        runCountByOwner.delete(ownerId);
      } else {
        runCountByOwner.set(ownerId, currentCount);
      }
    };
    pool = new Pool({ numberOfInstances: 2, canRunCheck, preScriptRunCallback, postScriptRunCallback }, { memoryLimitMB: 25, sandboxModulePath: path.resolve(import.meta.dirname, '../src/unsafe-sandbox.js') });
    await pool.waitForPoolReady();

    const promises = [];
    // Create blocking script.
    const script0 = pool.createScript('while(true);', 'owner1', { timeout: 500 });
    promises.push(wrapScript(script0, 0).then(onExit));

    const script1 = pool.createScript('payload.name = "script1";', 'owner1', { timeout: 1000 });
    promises.push(wrapScript(script1, 1).then(onExit));

    const script2 = pool.createScript('payload.name = "script2";', 'newOwner', { timeout: 250 });
    promises.push(wrapScript(script2, 2).then(onExit));

    const queuedTime = Date.now();
    script0.run({});
    script1.run({});
    script2.run({});
    const results = await Promise.all(promises);
    results.should.deepEqual([
      [ 0, 'timeout', [] ],
      [ 1, 'exit', [ null, { name: 'script1' } ] ],
      [ 2, 'exit', [ null, { name: 'script2' } ] ]
    ]);
    (exitTimes[0] - queuedTime).should.be.aboveOrEqual(499); // should have timed out
    exitTimes[1].should.be.aboveOrEqual(exitTimes[0]); // should have waited for timeout then ran...
    exitTimes[2].should.be.below(exitTimes[1]); // should not be blocked
  });

});
