import {
  fakeBroker,
  pathToEdgeTestToml,
  sinon,
  fixtures
} from './common.js';
const {
  toAgentFlowsInitial,
  toAgentPeripheralsInitial
} = fixtures;
import LJSON from 'losant-nodejs-utils/src/ljson.js';
import main from '../src/main.js';
import { mapP, defer } from 'omnibelt';
import logger from '../src/logger/index.js';
import path from 'node:path';
import { ID_ZERO_STR } from 'losant-nodejs-utils/src/constants/id-zero.js';

describe('main', () => {
  let finish, stub;

  afterEach(async () => {
    if (finish) {
      await finish();
      finish = null;
    }
    if (stub) {
      stub.restore();
      stub = null;
    }
    delete process.env.CONF_PATH;
  });

  it('exports a function', () => {
    main.should.be.a.Function();
  });

  describe('simulations', () => {

    it('first boot', async function() {
      const deferred = defer();
      const logs = [];
      stub = sinon.stub(logger, 'exception').callsFake((...params) => {
        logs.push(String(params.join(' ')));
        if (logs.length >= 1) { deferred.resolve(); }
      });

      const { gateway, shutdown } = await main({ confPath: pathToEdgeTestToml });
      finish = shutdown;
      await fakeBroker.initFlows(gateway().toAgentTopic, toAgentFlowsInitial);
      await fakeBroker.publish(gateway().toAgentTopic('peripherals'), await LJSON.deflate(toAgentPeripheralsInitial));
      await fakeBroker.publish(gateway().floatUpdateTopic, await LJSON.deflate({ peripherals: { '5a72186e811b0700075df661': { name: 'blah' } } }));
      await fakeBroker.publish(gateway().floatUpdateTopic, await LJSON.deflate({ peripherals: { '5a72186e811b0700075df661': null } }));
      await fakeBroker.publish(gateway().toAgentTopic('debug'), await LJSON.deflate({ '111111111111111111111111': true }));

      fakeBroker.publishedPackets.dynamic.length.should.deepEqual(6);
      fakeBroker.publishedPackets.initial.length.should.deepEqual(2);

      fakeBroker.publishedPackets.initial[1].topic.should.equal('losant/4b51351a811e1299935ae36d/fromAgent/flows');
      (await LJSON.inflate(fakeBroker.publishedPackets.initial[1].payload)).should.deepEqual({
        '111111111111111111111111': {
          previousVersion: null,
          newVersion: 'workflow-one-version',
          newEtag: '5a6b58e2fa016b90d970c97z'
        },
        '222222222222222222222222': {
          previousVersion: null,
          newVersion: 'workflow-two-version',
          newEtag: '5a6b58e2fa016b90d970c97y'
        },
        '333333333333333333333333': {
          previousVersion: null,
          newVersion: 'workflow-two-version',
          newEtag: '5a6b58e2fa016b90d970c97x'
        },
        '5a6b563972a4998fc022ad5a': {
          fileName: 'flow1.json',
          newVersion: 'develop',
          previousVersion: 'develop'
        },
        '5a6b563972a4998fc022ad5b': {
          fileName: 'flow2.json',
          newVersion: 'flowVersion',
          previousVersion: 'flowVersion'
        }
      });

      const publishResult = await mapP(async (packet) => {
        return LJSON.inflate(packet.payload);
      }, fakeBroker.publishedPackets.dynamic);


      publishResult.should.deepEqual([
        {
          clientId: '4b51351a811e1299935ae36d',
          subs: [
            {
              qos: 1,
              topic: '$SYS/applicationUpdate'
            },
            {
              qos: 1,
              topic: '$SYS/floatingUpdate'
            },
            {
              qos: 1,
              topic: 'losant/4b51351a811e1299935ae36d/toAgent/#'
            }
          ]
        },
        toAgentFlowsInitial,
        toAgentPeripheralsInitial,
        { peripherals: { '5a72186e811b0700075df661': { name: 'blah' } } },
        { peripherals: { '5a72186e811b0700075df661': null } },
        { '111111111111111111111111': true }
      ]);
      await deferred.promise;
      logs.should.deepEqual([
        'Error processing peripheral device updates from Losant: TypeError: [tcomb] Invalid value undefined supplied to PeripheralsMessage/peripherals: {[key: ObjectIdStr]: ?Peripheral}/5a72186e811b0700075df661: ?Peripheral/id: DeviceId'
      ]);
    });

    it('should store published flows and devices', async function() {
      const logs = [];
      const initialDefer = defer();
      const modifyDefer = defer();
      stub = sinon.stub(logger, 'info').callsFake((...params) => {
        logs.push(params);
        //9 init messages + x flow/device messages
        if (logs.length >= 13) {
          initialDefer.resolve();
        }
        if (logs.length >= 14) { modifyDefer.resolve(); }
      });

      const flowData = {
        versionId: '5a6b569172a4998fc022ad6c',
        version: 'flowVersion',
        name: 'flowName',
        globals: { },
        triggers: [
          { type: 'virtualButton', key: '1234', outputIds: [['node-1']] }
        ],
        nodes: [
          {
            id: 'node-1',
            outputIds: [['node-2']],
            type: 'GetPeripheralNode',
            config: {
              findMethod: 'name',
              name: 'TestDevice',
              findMultiple: true,
              sortField: 'id',
              resultPath: 'result'
            }
          },
          {
            id: 'node-2',
            type: 'MqttMessageNode',
            config: {
              topicTemplate: 'testButton/5a6b563972a4998fc022ad6b',
              messageTemplate: '{{jsonEncode result}}'
            }
          }
        ],
        minimumAgentVersion: '0.0.0'
      };

      const toAgent = { ...toAgentFlowsInitial };
      toAgent.flows = { '5a6b563972a4998fc022ad6b': flowData };
      const { gateway, shutdown } = await main({ confPath: pathToEdgeTestToml });
      finish = shutdown;

      await fakeBroker.subscribe('testButton/5a6b563972a4998fc022ad6b');
      await fakeBroker.initFlows(gateway().toAgentTopic, toAgent);
      await fakeBroker.publish(gateway().toAgentTopic('peripherals'), await LJSON.deflate(toAgentPeripheralsInitial));
      await fakeBroker.publish(gateway().toAgentTopic('peripherals'), await LJSON.deflate({
        mode: 'partial',
        peripherals: {
          '5a72186e811b0700075df667': {
            name: 'TestDevice',
            id: '5a72186e811b0700075df667',
            deviceClass: 'peripheral',
            tags: {},
            attributes: []
          }
        }
      }));
      await fakeBroker.publish(gateway().toAgentTopic('peripherals'), await LJSON.deflate({
        mode: 'partial',
        peripherals: {
          '5a72186e811b0700075df666': {
            name: 'TestDevice',
            id: '5a72186e811b0700075df666',
            deviceClass: 'peripheral',
            tags: {},
            attributes: []
          }
        }
      }));
      await fakeBroker.publish(gateway().toAgentTopic('peripherals'), await LJSON.deflate({
        mode: 'partial',
        peripherals: {
          '5a72186e811b0700075df665': {
            name: 'TestDevice',
            id: '5a72186e811b0700075df665',
            deviceClass: 'peripheral',
            tags: {},
            attributes: []
          }
        }
      }));
      await initialDefer.promise;
      await fakeBroker.publish(gateway().toAgentTopic('virtualButton'),
        '{ "triggerId": "1234", "flowVersion": "flowVersion" }');
      await fakeBroker.waitTill('publish', 3, true);
      fakeBroker.publishedPackets.initial.length.should.equal(3);
      const initialPeripherals = await LJSON.inflate(fakeBroker.publishedPackets.initial[2].payload);
      initialPeripherals.should.deepEqual([
        {
          name: 'TestDevice',
          id: '5a72186e811b0700075df661',
          deviceClass: 'peripheral',
          tags: {},
          attributes: []
        },
        {
          name: 'TestDevice',
          id: '5a72186e811b0700075df662',
          deviceClass: 'peripheral',
          tags: {},
          attributes: []
        },
        {
          name: 'TestDevice',
          id: '5a72186e811b0700075df663',
          deviceClass: 'peripheral',
          tags: { theKey: ['val1', 'val2', 'val3'], myKey: ['val1'] },
          attributes: []
        },
        {
          name: 'TestDevice',
          id: '5a72186e811b0700075df664',
          deviceClass: 'peripheral',
          tags: { myKey: ['val1', 'val2', 'val3'] },
          attributes: []
        },
        {
          name: 'TestDevice',
          id: '5a72186e811b0700075df665',
          deviceClass: 'peripheral',
          tags: {},
          attributes: []
        },
        {
          name: 'TestDevice',
          id: '5a72186e811b0700075df666',
          deviceClass: 'peripheral',
          tags: {},
          attributes: []
        },
        {
          name: 'TestDevice',
          id: '5a72186e811b0700075df667',
          deviceClass: 'peripheral',
          tags: {},
          attributes: []
        }
      ]);

      await fakeBroker.publish(gateway().floatUpdateTopic, await LJSON.deflate({
        peripherals: {
          '5a72186e811b0700075df661': null,
          '5a72186e811b0700075df665': null,
          '5a72186e811b0700075df666': null,
          '5a72186e811b0700075df667': null
        }
      }));
      await modifyDefer.promise;

      await fakeBroker.publish(gateway().toAgentTopic('virtualButton'),
        '{ "triggerId": "1234", "flowVersion": "flowVersion" }');
      await fakeBroker.waitTill('publish', 4, true);

      fakeBroker.publishedPackets.initial.length.should.equal(4);
      (await LJSON.inflate(fakeBroker.publishedPackets.initial[3].payload)).should.deepEqual([
        {
          name: 'TestDevice',
          id: '5a72186e811b0700075df662',
          deviceClass: 'peripheral',
          tags: {},
          attributes: []
        },
        {
          name: 'TestDevice',
          id: '5a72186e811b0700075df663',
          deviceClass: 'peripheral',
          tags: { theKey: ['val1', 'val2', 'val3'], myKey: ['val1'] },
          attributes: []
        },
        {
          name: 'TestDevice',
          id: '5a72186e811b0700075df664',
          deviceClass: 'peripheral',
          tags: { myKey: ['val1', 'val2', 'val3'] },
          attributes: []
        }
      ]);
      await fakeBroker.publish(gateway().toAgentTopic('virtualButton'),
        '{ "triggerId": "6789", "develop": "develop" }');
      await fakeBroker.waitTill('publish', 5, true);
      fakeBroker.publishedPackets.initial.length.should.equal(5);
      (await LJSON.inflate(fakeBroker.publishedPackets.initial[4].payload)).should.deepEqual(
        {
          name: 'TestDevice',
          id: '5a72186e811b0700075df663',
          deviceClass: 'peripheral',
          tags: { theKey: ['val1', 'val2', 'val3'], myKey: ['val1'] },
          attributes: []
        });
    }).timeout(30000);

    it('should boot without device config', async function() {
      const deferred = defer();
      const logs = [];
      stub = sinon.stub(logger, 'warn').callsFake((...params) => {
        const msg = String(params.join(' '));
        if (msg.includes('No gateway')) { logs.push(msg); }
        if (logs.length >= 1) { deferred.resolve(); }
      });

      const { gateway, shutdown } = await main();
      finish = shutdown;

      const deviceConf = { ...gateway().conf };
      deviceConf.should.deepEqual({
        host: 'broker.losant.com',
        protocol: 'mqtts',
        apiHost: undefined,
        id: ID_ZERO_STR,
        key: undefined,
        secret: undefined,
        clientSsl: undefined,
        queueOfflineMessages: true,
        offlineMessageReplayOrder: 'oldestFirst',
        subscribeToPeripheralUpdates: true
      });

      await deferred.promise;
      logs[0].should.deepEqual('No gateway configuration provided, booting without connecting to mqtts://broker.losant.com');
    });

    it('should reload config after booting edge agent', async function() {
      const deferred = defer();
      const logs = [];
      stub = sinon.stub(logger, 'info').callsFake((...params) => {
        logs.push(params[0]);
        if (logs.length >= 13 && logs.includes('Reloading agent configuration...')) {
          deferred.resolve();
        }
      });

      process.env.CONF_PATH = pathToEdgeTestToml;
      const { gateway, shutdown } = await main();
      finish = shutdown;

      const originalGateway = { ...gateway() };
      const originalGatewayConf = { ...originalGateway.conf };
      originalGatewayConf.should.deepEqual({
        host: '127.0.0.1',
        protocol: 'mqtt',
        apiHost: undefined,
        id: '4b51351a811e1299935ae36d',
        key: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        secret: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        clientSsl: undefined,
        queueOfflineMessages: true,
        offlineMessageReplayOrder: 'oldestFirst',
        subscribeToPeripheralUpdates: true
      });
      await fakeBroker.initFlows(gateway().toAgentTopic, toAgentFlowsInitial);

      process.env.CONF_PATH = path.resolve(import.meta.dirname, '__fixtures__', 'test-configs', 'losant-edge-agent-config.full.toml');
      process.kill(process.pid, 'SIGHUP');
      await deferred.promise;
      await fakeBroker.reset();
      const flowData = {
        versionId: '5a6b569172a4998fc022ad6c',
        version: 'flowVersion',
        name: 'flowName',
        globals: { },
        triggers: [
          { type: 'virtualButton', key: '1234', outputIds: [['node-1']] }
        ],
        nodes: [
          {
            id: 'node-1',
            type: 'MqttMessageNode',
            config: {
              topicTemplate: 'testButton/5a6b563972a4998fc022ad6b',
              messageTemplate: 'Sending messages in a whole new world'
            }
          }
        ],
        minimumAgentVersion: '0.0.0'
      };
      const toAgent = { ...toAgentFlowsInitial };
      toAgent.flows = { '5a6b563972a4998fc022ad6b': flowData };

      const deviceConf = { ...gateway().conf };
      deviceConf.should.deepEqual({
        host: '127.0.0.1',
        protocol: 'mqtt://',
        apiHost: undefined,
        id: '5bca18c752bc9b0006fab719',
        key: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        secret: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        clientSsl: undefined,
        queueOfflineMessages: true,
        offlineMessageReplayOrder: 'oldestFirst',
        subscribeToPeripheralUpdates: false
      });
      await fakeBroker.initFlows(gateway().toAgentTopic, toAgent);
      await fakeBroker.subscribe('testButton/5a6b563972a4998fc022ad6b');

      await fakeBroker.publish(gateway().toAgentTopic('virtualButton'),
        '{ "triggerId": "1234", "flowVersion": "flowVersion" }');
      await fakeBroker.waitTill('publish', 3, true);
      fakeBroker.publishedPackets.initial.length.should.equal(3);
      String(fakeBroker.publishedPackets.initial[2].payload).should.equal('Sending messages in a whole new world');
    });

    it('should load with defaults and example toml', async function() {
      const brokeTomlPath = path.resolve(import.meta.dirname, '..', 'losant-edge-agent-config.example.toml');
      process.env.CONF_PATH = brokeTomlPath;
      const { gateway, shutdown } = await main({ confPath: brokeTomlPath });
      finish = shutdown;
      const originalGateway = { ...gateway() };
      const originalGatewayConf = { ...originalGateway.conf };
      originalGatewayConf.should.deepEqual({
        host: 'broker.losant.com',
        protocol: 'mqtts',
        apiHost: undefined,
        id: ID_ZERO_STR,
        key: undefined,
        secret: undefined,
        clientSsl: undefined,
        queueOfflineMessages: true,
        offlineMessageReplayOrder: 'oldestFirst',
        subscribeToPeripheralUpdates: true
      });
    });

    it('should reject config with duplicate named triggers', async function() {
      const brokeTomlPath = path.resolve(import.meta.dirname, '__fixtures__', 'losant-edge-agent-config.broke.toml');
      process.env.CONF_PATH = brokeTomlPath;
      await main({ confPath: brokeTomlPath }).should.be.rejectedWith({
        message: 'The following configuration errors were found:\nDuplicate opcua triggers named opcuaTrig1.'
      });
    });

    it('should start log stream on request', async () => {
      const { gateway, shutdown } = await main({ confPath: pathToEdgeTestToml });
      finish = shutdown;

      await fakeBroker.initFlows(gateway().toAgentTopic, toAgentFlowsInitial);
      await fakeBroker.publish(
        gateway().toAgentTopic('logs'),
        await LJSON.deflate({
          sendLogBuffer: true,
          logLevel: 'verbose',
          streamLogs: true,
          requestId: '123'
        })
      );

      await fakeBroker.waitTill('publish', 3, true);
      fakeBroker.publishedPackets.initial[2].topic.should.equal('losant/4b51351a811e1299935ae36d/fromAgent/logs');

      let logPublish = await LJSON.inflate(fakeBroker.publishedPackets.initial[2].payload);
      logPublish.length.should.equal(20); // the buffer

      await fakeBroker.waitTill('publish', 4, true);
      fakeBroker.publishedPackets.initial[3].topic.should.equal('losant/4b51351a811e1299935ae36d/fromAgent/logs');

      logPublish = await LJSON.inflate(fakeBroker.publishedPackets.initial[3].payload);
      logPublish.should.deepEqual([{
        timestamp: logPublish[0].timestamp,
        level: 'verbose',
        message: `${(new Date(logPublish[0].timestamp)).toISOString()} [\u001b[36mverbose\u001b[39m] Logging stream request received from Losant.`,
        ...(logPublish[0].tsIndex ? { tsIndex: logPublish[0].tsIndex } : {})
      }]);

      await fakeBroker.publish(gateway().toAgentTopic('virtualButton'),
        '{ "triggerId": "1234", "flowVersion": "flowVersion" }');

      await fakeBroker.waitTill('publish', 5, true);
      fakeBroker.publishedPackets.initial[4].topic.should.equal('losant/4b51351a811e1299935ae36d/fromAgent/logs');

      logPublish = await LJSON.inflate(fakeBroker.publishedPackets.initial[4].payload);
      const addTsIndex = logPublish[0].timestamp === logPublish[1].timestamp ? { tsIndex: 1 } : {};
      const vbTs = logPublish[1].message.match(/"time": ".+Z",/)[0];
      logPublish.should.deepEqual([
        {
          timestamp: logPublish[0].timestamp,
          level: 'verbose',
          message: `${(new Date(logPublish[0].timestamp)).toISOString()} [\u001b[36mverbose\u001b[39m] Received Workflow Triggering Message\n{\n  "topic": "losant/4b51351a811e1299935ae36d/toAgent/virtualButton",\n  "payload": {${vbTs} "flowVersion": "flowVersion"}\n}`
        },
        {
          timestamp: logPublish[1].timestamp,
          level: 'verbose',
          message: `${(new Date(logPublish[1].timestamp)).toISOString()} [\u001b[36mverbose\u001b[39m] No workflows found for trigger:\n{\n  "payload": {${vbTs} "flowVersion": "flowVersion"},\n  "triggerId": "1234",\n  "triggerType": "virtualButton"\n}`,
          ...addTsIndex
        }
      ]);

    }).timeout(20000);


  });
});
