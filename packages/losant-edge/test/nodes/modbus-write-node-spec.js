import { socat } from '../common.js';
import ModbusWriteNode from '../../src/nodes/modbus-write-node.js';
import errors from 'losant-nodejs-utils/src/errors.js';
import modbusTestFramework from '../lib/modbus-test-framework.js';

let currentRegisters = {};
let currentCoils = {};
const vector = {
  setRegister: function(addr, value) {
    currentRegisters[addr] = value;
  },
  setCoil: function(addr, value) {
    currentCoils[addr] = value;
  }
};

const commonAbstractTests = (serverWrapper) => {
  ([
    {
      type: 'register',
      instr: { addressTemplate: '{{data.address}}', typeTemplate: 'holding-register', valueTemplate: 1 },
      response: { 'addr-5': true },
      check: () => { return currentRegisters[5] === 1; }
    },
    {
      type: 'coil',
      instr: { addressTemplate: '1', typeTemplate: 'coil', valueTemplate: '{{aVal}}' },
      response: { 'addr-1': true },
      check: () => { return currentCoils[1]; }
    },
    {
      type: 'register',
      instr: { addressTemplate: '1', typeTemplate: 'holding-register', valueTemplate: '{{aVal}}' },
      response: { 'addr-1': true },
      check: () => { return currentRegisters[1] === 0; },
      aValue: 0
    },
    {
      type: 'registers',
      instr: { addressTemplate: '1', typeTemplate: 'holding-registers', valueTemplate: 'aVal' },
      response: { 'addr-1': true },
      check: () => { return currentRegisters[1] === 1 && currentRegisters[2] === 0; },
      aValue: [ '1', '0' ]
    },
    {
      type: 'register',
      instr: { addressTemplate: '1', typeTemplate: 'holding-register', valueTemplate: '{{aVal}}' },
      response: { 'addr-1': true },
      check: () => { return currentRegisters[1] === 65535; },
      aValue: 65535
    }
  ]).forEach(({ type, instr, response, check, aValue }) => {
    it(`should write to ${type}${aValue !== undefined ? `-${aValue}` : ''}`, async () => {
      const config = {
        ...serverWrapper.basicNodeConfig,
        writeInstructions: [ instr ],
        destinationPath: 'destination'
      };
      const payload = {
        aVal: aValue !== undefined ? aValue : 1,
        data: {
          ...serverWrapper.basicNodeData,
          address: 5
        }
      };
      const outputIds = [['nid1']];
      const node = new ModbusWriteNode('id', outputIds, config);
      const output = await node.run({}, payload);
      output[1].destination.should.deepEqual(response);
      check().should.be.true();
    });
  });

  it('should use the given keys on writes', async () => {
    const config = {
      ...serverWrapper.basicNodeConfig,
      writeInstructions: [ { addressTemplate: '1', typeTemplate: 'holding-register', valueTemplate: '{{aVal}}', key: 'firstWrite' } ],
      destinationPath: 'destination'
    };
    const payload = {
      aVal: 10,
      data: {
        ...serverWrapper.basicNodeData,
        address: 5
      }
    };
    const outputIds = [['nid1']];
    const node = new ModbusWriteNode('id', outputIds, config);
    const output = await node.run({}, payload);
    output[1].destination.firstWrite.should.be.true();
  });

  it('should write to a register using payload path', async () => {
    const config = {
      ...serverWrapper.basicNodeConfig,
      typeTemplate: '{{type}}',
      writeInstructionsType: 'payloadPath',
      writeInstructions: 'myInstructions',
      destinationPath: 'destination'
    };
    const payload = {
      myInstructions: [
        { address: '1', type: 'holding-register', value: 1, key: 'firstWrite' },
        { address: '5', type: 'holding-register', value: 1 }
      ],
      data: {
        ...serverWrapper.basicNodeData,
        address: 5
      }
    };
    const outputIds = [['nid1']];
    const node = new ModbusWriteNode('id', outputIds, config);
    const output = await node.run({}, payload);
    output[1].destination.should.deepEqual({ 'firstWrite': true, 'addr-5': true });
    (currentRegisters[5] === 1).should.equal(true);
    (currentRegisters[1] === 1).should.equal(true);
  });

  it('should throw an error if the payload writes is not an array', async function() {
    const config = {
      ...serverWrapper.basicNodeConfig,
      endiannessTemplate: 'big',
      areUnsignedInts: true,
      readInstructionsType: 'payloadPath',
      readInstructions: 'myInstructions',
      destinationPath: 'destination'
    };
    const payload = {
      myInstructions: {},
      data: {
        ...serverWrapper.basicNodeData
      }
    };
    const outputIds = [['nid1']];
    const node = new ModbusWriteNode('id', outputIds, config);
    await node.run({}, payload).should.be.rejectedWith(errors.Validation({
      message: 'Write instructions must be an array.'
    }));
  });

  it('error if you try to write a huge number to a coil', async () => {
    const config = {
      ...serverWrapper.basicNodeConfig,
      writeInstructions: [
        { typeTemplate: 'coil', addressTemplate: '{{data.address}}', valueTemplate: 100000000000000000 }
      ],
      destinationPath: 'destination'
    };
    const payload = {
      data: {
        ...serverWrapper.basicNodeData,
        address: 3
      }
    };
    const outputIds = [['nid1']];
    const node = new ModbusWriteNode('id', outputIds, config);
    return node.run({}, payload).should.be.rejectedWith(errors.Validation({ message: 'coil can only hold a single bit.' }));
  });

  it('should error if you try to write a huge number to the holding registers', async () => {
    const config = {
      ...serverWrapper.basicNodeConfig,
      writeInstructions: [
        { typeTemplate: 'holding-register', addressTemplate: '{{data.address}}', valueTemplate: 100000000000000000 }
      ],
      destinationPath: 'destination'
    };
    const payload = {
      data: {
        ...serverWrapper.basicNodeData,
        address: 3
      }
    };
    const outputIds = [['nid1']];
    const node = new ModbusWriteNode('id', outputIds, config);
    return node.run({}, payload).should.be.rejectedWith(errors.Validation({ message: 'holding registers can only hold up to 16 bits of unsigned integers.' }));
  });

  it('should error if you try to write a negative number', async () => {
    const config = {
      ...serverWrapper.basicNodeConfig,
      writeInstructions: [
        { typeTemplate: 'holding-register', addressTemplate: '{{data.address}}', valueTemplate: -20000 }
      ],
      destinationPath: 'destination'
    };
    const payload = {
      data: {
        ...serverWrapper.basicNodeData,
        address: 3
      }
    };
    const outputIds = [['nid1']];
    const node = new ModbusWriteNode('id', outputIds, config);
    return node.run({}, payload).should.be.rejectedWith(errors.Validation({ message: 'holding registers can only hold up to 16 bits of unsigned integers.' }));
  });

  it('should throw an error if unit id is not an number', async () => {
    const node = new ModbusWriteNode('id', [['nid1']], {
      ...serverWrapper.basicNodeConfig,
      writeInstructions: [
        { typeTemplate: 'holding-register', addressTemplate: 5, valueTemplate: 1 }
      ],
      unitIdTemplate: '{{ id }}'
    });
    await node.run({}, {
      data: { ...serverWrapper.basicNodeData },
      id: 'apples'
    }).should.be.rejectedWith({
      message: 'Unit ID must be a number.'
    });
  });

  it('should throw an error if type is bad', async () => {
    const config = {
      ...serverWrapper.basicNodeConfig,
      writeInstructions: [
        { typeTemplate: 'want-it', addressTemplate: 5, valueTemplate: 1 }
      ],
      destinationPath: 'destination'
    };
    const payload = {
      data: {
        ...serverWrapper.basicNodeData,
        address: 3,
        num: 5
      }
    };
    const outputIds = [['nid1']];
    const node = new ModbusWriteNode('id', outputIds, config);
    return node.run({}, payload).should.be.rejectedWith(errors.Validation({ message: 'Write type must be one of the following coil, holding-register, holding-registers, not want-it.' }));
  });
};

