import { PubSub } from '@google-cloud/pubsub';
import { sinon } from './common.js';
import { fakeGoogleCredentials } from 'losant-nodejs-utils/test/utils/testing-constants.js';
import GooglePublishNode from '../src/google-publish-node.js';

describe('GooglePublishNode', () => {
  it('should successfully publish from direct config', async function() {
    const topic = {
      setPublishOptions: sinon.spy(),
      publish: sinon.stub().resolves('1234567890123456')
    };
    sinon.stub(PubSub.prototype, 'topic').returns(topic);

    const node = new GooglePublishNode('id', [[4]], {
      jwtDataTemplate: JSON.stringify(fakeGoogleCredentials),
      topicTemplate: '{{b}}',
      dataMethod: 'stringTemplate',
      dataTemplate: '{{c}}',
      attrMethod: 'individualFields',
      attrFields: [{ keyTemplate: '{{d}}', valueTemplate: '{{e}}' }],
      resultPath: 'f'
    });

    const results = await node.run({},
      {
        b: 'losantTestTopic2',
        c: 'myDataMessage',
        d: 'myKey',
        e: 'myValue',
        f: 'resultPath'
      });
    results.should.deepEqual([
      [[4]],
      {
        b: 'losantTestTopic2',
        c: 'myDataMessage',
        d: 'myKey',
        e: 'myValue',
        f: { messageId: '1234567890123456' }
      }
    ]);

    const client = PubSub.prototype.topic.firstCall.thisValue;
    client.options.projectId.should.equal(fakeGoogleCredentials.project_id);
    client.options.credentials.should.deepEqual(fakeGoogleCredentials);
    PubSub.prototype.topic.firstCall.args.should.deepEqual(['losantTestTopic2']);
    topic.setPublishOptions.firstCall.args.should.deepEqual([{ gaxOpts: { retry: 10 } }]);
    const [data, attributes] = topic.publish.firstCall.args;
    data.toString().should.equal('"myDataMessage"');
    attributes.should.deepEqual({ myKey: 'myValue' });
  });

  it('should require direct config', async function() {
    const node = new GooglePublishNode('id', [[4]], {
      topicTemplate: '{{b}}',
      dataMethod: 'stringTemplate',
      dataTemplate: '{{c}}',
      attrMethod: 'individualFields',
      attrFields: [{ keyTemplate: '{{d}}', valueTemplate: '{{e}}' }],
      resultPath: 'f'
    });

    const results = await node.run({},
      {
        b: 'losantTestTopic2',
        c: 'myDataMessage',
        d: 'myKey',
        e: 'myValue',
        f: 'resultPath'
      });
    results.should.deepEqual([
      [[4]],
      {
        b: 'losantTestTopic2',
        c: 'myDataMessage',
        d: 'myKey',
        e: 'myValue',
        f: { error: { message: 'JWT Data is required', type: 'Validation' } }
      }
    ]);
  });
});
