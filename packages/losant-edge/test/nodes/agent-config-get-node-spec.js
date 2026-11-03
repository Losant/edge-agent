import '../common.js';
import AgentConfigGetNode from '../../src/nodes/agent-config-get-node.js';
import Args from '../../src/types/args.js';

const makeFakeArgs = () => {
  return Args({
    gateway: {
      id: '123412341234123412341234',
      key: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      secret: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    },
    triggers: [
      {
        name: 'opcuaTrig1',
        type: 'opcua',
        uri: 'opc.tcp://localhost:4335/UA/Server',
        eventFilter: ['Message', 'Value'],
        monitoredItems: [{
          identifier: 'i=2255'
        }]
      },
      {
        name: 'opcuaTrig2',
        type: 'opcua',
        uri: 'opc.tcp://localhost:4335/UA/Server',
        samplingInterval: '10',
        eventFilter: [],
        monitoredItems: [{
          nameSpace: '1',
          identifier: 's=MyVar3'
        }, {
          nameSpace: '1',
          identifier: 's=MyVar4'
        }]
      }
    ]
  });
};

describe('AgentConfigGetNode', () => {

  it('should return entire config object when requested', async () => {
    const fakeArgs = makeFakeArgs();

    const node = new AgentConfigGetNode('id', [], { resultPath: 'a', getAll: true });

    node.run({
      getCurrentAgentConfig: () => fakeArgs
    }, {}).should.deepEqual([
      [],
      {
        a: {
          key: '.',
          value: {
            logger: {
              out: fakeArgs.logger.out,
              level: 'error'
            },
            gateway: {
              host: 'broker.losant.com',
              protocol: 'mqtts',
              id: '123412341234123412341234',
              key: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
              secret: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
              queueOfflineMessages: true,
              offlineMessageReplayOrder: 'oldestFirst',
              subscribeToPeripheralUpdates: true
            },
            store: {
              path: fakeArgs.store.path
            },
            triggers: [
              {
                name: 'opcuaTrig1',
                type: 'opcua',
                opcuaId: '0',
                uri: 'opc.tcp://localhost:4335/UA/Server',
                securityPolicy: 'None',
                securityMode: 'None',
                samplingInterval: '100',
                eventFilter: [ 'Message', 'Value' ],
                monitoredItems: [{
                  nameSpace: '0',
                  identifier: 'i=2255'
                }]
              },
              {
                name: 'opcuaTrig2',
                type: 'opcua',
                opcuaId: '0',
                uri: 'opc.tcp://localhost:4335/UA/Server',
                securityPolicy: 'None',
                securityMode: 'None',
                samplingInterval: '10',
                eventFilter: [],
                monitoredItems: [{
                  nameSpace: '1',
                  identifier: 's=MyVar3'
                }, {
                  nameSpace: '1',
                  identifier: 's=MyVar4'
                }]
              }
            ],
            udp: { address: '0.0.0.0' },
            webserver: { port: 8080, address: '0.0.0.0', enabled: true },
            localBroker: { port: 1883, address: '0.0.0.0', enabled: false },
            healthCheck: { enabled: true, offlineIsUnhealthy: false, port: 8010, address: '127.0.0.1' },
            workflow: { directory: fakeArgs.workflow.directory }
          }
        }
      }
    ]);
  });

  it('should return specific config', async () => {
    const fakeArgs = makeFakeArgs();
    const node = new AgentConfigGetNode('id', [], { resultPath: 'b', keyTemplate: '{{a}}' });

    node.run({
      getCurrentAgentConfig: () => fakeArgs
    }, { a: 'gateway.id' }).should.deepEqual([
      [],
      { a: 'gateway.id', b: { key: 'gateway.id', value: '123412341234123412341234' } }
    ]);

    node.run({
      getCurrentAgentConfig: () => fakeArgs
    }, { a: 'webserver' }).should.deepEqual([
      [],
      { a: 'webserver', b: { key: 'webserver', value: { port: 8080, address: '0.0.0.0', enabled: true } } }
    ]);
  });

  it('should return nothing for a config field that does not exist', async () => {
    const fakeArgs = makeFakeArgs();
    const node = new AgentConfigGetNode('id', [], { resultPath: 'b', keyTemplate: '{{a}}' });

    node.run({
      getCurrentAgentConfig: () => fakeArgs
    }, { a: 'gateway.a.b.c' }).should.deepEqual([
      [],
      { a: 'gateway.a.b.c', b: { key: 'gateway.a.b.c', value: undefined } }
    ]);

  });

});
