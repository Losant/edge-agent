import { defer } from 'omnibelt';
import BeckhoffReadNode from '../../src/nodes/beckhoff-read-node.js';
import { reset } from '../../src/lib/connections/beckhoff.js';

export const abstractTests = (NodeClass) => {
  it('should require localAmsNetId', async () => {
    const config = {
      localAmsNetIdTemplate: '{{ localAmsNetId }}'
    };
    const payload = {};
    const outputIds = [['nid1']];
    const node = new NodeClass('id', outputIds, config);
    await node.run({ externalTimeout: 10000 }, payload).should.be.rejectedWith({
      message: 'localAmsNetId is required.'
    });
  });
  it('should validate localAdsPort', async () => {
    const config = {
      localAmsNetIdTemplate: '{{ localAmsNetId }}',
      localAdsPortTemplate: '{{ localAdsPort }}'
    };
    const payload = {
      localAmsNetId: '192.168.200.217.1.1',
      localAdsPort: 3275000000000000
    };
    const outputIds = [['nid1']];
    const node = new NodeClass('id', outputIds, config);
    await node.run({ externalTimeout: 10000 }, payload).should.be.rejectedWith({
      message: 'localAdsPortTemplate number (3275000000000000) is invalid.'
    });
    await node.run({ externalTimeout: 10000 }, { ...payload, localAdsPort: -1 }).should.be.rejectedWith({
      message: 'localAdsPortTemplate number (-1) is invalid.'
    });
  });
  it('should validate targetAmsNetId', async () => {
    const config = {
      localAmsNetIdTemplate: '{{ localAmsNetId }}',
      localAdsPortTemplate: '',
      targetAmsNetIdTemplate: '{{ targetAmsNetId }}'
    };
    const payload = {
      localAmsNetId: '192.168.200.217.1.1',
      targetAmsNetId: ''
    };
    const outputIds = [['nid1']];
    const node = new NodeClass('id', outputIds, config);
    await node.run({ externalTimeout: 10000 }, payload).should.be.rejectedWith({
      message: 'targetAmsNetId is required.'
    });
    await node.run({ externalTimeout: 10000 }, { ...payload, targetAmsNetId: '155.155' }).should.be.rejectedWith({
      message: 'targetAmsNetId must be exactly 6 octets.'
    });
    await node.run({ externalTimeout: 10000 }, { ...payload, targetAmsNetId: '256.-1.258.0.1.1' }).should.be.rejectedWith({
      message: 'targetAmsNetId must contain numbers from 0 to 255.'
    });
    await node.run({ externalTimeout: 10000 }, { ...payload, targetAmsNetId: '256.   -1.258.0.1.1' }).should.be.rejectedWith({
      message: 'targetAmsNetId must contain numbers from 0 to 255.'
    });
  });
  it('should validate targetAdsPort', async () => {
    const config = {
      localAmsNetIdTemplate: '{{ localAmsNetId }}',
      localAdsPortTemplate: '',
      targetAmsNetIdTemplate: '5.123.154.18.1.1',
      targetAdsPortTemplate: '{{ targetAdsPort }}'
    };
    const payload = {
      localAmsNetId: '192.168.200.217.1.1',
      targetAdsPort: 3275000000000000
    };
    const outputIds = [['nid1']];
    const node = new NodeClass('id', outputIds, config);
    await node.run({ externalTimeout: 10000 }, payload).should.be.rejectedWith({
      message: 'targetAdsPortTemplate number (3275000000000000) is invalid.'
    });
    await node.run({ externalTimeout: 10000 }, { ...payload, targetAdsPort: -1 }).should.be.rejectedWith({
      message: 'targetAdsPortTemplate number (-1) is invalid.'
    });
  });
  it('should validate routerAddress', async () => {
    const config = {
      localAmsNetIdTemplate: '{{ localAmsNetId }}',
      localAdsPortTemplate: 32750,
      targetAmsNetIdTemplate: '5.123.154.18.1.1',
      targetAdsPortTemplate: 851,
      routerHostTemplate: '{{ foo }}'
    };
    const payload = {
      localAmsNetId: '192.168.200.217.1.1'
    };
    const outputIds = [['nid1']];
    const node = new NodeClass('id', outputIds, config);
    await node.run({ externalTimeout: 10000 }, payload).should.be.rejectedWith({
      message: 'routerHost is required.'
    });
  });
  it('should validate routerTcpPort', async () => {
    const config = {
      localAmsNetIdTemplate: '{{ localAmsNetId }}',
      localAdsPortTemplate: 32750,
      targetAmsNetIdTemplate: '5.123.154.18.1.1',
      targetAdsPortTemplate: 851,
      routerHostTemplate: '127.0.0.1',
      routerTcpPortTemplate: '{{ routerTcpPort }}'
    };
    const payload = {
      localAmsNetId: '192.168.200.217.1.1',
      routerTcpPort: 3275000000000000
    };
    const outputIds = [['nid1']];
    const node = new NodeClass('id', outputIds, config);
    await node.run({ externalTimeout: 10000 }, payload).should.be.rejectedWith({
      message: 'routerTcpPortTemplate number (3275000000000000) is invalid.'
    });
    await node.run({ externalTimeout: 10000 }, { ...payload, routerTcpPort: -1 }).should.be.rejectedWith({
      message: 'routerTcpPortTemplate number (-1) is invalid.'
    });
  });

};

