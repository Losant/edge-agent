import { levelManager } from '../common.js';
import { noop } from 'omnibelt';
import NodeRunner from '../../src/node-runner.js';
import abstractLoopNodeTests from 'losant-nodes/test/abstract/loop-node-spec.js';

let nodeRunner;

describe('LoopNode Using Edge NodeRunner', function() {
  before(async function() {
    nodeRunner = NodeRunner(levelManager.keyValueStore, { fireOnError: noop }, {}, {}, {
      sendMqttMessage: noop, sendDebugMessage: noop, sendStatsMessage: noop
    });
    await nodeRunner.initialize();
  });

  after(async function() {
    await nodeRunner.shutdown();
  });

  abstractLoopNodeTests((obj) => {
    return {
      ...nodeRunner.contextify(obj),
      flowErrorManager: { fireOnError: noop }
    };
  });
});
