import SandCastle from '../src/sandcastle.js';
import should from 'should';
import { defer } from 'omnibelt';
import errors from 'losant-nodejs-utils/src/errors.js';
import path from 'node:path';

const sandcastleReady = (sandcastle) => {
  return new Promise((resolve) => sandcastle.onSandboxReady(resolve));
};

const wrapScript = async (script) => {
  const deferred = defer();
  script.on('timeout', (...args) => deferred.resolve(['timeout', args]));
  script.on('error', (...args) => deferred.resolve(['error', args]));
  script.on('exit', (...args) => deferred.resolve(['exit', args]));
  return deferred.promise;
};

describe('SandCastle', () => {
  let sandcastle;

  afterEach(() => {
    if (sandcastle) {
      sandcastle.shutdown();
      sandcastle = null;
    }
  });

  it('should correctly run simple script', async () => {
    sandcastle = new SandCastle({ sandboxModulePath: path.resolve(import.meta.dirname, '../src/unsafe-sandbox.js') });
    await sandcastleReady(sandcastle);

    const script = sandcastle.createScript(`
      var result = 1 + 1;
      return { results: [ result ] };
    `);

    const resultPromise = wrapScript(script);

    script.run();

    (await resultPromise).should.deepEqual([
      'exit', [ null, { results: [ 2 ] } ]
    ]);
  });

  it('should correctly deal with a date', async () => {
    sandcastle = new SandCastle({ sandboxModulePath: path.resolve(import.meta.dirname, '../src/unsafe-sandbox.js') });
    await sandcastleReady(sandcastle);

    const script = sandcastle.createScript(`
      return { date: new Date(payload.input.getTime() + 1) };
    `);

    const resultPromise = wrapScript(script);

    script.run({ input: new Date(1234567) });

    (await resultPromise).should.deepEqual([
      'exit', [ null, { date: new Date(1234568) } ]
    ]);
  });

  it('should pass context to run()', async () => {
    sandcastle = new SandCastle({ sandboxModulePath: path.resolve(import.meta.dirname, '../src/unsafe-sandbox.js') });
    await sandcastleReady(sandcastle);

    const script = sandcastle.createScript('return payload.foo;');
    const resultPromise = wrapScript(script);

    script.run({ foo: 'bar' });

    (await resultPromise).should.deepEqual([
      'exit', [ null, 'bar' ]
    ]);
  });

  it('should timeout and respawn when looping script runs', async () => {
    sandcastle = new SandCastle({ sandboxModulePath: path.resolve(import.meta.dirname, '../src/unsafe-sandbox.js') });
    await sandcastleReady(sandcastle);

    const loopingScript = sandcastle.createScript('while(true) {};', { timeout: 1000 });
    const safeScript = sandcastle.createScript('return "banana";', { timeout: 1000 });

    const loopResultPromise = wrapScript(loopingScript);
    const safeResultPromise = wrapScript(safeScript);

    loopingScript.run();

    (await loopResultPromise).should.deepEqual([
      'timeout', []
    ]);

    await sandcastleReady(sandcastle);

    safeScript.run();
    (await safeResultPromise).should.deepEqual([
      'exit', [ null, 'banana' ]
    ]);
  });

  it('should kill process due to failing heartbeat', async () => {
    sandcastle = new SandCastle({ sandboxModulePath: path.resolve(import.meta.dirname, '../src/unsafe-sandbox.js'), timeout: 500 });
    await sandcastleReady(sandcastle);

    const loopingScript = sandcastle.createScript('while(true) {};', { timeout: 5000 });

    const loopResultPromise = wrapScript(loopingScript);

    loopingScript.run();

    (await loopResultPromise).should.deepEqual([
      'error',
      [ errors.NodeMaxRetryReached({
        title: 'Function Node',
        times: 3
      }) ]
    ]);

    await sandcastleReady(sandcastle);
  });

  it('should fail to escape with constructor fun', async () => {
    sandcastle = new SandCastle({ sandboxModulePath: path.resolve(import.meta.dirname, '../src/unsafe-sandbox.js') });
    await sandcastleReady(sandcastle);

    const unSafeScript = sandcastle.createScript(`
      return Buffer.constructor.constructor('return this')().process.pid
    `);
    const unSafeResultPromise = wrapScript(unSafeScript);

    unSafeScript.run({ a: 'hi' });

    const unSafeResult = (await unSafeResultPromise);
    unSafeResult[0].should.deepEqual('exit');
    should(unSafeResult[1][0]).be.null();
    (typeof unSafeResult[1][1]).should.equal('number');
  });

  it('should allow async await for unsafe scripts, with rejected result', async () => {
    sandcastle = new SandCastle({ sandboxModulePath: path.resolve(import.meta.dirname, '../src/unsafe-sandbox.js') });
    await sandcastleReady(sandcastle);

    const unSafeScript = sandcastle.createScript(`
      const results = await new Promise((resolve, reject) => {
        setTimeout(() => {
          reject(new Error('nope'));
        }, 1);
      });
      return results;
    `);
    const unSafeResultPromise = wrapScript(unSafeScript);

    unSafeScript.run({ a: 'hi' });

    const unSafeResult = (await unSafeResultPromise);
    unSafeResult.should.deepEqual([ 'exit', [ new Error('nope'), null ] ]);
  });

  it('should allow async await for scripts by default', async () => {
    sandcastle = new SandCastle({ sandboxModulePath: path.resolve(import.meta.dirname, '../src/unsafe-sandbox.js') });
    await sandcastleReady(sandcastle);

    let unSafeScript = sandcastle.createScript(`
      const results = await new Promise((resolve, reject) => {
        setTimeout(() => {
          resolve(payload.a + ' again');
        }, 1);
      });
      return results;
    `);
    let unSafeResultPromise = wrapScript(unSafeScript);

    unSafeScript.run({ a: 'hi' });

    let unSafeResult = (await unSafeResultPromise);
    unSafeResult.should.deepEqual([ 'exit', [ null, 'hi again' ] ]);

    unSafeScript = sandcastle.createScript('return (async () => { return "no"; })()');
    unSafeResultPromise = wrapScript(unSafeScript);
    unSafeScript.run({ a: 'hi' });
    unSafeResult = (await unSafeResultPromise);
    unSafeResult.should.deepEqual([ 'exit', [ null, 'no' ] ]);

    unSafeScript = sandcastle.createScript(`return new Promise((resolve) => {
      setTimeout(() => {
        resolve(payload.a + ' again');
      }, 1);
    });`);
    unSafeResultPromise = wrapScript(unSafeScript);
    unSafeScript.run({ a: 'hi' });
    unSafeResult = (await unSafeResultPromise);
    unSafeResult.should.deepEqual([ 'exit', [ null, 'hi again' ] ]);
  });

  it('should share process env for unsafe', async () => {
    sandcastle = new SandCastle({ sandboxModulePath: path.resolve(import.meta.dirname, '../src/unsafe-sandbox.js') });
    await sandcastleReady(sandcastle);

    const unSafeScript = sandcastle.createScript(`
      return !!require('process').env.PATH;
    `);
    const unSafeResultPromise = wrapScript(unSafeScript);

    unSafeScript.run({ });

    const unSafeResult = (await unSafeResultPromise);
    unSafeResult.should.deepEqual([ 'exit', [ null, true ] ]);
  });
});
