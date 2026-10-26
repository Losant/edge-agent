import mqtt from 'mqtt';
import Broker from '../../src/local-broker/index.js';
import { defer, noop, sleep } from 'omnibelt';
import { stubLogger } from '../common.js';
import FiredTrigger from '../../src/types/fired-trigger.js';
import SslConf from '../../src/types/ssl-conf.js';
import path from 'node:path';

// stubLogger records every warn/errorNoRollbar call in the process, so keep only the broker's own.
const brokerClientCalls = (loggerCalls) => loggerCalls.filter(([, message]) => String(message).startsWith('Local broker client'));
const describeCalls = (loggerCalls) => `expected exactly 1 local broker client log, process logged: ${JSON.stringify(loggerCalls)}`;

const defaultHost = '127.0.0.1';
const defaultPort = 1880;
const baseOptions = {
  username: 'testUser',
  password: 'testPass'
};
const baseBrokerOptions = {
  ...baseOptions,
  port: defaultPort,
  address: defaultHost,
  enabled: true
};

describe('Local Broker', () => {
  let brokers = [];
  let clients = [];
  let fires = [];

  const connectClient = ({ method = 'mqtt', host = defaultHost, port = defaultPort, options }) => {
    const client = mqtt.connect(`${method}://${host}:${port}`, options);
    clients.push(client);
    return client;
  };

  const connectBroker = async (options = baseBrokerOptions, fireFunc = noop) => {
    const broker = Broker(options);
    await broker.initialize([], fireFunc);
    brokers.push(broker);
    return broker;
  };

  const publishMessage = async ({ topic, message, client = clients[0], options = {} }) => {
    const deferred = defer();
    client.publish(topic, message, options, () => {
      deferred.resolve();
    });
    return deferred.promise;
  };

  afterEach(async () => {
    clients.forEach((c) => {
      c.end(true);
    });
    brokers.forEach(async (broker) => {
      await broker.shutdown();
    });

    clients = [];
    brokers = [];
    fires = [];
  });

  it('should properly update triggers and fire a trigger on receipt of a subbed topic', async () => {
    const fireDefer = defer();

    const broker = await connectBroker(baseBrokerOptions, (triggerFire) => {
      fires.push(triggerFire);
      if (fires.length >= 1) {
        fireDefer.resolve();
      }
    });

    const toSub = [
      {
        integrationId: 'local',
        triggerType: 'mqttTopic',
        mqttTopic: 'bigOleTest/one'
      },
      {
        integrationId: 'local',
        triggerType: 'mqttTopic',
        mqttTopic: 'bigOleTest/hello/#'
      },
      {
        integrationId: 'local',
        triggerType: 'mqttTopic',
        mqttTopic: 'bigOleTest/hello/+'
      },
      {
        integrationId: 'local',
        triggerType: 'mqttTopic',
        mqttTopic: 'bigOle/#'
      },
      {
        integrationId: 'local',
        triggerType: 'mqttTopic',
        mqttTopic: 'bigOle/+'
      },
      {
        integrationId: 'local',
        triggerType: 'mqttTopic',
        mqttTopic: 'bigOle/hi/+'
      },
      {
        integrationId: 'local',
        triggerType: 'mqttTopic',
        mqttTopic: 'bigOle/hi/+/+'
      },
      {
        integrationId: 'local',
        triggerType: 'mqttTopic',
        mqttTopic: 'bigOle/hi/#'
      },
      {
        integrationId: 'local',
        triggerType: 'mqttTopic',
        mqttTopic: 'bigOle/one'
      },
      {
        integrationId: 'local',
        triggerType: 'mqttTopic',
        mqttTopic: 'smallTest'
      },
      {
        integrationId: 'losant',
        triggerType: 'mqttTopic',
        mqttTopic: 'hello'
      },
      {
        integrationId: 'losant',
        triggerType: 'notAnMqttTopic',
        mqttTopic: 'helloAgain'
      }
    ];
    let subs = Object.keys(await broker.updateTriggerSubscriptions(toSub));
    subs.length.should.equal(10);
    subs.should.deepEqual([
      'bigOleTest/one',
      'bigOleTest/hello/#',
      'bigOleTest/hello/+',
      'bigOle/#',
      'bigOle/+',
      'bigOle/hi/+',
      'bigOle/hi/+/+',
      'bigOle/hi/#',
      'bigOle/one',
      'smallTest'
    ]);

    const client = connectClient({ options: baseOptions });
    const clientId = client.options.clientId;
    await publishMessage({ topic: 'bigOleTest/hello/its/me', message: 'this is a test' });
    await fireDefer.promise;
    fires.length.should.equal(1);
    fires.should.deepEqual([
      FiredTrigger({
        triggerId: 'bigOleTest/hello/#',
        triggerType: 'mqttTopic',
        integrationId: 'local',
        payload: {
          time: fires[0].payload.time,
          data: {
            clientId,
            message: 'this is a test',
            topic: 'bigOleTest/hello/its/me'
          }
        }
      })
    ]);

    subs = Object.keys(await broker.updateTriggerSubscriptions([
      {
        integrationId: 'local',
        triggerType: 'mqttTopic',
        mqttTopic: 'aDifferentTest'
      }
    ]));
    subs.length.should.equal(1);
    subs.should.deepEqual(['aDifferentTest']);

    fires = [];
    await publishMessage({ topic: 'bigOleTest/one', message: 'this is a test' });
    await sleep(1000);
    fires.length.should.equal(0);
  });

  it('should correctly route and authorize publishes with any qos', async () => {
    const broker = await connectBroker();

    const loggerCalls = stubLogger(['warn', 'errorNoRollbar']);
    const client = connectClient({ options: baseOptions });
    const subDefer = defer();
    client.subscribe('$SYS/broker/new/clients', () => {
      client.subscribe('$SYS/broker/disconnect/clients', () => {
        client.subscribe('bigOleTest', { qos: 2 }, () => {
          subDefer.resolve();
        });
      });
    });

    await subDefer.promise;
    const newClient = connectClient({ options: baseOptions });
    const clientId = newClient.options.clientId;

    const publishInfo = [];
    let counter = 0;
    const msgDefer = defer();
    const fourReceived = defer();
    client.on('message', async (topic, msg, packet) => {
      publishInfo.push({ ...packet, payload: String(packet.payload) });
      counter++;
      if (counter === 4) {
        fourReceived.resolve();
      } else if (counter === 5) {
        await publishMessage({
          topic: '$SYS',
          message: 'this is a bad topic',
          client: newClient
        });
        newClient.end();
      } else if (counter === 6) {
        msgDefer.resolve();
      }
    });

    await publishMessage({ topic: 'bigOleTest', message: 'hi this is a test', client: newClient });
    await publishMessage({ topic: 'bigOleTest', message: 'hi this is qos1', client: newClient, options: { qos: 1 } });
    await publishMessage({ topic: 'bigOleTest', message: 'hi this is qos2', client: newClient, options: { qos: 2 } });
    await fourReceived.promise;
    await broker.publish('bigOleTest', 'hello from the broker');
    await msgDefer.promise;

    const clientCalls = brokerClientCalls(loggerCalls);
    clientCalls.length.should.equal(1, describeCalls(loggerCalls));
    clientCalls[0].should.deepEqual(['errorNoRollbar', `Local broker client testUser:${clientId} encountered error: Invalid local broker publish topic: $SYS`]);
    publishInfo.length.should.equal(6);
    publishInfo.should.deepEqual([
      {
        cmd: 'publish',
        dup: false,
        length: publishInfo[0].length,
        payload: clientId,
        topic: '$SYS/broker/new/clients',
        qos: 0,
        retain: false
      },
      {
        cmd: 'publish',
        dup: false,
        length: publishInfo[1].length,
        payload: 'hi this is a test',
        topic: 'bigOleTest',
        qos: 0,
        retain: false
      },
      {
        cmd: 'publish',
        dup: false,
        messageId: publishInfo[2].messageId,
        length: publishInfo[2].length,
        payload: 'hi this is qos1',
        topic: 'bigOleTest',
        qos: 1,
        retain: false
      },
      {
        cmd: 'publish',
        dup: false,
        messageId: publishInfo[3].messageId,
        length: publishInfo[3].length,
        payload: 'hi this is qos2',
        topic: 'bigOleTest',
        qos: 2,
        retain: false
      },
      {
        cmd: 'publish',
        dup: false,
        length: publishInfo[4].length,
        payload: 'hello from the broker',
        topic: 'bigOleTest',
        qos: 0,
        retain: false
      },
      {
        cmd: 'publish',
        dup: false,
        length: publishInfo[5].length,
        payload: clientId,
        topic: '$SYS/broker/disconnect/clients',
        qos: 0,
        retain: false
      }
    ]);
  });

  it('should correctly route and authorize publishes over tls', async () => {
    const brokerConfig = {
      ssl: await SslConf.resolveAndValidate({
        keyPath: path.resolve(import.meta.dirname, '..', '__fixtures__', 'fake-ssl.key'),
        certificatePath: path.resolve(import.meta.dirname, '..', '__fixtures__', 'fake-ssl.crt')
      }),
      port: defaultPort,
      enabled: true
    };
    const clientOptions = {
      key: brokerConfig.ssl.key,
      certificate: brokerConfig.ssl.certificate,
      rejectUnauthorized: false
    };
    const broker = await connectBroker(brokerConfig);

    const client = connectClient({ method: 'mqtts', options: clientOptions });
    const loggerCalls = stubLogger(['warn', 'errorNoRollbar']);
    const subDefer = defer();
    client.subscribe('$SYS/broker/new/clients', () => {
      client.subscribe('$SYS/broker/disconnect/clients', () => {
        client.subscribe('bigOleTest', { qos: 2 }, () => {
          subDefer.resolve();
        });
      });
    });

    await subDefer.promise;
    const newClient = connectClient({ method: 'mqtts', options: clientOptions });
    const clientId = newClient.options.clientId;

    const publishInfo = [];
    let counter = 0;
    const msgDefer = defer();
    const fourReceived = defer();
    client.on('message', async (topic, msg, packet) => {
      publishInfo.push({ ...packet, payload: String(packet.payload) });
      counter++;
      if (counter === 4) {
        fourReceived.resolve();
      } else if (counter === 5) {
        await publishMessage({
          topic: '$SYS',
          message: 'this is a bad topic',
          client: newClient
        });
        newClient.end();
      } else if (counter === 6) {
        msgDefer.resolve();
      }
    });

    await publishMessage({ topic: 'bigOleTest', message: 'hi this is a test', client: newClient });
    await publishMessage({ topic: 'bigOleTest', message: 'hi this is qos1', client: newClient, options: { qos: 1 } });
    await publishMessage({ topic: 'bigOleTest', message: 'hi this is qos2', client: newClient, options: { qos: 2 } });
    await fourReceived.promise;
    await broker.publish('bigOleTest', 'hello from the broker');
    await msgDefer.promise;

    const clientCalls = brokerClientCalls(loggerCalls);
    clientCalls.length.should.equal(1, describeCalls(loggerCalls));
    clientCalls[0].should.deepEqual(['errorNoRollbar', `Local broker client ${clientId} encountered error: Invalid local broker publish topic: $SYS`]);
    publishInfo.length.should.equal(6);
    publishInfo.should.deepEqual([
      {
        cmd: 'publish',
        dup: false,
        length: publishInfo[0].length,
        payload: newClient.options.clientId,
        topic: '$SYS/broker/new/clients',
        qos: 0,
        retain: false
      },
      {
        cmd: 'publish',
        dup: false,
        length: publishInfo[1].length,
        payload: 'hi this is a test',
        topic: 'bigOleTest',
        qos: 0,
        retain: false
      },
      {
        cmd: 'publish',
        dup: false,
        messageId: publishInfo[2].messageId,
        length: publishInfo[2].length,
        payload: 'hi this is qos1',
        topic: 'bigOleTest',
        qos: 1,
        retain: false
      },
      {
        cmd: 'publish',
        dup: false,
        messageId: publishInfo[3].messageId,
        length: publishInfo[3].length,
        payload: 'hi this is qos2',
        topic: 'bigOleTest',
        qos: 2,
        retain: false
      },
      {
        cmd: 'publish',
        dup: false,
        length: publishInfo[4].length,
        payload: 'hello from the broker',
        topic: 'bigOleTest',
        qos: 0,
        retain: false
      },
      {
        cmd: 'publish',
        dup: false,
        length: publishInfo[5].length,
        payload: clientId,
        topic: '$SYS/broker/disconnect/clients',
        qos: 0,
        retain: false
      }
    ]);
  });

  it('should correctly do persistence/retention for disconnected clients', async () => {
    await connectBroker();

    const client = connectClient({ options: { ...baseOptions, clean: true } });
    const client2 = connectClient({ options: { ...baseOptions, clean: false, clientId: 'DirtySession' } });
    const client3 = connectClient({ options: baseOptions });

    const subDefer = defer();
    client.subscribe('bigOleTest', { qos: 2 }, () => {
      client2.subscribe('anotherTest', { qos: 2 }, () => {
        subDefer.resolve();
      });
    });
    await subDefer.promise;
    const closeDefer = defer();
    client.end(() => {
      client2.end(() => {
        closeDefer.resolve();
      });
    });

    const publishInfo = [];
    let counter = 0;
    const msgDefer = defer();
    const msgCb = async (topic, msg, packet) => {
      publishInfo.push({ ...packet });

      if (counter >= 2) {
        msgDefer.resolve();
      }
      counter++;
    };
    client.on('message', msgCb);
    client2.on('message', msgCb);

    await closeDefer.promise;
    await publishMessage({ topic: 'bigOleTest', message: 'hi this is a test', client: client3, options: { retain: true } });
    await publishMessage({ topic: 'anotherTest', message: 'hi this is qos1', client: client3, options: { qos: 1 } });
    await publishMessage({ topic: 'anotherTest', message: 'hi this is qos2', client: client3, options: { qos: 2 } });

    [client.connected, client2.connected].should.deepEqual([false, false]);
    client.reconnect();
    client2.reconnect();

    await msgDefer.promise;
    publishInfo.length.should.equal(3);
    publishInfo.sort((a, b) => {
      return a.qos - b.qos;
    }).should.deepEqual([
      {
        cmd: 'publish',
        dup: false,
        length: publishInfo[0].length,
        payload: Buffer.from('hi this is a test'),
        topic: 'bigOleTest',
        qos: 0,
        retain: true
      },
      {
        cmd: 'publish',
        dup: false,
        messageId: publishInfo[1].messageId,
        length: publishInfo[1].length,
        payload: Buffer.from('hi this is qos1'),
        topic: 'anotherTest',
        qos: 1,
        retain: false
      },
      {
        cmd: 'publish',
        dup: false,
        messageId: publishInfo[2].messageId,
        length: publishInfo[2].length,
        payload: Buffer.from('hi this is qos2'),
        topic: 'anotherTest',
        qos: 2,
        retain: false
      }
    ]);
  });
});
