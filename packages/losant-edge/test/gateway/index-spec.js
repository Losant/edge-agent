import { fakeBroker, fakeBrokerGatewayConf, levelManager } from '../common.js';
import {
  defer, noopAsync, isEmpty, forEachSerialP, sleep
} from 'omnibelt';
import LJSON from 'losant-nodejs-utils/src/ljson.js';
import { GATEWAY_ID_DEFAULT } from '../../src/constants.js';
import Gateway from '../../src/gateway/index.js';
import FiredTrigger from '../../src/types/fired-trigger.js';
import should from 'should';

const findPublished = async (topic, timeout = 3000, start = Date.now()) => {
  const found = fakeBroker.publishedPackets.initial.find((packet) => packet.topic.endsWith(`/${topic}`));
  if (found) { return found; }
  if (Date.now() - start >= timeout) { throw new Error(`Timed out waiting for a publish to ${topic}`); }
  await sleep(5);
  return findPublished(topic, timeout, start);
};

describe('gateway', function() {
  let gateway;

  beforeEach(async function() {
    gateway = Gateway(fakeBrokerGatewayConf, {
      incomingStore: levelManager.mqttIncomingStore,
      outgoingStore: levelManager.mqttOutgoingStore
    });
  });
  afterEach(async function() {
    await gateway.disconnect(true);
  });

  it('initialize', function() {
    gateway.initialize.should.be.a.Function();
  });

  it('subscribeFlows: string', async () => {
    await gateway.initialize(undefined, noopAsync, noopAsync);
    const deferred = defer();
    const calls = [];
    gateway.subscribeFlows((x) => {
      calls.push(x.toString());
      if (calls.length >= 2) { deferred.resolve(); }
    });
    await fakeBroker.waitTill('subscribe', 3);
    await fakeBroker.publish(gateway.toAgentTopic('flows'), 'hello');
    await fakeBroker.publish(gateway.appUpdateTopic, 'what');
    await deferred.promise;
    calls.should.deepEqual(['hello', 'what']);
  });

  it('subscribeFlows: JSON', async () => {
    await gateway.initialize(undefined, noopAsync, noopAsync);
    const deferred = defer();
    const calls = [];
    gateway.subscribeFlows((x) => {
      calls.push(x);
      if (calls.length >= 2) { deferred.resolve(); }
    });
    await fakeBroker.waitTill('subscribe', 3);
    await fakeBroker.publish(gateway.toAgentTopic('flows'), '{ "a": true }');
    await fakeBroker.publish(gateway.appUpdateTopic, '{ "b": false }');
    await deferred.promise;
    calls.should.deepEqual([{ a: true }, { b: false }]);
  });

  it('subscribePeripherals', async () => {
    const msg = {
      time: 1,
      mode: 'partial',
      peripherals: {
        '123412341234123412341233': {
          name: 'New Name',
          tags: {}
        }
      }
    };
    await gateway.initialize(undefined, noopAsync, noopAsync);
    const deferred = defer();
    const calls = [];
    gateway.subscribePeripherals((x) => {
      calls.push(x);
      if (calls.length>=3) { deferred.resolve(); }
    });
    await fakeBroker.waitTill('subscribe', 3);

    await fakeBroker.publish(gateway.toAgentTopic('peripherals'), JSON.stringify(msg));
    await fakeBroker.publish('$SYS/floatingUpdate', JSON.stringify(msg));
    await fakeBroker.publish('$SYS/floatingUpdate', JSON.stringify({ peripherals: { '123412341234123412341233': null } }));

    await deferred.promise;
    calls.should.deepEqual([msg, msg, { peripherals: { '123412341234123412341233': null } }]);

    fakeBroker.subscribedTo.initial.should.deepEqual([
      { topic: '$SYS/applicationUpdate', qos: 1 },
      { topic: '$SYS/floatingUpdate', qos: 1 },
      { topic: 'losant/123412341234123412341234/toAgent/#', qos: 1 }
    ]);
  });

  it('does not subscribe to either peripheral topic when value is false', async () => {
    gateway = Gateway({
      ...fakeBrokerGatewayConf,
      subscribeToPeripheralUpdates: false
    },
    {
      incomingStore: levelManager.mqttIncomingStore,
      outgoingStore: levelManager.mqttOutgoingStore
    });

    await gateway.initialize(undefined, noopAsync, noopAsync);

    gateway.subscribePeripherals(() => {
      throw new Error('should not be here');
    });
    await fakeBroker.waitTill('subscribe', 4);

    fakeBroker.subscribedTo.initial.should.deepEqual([
      { topic: '$SYS/applicationUpdate', qos: 1 },
      { topic: 'losant/123412341234123412341234/toAgent/debug', qos: 1 },
      { topic: 'losant/123412341234123412341234/toAgent/flows', qos: 1 },
      { topic: 'losant/123412341234123412341234/toAgent/virtualButton', qos: 1 },
      { topic: 'losant/123412341234123412341234/toAgent/logs', qos: 1 }
    ]);
  });

  it('does not subscribe to floating peripheral topic when value is peripheral', async () => {
    gateway = Gateway({
      ...fakeBrokerGatewayConf,
      subscribeToPeripheralUpdates: 'peripheral'
    },
    {
      incomingStore: levelManager.mqttIncomingStore,
      outgoingStore: levelManager.mqttOutgoingStore
    });

    await gateway.initialize(undefined, noopAsync, noopAsync);

    await fakeBroker.waitTill('subscribe', 2);

    fakeBroker.subscribedTo.initial.should.deepEqual([
      { topic: '$SYS/applicationUpdate', qos: 1 },
      { topic: 'losant/123412341234123412341234/toAgent/#', qos: 1 }
    ]);
  });

  it('does not subscribe to tied peripheral topic when value is floating', async () => {
    gateway = Gateway({
      ...fakeBrokerGatewayConf,
      subscribeToPeripheralUpdates: 'floating'
    },
    {
      incomingStore: levelManager.mqttIncomingStore,
      outgoingStore: levelManager.mqttOutgoingStore
    });

    await gateway.initialize(undefined, noopAsync, noopAsync);

    await fakeBroker.waitTill('subscribe', 5);

    fakeBroker.subscribedTo.initial.should.deepEqual([
      { topic: '$SYS/applicationUpdate', qos: 1 },
      { topic: '$SYS/floatingUpdate', qos: 1 },
      { topic: 'losant/123412341234123412341234/toAgent/debug', qos: 1 },
      { topic: 'losant/123412341234123412341234/toAgent/flows', qos: 1 },
      { topic: 'losant/123412341234123412341234/toAgent/virtualButton', qos: 1 },
      { topic: 'losant/123412341234123412341234/toAgent/logs', qos: 1 }
    ]);
  });

  it('does subscribe to both peripheral topics when value is true', async () => {
    gateway = Gateway({
      ...fakeBrokerGatewayConf,
      subscribeToPeripheralUpdates: true
    },
    {
      incomingStore: levelManager.mqttIncomingStore,
      outgoingStore: levelManager.mqttOutgoingStore
    });

    await gateway.initialize(undefined, noopAsync, noopAsync);

    await fakeBroker.waitTill('subscribe', 3);

    fakeBroker.subscribedTo.initial.should.deepEqual([
      { topic: '$SYS/applicationUpdate', qos: 1 },
      { topic: '$SYS/floatingUpdate', qos: 1 },
      { topic: 'losant/123412341234123412341234/toAgent/#', qos: 1 }
    ]);
  });

  it('publish: string', async () => {
    await gateway.initialize(undefined, noopAsync, noopAsync);
    const topic = 'testMessage';
    const message = 'foo';
    gateway.publish(topic, message);
    const packet = await findPublished(topic);
    packet.topic.should.deepEqual(`losant/123412341234123412341234/fromAgent/${topic}`);
    (await LJSON.inflate(packet.payload))
      .should.equal(message);
  });

  it('publish: JSON', async () => {
    await gateway.initialize(undefined, noopAsync, noopAsync);
    const topic = 'testMessage';
    const message = { foo: 'foo' };
    gateway.publish(topic, message);
    const packet = await findPublished(topic);
    packet.topic.should.deepEqual(`losant/123412341234123412341234/fromAgent/${topic}`);
    (await LJSON.inflate(packet.payload))
      .should.deepEqual(message);
  });

  it('fires subscription triggers: command', async () => {
    const deferred = defer();
    await gateway.initialize((firedTrigger) => {
      firedTrigger.should.deepEqual(FiredTrigger({
        payload: {
          time: firedTrigger.payload.time,
          data: { name: 'foo' }
        },
        triggerId: 'deviceCommand',
        triggerType: 'deviceCommand'
      }));
      deferred.resolve();
    }, noopAsync, noopAsync);
    gateway.updateTriggerSubscriptions([
      {
        mqttTopic: 'losant/5a6b58e2fa016b90d970c97d/command',
        triggerType: 'deviceCommand'
      }
    ]);
    await fakeBroker.waitTill('subscribe', 4);

    await fakeBroker.publish('losant/5a6b58e2fa016b90d970c97d/command', '{ "name": "foo" }');
    await deferred.promise;
  });

  it('fires subscription triggers: mqtt topic', async () => {
    const deferred = defer();
    await gateway.initialize((firedTrigger) => {
      firedTrigger.should.deepEqual(FiredTrigger({
        payload: {
          triggerId: 'whatever/topic',
          time: firedTrigger.payload.time,
          data: '{ "name": "foo" }'
        },
        triggerId: 'whatever/topic',
        triggerType: 'mqttTopic',
        integrationId: 'losant'
      }));
      deferred.resolve();
    }, noopAsync, noopAsync);
    gateway.updateTriggerSubscriptions([
      {
        mqttTopic: 'whatever/topic',
        triggerType: 'mqttTopic'
      }
    ]);
    await fakeBroker.waitTill('subscribe', 4);

    await fakeBroker.publish('whatever/topic', '{ "name": "foo" }');
    await deferred.promise;
  });

  it('updates trigger subscriptions without a client when no gateway is configured', async () => {
    const unconfigured = Gateway({ ...fakeBrokerGatewayConf, id: GATEWAY_ID_DEFAULT }, {
      incomingStore: levelManager.mqttIncomingStore,
      outgoingStore: levelManager.mqttOutgoingStore
    });
    await unconfigured.initialize(undefined, noopAsync, noopAsync);
    unconfigured.isConnected().should.equal(false);

    should.doesNotThrow(() => {
      unconfigured.updateTriggerSubscriptions([{ mqttTopic: 'whatever/topic', triggerType: 'mqttTopic' }]);
    });
    should.doesNotThrow(() => {
      unconfigured.updateTriggerSubscriptions([]);
    });
    await unconfigured.disconnect(true);
  });

  it('fires subscription triggers: mqtt topic wildcard', async () => {
    const deferred = defer();
    const fireMap = {};
    await gateway.initialize((firedTrigger) => {
      const topic = firedTrigger.payload.triggerId;
      should.exist(fireMap[topic]);

      if (++fireMap[topic].actualFires >= fireMap[topic].expectedFires) {
        delete fireMap[topic];
        if (isEmpty(fireMap)) { deferred.resolve(); }
      }
    }, noopAsync, noopAsync);

    const subscriptions = [
      { triggerType: 'mqttTopic', mqttTopic: 'b/#' },
      { triggerType: 'mqttTopic', mqttTopic: '+/+/+/+/+/#' },
      { triggerType: 'mqttTopic', mqttTopic: '+/+' },
      { triggerType: 'mqttTopic', mqttTopic: 'yee/haw' }
    ];
    gateway.updateTriggerSubscriptions(subscriptions);
    await fakeBroker.waitTill('subscribe', subscriptions.length, true);

    const pubConfigs = [
      { topic: 'b/mygirl', expectedFires: 2 },
      { topic: 'lets/call/you/a/taxi', expectedFires: 1 },
      { topic: 'taxi/for/them/taxi/for/him', expectedFires: 1 },
      { topic: 'b', expectedFires: 1 },
      { topic: 'yee/haw', expectedFires: 2 }
    ];
    pubConfigs.forEach((config) => { fireMap[config.topic] = { expectedFires: config.expectedFires, actualFires: 0 }; });
    await forEachSerialP(async (config) => { await fakeBroker.publish(config.topic, 'hey girl, im publishing'); }, pubConfigs);
    await deferred.promise;
  });

  it('fires subscription triggers: virtualButton', async () => {
    const deferred = defer();
    await gateway.initialize((firedTrigger) => {
      firedTrigger.should.deepEqual(FiredTrigger({
        payload: {
          time: firedTrigger.payload.time,
          data: { name: 'Khan!!!' },
          flowVersion: 'myVersion'
        },
        triggerId: 'losant/5a6b58e2fa016b90d970c97d/virtualButton',
        triggerType: 'virtualButton'
      }));
      deferred.resolve();
    }, noopAsync, noopAsync);
    gateway.subscribeButtons();
    await fakeBroker.waitTill('subscribe', 3);

    await fakeBroker.publish(gateway.toAgentTopic('virtualButton'),
      '{ "triggerId": "losant/5a6b58e2fa016b90d970c97d/virtualButton", "flowVersion": "myVersion", "data": { "name": "Khan!!!" } }');
    await deferred.promise;
  });

  it('should fire onConnect when it connects', async () => {
    const deferredConnect = defer();
    await gateway.initialize(undefined, (data) => {
      deferredConnect.resolve(data);
      return Promise.resolve();
    }, noopAsync);

    const result = await deferredConnect.promise;
    result.should.deepEqual({ lastDisconnectTime: null });
  });

  it('should return booleans from isConnected', async () => {
    gateway.isConnected().should.equal(false);
    await gateway.initialize(undefined, noopAsync, noopAsync);
    gateway.isConnected().should.equal(true);
    await gateway.disconnect(true);
    gateway.isConnected().should.equal(false);
  });

  it('correctly resubscribes to agent and custom topics on reconnect', async () => {
    await gateway.initialize(undefined, noopAsync, noopAsync);

    gateway.updateTriggerSubscriptions([
      { triggerType: 'mqttTopic', mqttTopic: 'b/#' },
      { triggerType: 'deviceCommand', mqttTopic: 'losant/5a6b58e2fa016b90d970c97d/command' },
      { triggerType: 'mqttTopic', mqttTopic: 'yee/haw' }
    ]);

    await fakeBroker.waitTill('subscribe', 6);
    gateway.isConnected().should.equal(true);
    fakeBroker.subscribedTo.initial.should.deepEqual([
      { topic: '$SYS/applicationUpdate', qos: 1 },
      { topic: '$SYS/floatingUpdate', qos: 1 },
      { topic: 'losant/123412341234123412341234/toAgent/#', qos: 1 },
      { topic: 'b/#', qos: 1 },
      { topic: 'losant/5a6b58e2fa016b90d970c97d/command', qos: 1 },
      { topic: 'yee/haw', qos: 1 }
    ]);

    await fakeBroker.reset();
    gateway.isConnected().should.equal(false);
    await fakeBroker.waitTill('subscribe', 6);
    gateway.isConnected().should.equal(true);
    fakeBroker.subscribedTo.initial.should.deepEqual([
      { topic: 'b/#', qos: 1 },
      { topic: 'losant/5a6b58e2fa016b90d970c97d/command', qos: 1 },
      { topic: 'yee/haw', qos: 1 },
      { topic: '$SYS/applicationUpdate', qos: 1 },
      { topic: '$SYS/floatingUpdate', qos: 1 },
      { topic: 'losant/123412341234123412341234/toAgent/#', qos: 1 }
    ]);

    await fakeBroker.reset();
    gateway.isConnected().should.equal(false);
    await fakeBroker.waitTill('subscribe', 6);
    gateway.isConnected().should.equal(true);
    fakeBroker.subscribedTo.initial.should.deepEqual([
      { topic: 'b/#', qos: 1 },
      { topic: 'losant/5a6b58e2fa016b90d970c97d/command', qos: 1 },
      { topic: 'yee/haw', qos: 1 },
      { topic: '$SYS/applicationUpdate', qos: 1 },
      { topic: '$SYS/floatingUpdate', qos: 1 },
      { topic: 'losant/123412341234123412341234/toAgent/#', qos: 1 }
    ]);

  }).timeout(30000);

  it('replays messages oldest first by default', async () => {
    await gateway.initialize(undefined, noopAsync, noopAsync);
    await fakeBroker.waitTill('publish', 2);
    gateway.isConnected().should.equal(true);

    await fakeBroker.reset();
    gateway.isConnected().should.equal(false);

    for (let i = 0; i < 5; i++) {
      gateway._publish('offlineTopic', `offlinePayload${i}`, { qos: 1 });
    }

    await fakeBroker.waitTill('publish', 7);

    fakeBroker.publishedPackets.initial.filter((p) => p.topic === 'offlineTopic').map((p) => String(p.payload)).should.deepEqual([
      'offlinePayload0',
      'offlinePayload1',
      'offlinePayload2',
      'offlinePayload3',
      'offlinePayload4'
    ]);
  }).timeout(30000);

  it('replays messages newest first when configured that way', async () => {
    gateway = Gateway({
      ...fakeBrokerGatewayConf,
      offlineMessageReplayOrder: 'newestFirst'
    },
    {
      incomingStore: levelManager.mqttIncomingStore,
      outgoingStore: levelManager.mqttOutgoingStore
    });

    await gateway.initialize(undefined, noopAsync, noopAsync);
    await fakeBroker.waitTill('publish', 2);
    gateway.isConnected().should.equal(true);

    await fakeBroker.reset();
    gateway.isConnected().should.equal(false);

    for (let i = 0; i < 5; i++) {
      gateway._publish('offlineTopic', `offlinePayload${i}`, { qos: 1 });
    }

    await fakeBroker.waitTill('publish', 7);

    fakeBroker.publishedPackets.initial.filter((p) => p.topic === 'offlineTopic').map((p) => String(p.payload)).should.deepEqual([
      'offlinePayload4',
      'offlinePayload3',
      'offlinePayload2',
      'offlinePayload1',
      'offlinePayload0'
    ]);
  }).timeout(30000);

  it('does not wait for replay to finish before publishing new messages', async () => {
    await gateway.initialize(undefined, noopAsync, noopAsync);
    await fakeBroker.waitTill('publish', 2);
    gateway.isConnected().should.equal(true);

    await fakeBroker.reset();

    gateway.isConnected().should.equal(false);
    for (let i = 0; i < 5; i++) {
      gateway._publish('offlineTopic', `offlinePayload${i}`, { qos: 1 });
    }

    await fakeBroker.waitTill('subscribe', 1);

    for (let i = 0; i < 5; i++) {
      gateway._publish('onlineTopic', `onlinePayload${i}`, { qos: 1 });
    }

    await fakeBroker.waitTill('publish', 12);
    const firstOnlineIndex = fakeBroker.publishedPackets.initial.findIndex((p) => p.topic === 'onlineTopic');
    const lastOfflineIndex = fakeBroker.publishedPackets.initial.findLastIndex((p) => p.topic === 'offlineTopic');

    firstOnlineIndex.should.be.lessThan(lastOfflineIndex);
  }).timeout(30000);
});