const tcpOnlyTests = () => {
  it('should set a list of errors', async () => {
    const config = {
      hostTemplate: '{{data.host}}',
      unitIdTemplate: 1,
      writeInstructions: [
        { typeTemplate: 'coil', addressTemplate: '{{data.address}}', valueTemplate: 1 },
        { typeTemplate: 'holding-register', addressTemplate: 5, valueTemplate: 1 }
      ],
      destinationPath: 'destination'
    };
    const payload = {
      data: {
        host: 'localhost',
        address: 3
      }
    };
    const outputIds = [['nid1']];
    const node = new ModbusWriteNode('id', outputIds, config);
    node.portTemplate.should.equal(502);
    const result = await node.run({}, payload);
    result[1].should.deepEqual({
      data: payload.data,
      destination: {
        errors: [{
          message: 'connect ECONNREFUSED 127.0.0.1:502',
          type: 'MODBUS_WRITE_ERROR'
        }]
      }
    });
  });

  it('should throw an error if address is bad', async () => {
    const config = {
      hostTemplate: '{{data.host}}',
      portTemplate: '{{data.port}}',
      unitIdTemplate: 1,
      writeInstructions: [
        { typeTemplate: 'coil', addressTemplate: 'abcdefghijkl', valueTemplate: '{{data.num}}' }
      ],
      destinationPath: 'destination'
    };
    const payload = {
      data: {
        host: 'localhost',
        port: '8888',
        address: 3,
        num: 5
      }
    };
    const outputIds = [['nid1']];
    const node = new ModbusWriteNode('id', outputIds, config);
    return node.run({}, payload).should.be.rejectedWith(errors.Validation({ message: 'Address must be a number.' }));
  });
};

