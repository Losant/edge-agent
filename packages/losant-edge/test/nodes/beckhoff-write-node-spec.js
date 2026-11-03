import BeckhoffWriteNode from '../../src/nodes/beckhoff-write-node.js';
import { reset } from '../../src/lib/connections/beckhoff.js';
import { abstractTests } from './beckhoff-read-node-spec.js';

describe('Beckhoff Write Node', () => {
  beforeEach(async () => {
    await reset();
  });
  afterEach(async () => {
    await BeckhoffWriteNode.shutdown();
  });
  abstractTests(BeckhoffWriteNode);
  it('should validate writeInstructions', async () => {
    const config = {
      localAmsNetIdTemplate: '{{ localAmsNetId }}',
      localAdsPortTemplate: 32750,
      targetAmsNetIdTemplate: '5.123.154.18.1.1',
      targetAdsPortTemplate: 851,
      routerHostTemplate: '127.0.0.1',
      routerTcpPortTemplate: 48898
    };
    const payload = {
      localAmsNetId: '192.168.200.217.1.1'
    };
    const outputIds = [['nid1']];
    const node = new BeckhoffWriteNode('id', outputIds, config);
    await node.run({ externalTimeout: 10000 }, payload).should.be.rejectedWith({
      message: 'Instructions must be an array.'
    });
  });
  it('should validate writeInstructions exist', async () => {
    const config = {
      localAmsNetIdTemplate: '{{ localAmsNetId }}',
      localAdsPortTemplate: 32750,
      targetAmsNetIdTemplate: '5.123.154.18.1.1',
      targetAdsPortTemplate: 851,
      routerHostTemplate: '127.0.0.1',
      routerTcpPortTemplate: 48898,
      writeInstructions: []
    };
    const payload = {
      localAmsNetId: '192.168.200.217.1.1'
    };
    const outputIds = [['nid1']];
    const node = new BeckhoffWriteNode('id', outputIds, config);
    await node.run({ externalTimeout: 10000 }, payload).should.be.rejectedWith({
      message: 'At least one write instruction is required.'
    });
  });
  it('should validate writeInstructions types are valid', async () => {
    const config = {
      localAmsNetIdTemplate: '{{ localAmsNetId }}',
      localAdsPortTemplate: 32750,
      targetAmsNetIdTemplate: '5.123.154.18.1.1',
      targetAdsPortTemplate: 851,
      routerHostTemplate: '127.0.0.1',
      routerTcpPortTemplate: 48898,
      writeInstructions: [{
        type: 'raw',
        nameTemplate: '{{ readFoo }}',
        dataTemplate: '{{ foo }}'
      }]
    };
    const payload = {
      localAmsNetId: '192.168.200.217.1.1'
    };
    const outputIds = [['nid1']];
    const node = new BeckhoffWriteNode('id', outputIds, config);
    await node.run({ externalTimeout: 10000 }, payload).should.be.rejectedWith({
      message: 'Type must be symbol.'
    });
  });
  it('should validate writeInstructions that data is given', async () => {
    const config = {
      localAmsNetIdTemplate: '{{ localAmsNetId }}',
      localAdsPortTemplate: 32750,
      targetAmsNetIdTemplate: '5.123.154.18.1.1',
      targetAdsPortTemplate: 851,
      routerHostTemplate: '127.0.0.1',
      routerTcpPortTemplate: 48898,
      writeInstructions: [{
        type: 'symbol',
        nameTemplate: 'GVL_Var.TestDint1'
      }]
    };
    const payload = {
      localAmsNetId: '192.168.200.217.1.1'
    };
    const outputIds = [['nid1']];
    const node = new BeckhoffWriteNode('id', outputIds, config);
    await node.run({ externalTimeout: 10000 }, payload).should.be.rejectedWith({
      message: 'Missing Data Template'
    });
  });
  it('should validate writeInstructions that data is given with a payload path', async () => {
    const config = {
      localAmsNetIdTemplate: '{{ localAmsNetId }}',
      localAdsPortTemplate: 32750,
      targetAmsNetIdTemplate: '5.123.154.18.1.1',
      targetAdsPortTemplate: 851,
      routerHostTemplate: '127.0.0.1',
      routerTcpPortTemplate: 48898,
      writeInstructions: [{
        type: 'symbol',
        nameTemplate: 'GVL_Var.TestDint1',
        dataMethod: 'payloadPath',
        dataTemplate: 'hello.world'
      }]
    };
    const payload = {
      localAmsNetId: '192.168.200.217.1.1'
    };
    const outputIds = [['nid1']];
    const node = new BeckhoffWriteNode('id', outputIds, config);
    await node.run({ externalTimeout: 10000 }, payload).should.be.rejectedWith({
      message: 'Data is required.'
    });
  });
  it('should validate writeInstructions that key cannot have errors', async () => {
    const config = {
      localAmsNetIdTemplate: '{{ localAmsNetId }}',
      localAdsPortTemplate: 32750,
      targetAmsNetIdTemplate: '5.123.154.18.1.1',
      targetAdsPortTemplate: 851,
      routerHostTemplate: '127.0.0.1',
      routerTcpPortTemplate: 48898,
      writeInstructions: [{
        type: 'symbol',
        nameTemplate: 'GVL_Var.TestDint1',
        dataMethod: 'stringTemplate',
        dataTemplate: '{{ foo }}',
        key: 'errors.foo'
      }],
      destinationPath: 'foo'
    };
    const payload = {
      localAmsNetId: '192.168.200.217.1.1'
    };
    const outputIds = [['nid1']];
    const node = new BeckhoffWriteNode('id', outputIds, config);
    await node.run({ externalTimeout: 10000 }, payload).should.be.rejectedWith({
      message: 'Keys cannot contain the special path errors.'
    });
  });
  it('should validate writeInstructions from payload path', async () => {
    const config = {
      localAmsNetIdTemplate: '{{ localAmsNetId }}',
      localAdsPortTemplate: 32750,
      targetAmsNetIdTemplate: '5.123.154.18.1.1',
      targetAdsPortTemplate: 851,
      routerHostTemplate: '127.0.0.1',
      routerTcpPortTemplate: 48898,
      writeInstructionsType: 'payloadPath',
      writeInstructions: 'instructions',
      destinationPath: 'foo'
    };
    const payload = {
      localAmsNetId: '192.168.200.217.1.1',
      instructions: []
    };
    const outputIds = [['nid1']];
    const node = new BeckhoffWriteNode('id', outputIds, config);
    await node.run({ externalTimeout: 10000 }, payload).should.be.rejectedWith({
      message: 'At least one write instruction is required.'
    });
  });
  it('should validate writeInstructions are objects from payload path', async () => {
    const config = {
      localAmsNetIdTemplate: '{{ localAmsNetId }}',
      localAdsPortTemplate: 32750,
      targetAmsNetIdTemplate: '5.123.154.18.1.1',
      targetAdsPortTemplate: 851,
      routerHostTemplate: '127.0.0.1',
      routerTcpPortTemplate: 48898,
      writeInstructionsType: 'payloadPath',
      writeInstructions: 'instructions',
      destinationPath: 'foo'
    };
    const payload = {
      localAmsNetId: '192.168.200.217.1.1',
      instructions: [1]
    };
    const outputIds = [['nid1']];
    const node = new BeckhoffWriteNode('id', outputIds, config);
    await node.run({ externalTimeout: 10000 }, payload).should.be.rejectedWith({
      message: 'Each write instruction must be an object.'
    });
  });
  it('should validate writeInstructions autoFill is a boolean', async () => {
    const config = {
      localAmsNetIdTemplate: '{{ localAmsNetId }}',
      localAdsPortTemplate: 32750,
      targetAmsNetIdTemplate: '5.123.154.18.1.1',
      targetAdsPortTemplate: 851,
      routerHostTemplate: '127.0.0.1',
      routerTcpPortTemplate: 48898,
      writeInstructionsType: 'payloadPath',
      writeInstructions: 'instructions',
      destinationPath: 'foo'
    };
    const payload = {
      localAmsNetId: '192.168.200.217.1.1',
      instructions: [{
        type: 'symbol',
        name: 'GVL_Var.TestDint1',
        data: '1',
        key: 'foo',
        autoFill: 'autoFill'
      }]
    };
    const outputIds = [['nid1']];
    const node = new BeckhoffWriteNode('id', outputIds, config);
    await node.run({ externalTimeout: 10000 }, payload).should.be.rejectedWith({
      message: 'autoFill must be a boolean.'
    });
  });
  // being on the VPN run ssh -L 48898:192.168.5.220:48898 losant@192.168.5.30
  describe.skip('Writes with South Bound Connector Lab', () => {
    it('should write to beckhoff', async () => {
      const instructions = [
        { name: 'GVL_Var.TestDint1', data: 1, key: 'newWrite' },
        { name: 'GVL_Var.TestDint1', data: 8, key: 'revertWrite' }
      ];
      const config = {
        localAmsNetIdTemplate: '192.168.5.221.1.2',
        localAdsPortTemplate: 32750,
        targetAmsNetIdTemplate: '5.123.154.18.1.1',
        targetAdsPortTemplate: 851,
        routerHostTemplate: '127.0.0.1',
        routerTcpPortTemplate: 48898,
        timeoutTemplate: 30000,
        writeInstructionsType: 'payloadPath',
        writeInstructions: 'instructions',
        destinationPath: 'results'
      };
      const payload = { instructions };
      const outputIds = [['nid1']];
      const node = new BeckhoffWriteNode('id', outputIds, config);
      const result = await node.run({ externalTimeout: 30000 }, payload);
      result[1].results.should.deepEqual({
        newWrite: { success: true },
        revertWrite: { success: true }
      });
    });
    it('should write to beckhoff', async () => {
      const config = {
        localAmsNetIdTemplate: '192.168.5.221.1.2',
        localAdsPortTemplate: 32750,
        targetAmsNetIdTemplate: '5.123.154.18.1.1',
        targetAdsPortTemplate: 851,
        routerHostTemplate: '127.0.0.1',
        routerTcpPortTemplate: 48898,
        timeoutTemplate: 30000,
        writeInstructionsType: 'array',
        writeInstructions: [
          { type: 'symbol', nameTemplate: 'GVL_Var.TestString1', dataMethod: 'stringTemplate', dataTemplate: '{{ foo }}' }
        ],
        destinationPath: 'results'
      };
      const payload = { foo: 'hello' };
      const outputIds = [['nid1']];
      const node = new BeckhoffWriteNode('id', outputIds, config);
      const result = await node.run({ externalTimeout: 30000 }, payload);
      result[1].results.GVL_Var.should.deepEqual({
        TestString1: { success: true }
      });
    });

    it('should write to beckhoff with some success and some failures', async () => {
      const config = {
        localAmsNetIdTemplate: '192.168.5.221.1.2',
        localAdsPortTemplate: 32750,
        targetAmsNetIdTemplate: '5.123.154.18.1.1',
        targetAdsPortTemplate: 851,
        routerHostTemplate: '127.0.0.1',
        routerTcpPortTemplate: 48898,
        timeoutTemplate: 30000,
        writeInstructionsType: 'array',
        writeInstructions: [
          { type: 'symbol', nameTemplate: 'GVL_Var.TestString1', dataMethod: 'stringTemplate', dataTemplate: '{{ foo }}' },
          { type: 'symbol', nameTemplate: 'GVL_Var.DoesNotExist10001', dataMethod: 'stringTemplate', dataTemplate: '{{ foo }}' },
          { type: 'symbol', nameTemplate: 'GVL_Var.TestString1', key: 'again', dataMethod: 'stringTemplate', dataTemplate: 'Hello Losant' },
          { type: 'symbol', nameTemplate: 'GVL_Var.TestDint1', dataMethod: 'stringTemplate', dataTemplate: 'Hello Losant' },
          { type: 'symbol', nameTemplate: 'GVL_Var.TestDint1', key: 'testdint1', dataMethod: 'payloadPath', dataTemplate: 'pathToNull' },
          { type: 'symbol', nameTemplate: 'GVL_Var.TestArrayInt1', dataMethod: 'stringTemplate', dataTemplate: '0' },
          { type: 'symbol', nameTemplate: 'GVL_Var.TestStructure1', dataMethod: 'payloadPath', dataTemplate: 'boo' },
          { type: 'symbol', nameTemplate: 'GVL_Var.TestEnumeration1', dataMethod: 'payloadPath', dataTemplate: 'woo' }
        ],
        destinationPath: 'results'
      };
      const payload = { foo: 'hello', boo: { TestInt: 22 }, woo: { name: 'blue' }, zero: 0, pathToNull: null };
      const outputIds = [['nid1']];
      const node = new BeckhoffWriteNode('id', outputIds, config);
      const result = await node.run({ externalTimeout: 30000 }, payload);
      result[1].results.should.deepEqual({
        GVL_Var: {
          TestString1: { success: true },
          DoesNotExist10001: { success: false },
          TestDint1: { success: true },
          TestArrayInt1: { success: true },
          TestStructure1: { success: true },
          TestEnumeration1: { success: true }
        },
        testdint1: { success: true },
        again: { success: true },
        errors:  [
          {
            key: 'GVL_Var.DoesNotExist10001',
            message: 'Getting symbol for GVL_Var.DoesNotExist10001 failed',
            type: 'BECKHOFF_WRITE_ERROR'
          }
        ]
      });
    }).timeout(60000);

    it('should test autofill behavior', async () => {
      const config = {
        localAmsNetIdTemplate: '192.168.5.221.1.2',
        localAdsPortTemplate: 32750,
        targetAmsNetIdTemplate: '5.123.154.18.1.1',
        targetAdsPortTemplate: 851,
        routerHostTemplate: '127.0.0.1',
        routerTcpPortTemplate: 48898,
        timeoutTemplate: 30000,
        writeInstructionsType: 'array',
        writeInstructions: [
          { type: 'symbol', nameTemplate: 'GVL_Var.TestArrayInt1', key: 'autoFillDefault', dataMethod: 'stringTemplate', dataTemplate: '0' },
          {
            type: 'symbol', nameTemplate: 'GVL_Var.TestArrayInt1', key: 'autoFillFalse', dataMethod: 'stringTemplate', dataTemplate: '0', autoFill: false
          },
          {
            type: 'symbol', nameTemplate: 'GVL_Var.TestArrayInt1', key: 'autoFillTrue', dataMethod: 'stringTemplate', dataTemplate: '0', autoFill: true
          }
        ],
        destinationPath: 'results'
      };
      const payload = { foo: 'hello', boo: { TestInt: 22 }, woo: { name: 'blue' }, zero: 0, pathToNull: null };
      const outputIds = [['nid1']];
      const node = new BeckhoffWriteNode('id', outputIds, config);
      const result = await node.run({ externalTimeout: 30000 }, payload);
      result[1].results.should.deepEqual({
        autoFillDefault: { success: true },
        autoFillTrue: { success: true },
        autoFillFalse: { success: false },
        errors:  [
          {
            key: 'autoFillFalse',
            message: 'Converting object to raw value for GVL_Var.TestArrayInt1 failed. The object is missing key/value for "[1]". Hint: Use autoFill parameter to add missing fields automatically',
            type: 'BECKHOFF_WRITE_ERROR'
          }
        ]
      });
    });
  });
});
