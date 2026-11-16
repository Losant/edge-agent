// Mocha by default attaches to the unhandled exception handler
// but not the unhandledRejection handler. This makes sure tests
// fail on unhandled rejections
process.on('unhandledRejection', (rejection) => { throw rejection; });

import path from 'node:path';
import nock from 'nock';
import tk from 'timekeeper';
import kvStore from './fake-key-value-store.js';
import * as nodes from '../src/index.js';
import { sleep, uniq, flatten, keys } from 'omnibelt';
import u from 'updeep';
import { addToPreviousNodeInfo } from '../src/lib/node-runner-helpers.js';
import { restoreEnv } from 'losant-nodejs-utils/test/utils/mocha-helpers.js';
import { describeService } from 'losant-nodejs-utils/test/utils/test-services.js';
import { createSandbox } from 'sinon';
import measureCpu from 'losant-nodejs-utils/test/utils/measure-cpu.js';
import fs from 'fs-extra';
import errors from 'losant-nodejs-utils/src/errors.js';
export const testDirectory = import.meta.dirname;
const sinonSandbox = createSandbox();
export const sinon = sinonSandbox;
// Enable nock fixture snapshots.
nock.back.fixtures = path.resolve(testDirectory, '__fixtures__');
nock.back.setMode('wild');

const publishedDebugMessages = [];

// make sure payloads are always frozen for testing purposes
keys(nodes).forEach((name) => {
  const klass = nodes[name];
  if (klass.prototype._origRun) { return; } // some are under multiple names
  klass.prototype._origRun = klass.prototype.run;
  klass.prototype.run = function(context, payload, prevNodeInfo) {
    return this._origRun(context, u.freeze(payload), prevNodeInfo);
  };
});

export const mochaHooks = {
  beforeEach: function() {
    tk.reset();
    if (!nock.isActive()) {
      nock.activate();
    }
    nock.disableNetConnect();
    nock.cleanAll();
    kvStore._locks.clear();
    kvStore._values.clear();
    // empty the array, but preserve the array ref
    publishedDebugMessages.length = 0;
  },
  afterEach: async function() {
    sinonSandbox.verifyAndRestore();
    if (!nock.isDone()) {
      await sleep(500);
      if (!nock.isDone()) {
        throw new Error(`Pending Nocks: ${nock.pendingMocks()}`);
      }
    }
  }
};

export const mochaGlobalTeardown = function() {
  keys(nodes).forEach((name) => {
    const klass = nodes[name];
    if (klass.shutdown) {
      klass.shutdown();
    }
  });
};

const runNodes = async (nodeIds, payload, context, prevNodeInfo) => {
  nodeIds = uniq(flatten(nodeIds || []));
  if (nodeIds.length === 0) { return { pathsCompleted: 1, errors: [] }; }
  const result = { pathsCompleted: 0, errors: [] };
  await Promise.all(nodeIds.map(async (nodeId) => {
    let outputIds, newPayload, deepErrors;
    try {
      [outputIds, newPayload, deepErrors] = await context.nodes[nodeId].run(context, payload, prevNodeInfo);
    } catch (e) {
      result.errors.push({ nodeId, error: { name: e.name, message: e.message } });
      return;
    }
    if (deepErrors?.length > 0) {
      result.errors.push(...deepErrors);
    } else {
      if (prevNodeInfo) {
        prevNodeInfo = addToPreviousNodeInfo(nodeId, 0, true, prevNodeInfo);
      }
      const innerResult = await runNodes(outputIds, newPayload, context, prevNodeInfo);
      result.pathsCompleted += innerResult.pathsCompleted;
      result.errors.push(...innerResult.errors);
    }
  }));
  return result;
};

const defaultGuardPath = async (rawPath, { checkAncestors = false } = {}) => {
  if (typeof rawPath !== 'string') {
    throw errors.Validation({ message: 'Path must be a string.' });
  }
  if (!rawPath) {
    if (checkAncestors) {
      throw errors.Validation({ message: 'The provided disk path cannot be empty.' });
    }
    return { resolvedPath: '', realPath: undefined };
  }
  const resolvedPath = path.resolve(rawPath);
  let realPath;
  try {
    realPath = await fs.realpath(resolvedPath);
  } catch {
    // Target does not exist on disk or is a dangling symlink.
  }
  if (realPath) {
    return { resolvedPath, realPath };
  }
  if (checkAncestors) {
    let lstat;
    try {
      lstat = await fs.lstat(resolvedPath);
    } catch {
      lstat = undefined;
    }
    if (lstat?.isSymbolicLink()) {
      throw errors.Validation({ message: 'The provided disk path is a symlink with no valid target.' });
    }
  }
  return { resolvedPath, realPath: undefined };
};

const defaultGuardFileReadPath = async (rawPath) => {
  const { realPath } = await defaultGuardPath(rawPath);
  let stats;
  try {
    stats = realPath && await fs.stat(realPath);
  } catch {}
  if (!stats) {
    throw errors.NotFound({ message: `No file exists at "${rawPath}"` });
  }
  if (!stats.isFile()) {
    throw errors.NotFound({
      message: stats.isDirectory() ? 'The provided disk path is a directory.' : 'The provided disk path is not a regular file.'
    });
  }
  return { realPath, stats };
};

const defaultLoadGuardedFile = async (rawPath, { encoding } = {}) => {
  const { realPath } = await defaultGuardFileReadPath(rawPath);
  return fs.readFile(realPath, encoding);
};

const defaultDiskUtils = {
  guardPath: defaultGuardPath,
  guardFileReadPath: defaultGuardFileReadPath,
  loadGuardedFile: defaultLoadGuardedFile
};

// simulates every guard rejecting the path as inside the protected agent directory
const protectedDiskUtils = (() => {
  const reject = async () => {
    throw errors.Validation({ message: 'Cannot access within the protected Losant Edge Agent directory.' });
  };
  return { guardPath: reject, guardFileReadPath: reject, loadGuardedFile: reject };
})();

const contextify = (obj = {}) => {
  return {
    diskUtils: defaultDiskUtils,
    kvStore,
    publishDebugMessage: async function(msgObj, prevNodeInfo) {
      // NOTE 'this' is the workflow context object
      await sleep(0);
      publishedDebugMessages.push({
        applicationId: this.applicationId,
        flowId: this.flowId,
        etag: this.etag,
        prevNodeInfo,
        msgObj
      });
    },
    runNodes: function(outputIds, newPayload, context) {
      return runNodes(outputIds, newPayload, context, context.publishDebugMessage ? { ids: [], durations: [] } : null);
    },
    externalTimeout: 30000,
    maxFlowRunTime: 60000,
    runStart: Date.now(),
    maxConcurrentNodes: 5,
    concurrent: { awaiting: [], count: 0 },
    applicationId: '000000000000000000000002',
    flowId: '000000000000000000000001',
    flowVersion: 'develop',
    ...obj
  };
};

export {
  tk,
  nock,
  kvStore,
  contextify,
  defaultGuardPath,
  defaultDiskUtils,
  protectedDiskUtils,
  publishedDebugMessages,
  measureCpu,
  restoreEnv,
  describeService
};
