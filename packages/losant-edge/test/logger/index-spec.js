// NOTE: Default log out is `pathToLoggerSpecLogFile`
// NOTE: Default log level is 'error' for other tests

import {
  pathToLoggerSpecWorkspace as workingDir,
  pathToLoggerSpecLogFile as workingLog,
  toTestableLinesDir,
  sinon
} from '../common.js';
import { __, curryN, sleep, concat } from 'omnibelt';
import path from 'node:path';
import fs from 'fs-extra';
import {
  captureStdout,
  captureStderr
} from 'capture-console';
import rollbar from '../../src/rollbar.js';
import logger from '../../src/logger/index.js';
import logBuffer from '../../src/logger/log-buffer.js';

let toTestableLines;

const readFile = curryN(2, fs.readFile)(__, 'utf8');
const readFileTestableLines = async (filename) => {
  await sleep(50); // Let winston settle
  return readFile(filename).then(toTestableLines);
};
const readLog = () => readFileTestableLines(workingLog);

describe('logger', function() {

  before(async function() {
    toTestableLines = toTestableLinesDir(workingDir);
    // NOTE: Logger should have already made this path (there's a test)
    // await fs.ensureFile(workingLog);
  });
  after(async function() {
    await fs.remove(workingDir);
  });

  describe('init', function() {

    it('exports a singleton of expected interface', function() {
      // Passing by nature of the code not blowing up on require
    });

    it('creates a log file at specified location on init', function() {
      return fs.pathExists(workingLog).should.be.fulfilledWith(true);
    });

  });

  describe('un-tampered with singleton', function() {

    beforeEach(async function() {
      await fs.ensureFile(workingLog);
      await fs.writeFile(workingLog, '');
    });

    it('logs to a file, correct single line format, respects log level', function() {
      logger.error('error message');
      logger.warn('warn message');
      logger.info('info message');
      logger.verbose('verbose message');
      return readLog().should.be.fulfilledWith([
        '0000-00-00T00:00:00.000Z [error] error message'
      ]);
    });

    it('can reconfigure new file transport', async function() {
      const pathToReconfiguredLog = path.resolve(workingDir, 'reconfigured.log');
      logger.reconfigure({
        out: pathToReconfiguredLog,
        level: 'error'
      });
      logger.error('error without context');
      const subject = await readFileTestableLines(pathToReconfiguredLog);
      subject.should.deepEqual([
        '0000-00-00T00:00:00.000Z [error] error without context'
      ]);
      await fs.remove(pathToReconfiguredLog);
    });

    // NOTE: The immediately preceding test reconfigures the logger.
    //       All tests that want to test the initially exported singleton
    //       should go above that test.

  });

  describe('log buffer', function() {

    beforeEach(async function() {
      await fs.ensureFile(workingLog);
      await fs.writeFile(workingLog, '');
      logger.reconfigure({
        out: workingLog,
        level: 'verbose'
      });
    });

    it('should limit total size buffered', async () => {
      logger.verbose(Array.from({ length: 256*1024 }).fill('a').join(''));

      logBuffer._buffers.verbose.size.should.equal(256*1024 + 45);
      let currentBuf = logBuffer.getBuffer('verbose');
      currentBuf.length.should.equal(1);
      currentBuf[0].message.length.should.equal(256*1024 + 45);

      logger.verbose(Array.from({ length: 256*1024 }).fill('a').join(''));
      logBuffer._buffers.verbose.size.should.equal(2 * (256*1024 + 45));
      currentBuf = logBuffer.getBuffer('verbose');
      currentBuf.length.should.equal(2);
      currentBuf[0].message.length.should.equal(256*1024 + 45);
      currentBuf[1].message.length.should.equal(256*1024 + 45);

      logger.verbose(Array.from({ length: 2*1024*1024 }).fill('a').join(''));
      logBuffer._buffers.verbose.size.should.equal(1024*1024);
      currentBuf = logBuffer.getBuffer('verbose');
      currentBuf.length.should.equal(1);
      currentBuf[0].message.length.should.equal(1024*1024);

      for (let i=100; i<400; i++) {
        logger.verbose(`${i}`);
        // eslint-disable-next-line no-await-in-loop
        await sleep(0);
      }

      logBuffer._buffers.verbose.size.should.equal(256*48);
      currentBuf = logBuffer.getBuffer('verbose');
      currentBuf.length.should.equal(256);
      currentBuf.forEach((line, index) => {
        line.message.endsWith(`${index + 144}`).should.equal(true);
        line.message.length.should.equal(48);
      });
      currentBuf[0].message.length.should.equal(48);

      logger.verbose(Array.from({ length: 2*1024*1024 }).fill('a').join(''));
      logBuffer._buffers.verbose.size.should.equal(1024*1024);
      currentBuf = logBuffer.getBuffer('verbose');
      currentBuf.length.should.equal(1);
      currentBuf[0].message.length.should.equal(1024*1024);
    });


  });

  describe('usage', function() {

    beforeEach(async function() {
      await fs.ensureFile(workingLog);
      await fs.writeFile(workingLog, '');
      logger.reconfigure({
        out: workingLog,
        level: 'verbose'
      });
    });

    it('prints all levels on relaxed setting', function() {
      logger.reconfigure({
        out: workingLog,
        level: 'verbose'
      });
      logger.error('error message');
      logger.warn('warn message');
      logger.info('info message');
      logger.verbose('verbose message');
      return readLog().should.be.fulfilledWith([
        '0000-00-00T00:00:00.000Z [error] error message',
        '0000-00-00T00:00:00.000Z [warn] warn message',
        '0000-00-00T00:00:00.000Z [info] info message',
        '0000-00-00T00:00:00.000Z [verbose] verbose message'
      ]);
    });

    it('can reconfigure level', async function() {
      logger.reconfigure({
        out: workingLog,
        level: 'info'
      });
      logger.error('error message');
      logger.warn('warn message');
      logger.info('info message');
      logger.verbose('verbose message');
      return readLog().should.be.fulfilledWith([
        '0000-00-00T00:00:00.000Z [error] error message',
        '0000-00-00T00:00:00.000Z [warn] warn message',
        '0000-00-00T00:00:00.000Z [info] info message'
      ]);
    });

    it('can reconfigure `out` to "console"', async function() {
      logger.reconfigure({
        out: 'console',
        level: 'info'
      });

      const output = concat(
        captureStderr(() => {
          logger.error('error message');
          logger.info('info message');
        }),
        captureStdout(() => {
          logger.error('error message');
          logger.warn('warn message');
          logger.verbose('verbose message');
        })
      );

      toTestableLines(output).should.be.deepEqual([
        '0000-00-00T00:00:00.000Z [error] error message',
        '0000-00-00T00:00:00.000Z [warn] warn message'
      ]);
      return readLog().should.be.fulfilledWith([]);
    });

    it('context is printed when provided', function() {
      logger.error('error WITH context', { foo: 'foo' });
      return readLog().should.be.fulfilledWith([
        '0000-00-00T00:00:00.000Z [error] error WITH context',
        '{"foo": "foo"}'
      ]);
    });

    it('circular context does not explode', function() {
      const context = { a: {} };
      context.a.b = context;

      logger.error('error with circular context', context);
      return readLog().should.be.fulfilledWith([
        '0000-00-00T00:00:00.000Z [error] error with circular context',
        '<ref *1> { a: { b: [Circular *1] } }'
      ]);
    });

    it('context can be empty', function() {
      logger.error('error message', {});
      return readLog().should.be.fulfilledWith([
        '0000-00-00T00:00:00.000Z [error] error message',
        '{}'
      ]);
    });

    it('context is allowed to have `logformat` props', function() {
      logger.error('error message', {
        timestamp: 'timestamp',
        level: 'level',
        message: 'message'
      });
      return readLog().should.be.fulfilledWith([
        '0000-00-00T00:00:00.000Z [error] error message',
        '{"timestamp": "timestamp", "level": "level", "message": "message"}'
      ]);
    });

    it('context is broken to multiple lines when too long', function() {
      logger.error('error message', {
        foo: 'a really long string about the property foo',
        bar: 'another really long string about the property bar'
      });
      return readLog().should.be.fulfilledWith([
        '0000-00-00T00:00:00.000Z [error] error message',
        '{',
        '  "foo": "a really long string about the property foo",',
        '  "bar": "another really long string about the property bar"',
        '}'
      ]);
    });

    it('`logger.error` should rollbar', function(done) {
      const errorMessage = 'error message';
      const errorContext = { foo: 'foo' };

      const stub = sinon.stub(rollbar, 'error');
      stub.callsFake((message, custom, callback) => {
        message.should.equal(errorMessage);
        custom.should.deepEqual({ custom: errorContext });
        callback.should.be.a.Function();
        stub.restore();
        done();
      });

      logger.error(errorMessage, errorContext);
    });

    it('`logger.exception` should rollbar with exception', function(done) {
      const errorMessage = 'error message';
      const errorError = new Error('foo');
      const errorContext = { foo: 'foo' };

      const stub = sinon.stub(rollbar, 'error');
      stub.callsFake((message, err, custom, callback) => {
        message.should.equal(errorMessage);
        err.should.deepEqual(errorError);
        custom.should.deepEqual({ custom: errorContext });
        callback.should.be.a.Function();
        stub.restore();
        done();
      });

      logger.exception(errorMessage, errorError, errorContext);
    });

  });

});
