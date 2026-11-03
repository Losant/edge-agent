import { levelManager } from '../common.js';
import { noop } from 'omnibelt';
import NodeRunner from '../../src/node-runner.js';
import abstractLatchNodeTests from 'losant-nodes/test/abstract/latch-node-spec.js';

let nodeRunner, contextify, kvStore;
describe('LatchNode', () => {
  before(async function() {
    nodeRunner = NodeRunner(levelManager.keyValueStore, { fireOnError: noop }, {}, {}, {
      sendMqttMessage: noop, sendDebugMessage: noop, sendStatsMessage: noop
    });
    await nodeRunner.initialize();
    contextify = nodeRunner.contextify;
    kvStore = levelManager.keyValueStore;
  });

  after(async function() {
    await nodeRunner.shutdown();
  });
  abstractLatchNodeTests(() => {
    return { contextify, kvStore };
  });
});
