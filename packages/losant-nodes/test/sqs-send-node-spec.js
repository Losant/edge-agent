import SqsSendNode from '../src/sqs-send-node.js';
import { sqsConfig } from 'losant-nodejs-utils/test/utils/testing-constants.js';
import { mockClient } from 'aws-sdk-client-mock';
import { SQSClient } from '@aws-sdk/client-sqs';
let sqsMock;

describe('SqsSendNode', () => {
  afterEach(() => {
    if (sqsMock) {
      sqsMock.restore();
      sqsMock = null;
    }
  });
  it('should successfully publish from direct config', async function() {
    sqsMock = mockClient(SQSClient);

    sqsMock
      .onAnyCommand((cmd) => {
        cmd.MessageBody.should.equal("I'm sendin you a message");
        cmd.MessageAttributes['1'].should.deepEqual({
          DataType: 'Number', StringValue: '2'
        });
        cmd.MessageAttributes.myKey.should.deepEqual({
          DataType: 'String', StringValue: 'myValue'
        });
        return true;
      })
      .resolves({ MD5OfMessageAttributes: '00b0b996888af0f44b9cd6df8cc7d16c', MD5OfMessageBody: '969bf297778c52dc909887225a93805e', MessageId: 'f9aecfb9-b1ef-4888-84dc-252ae5bb471b', SequenceNumber: '2675222970749800376320' });

    const node = new SqsSendNode('id', [[4]], {
      regionTemplate: sqsConfig.region,
      accessKeyIdTemplate: sqsConfig.accessKeyId,
      secretAccessKeyTemplate: sqsConfig.secretAccessKey,
      queueUrl: 'https://sqs.us-east-2.amazonaws.com/123456789012/nodeTest.fifo',
      dataMethod: 'stringTemplate',
      dataTemplate: '{{c}}',
      attributeMethod: 'individualFields',
      attributeFields: [{ keyTemplate: '{{d}}', valueTemplate: '{{e}}' }, { keyTemplate: 1, valueTemplate: 2 }],
      resultPath: 'f',
      messageGroupIdTemplate: 'test',
      messageDeduplicationIdTemplate: `${Math.random()}`
    });

    const results = await node.run({},
      {
        b: 'foo',
        c: 'I\'m sendin you a message',
        d: 'myKey',
        e: 'myValue'
      });

    results.should.deepEqual([
      [[4]],
      {
        b: 'foo',
        c: 'I\'m sendin you a message',
        d: 'myKey',
        e: 'myValue',
        f: { messageId: results[1].f.messageId, success: true }
      }
    ]);
  });

  it('should require direct config', async function() {
    const node = new SqsSendNode('id', [[4]], {
      dataMethod: 'stringTemplate',
      dataTemplate: '{{c}}',
      attributeMethod: 'individualFields',
      attributeFields: [{ keyTemplate: '{{d}}', valueTemplate: '{{e}}' }, { keyTemplate: 1, valueTemplate: 2 }],
      resultPath: 'f',
      messageGroupIdTemplate: 'test',
      messageDeduplicationIdTemplate: `${Math.random()}`
    });

    const results = await node.run({},
      {
        b: 'foo',
        c: 'I\'m sendin you a message',
        d: 'myKey',
        e: 'myValue'
      });

    results.should.deepEqual([
      [[4]],
      {
        b: 'foo',
        c: 'I\'m sendin you a message',
        d: 'myKey',
        e: 'myValue',
        f: { error: { message: 'Missing AWS Access Key ID', type: 'MissingField' }, success: false }
      }
    ]);
  });
});
