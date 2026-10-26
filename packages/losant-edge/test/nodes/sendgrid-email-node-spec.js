import { nock, levelManager } from '../common.js';
import abstractSendgridEmailNodeTests from 'losant-nodes/test/abstract/sendgrid-email-node-spec.js';
import SendgridEmailNode from '../../src/nodes/sendgrid-email-node.js';
import NodeRunner from '../../src/node-runner.js';
import { noop } from 'omnibelt';

describe('SendgridEmailNode In Edge', function() {
  let nodeRunner;
  before(async function() {
    nodeRunner = NodeRunner(levelManager.keyValueStore, { fireOnError: noop }, {}, {}, {
      sendMqttMessage: noop, sendDebugMessage: noop, sendStatsMessage: noop
    });
    await nodeRunner.initialize();
  });

  after(async function() {
    await nodeRunner.shutdown();
  });

  abstractSendgridEmailNodeTests(SendgridEmailNode, {
    nock,
    contextify: (obj = {}) => nodeRunner.contextify({
      runStart: Date.now(),
      applicationId: '000000000000000000000002',
      flowId: '000000000000000000000001',
      flowVersion: 'develop',
      ...obj
    })
  });
});