const serialOnlyTests = (serverWrapper) => {
  it('should return an error if server is not running', async () => {
    await serverWrapper.close();
    const node = new ModbusWriteNode('id', [['nid1']], {
      ...serverWrapper.basicNodeConfig,
      writeInstructions: [
        { typeTemplate: 'holding-register', addressTemplate: 5, valueTemplate: 1 }
      ],
      destinationPath: 'destination'
    });
    const result = await node.run({ externalTimeout: 1000 }, { data: { ...serverWrapper.basicNodeData } });
    result[1].destination.should.deepEqual({
      errors: [ {
        message: 'Timed out',
        type: 'MODBUS_WRITE_ERROR'
      }]
    });
  });

  it('should return an error if path does not exist', async () => {
    const node = new ModbusWriteNode('id', [['nid1']], {
      writeInstructions: [
        { typeTemplate: 'holding-register', addressTemplate: 5, valueTemplate: 1 }
      ],
      pathTemplate: '/tmp{{ path }}',
      connectionTypeTemplate: 'serial',
      destinationPath: 'destination'
    });
    const result = await node.run({}, { path: socat.serialPathSideB });
    result[1].destination.should.deepEqual({
      errors: [ {
        message: `Error: No such file or directory, cannot open /tmp${socat.serialPathSideB}`,
        type: 'MODBUS_WRITE_ERROR'
      }]
    });
  });

  it('should throw an error if path is protected', async () => {
    const node = new ModbusWriteNode('id', [['nid1']], {
      writeInstructions: [
        { typeTemplate: 'holding-register', addressTemplate: 5, valueTemplate: 1 }
      ],
      pathTemplate: '.{{ path }}',
      connectionTypeTemplate: 'serial',
      destinationPath: 'destination'
    });
    await node.run({}, { path: socat.serialPathSideB }).should.be.rejectedWith({
      message: 'Cannot access within the protected Losant Edge Agent directory.'
    });
  });

  it('should throw an error if path is not defined', async () => {
    const node = new ModbusWriteNode('id', [['nid1']], {
      writeInstructions: [
        { typeTemplate: 'holding-register', addressTemplate: 5, valueTemplate: 1 }
      ],
      pathTemplate: '{{ not.a.path }}',
      connectionTypeTemplate: 'serial'
    });
    await node.run({}, { id: 'apples' }).should.be.rejectedWith({
      message: 'Path Template is required for modbus serial connection.'
    });
  });

  it('should throw an error if baud rate is not defined', async () => {
    const node = new ModbusWriteNode('id', [['nid1']], {
      writeInstructions: [
        { typeTemplate: 'holding-register', addressTemplate: 5, valueTemplate: 1 }
      ],
      pathTemplate: '/dev/Path',
      baudRateTemplate: '{{ baudRate }}',
      connectionTypeTemplate: 'serial'
    });
    await node.run({}, { id: 'apples' }).should.be.rejectedWith({
      message: 'Baud Rate is required.'
    });
  });

  it('should throw an error if baud rate is not valid', async () => {
    const node = new ModbusWriteNode('id', [['nid1']], {
      writeInstructions: [
        { typeTemplate: 'holding-register', addressTemplate: 5, valueTemplate: 1 }
      ],
      pathTemplate: '/dev/Path',
      baudRateTemplate: '{{ baudRate }}',
      connectionTypeTemplate: 'serial'
    });
    await node.run({}, { id: 'apples', baudRate: -256001 }).should.be.rejectedWith({
      message: 'Baud Rate -256001 is not valid, must be a positive integer.'
    });
  });

  it('should throw an error if parity is not valid', async () => {
    const node = new ModbusWriteNode('id', [['nid1']], {
      writeInstructions: [
        { typeTemplate: 'holding-register', addressTemplate: 5, valueTemplate: 1 }
      ],
      pathTemplate: '/dev/Path',
      connectionTypeTemplate: 'serial',
      parityTemplate: '{{ parity }}'
    });
    await node.run({}, { id: 'apples', parity: 'notAParty' }).should.be.rejectedWith({
      message: 'Parity Template notAParty is not valid, valid parity values include none, even, mark, odd, space.'
    });
  });

  it('should throw an error if dataBits is not valid', async () => {
    const node = new ModbusWriteNode('id', [['nid1']], {
      writeInstructions: [
        { typeTemplate: 'holding-register', addressTemplate: 5, valueTemplate: 1 }
      ],
      pathTemplate: '/dev/Path',
      connectionTypeTemplate: 'serial',
      dataBitsTemplate: '{{ bits }}'
    });
    await node.run({}, { id: 'apples', bits: '4' }).should.be.rejectedWith({
      message: 'Data Bits Template 4 is not valid, valid data bits include 5, 6, 7, 8.'
    });
  });

  it('should throw an error if stopBits is not valid', async () => {
    const node = new ModbusWriteNode('id', [['nid1']], {
      writeInstructions: [
        { typeTemplate: 'holding-register', addressTemplate: 5, valueTemplate: 1 }
      ],
      pathTemplate: '/dev/Path',
      connectionTypeTemplate: 'serial',
      stopBitsTemplate: '{{ bits }}'
    });
    await node.run({}, { id: 'apples', bits: '4' }).should.be.rejectedWith({
      message: 'Stop Bits Template 4 is not valid, valid stop bits include 1, 2.'
    });
  });

};

