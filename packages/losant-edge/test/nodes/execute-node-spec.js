import '../common.js';
import ExecuteNode from '../../src/nodes/execute-node.js';
import fs from 'fs-extra';
import { sleep } from 'omnibelt';
const FILENAME = 'test.txt';
import should from 'should';
const cleanUp = () => fs.remove(FILENAME);

describe('ExecuteNode', async () => {
  before(cleanUp);
  after(cleanUp);
  it('should error if no command was given', async () => {
    let error = {};
    const node = new ExecuteNode('id', [[1]], {});
    try {
      await node.run({}, {});
    } catch (e) {
      error = e;
    }
    error.message.should.equal('A command is required');
  });
  it('should be able to run a command', async () => {
    const config = {
      commandTemplate: 'echo \\$NODE_ENV $NODE_ENV \\$ENV $ENV',
      resultPath: 'data',
      cwdTemplate: '{{cwd}}',
      encodingTemplate: '{{encoding}}',
      envsTemplate: [
        { keyTemplate: '{{aKey}}', valueTemplate: '{{theValue}}' },
        { keyTemplate: 'ENV', valueTemplate: '{{envVal}}' }
      ]
    };
    const outputIds = [[1]];
    const node = new ExecuteNode('id', outputIds, config);
    const payload = { aKey: 'NODE_ENV', theValue: 'DEBUG', cwd: './', encoding: 'utf8', envVal: true };
    const output = await node.run({ externalTimeout: 30000 }, payload);
    output[1].should.deepEqual({
      aKey: 'NODE_ENV',
      theValue: 'DEBUG',
      cwd: './',
      encoding: 'utf8',
      envVal: true,
      data: {
        stderr: '',
        exitCode: 0,
        signal: null,
        stdout: '$NODE_ENV DEBUG $ENV true\n'
      }
    });
  });
  it('should be able to run a command that will error', async () => {
    const config = {
      commandTemplate: 'cat -$ randomJSONFile.json',
      resultPath: 'data',
      cwdTemplate: '{{cwd}}',
      encodingTemplate: '{{encoding}}',
      envsTemplate: [
        { keyTemplate: '{{aKey}}', valueTemplate: '{{theValue}}' }
      ]
    };
    const outputIds = [[1]];
    const node = new ExecuteNode('id', outputIds, config);
    const payload = { aKey: 'NODE_ENV', theValue: 'DEBUG', cwd: '', encoding: 'utf8' };
    const output = await node.run({ externalTimeout: 30000 }, payload);
    // handle arm and alpine versions, variations too numerous
    output[1].aKey.should.equal('NODE_ENV');
    output[1].theValue.should.equal('DEBUG');
    output[1].data.error.type.should.equal('EXECUTE_ERROR');
    output[1].data.exitCode.should.equal(1);
  });
  it('should be able to run a command that will error in a detached state', async () => {
    const config = {
      commandTemplate: 'cat -$ randomJSONFile.json',
      resultPath: 'data',
      cwdTemplate: '{{cwd}}',
      encodingTemplate: '{{encoding}}',
      detached: true,
      envsTemplate: [
        { keyTemplate: '{{aKey}}', valueTemplate: '{{theValue}}' }
      ]
    };
    const outputIds = [[1]];
    const node = new ExecuteNode('id', outputIds, config);
    const payload = { aKey: 'NODE_ENV', theValue: 'DEBUG', cwd: '', encoding: 'utf8' };
    const output = await node.run({ externalTimeout: 30000 }, payload);
    output[1].should.deepEqual({
      aKey: 'NODE_ENV',
      theValue: 'DEBUG',
      cwd: '',
      encoding: 'utf8',
      data: {
        exitCode: 1,
        signal: null
      }
    });
  });
  it('should be able to run a command that will error because no bash', async () => {
    const config = {
      commandTemplate: 'lol',
      resultPath: 'data',
      detached: true,
      envsTemplate: [
        { keyTemplate: 'PATH', valueTemplate: '/notReal' }
      ]
    };
    const outputIds = [[1]];
    const node = new ExecuteNode('id', outputIds, config);
    const output = await node.run({ externalTimeout: 30000 }, {});
    output[1].should.deepEqual({
      data: {
        error: { type: 'EXECUTE_ERROR', message: 'spawn bash ENOENT' }
      }
    });
  });
  it('should run a command in a detached state', async function() {
    const date = new Date();
    const config = {
      commandTemplate: `sleep 2 && echo "hello world ${date.toISOString()}" >> ${FILENAME}`,
      resultPath: 'data',
      encodingTemplate: '{{encoding}}',
      envsTemplate: [],
      detached: true
    };
    const outputIds = [[1]];
    const node = new ExecuteNode('id', outputIds, config);
    const payload = { cwd: './', encoding: 'utf8' };
    const output = await node.run({ externalTimeout: 30000 }, payload);
    should(await fs.pathExists(FILENAME)).equal(false);
    output[1].should.deepEqual({
      cwd: './',
      encoding: 'utf8',
      data: {}
    });
    await sleep(2000);
    const contents = await fs.readFile(FILENAME);
    contents.toString().should.equal(`hello world ${date.toISOString()}\n`);
  });
  it('should timeout when waiting for a response', async () => {
    const config = {
      commandTemplate: 'sleep 2',
      resultPath: 'data',
      encodingTemplate: '{{encoding}}',
      envsTemplate: []
    };
    const outputIds = [[1]];
    const node = new ExecuteNode('id', outputIds, config);
    const payload = { cwd: './', encoding: 'utf8' };
    const output = await node.run({ externalTimeout: 1000 }, payload);
    output[1].should.deepEqual({
      cwd: './',
      encoding: 'utf8',
      data: {
        exitCode: null,
        signal: 'SIGTERM',
        stdout: '',
        stderr: '',
        error: {
          type: 'EXECUTE_ERROR',
          message: 'Command failed: sleep 2\n'
        }
      }
    });
  });
});

