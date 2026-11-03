import { sinon } from '../common.js';
import AgentConfigSetNode from '../../src/nodes/agent-config-set-node.js';
import Args from '../../src/types/args.js';
import fs from 'fs-extra';
import process from 'process';
import { defer } from 'omnibelt';
import toml from '@iarna/toml';
import { tmpdir } from 'os';

describe('AgentConfigSetNode', () => {
  const fakeTomlPath = `${tmpdir()}/test.toml`;

  const makeFakeArgs = () => {
    return Args({
      gateway: {
        id: '123412341234123412341234',
        key: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        secret: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
      },
      originalCliArgs: {
        deviceId: '123412341234123412341234',
        confPath: fakeTomlPath
      },
      triggers: [
        {
          name: 'opcuaTrig1',
          type: 'opcua',
          uri: 'opc.tcp://localhost:4335/UA/Server',
          eventFilter: [],
          monitoredItems: [{
            nameSpace: '0',
            identifier: 'i=1'
          }]
        }
      ]
    });
  };

  let signalHandler = null;

  beforeEach(async () => {
    await fs.remove(fakeTomlPath);
  });

  afterEach(() => {
    if (signalHandler) {
      process.removeListener('SIGHUP', signalHandler);
      signalHandler = null;
    }
  });

  it('should update config and send SIGHUP, individual fields', async () => {
    const fakeArgs = makeFakeArgs();

    const node = new AgentConfigSetNode('id', [], {
      resultPath: 'a',
      configSourceMethod: 'individualFields',
      configSource: [
        { keyTemplate: '{{foo}}', valueTemplate: '{{bar}}' }
      ]
    });

    const deferred = defer();
    signalHandler = deferred.resolve;
    process.on('SIGHUP', signalHandler);

    (await node.run({
      getCurrentAgentConfig: () => fakeArgs
    }, {
      foo: 'gateway.id',
      bar: '888877776666666677778888'
    })).should.deepEqual([
      [],
      {
        a: { success: true },
        bar: '888877776666666677778888',
        foo: 'gateway.id'
      }
    ]);

    await deferred.promise;

    toml.parse(await fs.readFile(fakeTomlPath, 'utf8')).should.deepEqual({ gateway: { id: '888877776666666677778888' } });

    (await node.run({
      getCurrentAgentConfig: () => fakeArgs
    }, {
      foo: 'triggers.[0]',
      bar: {
        name: 'opcuaTrig1',
        type: 'opcua',
        uri: 'opc.tcp://localhost:4335/UA/Server',
        eventFilter: ['Message', 'Value', null],
        monitoredItems: [{
          nameSpace: '0',
          identifier: 'i=2255'
        }, {
          nameSpace: '1',
          identifier: 'i=2255'
        }]
      }
    })).should.deepEqual([
      [],
      {
        a: { success: true },
        bar: {
          name: 'opcuaTrig1',
          type: 'opcua',
          uri: 'opc.tcp://localhost:4335/UA/Server',
          eventFilter: ['Message', 'Value', null],
          monitoredItems: [{
            nameSpace: '0',
            identifier: 'i=2255'
          }, {
            nameSpace: '1',
            identifier: 'i=2255'
          }]
        },
        foo: 'triggers.[0]'
      }
    ]);

    await deferred.promise;

    toml.parse(await fs.readFile(fakeTomlPath, 'utf8')).should.deepEqual({
      gateway: { id: '888877776666666677778888' },
      triggers: [
        {
          name: 'opcuaTrig1',
          type: 'opcua',
          uri: 'opc.tcp://localhost:4335/UA/Server',
          eventFilter: ['Message', 'Value'],
          monitoredItems: [{
            nameSpace: '0',
            identifier: 'i=2255'
          }, {
            nameSpace: '1',
            identifier: 'i=2255'
          }]
        }
      ]
    });

    (await node.run({
      getCurrentAgentConfig: () => fakeArgs
    }, {
      foo: 'triggers.[0].name',
      bar: 'opcuaTrig2'
    })).should.deepEqual([
      [],
      {
        a: { success: true },
        foo: 'triggers.[0].name',
        bar: 'opcuaTrig2'
      }
    ]);

    await deferred.promise;

    toml.parse(await fs.readFile(fakeTomlPath, 'utf8')).should.deepEqual({
      gateway: { id: '888877776666666677778888' },
      triggers: [
        {
          name: 'opcuaTrig2',
          type: 'opcua',
          uri: 'opc.tcp://localhost:4335/UA/Server',
          eventFilter: ['Message', 'Value'],
          monitoredItems: [{
            nameSpace: '0',
            identifier: 'i=2255'
          }, {
            nameSpace: '1',
            identifier: 'i=2255'
          }]
        }
      ]
    });

    (await node.run({
      getCurrentAgentConfig: () => fakeArgs
    }, {
      foo: 'triggers.[0].monitoredItems.[0].identifier',
      bar: 'i=666'
    })).should.deepEqual([
      [],
      {
        a: { success: true },
        foo: 'triggers.[0].monitoredItems.[0].identifier',
        bar: 'i=666'
      }
    ]);

    await deferred.promise;

    toml.parse(await fs.readFile(fakeTomlPath, 'utf8')).should.deepEqual({
      gateway: { id: '888877776666666677778888' },
      triggers: [
        {
          name: 'opcuaTrig2',
          type: 'opcua',
          uri: 'opc.tcp://localhost:4335/UA/Server',
          eventFilter: ['Message', 'Value'],
          monitoredItems: [{
            nameSpace: '0',
            identifier: 'i=666'
          }, {
            nameSpace: '1',
            identifier: 'i=2255'
          }]
        }
      ]
    });
  });

  it('should update config and send SIGHUP, json template, add to existing file', async () => {
    await fs.outputFile(fakeTomlPath, toml.stringify({
      webserver: { port: 12 }
    }));

    const fakeArgs = makeFakeArgs();

    const node = new AgentConfigSetNode('id', [], {
      resultPath: 'a',
      configSourceMethod: 'jsonTemplate',
      configSource: '{ "webserver": { "{{field}}": true } }'
    });

    const deferred = defer();
    signalHandler = deferred.resolve;
    process.on('SIGHUP', signalHandler);

    (await node.run({
      getCurrentAgentConfig: () => fakeArgs
    }, {
      field: 'enabled'
    })).should.deepEqual([
      [],
      {
        a: { success: true },
        field: 'enabled'
      }
    ]);

    await deferred.promise;

    toml.parse(await fs.readFile(fakeTomlPath, 'utf8')).should.deepEqual({ webserver: { port: 12, enabled: true } });
  });

  it('should update config and send SIGHUP, payload path, remove field from file', async () => {
    await fs.outputFile(fakeTomlPath, toml.stringify({
      webserver: { enabled: true, port: 12 }
    }));

    const fakeArgs = makeFakeArgs();

    const node = new AgentConfigSetNode('id', [], {
      resultPath: 'a',
      configSourceMethod: 'payloadPath',
      configSource: 'what'
    });

    const deferred = defer();
    signalHandler = deferred.resolve;
    process.on('SIGHUP', signalHandler);

    (await node.run({
      getCurrentAgentConfig: () => fakeArgs
    }, {
      what: { 'webserver': { port: null, username: 'foo' }, 'webserver.password': 'bar' }
    })).should.deepEqual([
      [],
      {
        a: { success: true },
        what: { 'webserver': { port: null, username: 'foo' }, 'webserver.password': 'bar' }
      }
    ]);

    await deferred.promise;

    toml.parse(await fs.readFile(fakeTomlPath, 'utf8')).should.deepEqual({ webserver: { username: 'foo', enabled: true, password: 'bar' } });
  });

  it('should error on invalid config fields', async () => {
    const fakeArgs = makeFakeArgs();

    const node = new AgentConfigSetNode('id', [], {
      resultPath: 'a',
      configSourceMethod: 'individualFields',
      configSource: [
        { keyTemplate: '{{foo}}', valueTemplate: '{{bar}}' }
      ]
    });

    (await node.run({
      getCurrentAgentConfig: () => fakeArgs
    }, {
      foo: 'nope',
      bar: 'hello'
    })).should.deepEqual([
      [],
      {
        a: {
          error: {
            message: 'The following configuration errors were found:\nInvalid value "hello" supplied to /nope: Nil',
            type: 'LosantAgentConfigurationError'
          },
          success: false
        },
        foo: 'nope',
        bar: 'hello'
      }
    ]);
  });

  it('should error when it cant write to the config file', async () => {
    const node = new AgentConfigSetNode('id', [], {
      resultPath: 'a',
      configSourceMethod: 'individualFields',
      configSource: [
        { keyTemplate: '{{foo}}', valueTemplate: '{{bar}}' }
      ]
    });

    sinon.stub(fs, 'outputFile').callsFake(async (confPath) => {
      confPath.should.equal('/root/lib/nope.toml');
      throw new Error('Cannot write to file.');
    });

    (await node.run({
      getCurrentAgentConfig: () => {
        return { originalCliArgs: { confPath: '/root/lib/nope.toml' } };
      }
    }, {
      foo: 'gateway.id',
      bar: '888877776666666677778888'
    })).should.deepEqual([
      [],
      {
        a: {
          error: {
            message: 'Error writing updated configuration file to /root/lib/nope.toml',
            type: 'CONFIG_WRITE_ERROR'
          },
          success: false
        },
        foo: 'gateway.id',
        bar: '888877776666666677778888'
      }
    ]);
  });

});
