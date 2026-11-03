import { socat } from '../common.js';
import ModbusReadNode from '../../src/nodes/modbus-read-node.js';
import errors from 'losant-nodejs-utils/src/errors.js';
import modbusTestFramework from '../lib/modbus-test-framework.js';

const vector = {
  getInputRegister: function() { return 1; },
  getHoldingRegister: function(addr) {
    if (addr === 10) {
      return new Promise(function(resolve) {
        setTimeout(function() {
          resolve(addr % 2);
        }, 150);
      });
    }
    if (addr === 5) { return 65535; }
    if (addr === 6) { return 0; }
    if (addr === 7) { throw new Error('BLAH !!!'); }
    return addr + 8000;
  },
  getCoil: function(addr) { return ((addr % 2) === 0 ? 1 : 0); },
  readDeviceIdentification: function() {
    return {
      0x00: 'MyVendorName',
      0x01: 'MyProductCode',
      0x02: 'MyMajorMinorRevision',
      0x05: 'MyModelName',
      0x97: 'MyExtendedObject1',
      0xAB: 'MyExtendedObject2'
    };
  }
};

const commonAbstractTests = (serverWrapper) => {
  it('should correctly return results and timeout properly', async function() {
    const config = {
      ...serverWrapper.basicNodeConfig,
      unitIdTemplate: 0,
      endiannessTemplate: 'big',
      areUnsignedInts: true,
      readInstructions: [
        { addressTemplate: '{{data.address}}', typeTemplate: 'holding-register', key: 'aKey', lengthTemplate: 2 },
        { addressTemplate: '10', typeTemplate: 'holding-register', key: 'bKey', lengthTemplate: 2 },
        { addressTemplate: '5', typeTemplate: 'holding-register', key: 'cKey', lengthTemplate: 2 }
      ],
      destinationPath: 'destination',
      timeoutTemplate: 100
    };
    const payload = {
      data: {
        ...serverWrapper.basicNodeData,
        address: 5
      }
    };
    const outputIds = [['nid1']];
    const node = new ModbusReadNode('id', outputIds, config);
    const output = await node.run({}, payload);

    output.should.deepEqual([
      outputIds,
      {
        data: payload.data,
        destination: {
          aKey: [ 65535, 0 ],
          errors: [
            {
              message: 'Timed out',
              type: 'MODBUS_READ_ERROR'
            },
            {
              message: 'Timed out',
              type: 'MODBUS_READ_ERROR'
            }
          ]
        }
      }
    ]);
  });

  it('should read device identification', async () => {
    const config = {
      ...serverWrapper.basicNodeConfig,
      endiannessTemplate: 'big',
      readInstructions: [ { deviceIdCodeTemplate: '{{deviceIdCode}}', objectIdTemplate: '{{objectId}}', typeTemplate: 'read-device-identification', key: 'aKey' } ],
      destinationPath: 'destination'
    };
    const payload = {
      deviceIdCode: 4,
      objectId: 0,
      data: {
        ...serverWrapper.basicNodeData,
        address: 0
      }
    };
    const outputIds = [['nid1']];
    const node = new ModbusReadNode('id', outputIds, config);
    const output = await node.run({ externalTimeout: 10000 }, payload);
    output.should.deepEqual([
      outputIds,
      {
        deviceIdCode: 4,
        objectId: 0,
        data: payload.data,
        destination: {
          aKey: { data: { 0: 'MyVendorName' }, conformityLevel: 129 }
        }
      }
    ]);
  });

  it('should correctly read modbus holding registers', async () => {
    const config = {
      ...serverWrapper.basicNodeConfig,
      endiannessTemplate: 'big',
      readInstructions: [ { addressTemplate: '{{data.address}}', typeTemplate: 'holding-register', key: 'aKey', lengthTemplate: 2 } ],
      destinationPath: 'destination'
    };
    const payload = {
      data: {
        ...serverWrapper.basicNodeData,
        address: 5
      }
    };
    const outputIds = [['nid1']];
    const node = new ModbusReadNode('id', outputIds, config);
    const output = await node.run({}, payload);
    output.should.deepEqual([
      outputIds,
      {
        data: payload.data,
        destination: {
          aKey: [ -1, 0 ]
        }
      }
    ]);
  });

  it('should correctly read modbus holding registers for unsigned ints', async () => {
    const config = {
      ...serverWrapper.basicNodeConfig,
      endiannessTemplate: 'big',
      areUnsignedInts: true,
      readInstructions: [
        { addressTemplate: '{{data.address}}', typeTemplate: 'holding-register', key: 'aKey', lengthTemplate: 2 },
        { addressTemplate: 7, typeTemplate: 'holding-register', key: 'bKey', lengthTemplate: 1 }
      ],
      destinationPath: 'destination'
    };
    const payload = {
      data: {
        ...serverWrapper.basicNodeData,
        address: 5
      }
    };
    const outputIds = [['nid1']];
    const node = new ModbusReadNode('id', outputIds, config);
    const output = await node.run({}, payload);
    output.should.deepEqual([
      outputIds,
      {
        data: payload.data,
        destination: {
          aKey: [ 65535, 0 ],
          errors: [
            {
              message: 'Modbus exception 4: Slave device failure (device reports internal error)',
              type: 'MODBUS_READ_ERROR'
            }
          ]
        }
      }
    ]);
  });

  it('should correctly read modbus holding registers for unsigned ints with a payload path', async () => {
    const config = {
      ...serverWrapper.basicNodeConfig,
      endiannessTemplate: 'big',
      areUnsignedInts: true,
      readInstructionsType: 'payloadPath',
      readInstructions: 'myInstructions',
      destinationPath: 'destination'
    };
    const payload = {
      myInstructions: [
        { address: '5', type: 'holding-register', key: 'aKey', length: 2 },
        { address: 7, type: 'holding-register', key: 'bKey', length: 1 }
      ],
      data: {
        ...serverWrapper.basicNodeData
      }
    };
    const outputIds = [['nid1']];
    const node = new ModbusReadNode('id', outputIds, config);
    const output = await node.run({}, payload);
    output.should.deepEqual([
      outputIds,
      {
        myInstructions: [
          { address: '5', type: 'holding-register', key: 'aKey', length: 2 },
          { address: 7, type: 'holding-register', key: 'bKey', length: 1 }
        ],
        data: payload.data,
        destination: {
          aKey: [ 65535, 0 ],
          errors: [
            {
              message: 'Modbus exception 4: Slave device failure (device reports internal error)',
              type: 'MODBUS_READ_ERROR'
            }
          ]
        }
      }
    ]);
  });

  it('should throw an error if the payload read instructions is not an array', async () => {
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
    const node = new ModbusReadNode('id', outputIds, config);
    await node.run({}, payload).should.be.rejectedWith(errors.Validation({
      message: 'Read instructions must be an array.'
    }));
  });

  it('should correctly read coils', async () => {
    const config = {
      ...serverWrapper.basicNodeConfig,
      readInstructions: [ { addressTemplate: '{{data.address}}', typeTemplate: 'coil', key: 'aKey', lengthTemplate: 2 } ],
      destinationPath: 'destination'
    };
    const payload = {
      data: {
        ...serverWrapper.basicNodeData,
        address: 1
      }
    };
    const outputIds = [['nid1']];
    const node = new ModbusReadNode('id', outputIds, config);
    const output = await node.run({}, payload);
    output.should.deepEqual([
      outputIds,
      {
        data: payload.data,
        destination: {
          aKey: [ 0, 1 ]
        }
      }
    ]);
  });

  it('should correctly read discrete input', async () => {
    const config = {
      ...serverWrapper.basicNodeConfig,
      endianness: '{{data.endianness}}',
      readInstructions: [
        { typeTemplate: 'input-register', addressTemplate: '{{data.address}}', key: 'data.discrete', lengthTemplate: 3 }
      ],
      destinationPath: 'destination'
    };
    const payload = {
      data: {
        ...serverWrapper.basicNodeData,
        endianness: 'little',
        address: 10,
        num: 5
      }
    };
    const outputIds = [['nid1']];
    const node = new ModbusReadNode('id', outputIds, config);
    const output = await node.run({}, payload);
    output.should.deepEqual([
      outputIds,
      {
        data: payload.data,
        destination: {
          data: {
            discrete: [ 1, 1, 1 ]
          }
        }
      }
    ]);
  });

  it('should share connections', async () => {
    const config = {
      ...serverWrapper.basicNodeConfig,
      endianness: '{{data.endianness}}',
      readInstructions: [
        { typeTemplate: 'input-register', addressTemplate: '{{data.address}}', key: 'data.discrete', lengthTemplate: 3 }
      ],
      destinationPath: 'destination'
    };
    const config2 = {
      ...serverWrapper.basicNodeConfig,
      endianness: '{{data.endianness}}',
      readInstructions: [
        { addressTemplate: 10, typeTemplate: 'coil', key: 'aKey', lengthTemplate: 2 },
        { typeTemplate: 'input-register', addressTemplate: '{{data.address}}', key: 'data.discrete', lengthTemplate: 3 }
      ],
      destinationPath: 'destination'
    };
    const payload = {
      data: {
        ...serverWrapper.basicNodeData,
        endianness: 'little',
        address: 10,
        num: 5
      }
    };
    const outputIds = [['nid1']];
    const node = new ModbusReadNode('id', outputIds, config);
    const node2 = new ModbusReadNode('id2', outputIds, config2);
    const [ output, output2 ] = await Promise.all([
      node.run({ externalTimeout: 250 }, payload),
      node2.run({ externalTimeout: 250 }, payload)
    ]);
    output.should.deepEqual([
      outputIds,
      {
        data: payload.data,
        destination: {
          data: {
            discrete: [ 1, 1, 1 ]
          }
        }
      }
    ]);
    output2.should.deepEqual([
      outputIds,
      {
        data: payload.data,
        destination: {
          aKey: [ 1, 0 ],
          data: {
            discrete: [ 1, 1, 1 ]
          }
        }
      }
    ]);
  });

  it('should default length template to 1 if not defined', async () => {
    const config = {
      ...serverWrapper.basicNodeConfig,
      endiannessTemplate: 'big',
      readInstructions: [ { addressTemplate: '{{data.address}}', typeTemplate: 'holding-register', key: 'aKey', lengthTemplate: '' } ],
      destinationPath: 'destination'
    };
    const payload = {
      data: {
        ...serverWrapper.basicNodeData,
        address: 2
      }
    };
    const outputIds = [['nid1']];
    const node = new ModbusReadNode('id', outputIds, config);
    const output = await node.run({}, payload);
    output.should.deepEqual([
      outputIds,
      {
        data: payload.data,
        destination: {
          aKey: [ 8002 ]
        }
      }
    ]);
  });

  it('should throw an error if unit id is not an number', async () => {
    const node = new ModbusReadNode('id', [['nid1']], {
      ...serverWrapper.basicNodeConfig,
      readInstructions: [
        { typeTemplate: 'holding-register', addressTemplate: 5, key: 'data.input' }
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
      endianness: '{{data.endianness}}',
      readInstructions: [
        { typeTemplate: 'want-it', addressTemplate: 5, key: 'data.input' }
      ],
      destinationPath: 'destination'
    };
    const payload = {
      data: {
        ...serverWrapper.basicNodeData,
        endianness: 'little',
        address: 3,
        num: 5
      }
    };
    const outputIds = [['nid1']];
    const node = new ModbusReadNode('id', outputIds, config);
    return node.run({}, payload).should.be.rejectedWith(errors.Validation({ message: 'Read type must be one of the following coil, discrete-input, holding-register, input-register, read-device-identification, not want-it.' }));
  });
};

const tcpOnlyTests = () => {
  it('should timeout correctly', async () => {
    const config = {
      hostTemplate: 'www.google.com',
      unitIdTemplate: 1,
      endiannessTemplate: 'big',
      readInstructions: [ { addressTemplate: '1', typeTemplate: 'holding-register', key: 'aKey', lengthTemplate: 2 } ],
      destinationPath: 'destination'
    };
    const payload = {};
    const outputIds = [['nid1']];
    const node = new ModbusReadNode('id', outputIds, config);
    node.portTemplate.should.equal(502);
    const output = await node.run({ externalTimeout: 500 }, payload);
    output[1].destination.errors[0].type.should.equal('MODBUS_READ_ERROR');
    const errMessage = output[1].destination.errors[0].message;
    (errMessage.startsWith('TCP Connection Timed Out') ||
      errMessage.startsWith('connect EHOSTUNREACH') ||
      errMessage.startsWith('connect EHOSTDOWN') ||
      errMessage.startsWith('ETIMEDOUT')
    ).should.be.true();
  });

  it('should properly error for an invalid host', async function() {
    const config = {
      hostTemplate: 'localhope',
      unitIdTemplate: 1,
      endiannessTemplate: 'big',
      readInstructions: [ { addressTemplate: '1', typeTemplate: 'holding-register', key: 'aKey', lengthTemplate: 2 } ],
      destinationPath: 'destination'
    };
    const node = new ModbusReadNode('id', [['nid1']], config);
    await node.run({ externalTimeout: 1000 }, {}).should.be.resolvedWith([
      [ [ 'nid1' ] ],
      {
        destination:  {
          errors: [ {
            type: 'MODBUS_READ_ERROR',
            message: 'Cannot resolve host: localhope'
          } ]
        }
      }
    ]);
  });

  it('should error if it cannot make a connection for each key', async () => {
    const config = {
      hostTemplate: '{{data.host}}',
      portTemplate: '{{data.port}}',
      unitIdTemplate: 1,
      endianness: '{{data.endianness}}',
      readInstructions: [
        { typeTemplate: 'discrete-input', addressTemplate: '{{data.address}}', key: 'data.discrete' },
        { typeTemplate: 'input-register', addressTemplate: 5, key: 'data.input' }
      ],
      destinationPath: 'destination'
    };
    const payload = {
      data: {
        endianness: 'little',
        host: 'localhost',
        port: '6969',
        address: 3,
        num: 5
      }
    };
    const outputIds = [['nid1']];
    const node = new ModbusReadNode('id', outputIds, config);
    const result = await node.run({}, payload);
    result[1].should.deepEqual({
      data: payload.data,
      destination: {
        errors: [{
          message: 'connect ECONNREFUSED 127.0.0.1:6969',
          type: 'MODBUS_READ_ERROR'
        }]
      }
    });
  });

  it('should throw an error if address is bad', async () => {
    const config = {
      hostTemplate: '{{data.host}}',
      portTemplate: '{{data.port}}',
      unitIdTemplate: 1,
      endianness: '{{data.endianness}}',
      readInstructions: [
        { typeTemplate: 'discrete-input', addressTemplate: 'abcdefghijkl', key: 'data.discrete' }
      ],
      destinationPath: 'destination'
    };
    const payload = {
      data: {
        endianness: 'little',
        host: 'localhost',
        port: '8888',
        address: 3,
        num: 5
      }
    };
    const outputIds = [['nid1']];
    const node = new ModbusReadNode('id', outputIds, config);
    return node.run({}, payload).should.be.rejectedWith(errors.Validation({ message: 'Address must be a number.' }));
  });
};

const serialOnlyTests = (serverWrapper) => {
  it('should return an error if server is not running', async () => {
    await serverWrapper.close();
    const node = new ModbusReadNode('id', [['nid1']], {
      ...serverWrapper.basicNodeConfig,
      readInstructions: [
        { typeTemplate: 'holding-register', addressTemplate: 5, key: 'data.input' }
      ],
      destinationPath: 'destination'
    });
    const result = await node.run({ externalTimeout: 1000 }, { data: { ...serverWrapper.basicNodeData } });
    result[1].destination.should.deepEqual({
      errors: [ {
        message: 'Timed out',
        type: 'MODBUS_READ_ERROR'
      }]
    });
  });

  it('should return an error if path does not exist', async () => {
    const node = new ModbusReadNode('id', [['nid1']], {
      readInstructions: [
        { typeTemplate: 'holding-register', addressTemplate: 5, key: 'data.input' }
      ],
      pathTemplate: '/tmp{{ path }}',
      connectionTypeTemplate: 'serial',
      destinationPath: 'destination'
    });
    const result = await node.run({}, { path: socat.serialPathSideB });
    result[1].destination.should.deepEqual({
      errors: [ {
        message: `Error: No such file or directory, cannot open /tmp${socat.serialPathSideB}`,
        type: 'MODBUS_READ_ERROR'
      }]
    });
  });

  it('should throw an error if path is protected', async () => {
    const node = new ModbusReadNode('id', [['nid1']], {
      readInstructions: [
        { typeTemplate: 'holding-register', addressTemplate: 5, key: 'data.input' }
      ],
      pathTemplate: '.{{ path }}',
      connectionTypeTemplate: 'serial',
      destinationPath: 'destination'
    });
    await node.run({}, { path: socat.serialPathSideB }).should.be.rejectedWith({
      message: 'Cannot access within the protected Losant Edge Agent directory.'
    });
  });

  it('should throw an error if parity is not valid', async () => {
    const node = new ModbusReadNode('id', [['nid1']], {
      readInstructions: [
        { typeTemplate: 'holding-register', addressTemplate: 5, key: 'data.input' }
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
    const node = new ModbusReadNode('id', [['nid1']], {
      readInstructions: [
        { typeTemplate: 'holding-register', addressTemplate: 5, key: 'data.input' }
      ],
      pathTemplate: '/dev/Path',
      connectionTypeTemplate: 'serial',
      dataBitsTemplate: '{{ bits }}'
    });
    await node.run({}, { id: 'apples', bits: '6.5' }).should.be.rejectedWith({
      message: 'Data Bits Template 6.5 is not valid, valid data bits include 5, 6, 7, 8.'
    });
  });

  it('should throw an error if stopBits is not valid', async () => {
    const node = new ModbusReadNode('id', [['nid1']], {
      readInstructions: [
        { typeTemplate: 'holding-register', addressTemplate: 5, key: 'data.input' }
      ],
      pathTemplate: '/dev/Path',
      connectionTypeTemplate: 'serial',
      stopBitsTemplate: '{{ bits }}'
    });
    await node.run({}, { id: 'apples', bits: '4' }).should.be.rejectedWith({
      message: 'Stop Bits Template 4 is not valid, valid stop bits include 1, 2.'
    });
  });

  it('should throw an error if path is not defined', async () => {
    const node = new ModbusReadNode('id', [['nid1']], {
      readInstructions: [
        { typeTemplate: 'holding-register', addressTemplate: 5, key: 'data.input' }
      ],
      pathTemplate: '{{ not.a.path }}',
      connectionTypeTemplate: 'serial'
    });
    await node.run({}, { id: 'apples' }).should.be.rejectedWith({
      message: 'Path Template is required for modbus serial connection.'
    });
  });

  it('should throw an error if baud rate is not defined', async () => {
    const node = new ModbusReadNode('id', [['nid1']], {
      readInstructions: [
        { typeTemplate: 'holding-register', addressTemplate: 5, key: 'data.input' }
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
    const node = new ModbusReadNode('id', [['nid1']], {
      readInstructions: [
        { typeTemplate: 'holding-register', addressTemplate: 5, key: 'data.input' }
      ],
      pathTemplate: '/dev/Path',
      baudRateTemplate: '{{ baudRate }}',
      connectionTypeTemplate: 'serial'
    });
    await node.run({}, { id: 'apples', baudRate: -256001 }).should.be.rejectedWith({
      message: 'Baud Rate -256001 is not valid, must be a positive integer.'
    });
  });
};

describe('Modbus Read Node', () => {
  modbusTestFramework({
    vector,
    sharedTestGenerator: commonAbstractTests,
    tcpOnlyTestGenerator: tcpOnlyTests,
    serialOnlyTestGenerator: serialOnlyTests
  });

  it('should throw an error if read instructions are not an array', async () => {
    const node = new ModbusReadNode('id', [['nid1']], { readInstructions: {} });
    return node.run({}, {}).should.be.rejectedWith(errors.Validation({ message: 'Read instructions must be an array.' }));
  });
  it('should throw an error if read instructions are empty', async () => {
    const node = new ModbusReadNode('id', [['nid1']], { readInstructions: [] });
    return node.run({}, {}).should.be.rejectedWith(errors.Validation({ message: 'Read instructions are required for Modbus read' }));
  });
  it('should throw an error if read instructions are not objects of arrays', async () => {
    const node = new ModbusReadNode('id', [['nid1']], { readInstructions: [ null ] });
    return node.run({}, {}).should.be.rejectedWith(errors.Validation({ message: 'Each read instruction must be an object.' }));
  });
  it('should throw an error if read instructions are not objects of arrays with payload paths', async () => {
    const node = new ModbusReadNode('id', [['nid1']], { readInstructions: 'instructs', readInstructionsType: 'payloadPath' });
    return node.run({}, { instructs: [ null ] }).should.be.rejectedWith(errors.Validation({ message: 'Each read instruction must be an object.' }));
  });
  it('should throw an error if read instruction object keys are missing', async () => {
    const node = new ModbusReadNode('id', [['nid1']], { readInstructions: [ {} ] });
    return node.run({}, {}).should.be.rejectedWith(errors.Validation({ message: 'Type Template is required for read instructions.' }));
  });
  it('should throw an error if address is out of bounds', async () => {
    const node = new ModbusReadNode('id', [['nid1']], { readInstructions: [ { addressTemplate: 65536, typeTemplate: 'coil', key: 'key' } ] });
    return node.run({}, {}).should.be.rejectedWith(errors.Validation({ message: 'Address must be greater than -1 and less than 65536.' }));
  });
  it('should throw an error if a key is trying to map into the errors path', async () => {
    const node = new ModbusReadNode('id', [['nid1']], { readInstructions: [ { addressTemplate: 2, typeTemplate: 'coil', key: 'errors.err' } ] });
    return node.run({}, {}).should.be.rejectedWith(errors.Validation({ message: 'Keys cannot contain the special path errors.' }));
  });
  it('should throw an error if the length will push the address out of bounds', async () => {
    const node = new ModbusReadNode('id', [['nid1']], { readInstructions: [ { addressTemplate: 65530, lengthTemplate: 10, typeTemplate: 'coil', key: 'errors.err' } ] });
    return node.run({}, {}).should.be.rejectedWith(errors.Validation({ message: 'Length will push address index out of bounds.' }));
  });
  it('should throw an error if the start of frame character renders to more than one byte', async () => {
    const node = new ModbusReadNode('id', [['nid1']], {
      readInstructions: [ { typeTemplate: 'holding-register', addressTemplate: 5, key: 'input' } ],
      pathTemplate: '/dev/Path',
      connectionTypeTemplate: 'asciiSerial',
      startOfFrameCharTemplate: '{{ char }}'
    });
    return node.run({}, { char: '::' }).should.be.rejectedWith({
      message: 'startOfFrameCharTemplate is not valid, should be a single ASCII character.'
    });
  });
  it('should throw an error if the timeout template is greater than the externalTimeout', async () => {
    const node = new ModbusReadNode('id', [['nid1']], { timeoutTemplate: 31000, hostTemplate: '192.168.1.117', readInstructions: [ { addressTemplate: '1', typeTemplate: 'holding-register', key: 'aKey', lengthTemplate: 2 } ] });
    return node.run({ externalTimeout: 30000 }, {}).should.be.rejectedWith({ message: 'timeoutTemplate cannot be greater than 30 seconds.' });
  });
});
