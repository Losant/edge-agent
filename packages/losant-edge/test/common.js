import path from 'node:path';
import should from 'should';
import {
  replace, toString, split, map, pipe, when, last,
  equals, dropLast, defer
} from 'omnibelt';
import fs from 'fs-extra';
import nock from 'nock';
import tk from 'timekeeper';
import { createSandbox } from 'sinon';
import snap7 from 'node-snap7';
import { AGENT_VERSION } from '../src/constants.js';
import LevelManager from '../src/level/manager.js';
import * as nodeManager from '../src/node-manager.js';
import fakeOpcuaServer from './lib/opcua-test-server.js';
import buildFakeBroker from 'losant-nodejs-utils/test/utils/fake-broker.js';
import command from './__fixtures__/command.js';
import toAgentFlowsInitial from './__fixtures__/to-agent-flows-initial.js';
import toAgentPeripheralsInitial from './__fixtures__/to-agent-peripherals-initial.js';
import logger from '../src/logger/index.js';
import logBuffer from '../src/logger/log-buffer.js';
import startSocat from './lib/socat.js';
import { restoreEnv } from 'losant-nodejs-utils/test/utils/mocha-helpers.js';
import { describeService } from 'losant-nodejs-utils/test/utils/test-services.js';

const pathToEdgeConfFixture = path.resolve(import.meta.dirname, '__fixtures__', 'losant-edge-agent-config.simple.toml');
const pathToEdgeTestToml = path.resolve(import.meta.dirname, '__fixtures__', 'losant-edge-agent-config.full.toml');
const pathToDiskFlows = process.env.WORKFLOW_DIRECTORY_DEFAULT || path.resolve(import.meta.dirname, '__fixtures__', 'workflows');
const testingWorkspace = path.resolve(import.meta.dirname, 'testing-workspace');
const pathToLevelDbTesting = path.resolve(testingWorkspace, 'common-losant-edge-agent-store.db');
const pathToLoggerSpecWorkspace = path.resolve(testingWorkspace, 'logger');
const pathToLoggerSpecLogFile = process.env.LOGGER_OUT_DEFAULT || path.resolve(pathToLoggerSpecWorkspace, 'logger-spec-temp.log');

// Mocha by default attaches to the unhandled exception handler
// but not the unhandledRejection handler. This makes sure tests
// fail on unhandled rejections
process.on('unhandledRejection', (rejection) => { throw rejection; });

const sinonSandbox = createSandbox();
let fakeBroker, levelManager, s7Server, socat;

const mochaGlobalSetup = async function() {
  levelManager = LevelManager({
    basePath: pathToLevelDbTesting,
    path: path.resolve(pathToLevelDbTesting, '111111111111111111111111')
  });
  fakeBroker = await buildFakeBroker(1883);
  s7Server = new snap7.S7Server();
  s7Server.SetParam(s7Server.LocalPort, 4567);
  const s7Startup = defer();
  s7Server.StartTo('0.0.0.0', (err) => {
    if (err) {
      s7Startup.reject(s7Server.ErrorText(err));
    }
    s7Startup.resolve();
  });
  await fakeOpcuaServer.before();
  await levelManager.initialize();
  await fakeBroker.initialize();
  await s7Startup.promise;
  socat = await startSocat();
};

const mochaGlobalTeardown = async function() {
  const s7Shutdown = defer();
  s7Server.Stop((err) => {
    if (err) {
      s7Shutdown.reject(s7Server.ErrorText(err));
    }
    s7Shutdown.resolve();
  });
  await fakeOpcuaServer.after();
  await levelManager.shutdown();
  await levelManager.reset();
  await fakeBroker.shutdown();
  await nodeManager.shutdown();
  fs.removeSync(testingWorkspace);
  await s7Shutdown.promise;
  await socat.shutdown();
};

const mochaHooks = {
  beforeEach: async function() {
    tk.reset();
    nock.disableNetConnect();
    nock.cleanAll();
    await fakeOpcuaServer.beforeEach();
    await levelManager.reset();
    logBuffer.reset();
    await socat.reset();
  },
  afterEach: async function() {
    await fakeBroker.reset();
    await fakeOpcuaServer.afterEach();
    sinonSandbox.verifyAndRestore();
  }
};

const fakeBrokerGatewayConf = {
  host: '127.0.0.1',
  protocol: 'mqtt://',
  id: '123412341234123412341234',
  key: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  secret: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
};

// :: Path -> Buffer|String -> String
const toTestableLinesDir = (workingDir) => pipe(
  toString,
  split('\n'),
  map(pipe(
    replace(/\d\d\d\d-\d\d-\d\dT\d\d:\d\d:\d\d.\d\d\dZ/, '0000-00-00T00:00:00.000Z'),
    replace(workingDir, '__WORKING_DIR__'),
    replace(`Agent Version: ${AGENT_VERSION.version}`, 'Agent Version: 0.0.0'),
    replace('[\u001b[31merror\u001b[39m]', '[error]'),
    replace('[\u001b[33mwarn\u001b[39m]', '[warn]'),
    replace('[\u001b[32minfo\u001b[39m]', '[info]'),
    replace('[\u001b[36mverbose\u001b[39m]', '[verbose]')
  )),
  when(
    pipe(last, equals('')),
    dropLast(1)
  )
);

export const fixtures = {
  command,
  toAgentFlowsInitial,
  toAgentPeripheralsInitial
};

const stubLogger = (types = ['warn', 'errorNoRollbar', 'error', 'info', 'verbose']) => {
  const loggerCalls = [];
  types.forEach((type) => {
    sinonSandbox.stub(logger, type).callsFake((...params) => {
      params.unshift(type);
      loggerCalls.push(params);
    });
  });
  return loggerCalls;
};

export {
  mochaGlobalSetup,
  mochaGlobalTeardown,
  mochaHooks,
  pathToLevelDbTesting,
  pathToEdgeConfFixture,
  pathToEdgeTestToml,
  pathToLoggerSpecWorkspace,
  pathToLoggerSpecLogFile,
  pathToDiskFlows,
  testingWorkspace,
  fakeBrokerGatewayConf,
  fakeBroker,
  levelManager,
  tk,
  nock,
  toTestableLinesDir,
  should,
  sinonSandbox as sinon,
  s7Server,
  stubLogger,
  restoreEnv,
  socat,
  describeService
};
