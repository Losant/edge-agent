import { EventHubProducerClient } from '@azure/event-hubs';
import { sinon } from './common.js';
import AzureEventHubPublishNode from '../src/azure-event-hub-publish-node.js';

describe('AzureEventHubPublishNode', () => {
  it('should successfully publish from direct config', async function() {
    sinon.stub(EventHubProducerClient.prototype, 'sendBatch').resolves();
    sinon.stub(EventHubProducerClient.prototype, 'close').resolves();

    const node = new AzureEventHubPublishNode('id', [[4]], {
      hubName: 'fake-hub',
      connectionString: 'Endpoint=sb://fake-namespace.servicebus.windows.net/;SharedAccessKeyName=fake;SharedAccessKey=fake',
      partitionKeyTemplate: '{{b}}',
      dataMethod: 'stringTemplate',
      dataTemplate: '{{c}}',
      propMethod: 'individualFields',
      propFields: [{ keyTemplate: '{{d}}', valueTemplate: '{{e}}' }, { keyTemplate: 1, valueTemplate: 2 }],
      resultPath: 'f'
    });

    const results = await node.run({}, {
      b: 'foo',
      c: 'I\'m sendin you a message',
      d: 'myKey',
      e: 'myValue'
    });

    results.should.deepEqual([ [[4]], {
      b: 'foo',
      c: 'I\'m sendin you a message',
      d: 'myKey',
      e: 'myValue',
      f: { success: true }
    }]);

    const sendBatch = EventHubProducerClient.prototype.sendBatch;
    const client = sendBatch.firstCall.thisValue;
    client.fullyQualifiedNamespace.should.equal('fake-namespace.servicebus.windows.net');
    client.eventHubName.should.equal('fake-hub');
    sendBatch.firstCall.args.should.deepEqual([
      [{ body: 'I\'m sendin you a message', properties: { myKey: 'myValue', 1: 2 } }],
      { partitionKey: 'foo' }
    ]);
    EventHubProducerClient.prototype.close.calledOnce.should.be.true();
  });

  it('should require direct config', async function() {
    const node = new AzureEventHubPublishNode('id', [[4]], {
      partitionKeyTemplate: '{{b}}',
      dataMethod: 'stringTemplate',
      dataTemplate: '{{c}}',
      propMethod: 'individualFields',
      propFields: [{ keyTemplate: '{{d}}', valueTemplate: '{{e}}' }, { keyTemplate: 1, valueTemplate: 2 }],
      resultPath: 'f'
    });

    const results = await node.run({}, {
      b: 'foo',
      c: 'I\'m sendin you a message',
      d: 'myKey',
      e: 'myValue'
    });

    results.should.deepEqual([ [[4]], {
      b: 'foo',
      c: 'I\'m sendin you a message',
      d: 'myKey',
      e: 'myValue',
      f: { error: { message: 'Connection String is required', type: 'Validation' }, success: false }
    }]);
  });
});
