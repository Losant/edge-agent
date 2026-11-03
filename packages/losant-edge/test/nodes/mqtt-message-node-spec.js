import { fakeBroker, stubLogger, pathToEdgeTestToml } from '../common.js';
import MqttMessageNode from '../../src/nodes/mqtt-message-node.js';
import LocalBroker from '../../src/local-broker/index.js';
import MqttClientManager from '../../src/mqtt-client-manager.js';
import main from '../../src/main.js';
import { sleep } from 'omnibelt';

describe('MqttMessageNode', async () => {
  let mqttClientManager;

  afterEach(async () => {
    if (mqttClientManager) {
      await mqttClientManager.shutdown();
      mqttClientManager = null;
    }
  });

  it('should correctly error on invalid topics', async () => {
    let node = new MqttMessageNode('id', [], { topicTemplate: '' });
    await node.run({}, {}).should.be.rejectedWith('A topic must be provided.');

    node = new MqttMessageNode('id', [], { topicTemplate: 'a+b' });
    await node.run({}, {}).should.be.rejectedWith('Invalid topic name: a+b');

    node = new MqttMessageNode('id', [], { topicTemplate: 'a#b' });
    await node.run({}, {}).should.be.rejectedWith('Invalid topic name: a#b');

    node = new MqttMessageNode('id', [], { topicTemplate: 'a\0b' });
    await node.run({}, {}).should.be.rejectedWith('Invalid topic name: a\0b');

    node = new MqttMessageNode('id', [], { topicTemplate: 'losant/a' });
    await node.run({}, {}).should.be.rejectedWith('Invalid topic name: losant/a');

    node = new MqttMessageNode('id', [], { topicTemplate: '$SYS/foo' });
    await node.run({}, {}).should.be.rejectedWith('Invalid topic name: $SYS/foo');

    const longTopic = new Array(232).join('a');
    node = new MqttMessageNode('id', [], { topicTemplate: longTopic });
    await node.run({}, {}).should.be.rejectedWith(`Invalid topic name: ${longTopic}`);

    const broker = LocalBroker({ enabled: true });
    await broker.initialize([], () => {});
    const context = {
      sendMqttMessage: async ({ brokerType, topic, message }) => {
        if (brokerType === 'local') {
          await broker.publish(topic, message);
        }
      }
    };
    node = new MqttMessageNode('id', [], { topicTemplate: '$SYS/foo', integrationId: 'local' });
    await node.run(context, {}).should.be.rejectedWith('Invalid local broker publish topic: $SYS/foo');

    node = new MqttMessageNode('id', [], { topicTemplate: '', integrationId: 'local' });
    await node.run(context, {}).should.be.rejectedWith('A topic must be provided.');
    await broker.shutdown();
  });

  it('should correctly send mqtt message to Losant', async () => {
    const node = new MqttMessageNode('id', [[1]], {
      topicTemplate: 'foo/{{bar}}',
      messageTemplate: '{{bar}} + {{foo}} + WHAT'
    });

    const messages = [];
    const context = {
      flowId: 'myFlowId',
      applicationId: 'myAppId',
      sendMqttMessage: ({ brokerType, topic, message }) => {
        if (brokerType === 'losant') {
          messages.push({ topic, message });
        }
      }
    };

    const [oids, p] = await node.run(context, { foo: 'theFooGuy', bar: 'theBarGuy' });
    oids.should.deepEqual([[1]]);
    p.should.deepEqual({ foo: 'theFooGuy', bar: 'theBarGuy' });

    messages.length.should.equal(1);
    messages[0].topic.should.equal('foo/theBarGuy');
    String(messages[0].message).should.equal('theBarGuy + theFooGuy + WHAT');
  });

  it('should error when sending a too large message to losant', async () => {
    const { gateway, shutdown } = await main({ confPath: pathToEdgeTestToml });
    let bigOleMessage = '';
    for (let i = 0; i < 8500; i++) {
      bigOleMessage += 'ThisIsALargeMessageThatWillError';
    }
    const node = new MqttMessageNode('id', [[1]], {
      topicTemplate: 'foo/{{bar}}',
      messageTemplate: bigOleMessage
    });

    const context = {
      flowId: 'myFlowId',
      applicationId: 'myAppId',
      sendMqttMessage: ({ brokerType, topic, message }) => {
        if (brokerType === 'losant') {
          gateway()._publish(topic, message);
        }
      }
    };

    await node.run(context, { bar: 'theBarGuy' }).should.be.rejectedWith({ message: 'Payload size cannot exceed 262144' });
    await shutdown();
  });

  it('should correctly send an mqtt message from the local broker', async () => {
    const broker = LocalBroker({ enabled: false });
    await broker.initialize([], () => {});

    const node = new MqttMessageNode('id', [[1]], {
      topicTemplate: '{{foo}}/{{bar}}',
      messageTemplate: '{{bar}} + {{foo}} + WHAT',
      integrationId: 'local'
    });
    const messages = [];
    const context = {
      flowId: 'myFlowId',
      applicationId: 'myAppId',
      sendMqttMessage: async ({ brokerType, topic, message }) => {
        if (brokerType === 'local') {
          await broker.publish(topic, message);
        }
      }
    };

    await node.run(context, { foo: 'theFooGuy', bar: 'theBarGuy' }).should.be.rejectedWith('Local Broker is not enabled');
    await broker.shutdown();

    const newBroker = LocalBroker({ enabled: true });
    context.sendMqttMessage = async ({ brokerType, topic, message }) => {
      if (brokerType === 'local') {
        messages.push({ topic, buffer: message });
        await newBroker.publish(topic, message);
      }
    };
    await node.run(context, { foo: 'theFooGuy', bar: 'theBarGuy' }).should.be.rejectedWith('Failed to publish message, local broker has been disconnected');
    messages.pop(); //ignore the message from this failed pub
    await newBroker.initialize([], () => {});

    const [oids, p] = await node.run(context, { foo: 'theFooGuy', bar: 'theBarGuy' });
    oids.should.deepEqual([[1]]);
    p.should.deepEqual({ foo: 'theFooGuy', bar: 'theBarGuy' });

    messages.length.should.equal(1);
    messages[0].topic.should.equal('theFooGuy/theBarGuy');
    String(messages[0].buffer).should.equal('theBarGuy + theFooGuy + WHAT');

    await node.run(context, { foo: '$SYS', bar: 'theBarGuy' }).should.be.rejectedWith('Invalid local broker publish topic: $SYS/theBarGuy');
    messages.length.should.equal(2);
    messages[1].topic.should.equal('$SYS/theBarGuy');
    String(messages[1].buffer).should.equal('theBarGuy + $SYS + WHAT');

    await newBroker.shutdown();
  });

  it('should correctly send an mqtt message to an external broker', async () => {
    const loggerCalls = stubLogger();
    mqttClientManager = MqttClientManager({
      configName1: {
        type: 'mqttClient',
        name: 'configName1',
        host: '127.0.0.1',
        subscriptions: ['my/topic', 'wild/#'],
        protocol: 'mqtt://'
      },
      configName2: {
        type: 'mqttClient',
        name: 'configName2',
        host: 'wontConnectThis',
        protocol: 'mqtt://'
      }
    }, '123412341234123412341234');
    await mqttClientManager.initialize([], () => {});

    while (Object.keys(fakeBroker.clients).length < 1) { await sleep(0); } // eslint-disable-line no-await-in-loop
    while (loggerCalls.length < 3) { await sleep(0); } // eslint-disable-line no-await-in-loop

    const node = new MqttMessageNode('id', [[1]], {
      topicTemplate: '{{foo}}/{{bar}}',
      messageTemplate: '{{bar}} + {{foo}} + WHAT',
      integrationId: 'external',
      configNameTemplate: '{{a}}'
    });

    const context = {
      flowId: 'myFlowId',
      applicationId: 'myAppId',
      sendMqttMessage: async ({ brokerType, configName, topic, message }) => {
        if (brokerType === 'external') {
          await mqttClientManager.publish(configName, topic, message);
        }
      }
    };

    await node.run(context, { foo: 'theFooGuy', bar: 'theBarGuy' }).should.be.rejectedWith('A MQTT Client config name must be provided for external brokers.');
    await node.run(context, { foo: 'theFooGuy', bar: 'theBarGuy', a: 'what' }).should.be.rejectedWith('Invalid MQTT Client config name: what');
    await node.run(context, { foo: 'theFooGuy', bar: 'theBarGuy', a: 'configName2' }).should.be.rejectedWith('MQTT Client "configName2" is not currently connected.');
    await node.run(context, { foo: 'theFooGuy', bar: 'theBarGuy', a: 'configName1' });

    await fakeBroker.waitTill('publish', 1);
    String(fakeBroker.publishedPackets.initial[0].payload).should.deepEqual('theBarGuy + theFooGuy + WHAT');
    fakeBroker.publishedPackets.initial[0].topic.should.deepEqual('theFooGuy/theBarGuy');
  });
});