describe('Beckhoff Read Node', () => {
  beforeEach(async () => {
    await reset();
  });
  afterEach(async () => {
    await BeckhoffReadNode.shutdown();
  });
  abstractTests(BeckhoffReadNode);
  it('should properly error for an invalid host', async () => {
    const config = {
      localAmsNetIdTemplate: '192.168.200.217.1.1',
      localAdsPortTemplate: 32750,
      targetAmsNetIdTemplate: '5.123.154.18.1.1',
      targetAdsPortTemplate: 851,
      routerHostTemplate: 'localhope',
      readInstructions: [{ type: 'symbol', nameTemplate: 'name' }],
      destinationPath: 'destination'
    };
    const outputIds = [['nid1']];
    const node = new BeckhoffReadNode('id', outputIds, config);
    await node.run({ externalTimeout: 1000 }, {}).should.be.resolvedWith([
      [ [ 'nid1' ] ],
      {
        destination:  {
          errors: [ {
            type: 'BECKHOFF_READ_ERROR',
            message: 'Cannot resolve host: localhope'
          } ]
        }
      }
    ]);
  });
  it('should validate readInstructions', async () => {
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
    const node = new BeckhoffReadNode('id', outputIds, config);
    await node.run({ externalTimeout: 10000 }, payload).should.be.rejectedWith({
      message: 'Instructions must be an array.'
    });
  });
  it('should validate readInstructions exist', async () => {
    const config = {
      localAmsNetIdTemplate: '{{ localAmsNetId }}',
      localAdsPortTemplate: 32750,
      targetAmsNetIdTemplate: '5.123.154.18.1.1',
      targetAdsPortTemplate: 851,
      routerHostTemplate: '127.0.0.1',
      routerTcpPortTemplate: 48898,
      readInstructions: []
    };
    const payload = {
      localAmsNetId: '192.168.200.217.1.1'
    };
    const outputIds = [['nid1']];
    const node = new BeckhoffReadNode('id', outputIds, config);
    await node.run({ externalTimeout: 10000 }, payload).should.be.rejectedWith({
      message: 'At least one read instruction is required.'
    });
  });
  it('should validate readInstructions types are valid', async () => {
    const config = {
      localAmsNetIdTemplate: '{{ localAmsNetId }}',
      localAdsPortTemplate: 32750,
      targetAmsNetIdTemplate: '5.123.154.18.1.1',
      targetAdsPortTemplate: 851,
      routerHostTemplate: '127.0.0.1',
      routerTcpPortTemplate: 48898,
      readInstructions: [{
        type: 'raw',
        name: '{{ readFoo }}'
      }]
    };
    const payload = {
      localAmsNetId: '192.168.200.217.1.1'
    };
    const outputIds = [['nid1']];
    const node = new BeckhoffReadNode('id', outputIds, config);
    await node.run({ externalTimeout: 10000 }, payload).should.be.rejectedWith({
      message: 'Type must be symbol.'
    });
  });
  it('should validate readInstructions name is required', async () => {
    const config = {
      localAmsNetIdTemplate: '{{ localAmsNetId }}',
      localAdsPortTemplate: 32750,
      targetAmsNetIdTemplate: '5.123.154.18.1.1',
      targetAdsPortTemplate: 851,
      routerHostTemplate: '127.0.0.1',
      routerTcpPortTemplate: 48898,
      readInstructions: [{
        type: 'symbol',
        nameTemplate: '{{ readFoo }}'
      }]
    };
    const payload = {
      localAmsNetId: '192.168.200.217.1.1'
    };
    const outputIds = [['nid1']];
    const node = new BeckhoffReadNode('id', outputIds, config);
    await node.run({ externalTimeout: 10000 }, payload).should.be.rejectedWith({
      message: 'Name is required.'
    });
  });
  it('should validate readInstructions (by payloadPath)', async () => {
    const config = {
      localAmsNetIdTemplate: '{{ localAmsNetId }}',
      localAdsPortTemplate: 32750,
      targetAmsNetIdTemplate: '5.123.154.18.1.1',
      targetAdsPortTemplate: 851,
      routerHostTemplate: '127.0.0.1',
      routerTcpPortTemplate: 48898,
      readInstructionsType: 'payloadPath'
    };
    const payload = {
      localAmsNetId: '192.168.200.217.1.1'
    };
    const outputIds = [['nid1']];
    const node = new BeckhoffReadNode('id', outputIds, config);
    await node.run({ externalTimeout: 10000 }, payload).should.be.rejectedWith({
      message: 'Instructions must be an array.'
    });
  });
  it('should validate readInstructions exist (by payloadPath)', async () => {
    const config = {
      localAmsNetIdTemplate: '{{ localAmsNetId }}',
      localAdsPortTemplate: 32750,
      targetAmsNetIdTemplate: '5.123.154.18.1.1',
      targetAdsPortTemplate: 851,
      routerHostTemplate: '127.0.0.1',
      routerTcpPortTemplate: 48898,
      readInstructionsType: 'payloadPath',
      readInstructions: 'instructions'
    };
    const payload = {
      localAmsNetId: '192.168.200.217.1.1',
      instructions: []
    };
    const outputIds = [['nid1']];
    const node = new BeckhoffReadNode('id', outputIds, config);
    await node.run({ externalTimeout: 10000 }, payload).should.be.rejectedWith({
      message: 'At least one read instruction is required.'
    });
  });
  it('should validate readInstructions (by payloadPath) types are valid', async () => {
    const config = {
      localAmsNetIdTemplate: '{{ localAmsNetId }}',
      localAdsPortTemplate: 32750,
      targetAmsNetIdTemplate: '5.123.154.18.1.1',
      targetAdsPortTemplate: 851,
      routerHostTemplate: '127.0.0.1',
      routerTcpPortTemplate: 48898,
      readInstructionsType: 'payloadPath',
      readInstructions: 'instructions'
    };
    const payload = {
      localAmsNetId: '192.168.200.217.1.1',
      instructions: [{ type: 'raw' }]
    };
    const outputIds = [['nid1']];
    const node = new BeckhoffReadNode('id', outputIds, config);
    await node.run({ externalTimeout: 10000 }, payload).should.be.rejectedWith({
      message: 'Type must be symbol.'
    });
  });
  it('should validate readInstructions (by payloadPath) name is required', async () => {
    const config = {
      localAmsNetIdTemplate: '{{ localAmsNetId }}',
      localAdsPortTemplate: 32750,
      targetAmsNetIdTemplate: '5.123.154.18.1.1',
      targetAdsPortTemplate: 851,
      routerHostTemplate: '127.0.0.1',
      routerTcpPortTemplate: 48898,
      readInstructionsType: 'payloadPath',
      readInstructions: 'instructions'
    };
    const payload = {
      localAmsNetId: '192.168.200.217.1.1',
      instructions: [{ type: 'symbol', name: '' }]
    };
    const outputIds = [['nid1']];
    const node = new BeckhoffReadNode('id', outputIds, config);
    await node.run({ externalTimeout: 10000 }, payload).should.be.rejectedWith({
      message: 'Name is required.'
    });
  });
  it('should validate destinationPath', async () => {
    const config = {
      localAmsNetIdTemplate: '{{ localAmsNetId }}',
      localAdsPortTemplate: 32750,
      targetAmsNetIdTemplate: '5.123.154.18.1.1',
      targetAdsPortTemplate: 851,
      routerHostTemplate: '127.0.0.1',
      routerTcpPortTemplate: 48898,
      readInstructionsType: 'payloadPath',
      readInstructions: 'instructions'
    };
    const payload = {
      localAmsNetId: '192.168.200.217.1.1',
      instructions: [{ type: 'symbol', name: 'GVL_Var.TestDint1' }]
    };
    const outputIds = [['nid1']];
    const node = new BeckhoffReadNode('id', outputIds, config);
    await node.run({ externalTimeout: 10000 }, payload).should.be.rejectedWith({
      message: 'Destination path is required.'
    });
  });
  it('should properly return client errors', async () => {
    const config = {
      localAmsNetIdTemplate: '{{ localAmsNetId }}',
      localAdsPortTemplate: 32750,
      targetAmsNetIdTemplate: '5.123.154.18.1.1',
      targetAdsPortTemplate: 851,
      routerHostTemplate: '127.0.0.1',
      routerTcpPortTemplate: 48898,
      readInstructionsType: 'payloadPath',
      readInstructions: 'instructions',
      destinationPath: 'readResults'
    };
    const payload = {
      localAmsNetId: '192.168.200.217.1.1',
      instructions: [{ type: 'symbol', name: 'GVL_Var.TestDint1' }]
    };
    const outputIds = [['nid1']];
    const node = new BeckhoffReadNode('id', outputIds, config);
    const result = await node.run({ externalTimeout: 1000 }, payload);
    result[1].readResults.errors[0].message.startsWith('Connecting to 127.0.0.1:48898 failed').should.equal(true);
  });
  // being on the VPN run ssh -L 48898:192.168.5.220:48898 losant@192.168.5.30
  describe.skip('Real Read tests with south bound connector lab', () => {
    after(async function() {
      this.timeout(60000);
      await BeckhoffReadNode.shutdown();
    });
    it('should return disconnect error when trying to reach targetAmsNetId and targetAdsPort that are not configured', async () => {
      const instructions = [
        { name: 'GVL_Var.TestDint1' },
        { name: 'b 🌺 c' }
      ];
      const config = {
        localAmsNetIdTemplate: '192.168.5.150.1.1',
        localAdsPortTemplate: 32750,
        targetAmsNetIdTemplate: '5.123.154.18.1.1',
        targetAdsPortTemplate: 851,
        routerHostTemplate: '127.0.0.1',
        routerTcpPortTemplate: 48898,
        timeoutTemplate: 30000,
        readInstructionsType: 'payloadPath',
        readInstructions: 'instructions',
        destinationPath: 'results'
      };
      const payload = { instructions };
      const outputIds = [['nid1']];
      const node = new BeckhoffReadNode('id', outputIds, config);
      const result = await node.run({ externalTimeout: 30000 }, payload);
      // console.log(result[1]);
      result[1].results.errors.should.deepEqual([
        {
          type: 'BECKHOFF_READ_ERROR',
          message: 'Connection failed: Device system manager state read failed'
        }
      ]);
    }).timeout(50000);
    it('should properly cache clients and run instructions one at a time', async () => {
      const instructions = [
        { name: 'GVL_Var.TestDint1' },
        { name: 'GVL_Var.TestReal1' },
        { name: 'GVL_Var.TestBool1' },
        { name: 'GVL_Var.TestString1' },
        { name: 'GVL_Var.TestInt1' }
      ];
      const config = {
        localAmsNetIdTemplate: '192.168.5.221.1.2',
        localAdsPortTemplate: 32750,
        targetAmsNetIdTemplate: '5.123.154.18.1.1',
        targetAdsPortTemplate: 851,
        routerHostTemplate: '127.0.0.1',
        routerTcpPortTemplate: 48898,
        timeoutTemplate: 10000,
        readInstructionsType: 'payloadPath',
        readInstructions: 'instructions',
        destinationPath: 'results'
      };
      const payload = { instructions };
      const outputIds = [['nid1']];
      const node = new BeckhoffReadNode('id', outputIds, config);
      const node1 = new BeckhoffReadNode('id', outputIds, config);
      const node2 = new BeckhoffReadNode('id', outputIds, config);
      const [ results, results1, results2 ] = await Promise.all([
        await node.run({ externalTimeout: 30000 }, payload),
        await node1.run({ externalTimeout: 30000 }, payload),
        await node2.run({ externalTimeout: 30000 }, payload)
      ]);
      // console.log(results[1].results);
      results[1].results.should.deepEqual(results1[1].results);
      results1[1].results.should.deepEqual(results2[1].results);
    }).timeout(60000);
    it('repeatedly reading over 5 seconds', async () => {
      const instructions = [
        { name: 'GVL_Var.TestDint1' },
        { name: 'GVL_Var.TestReal1' },
        { name: 'GVL_Var.TestBool1' },
        { name: 'GVL_Var.TestString1' },
        { name: 'GVL_Var.TestInt1' }
      ];
      const config = {
        localAmsNetIdTemplate: '192.168.5.221.1.2',
        localAdsPortTemplate: 32750,
        targetAmsNetIdTemplate: '5.123.154.18.1.1',
        targetAdsPortTemplate: 851,
        routerHostTemplate: '127.0.0.1',
        routerTcpPortTemplate: 48898,
        timeoutTemplate: 30000,
        readInstructionsType: 'payloadPath',
        readInstructions: 'instructions',
        destinationPath: 'results'
      };
      const payload = { instructions };
      const outputIds = [['nid1']];
      const waitForTimeouts = defer();
      let count = 0;
      const intervalId = setInterval(async () => {
        count++;
        const node = new BeckhoffReadNode('id', outputIds, config);
        const results = await node.run({ externalTimeout: 30000 }, payload);
        results[1].results.should.not.be.null();
        if (count === 58) {
          waitForTimeouts.resolve();
        }
      }, 1000);
      await waitForTimeouts.promise;
      clearInterval(intervalId);
    }).timeout(60000);
    it('should not have issues with weird reads', async () => {
      const instructions = [
        { name: 12345 },
        { name: 'b 🌺 c' }
      ];
      const config = {
        localAmsNetIdTemplate: '192.168.5.221.1.2',
        localAdsPortTemplate: 32750,
        targetAmsNetIdTemplate: '5.123.154.18.1.1',
        targetAdsPortTemplate: 851,
        routerHostTemplate: '127.0.0.1',
        routerTcpPortTemplate: 48898,
        timeoutTemplate: 10000,
        readInstructionsType: 'payloadPath',
        readInstructions: 'instructions',
        destinationPath: 'results'
      };
      const payload = { instructions };
      const outputIds = [['nid1']];
      const node = new BeckhoffReadNode('id', outputIds, config);
      const result = await node.run({ externalTimeout: 30000 }, payload);
      result[1].results.errors.should.deepEqual([
        {
          key: '12345',
          type: 'BECKHOFF_READ_ERROR',
          message: 'Reading symbol for 12345 failed'
        },
        {
          key: 'b 🌺 c',
          type: 'BECKHOFF_READ_ERROR',
          message: 'Reading symbol for b 🌺 c failed'
        }
      ]);
    }).timeout(30000);
    it('should read an all kinds of data types', async () => {
      const instructions = [
        { name: 'GVL_Var.TestDint1' },
        { name: 'GVL_Var.TestReal1' },
        { name: 'GVL_Var.TestBool1' },
        { name: 'GVL_Var.TestString1' },
        { name: 'GVL_Var.TestInt1' },

        { name: 'POU_LD_1.POU_LD_1_TestBool1' },
        { name: 'POU_LD_1.POU_LD_1_TestBool2' },
        { name: 'POU_LD_1.POU_LD_1_TestInt' },
        { name: 'POU_LD_1.POU_LD_1_TestReal1' },
        { name: 'POU_LD_1.POU_LD_1_TestDint1' },

        { name: 'GVL_Var.TestStructure1' },
        { name: 'GVL_Var.TestEnumeration1' },
        { name: 'GVL_Var.TestArrayInt1' },
        { name: 'GVL_Var.TestArrayStruct1' },
        { name: 'GVL_Var.TestArrayStruct2' }
      ];
      const config = {
        localAmsNetIdTemplate: '192.168.5.221.1.2',
        localAdsPortTemplate: 32750,
        targetAmsNetIdTemplate: '5.123.154.18.1.1',
        targetAdsPortTemplate: 851,
        routerHostTemplate: '127.0.0.1',
        routerTcpPortTemplate: 48898,
        timeoutTemplate: 30000,
        readInstructionsType: 'payloadPath',
        readInstructions: 'instructions',
        destinationPath: 'results'
      };
      const payload = { instructions };
      const outputIds = [['nid1']];
      const node = new BeckhoffReadNode('id', outputIds, config);
      const result = await node.run({ externalTimeout: 30000 }, payload);
      const testResults = {};
      Object.keys(result[1].results.GVL_Var).forEach((key) => {
        testResults[key] = { value: result[1].results.GVL_Var[key].value };
      });
      // these results may change as write node is developed.
      result[1].results.GVL_Var.TestDint1.should.deepEqual({
        value: 1,
        symbol: {
          name: 'GVL_Var.TestDint1',
          comment: '',
          type: 'DINT',
          size: 4,
          indexOffset: 384808,
          indexGroup: 16448
        }
      });
      testResults.should.deepEqual({
        TestDint1: { value: 414 },
        TestReal1: { value: 2 },
        TestBool1: { value: false },
        TestString1: { value: 'Hello Losant' },
        TestInt1: { value: 3 },
        TestStructure1: {
          value: {
            TestInt: 22,
            TestReal: 19.123456954956055,
            TestString: 'Test String to Losant Platform'
          }
        },
        TestEnumeration1: { value: { name: 'Blue', value: 2 } },
        TestArrayInt1: { value: [ 1, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10 ] },
        TestArrayStruct1: {
          value: [
            { TestInt: 0, TestReal: 0, TestString: '' },
            { TestInt: 0, TestReal: 0, TestString: '' },
            { TestInt: 0, TestReal: 0, TestString: '' },
            { TestInt: 0, TestReal: 0, TestString: '' },
            { TestInt: 0, TestReal: 0, TestString: '' },
            { TestInt: 0, TestReal: 0, TestString: '' },
            { TestInt: 0, TestReal: 0, TestString: '' },
            { TestInt: 0, TestReal: 0, TestString: '' },
            { TestInt: 0, TestReal: 0, TestString: '' },
            { TestInt: 0, TestReal: 0, TestString: '' },
            { TestInt: 0, TestReal: 0, TestString: '' }
          ]
        },
        TestArrayStruct2: {
          value: [
            [
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' }
            ],
            [
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' }
            ],
            [
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' }
            ],
            [
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' }
            ],
            [
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' }
            ],
            [
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' }
            ],
            [
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' }
            ],
            [
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' }
            ],
            [
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' }
            ],
            [
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' }
            ],
            [
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' },
              { TestInt: 0, TestReal: 0, TestString: '' }
            ]
          ]
        }
      });
      const otherResults = {};
      Object.keys(result[1].results.POU_LD_1).forEach((key) => {
        otherResults[key] = { value: result[1].results.POU_LD_1[key].value };
      });
      otherResults.should.deepEqual({
        POU_LD_1_TestBool1: { value: false },
        POU_LD_1_TestBool2: { value: false },
        POU_LD_1_TestInt: { value: 17 },
        POU_LD_1_TestReal1: { value: 3 },
        POU_LD_1_TestDint1: { value: 9 }
      });
    }).timeout(60000);
  });
});
