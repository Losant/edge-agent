import { EventEmitter } from 'node:events';
import { fakeBroker, stubLogger, sinon, describeService } from './common.js';
import { sleep, defer } from 'omnibelt';
import FiredTrigger from '../src/types/fired-trigger.js';
import MqttClientManager from '../src/mqtt-client-manager.js';
import { PLATFORM_TOPIC_BASE } from '../src/constants.js';
import { fakeClientSslKey, fakeClientSslCert } from 'losant-nodejs-utils/test/utils/fake-ssl.js';
import { altFakeSslCert } from 'losant-nodejs-utils/test/utils/fake-ssl-alt-names.js';
import mqtt from 'mqtt';

describe('MQTT Client Manager', () => {
  let mqttClientManager;

  afterEach(async () => {
    if (mqttClientManager) {
      await mqttClientManager.shutdown();
      mqttClientManager = null;
    }
  });

  it('should trigger on mqtt client subscribed topic messages', async () => {
    const triggers = [];

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
        protocol: 'mqtt'
      }
    }, '123412341234123412341234');

    await mqttClientManager.initialize([
      { mqttTopic: 'configName1', triggerType: 'mqttTopic', integrationId: 'external' },
      { mqttTopic: 'configName2', triggerType: 'mqttTopic', integrationId: 'local' }
    ], async (triggerFire) => {
      triggers.push(triggerFire);
    });

    await fakeBroker.waitTill('subscribe', 2);

    Object.keys(fakeBroker.clients).should.deepEqual(['losant_123412341234123412341234']);
    Object.keys(fakeBroker.clients.losant_123412341234123412341234.subscriptions).should.deepEqual([ 'my/topic', 'wild/#' ]);

    await fakeBroker.publish('my/topic', 'hello1');
    await fakeBroker.publish('wild/what', 'hello2');

    while (triggers.length < 2) { await sleep(0); } // eslint-disable-line no-await-in-loop

    triggers.should.deepEqual([FiredTrigger({
      triggerId: 'configName1',
      triggerType: 'mqttTopic',
      integrationId: 'external',
      payload: {
        time: triggers[0].payload.time,
        data: { message: 'hello1', topic: 'my/topic', brokerUrl: 'mqtt://127.0.0.1' }
      }
    }), FiredTrigger({
      triggerId: 'configName1',
      triggerType: 'mqttTopic',
      integrationId: 'external',
      payload: {
        time: triggers[1].payload.time,
        data: { message: 'hello2', topic: 'wild/what', brokerUrl: 'mqtt://127.0.0.1' }
      }
    })]);

    await mqttClientManager.update([
      { mqttTopic: 'configName1', triggerType: 'mqttTopic', integrationId: 'local' },
      { mqttTopic: 'configName2', triggerType: 'mqttTopic', integrationId: 'external' }
    ]);

    while (Object.keys(fakeBroker.clients.losant_123412341234123412341234.subscriptions).length > 0) { await sleep(0); } // eslint-disable-line no-await-in-loop

    // still connected, but not subscribed
    Object.keys(fakeBroker.clients).should.deepEqual(['losant_123412341234123412341234']);
    Object.keys(fakeBroker.clients.losant_123412341234123412341234.subscriptions).should.deepEqual([]);

    await fakeBroker.publish('my/topic', 'hello1');
    await fakeBroker.publish('wild/what', 'hello2');

    await sleep(0);

    triggers.length.should.equal(2);

    await mqttClientManager.update([
      { mqttTopic: 'configName1', triggerType: 'mqttTopic', integrationId: 'external' }
    ]);

    await fakeBroker.waitTill('subscribe', 4);

    Object.keys(fakeBroker.clients).should.deepEqual(['losant_123412341234123412341234']);
    Object.keys(fakeBroker.clients.losant_123412341234123412341234.subscriptions).should.deepEqual([ 'my/topic', 'wild/#' ]);

    await fakeBroker.publish('wild/whatAgain', 'hello3');

    while (triggers.length < 3) { await sleep(0); } // eslint-disable-line no-await-in-loop

    triggers[2].should.deepEqual(FiredTrigger({
      triggerId: 'configName1',
      triggerType: 'mqttTopic',
      integrationId: 'external',
      payload: {
        time: triggers[2].payload.time,
        data: { message: 'hello3', topic: 'wild/whatAgain', brokerUrl: 'mqtt://127.0.0.1' }
      }
    }));
  });

  it('should correctly allow publishes', async () => {
    const loggerCalls = stubLogger();

    mqttClientManager = MqttClientManager({
      configName1: {
        type: 'mqttClient',
        name: 'configName1',
        host: '127.0.0.1',
        subscriptions: ['my/topic', 'wild/#'],
        protocol: 'mqtt'
      },
      configName2: {
        type: 'mqttClient',
        name: 'configName2',
        host: 'wontConnectThis',
        protocol: 'mqtt://'
      }
    }, '123412341234123412341234');

    await mqttClientManager.publish('configName1', 'incoming/message1', '{ "knock": "knock1" }')
      .should.be.rejectedWith({ message: 'MQTT Client manager must be initialized first.' });

    await mqttClientManager.initialize([], () => {});

    while (Object.keys(fakeBroker.clients).length < 1) { await sleep(0); } // eslint-disable-line no-await-in-loop
    while (loggerCalls.length < 3) { await sleep(0); } // eslint-disable-line no-await-in-loop

    await mqttClientManager.publish('configName1', 'incoming/message2', '{ "knock": "knock2" }');
    await mqttClientManager.publish('configName2', 'incoming/message3', '{ "knock": "knock3" }')
      .should.be.rejectedWith({ message: 'MQTT Client "configName2" is not currently connected.' });
    await mqttClientManager.publish('configName3', 'incoming/message4', '{ "knock": "knock4" }')
      .should.be.rejectedWith({ message: 'Invalid MQTT Client config name: configName3' });

    await fakeBroker.waitTill('publish', 1);
    String(fakeBroker.publishedPackets.initial[0].payload).should.deepEqual('{ "knock": "knock2" }');
    fakeBroker.publishedPackets.initial[0].topic.should.deepEqual('incoming/message2');
  });

  it('should pass client cert and CA cert TLS options to mqtt.connect', async () => {
    const loggerCalls = stubLogger();
    const client = Object.assign(new EventEmitter(), {
      connected: false,
      subscribe: sinon.spy(),
      end: sinon.spy((force, cb) => cb())
    });
    sinon.stub(mqtt, 'connect').returns(client);

    mqttClientManager = MqttClientManager({
      configName1: {
        type: 'mqttClient',
        name: 'configName1',
        host: 'fake-endpoint.iot.us-west-2.amazonaws.com',
        subscriptions: ['foo/bar/hello', 'foo/bar/goodbye'],
        protocol: 'mqtts://',
        port: 8883,
        clean: true,
        clientSsl: {
          key: fakeClientSslKey,
          certificate: fakeClientSslCert
        },
        caCertificate: altFakeSslCert
      }
    }, '123412341234123412341234');

    await mqttClientManager.initialize([
      { mqttTopic: 'configName1', triggerType: 'mqttTopic', integrationId: 'external' }
    ], async () => {});
    client.emit('connect');

    mqtt.connect.firstCall.args.should.deepEqual([{
      rejectUnauthorized: true,
      clientId: `${PLATFORM_TOPIC_BASE}_123412341234123412341234`,
      protocol: 'mqtts',
      port: 8883,
      hostname: 'fake-endpoint.iot.us-west-2.amazonaws.com',
      clean: true,
      protocolVersion: 4,
      ca: altFakeSslCert,
      cert: fakeClientSslCert,
      key: fakeClientSslKey,
      requestCert: true
    }]);
    client.subscribe.firstCall.args.slice(0, 2).should.deepEqual([['foo/bar/hello', 'foo/bar/goodbye'], { qos: 1 }]);
    loggerCalls.should.deepEqual([[
      'info',
      'MQTT Client (configName1) connected to mqtts://fake-endpoint.iot.us-west-2.amazonaws.com:8883'
    ]]);
  });

  it('should correctly connect log out subscriptions', async () => {
    const loggerCalls = stubLogger();
    const triggers = [];
    mqttClientManager = MqttClientManager({
      configName1: {
        type: 'mqttClient',
        name: 'configName1',
        host: '127.0.0.1',
        subscriptions: ['my/topic', 'notAllowed'],
        protocol: 'mqtt://'
      }
    }, '123412341234123412341234');

    await mqttClientManager.initialize([
      { mqttTopic: 'configName1', triggerType: 'mqttTopic', integrationId: 'external' }
    ], async (triggerFire) => {
      triggers.push(triggerFire);
    });

    while (loggerCalls.length < 3) { await sleep(0); } // eslint-disable-line no-await-in-loop

    loggerCalls.should.deepEqual([[
      'info',
      'MQTT Client (configName1) connected to mqtt://127.0.0.1'
    ], [
      'info',
      'MQTT Client (configName1) subscribed to topic \'my/topic\''
    ], [
      'warn',
      'MQTT Client (configName1) failed to subscribe to topic \'notAllowed\''
    ]]);
  });

  describeService('mosquitto', 'MQTT 5', () => {
    let client;
    before(async () => {
      const waitForClientConnect = defer();
      client = mqtt.connect({
        clientId: 'foo-bar',
        protocol: 'mqtt',
        host: process.env.MOSQUITTO_HOST,
        port: 1888,
        clean: true,
        protocolVersion: 5,
        reconnectPeriod: 0
      });
      client.on('connect', waitForClientConnect.resolve);
      return waitForClientConnect.promise;
    });
    after(() => {
      if (client) {
        const waitForClientClose = defer();
        client.end(true, waitForClientClose.resolve);
        return waitForClientClose.promise;
      }
    });

    it('mosquitto should connect, publish, and receive on an MQTT 5 external borker', async () => {
      const loggerCalls = stubLogger();
      const triggers = [];
      mqttClientManager = MqttClientManager({
        mosquitto: {
          type: 'mqttClient',
          name: 'mosquitto',
          host: process.env.MOSQUITTO_HOST,
          subscriptions: [ 'incoming/#', 'foo/boo' ],
          protocol: 'mqtt://',
          port: 1888,
          clean: true,
          protocolVersion: '5'
        }
      }, '123412341234123412341234');

      await mqttClientManager.initialize([
        { mqttTopic: 'mosquitto', triggerType: 'mqttTopic', integrationId: 'external' },
        { mqttTopic: 'configName3', triggerType: 'mqttTopic', integrationId: 'external' }
      ], async (triggerFire) => {
        triggers.push(triggerFire);
      });

      while (loggerCalls.length < 2) { await sleep(0); } // eslint-disable-line no-await-in-loop

      await mqttClientManager.publish('mosquitto', 'incoming/message', '{ "knock": "knock" }');

      while (triggers.length < 1) { await sleep(0); } // eslint-disable-line no-await-in-loop

      triggers.should.deepEqual([FiredTrigger({
        payload: {
          time: triggers[0].payload.time,
          data: {
            message: '{ "knock": "knock" }',
            topic: 'incoming/message',
            brokerUrl: `mqtt://${process.env.MOSQUITTO_HOST}:1888`
          }
        },
        triggerId: 'mosquitto',
        triggerType: 'mqttTopic',
        integrationId: 'external'
      })]);

      loggerCalls.sort().should.deepEqual([[
        'errorNoRollbar',
        'MQTT Client trigger config, configName3, was not found.'
      ], [
        'info',
        `MQTT Client (mosquitto) connected to mqtt://${process.env.MOSQUITTO_HOST}:1888`
      ],
      [
        'info',
        'MQTT Client (mosquitto) subscribed to topic \'foo/boo\''
      ], [
        'info',
        'MQTT Client (mosquitto) subscribed to topic \'incoming/#\''
      ],
      [
        'verbose',
        'Sending MQTT message (mosquitto) from workflow',
        { topic: 'incoming/message', message: '{ "knock": "knock" }' }
      ]
      ]);
    }).timeout(30000);

    it('should add extra properties onto the payload along with the packet', async () => {
      const loggerCalls = stubLogger();
      const triggers = [];
      mqttClientManager = MqttClientManager({
        mosquitto: {
          type: 'mqttClient',
          name: 'mosquitto',
          host: process.env.MOSQUITTO_HOST,
          subscriptions: [ 'incoming/#', 'foo/boo' ],
          protocol: 'mqtt://',
          port: 1888,
          clean: true,
          protocolVersion: '5'
        }
      }, '123412341234123412341234');

      await mqttClientManager.initialize([
        { mqttTopic: 'mosquitto', triggerType: 'mqttTopic', integrationId: 'external' },
        { mqttTopic: 'configName3', triggerType: 'mqttTopic', integrationId: 'external' }
      ], async (triggerFire) => {
        triggers.push(triggerFire);
      });

      while (loggerCalls.length < 2) { await sleep(0); } // eslint-disable-line no-await-in-loop

      const waitForPublish = defer();
      client.publish('incoming/messages', 'hello world', {
        properties: {
          payloadFormatIndicator: true,
          topicAlias: 1,
          contentType: 'UTF8',
          correlationData: (Buffer.from('identifier-1')).toString('binary'),
          responseTopic: 'outgoing/messages',
          userProperties: { foo: 'bar', boo: true, one: 12356 }
        }
      }, waitForPublish.resolve);
      await waitForPublish.promise;
      // await mqttClientManager.publish('mosquitto', 'incoming/message', '{ "knock": "knock" }');

      while (triggers.length < 1) { await sleep(0); } // eslint-disable-line no-await-in-loop

      triggers.should.deepEqual([FiredTrigger({
        payload: {
          time: triggers[0].payload.time,
          data: {
            message: 'hello world',
            topic: 'incoming/messages',
            brokerUrl: `mqtt://${process.env.MOSQUITTO_HOST}:1888`,
            properties: {
              payloadFormatIndicator: true,
              correlationData: 'identifier-1',
              contentType: 'UTF8',
              responseTopic: 'outgoing/messages',
              userProperties: { foo: 'bar', boo: 'true', one: '12356' }
            }
          }
        },
        triggerId: 'mosquitto',
        triggerType: 'mqttTopic',
        integrationId: 'external'
      })]);

      loggerCalls.should.deepEqual([[
        'errorNoRollbar',
        'MQTT Client trigger config, configName3, was not found.'
      ], [
        'info',
        `MQTT Client (mosquitto) connected to mqtt://${process.env.MOSQUITTO_HOST}:1888`
      ],
      [
        'info',
        'MQTT Client (mosquitto) subscribed to topic \'incoming/#\''
      ], [
        'info',
        'MQTT Client (mosquitto) subscribed to topic \'foo/boo\''
      ]
      ]);
    }).timeout(30000);
  });

});