describe('Modbus Write Node', () => {
  beforeEach(async () => {
    currentCoils = {};
    currentRegisters = {};
  });

  modbusTestFramework({
    vector,
    sharedTestGenerator: commonAbstractTests,
    tcpOnlyTestGenerator: tcpOnlyTests,
    serialOnlyTestGenerator: serialOnlyTests
  });

  it('should throw an error if write instructions are not an array', async () => {
    const node = new ModbusWriteNode('id', [['nid1']], { writeInstructions: {} });
    return node.run({}, {}).should.be.rejectedWith(errors.Validation({ message: 'Write instructions must be an array.' }));
  });
  it('should throw an error if write instructions are not objects of arrays', async () => {
    const node = new ModbusWriteNode('id', [['nid1']], { writeInstructions: [ null ] });
    return node.run({}, {}).should.be.rejectedWith(errors.Validation({ message: 'Each write instruction must be an object.' }));
  });
  it('should throw an error if write instructions are not objects of arrays with payload path', async () => {
    const node = new ModbusWriteNode('id', [['nid1']], { writeInstructions: 'instructs', writeInstructionsType: 'payloadPath' });
    return node.run({}, { instructs: [ null ] }).should.be.rejectedWith(errors.Validation({ message: 'Each write instruction must be an object.' }));
  });
  it('should throw an error if write instructions are empty', async () => {
    const node = new ModbusWriteNode('id', [['nid1']], { writeInstructions: [] });
    return node.run({}, {}).should.be.rejectedWith(errors.Validation({ message: 'Write instructions are required for Modbus write' }));
  });
  it('should throw an error if write instruction function type is missing', async () => {
    const node = new ModbusWriteNode('id', [['nid1']], { writeInstructions: [ {} ] });
    return node.run({}, {}).should.be.rejectedWith(errors.Validation({ message: 'Type Template is required for write instructions.' }));
  });
  it('should throw an error if address is out of bounds', async () => {
    const node = new ModbusWriteNode('id', [['nid1']], { writeInstructions: [ { addressTemplate: 65536, typeTemplate: 'coil', valueTemplate: '12' } ] });
    return node.run({}, {}).should.be.rejectedWith(errors.Validation({ message: 'Address must be greater than -1 and less than 65536.' }));
  });
  it('should throw an error if the start of frame character renders to more than one byte', async () => {
    const node = new ModbusWriteNode('id', [['nid1']], {
      writeInstructions: [ { typeTemplate: 'holding-register', addressTemplate: 5, valueTemplate: 1 } ],
      pathTemplate: '/dev/Path',
      connectionTypeTemplate: 'asciiSerial',
      startOfFrameCharTemplate: '{{ char }}'
    });
    return node.run({}, { char: '::' }).should.be.rejectedWith({
      message: 'startOfFrameCharTemplate is not valid, should be a single ASCII character.'
    });
  });
  it('should throw an error if the timeout template is greater than the externalTimeout', async () => {
    const node = new ModbusWriteNode('id', [['nid1']], { timeoutTemplate: 31000, hostTemplate: '192.168.1.117', writeInstructions: [ { addressTemplate: '1', typeTemplate: 'holding-register', valueTemplate: 2 } ] });
    return node.run({ externalTimeout: 30000 }, {}).should.be.rejectedWith({ message: 'timeoutTemplate cannot be greater than 30 seconds.' });
  });
});
