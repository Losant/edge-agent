import { s7Server } from  '../common.js';
import errors from 'losant-nodejs-utils/src/errors.js';
import S7ReadNode from '../../src/nodes/s7-read-node.js';
import { reset as resetConnections } from '../../src/lib/s7-connections.js';

export const S7_BASE_TESTING_DATA = [
  0, 0, 0, 17, 1, 0, 0, 198, 0, 0, 0, 175,
  0, 21, 66, 199, 189, 113, 0, 0, 47, 37, 2, 0,
  0, 0, 0, 20, 0, 28, 3, 0, 89, 108, 2, 0,
  171, 3, 64, 182, 102, 102, 65, 30, 102, 102, 64, 243,
  51, 51, 64, 70, 102, 102, 65, 1, 194, 143, 112, 0,
  109, 0, 0, 0, 7, 108, 2, 180, 187, 216
];

describe('S7ReadNode', () => {
  before(() => {
    s7Server.RegisterArea(s7Server.srvAreaDB, 1, Buffer.from(S7_BASE_TESTING_DATA, 'hex'));
  });
  after(() => {
    s7Server.UnregisterArea(s7Server.srvAreaDB, 1);
  });
  beforeEach(() => {
    resetConnections();
  });
  afterEach(async () => {
    await S7ReadNode.shutdown();
  });

  it('should throw an error if read instructions are empty', async () => {
    const node = new S7ReadNode('id', [], {});
    return node.run({}, {}).should.be.rejectedWith(errors.Validation({ message: 'readInstructions are required for S7 read.' }));
  });
  it('should throw an error if read instructions are empty array', async () => {
    const node = new S7ReadNode('id', [['nid1']], { readInstructionsType: 'payloadPath', readInstructions: 'instructs' });
    return node.run({}, { instructs: [] }).should.be.rejectedWith(errors.Validation({ message: 'readInstructions are required for S7 read.' }));
  });
  it('should throw an error if data type is empty', async () => {
    const node = new S7ReadNode('id', [['nid1']], {
      readInstructions: [
        {
          dbTemplate: 16,
          offsetTemplate: 0,
          dataTypeTemplate: '',
          key: 'doubleint'
        }
      ]
    });
    return node.run({}, {}).should.be.rejectedWith(errors.Validation({ message: 'Data Type is required.' }));
  });
  it('should throw an error if data type is not valid', async () => {
    const node = new S7ReadNode('id', [['nid1']], {
      readInstructions: [
        {
          dbTemplate: 16,
          offsetTemplate: 0,
          dataTypeTemplate: 'fakeType',
          key: 'doubleint'
        }
      ]
    });
    return node.run({}, {}).should.be.rejectedWith(errors.Validation({ message: 'fakeType is not a valid Data Type.' }));
  });
  it('should throw an error if database is not a valid integer', async () => {
    const node = new S7ReadNode('id', [['nid1']], {
      readInstructions: [
        {
          dbTemplate: 'abcd',
          offsetTemplate: 0,
          dataTypeTemplate: 'WORD',
          key: 'word'
        }
      ]
    });
    return node.run({}, {}).should.be.rejectedWith(errors.Validation({ message: 'Database must be an integer between 0 and 65535.' }));
  });
  it('should throw an error if database is not provided', async () => {
    const node = new S7ReadNode('id', [['nid1']], {
      readInstructions: [
        {
          offsetTemplate: 0,
          dataTypeTemplate: 'WORD',
          key: 'word'
        }
      ]
    });
    return node.run({}, {}).should.be.rejectedWith(errors.Validation({ message: 'Database is required.' }));
  });
  it('should throw an error if offset is not a valid integer', async () => {
    const node = new S7ReadNode('id', [['nid1']], {
      readInstructions: [
        {
          dbTemplate: 16,
          offsetTemplate: -1,
          dataTypeTemplate: 'INT',
          key: 'int'
        }
      ]
    });
    return node.run({}, {}).should.be.rejectedWith(errors.Validation({ message: 'Offset must be an integer between 0 and 2147483646.' }));
  });
  it('should throw an error if offset is not provided', async () => {
    const node = new S7ReadNode('id', [['nid1']], {
      readInstructions: [
        {
          dbTemplate: 16,
          dataTypeTemplate: 'INT',
          key: 'int'
        }
      ]
    });
    return node.run({}, {}).should.be.rejectedWith(errors.Validation({ message: 'Offset is required.' }));
  });
  it('should throw an error if array length is not a valid integer', async () => {
    const node = new S7ReadNode('id', [['nid1']], {
      readInstructions: [
        {
          arrayLengthTemplate: -1,
          dbTemplate: 16,
          offsetTemplate: 1,
          dataTypeTemplate: 'INT',
          key: 'int'
        }
      ]
    });
    return node.run({}, {}).should.be.rejectedWith(errors.Validation({ message: 'Array length must be an integer greater than 0.' }));
  });
  it('should throw an error if key is not provided', async () => {
    const node = new S7ReadNode('id', [['nid1']], {
      readInstructions: [
        {
          dbTemplate: 16,
          offsetTemplate: 1,
          dataTypeTemplate: 'INT'
        }
      ]
    });
    return node.run({}, {}).should.be.rejectedWith(errors.Validation({ message: 'Key is required for read.' }));
  });
  it('should throw an error if key is not a string', async () => {
    const node = new S7ReadNode('id', [['nid1']], {
      readInstructions: [
        {
          dbTemplate: 16,
          offsetTemplate: 1,
          dataTypeTemplate: 'INT',
          key: 10
        }
      ]
    });
    return node.run({}, {}).should.be.rejectedWith(errors.Validation({ message: 'Key must be a string.' }));
  });
  it('should throw an error if key is matches the errors special path', async () => {
    const node = new S7ReadNode('id', [['nid1']], {
      readInstructions: [
        {
          dbTemplate: 16,
          offsetTemplate: 1,
          dataTypeTemplate: 'INT',
          key: 'errors'
        }
      ]
    });
    return node.run({}, {}).should.be.rejectedWith(errors.Validation({ message: 'Keys cannot contain the special path errors.' }));
  });
  it('should throw an error if host is not provided', async () => {
    const node = new S7ReadNode('id', [['nid1']], {
      destinationPath: 'test',
      rackTemplate: 0,
      slotTemplate: 1,
      timeoutTemplate: 100,
      readInstructions: [
        {
          dbTemplate: 16,
          offsetTemplate: 1,
          dataTypeTemplate: 'INT',
          key: 'test'
        }
      ]
    });
    return node.run({}, {}).should.be.rejectedWith(errors.Validation({ message: 'Host is required.' }));
  });
  it('should throw an error if port is invalid', async () => {
    const node = new S7ReadNode('id', [['nid1']], {
      destinationPath: 'test',
      hostTemplate: 'localhost',
      portTemplate: '{{foo}}',
      rackTemplate: 0,
      slotTemplate: 1,
      timeoutTemplate: 100,
      readInstructions: [
        {
          dbTemplate: 16,
          offsetTemplate: 1,
          dataTypeTemplate: 'INT',
          key: 'test'
        }
      ]
    });
    return node.run({}, { foo: 'a' }).should.be.rejectedWith(errors.Validation({ message: 'S7 port number (a) is invalid.' }));
  });
  it('should throw an error if instructions are empty', async () => {
    const node = new S7ReadNode('id', [['nid1']], {
      destinationPath: 'test',
      hostTemplate: 'localhost',
      rackTemplate: 0,
      slotTemplate: 1,
      timeoutTemplate: 100,
      readInstructions: []
    });
    return node.run({}, {}).should.be.rejectedWith(errors.Validation({ message: 'readInstructions are required for S7 read.' }));
  });
  it('should return an error when unable to connect to the PLC', async () => {
    const node = new S7ReadNode('id', [], {
      destinationPath: 'test',
      hostTemplate: 'localhost',
      portTemplate: 4568,
      rackTemplate: 0,
      slotTemplate: 1,
      timeoutTemplate: 100,
      readInstructions: [
        {
          dbTemplate: 1,
          offsetTemplate: 0,
          dataTypeTemplate: 'DINT',
          key: 'doubleint'
        }
      ]
    });

    const output = await node.run({}, {});
    output[1].test.should.deepEqual({
      errors: [{
        message: 'Failed to connect.  TCP : Connection refused',
        type: 'S7_READ_ERROR'
      }]
    });
  });
  it('should properly read and format data', async () => {
    const node = new S7ReadNode('id', ['someoutputID'], {
      destinationPath: 'test',
      hostTemplate: 'localhost',
      portTemplate: 4567,
      rackTemplate: 0,
      slotTemplate: 1,
      timeoutTemplate: 5000,
      readInstructions: [
        {
          dbTemplate: 1,
          offsetTemplate: 0,
          arrayLengthTemplate: 1,
          dataTypeTemplate: 'DINT',
          key: 'doubleint'
        },
        {
          dbTemplate: 1,
          offsetTemplate: 4,
          dataTypeTemplate: 'BOOL',
          key: 'bool1'
        },
        {
          dbTemplate: 1,
          offsetTemplate: 6,
          dataTypeTemplate: 'WORD',
          key: 'word'
        },
        {
          dbTemplate: 1,
          offsetTemplate: 8,
          dataTypeTemplate: 'DWORD',
          key: 'doubleword'
        },
        {
          dbTemplate: 1,
          offsetTemplate: 12,
          dataTypeTemplate: 'INT',
          key: 'int'
        },
        {
          dbTemplate: 1,
          offsetTemplate: 14,
          dataTypeTemplate: 'REAL',
          key: 'real'
        },
        {
          dbTemplate: 1,
          offsetTemplate: 18,
          dataTypeTemplate: 'BOOL',
          key: 'bool2'
        },
        {
          dbTemplate: 1,
          offsetTemplate: 20,
          dataTypeTemplate: 'DATE',
          key: 'date'
        },
        {
          dbTemplate: 1,
          offsetTemplate: 22,
          dataTypeTemplate: 'BOOL',
          arrayLengthTemplate: 2,
          key: 'boolArray'
        },
        {
          dbTemplate: 1,
          offsetTemplate: 24,
          arrayLengthTemplate: 1,
          dataTypeTemplate: 'BYTE',
          key: 'byte'
        },
        {
          dbTemplate: 1,
          arrayLengthTemplate: 2,
          offsetTemplate: 26,
          dataTypeTemplate: 'INT',
          key: 'intarray'
        },
        {
          dbTemplate: 1,
          arrayLengthTemplate: 2,
          offsetTemplate: 30,
          dataTypeTemplate: 'BOOL',
          key: 'bool3Array'
        },
        {
          arrayLengthTemplate: 18,
          dbTemplate: 1,
          offsetTemplate: 32,
          dataTypeTemplate: 'BOOL',
          key: 'bigBoolArray'
        },
        {
          dbTemplate: 1,
          offsetTemplate: 36,
          dataTypeTemplate: 'BYTE',
          key: 'byte2'
        },
        {
          dbTemplate: 1,
          offsetTemplate: 37,
          dataTypeTemplate: 'BYTE',
          key: 'byte3'
        },
        {
          arrayLengthTemplate: 5,
          dbTemplate: 1,
          offsetTemplate: 38,
          dataTypeTemplate: 'REAL',
          key: 'arrayOfReal'
        },
        {
          dbTemplate: 1,
          arrayLengthTemplate: 12,
          offsetTemplate: 58,
          dataTypeTemplate: 'BOOL',
          key: 'anotherBoolArray'
        },
        {
          dbTemplate: 1,
          offsetTemplate: 60,
          arrayLengthTemplate: 1,
          dataTypeTemplate: 'CHAR',
          key: 'char'
        },
        {
          dbTemplate: 1,
          offsetTemplate: 62,
          dataTypeTemplate: 'TIME',
          key: 'time'
        },
        {
          dbTemplate: 1,
          offsetTemplate: 66,
          dataTypeTemplate: 'TIME_OF_DAY',
          key: 'timeofDay'
        }
      ]
    });

    const output = await node.run({}, {});
    output.should.deepEqual([['someoutputID'], {
      test: {
        anotherBoolArray: [
          false,
          false,
          false,
          false,
          true,
          true,
          true,
          false,
          false,
          false,
          false,
          false
        ],
        arrayOfReal: [
          5.699999809265137,
          9.899999618530273,
          7.599999904632568,
          3.0999999046325684,
          8.109999656677246
        ],
        bigBoolArray: [
          true,
          false,
          false,
          true,
          true,
          false,
          true,
          false,
          false,
          false,
          true,
          true,
          false,
          true,
          true,
          false,
          false,
          true
        ],
        boolArray: [
          false,
          true
        ],
        bool1: true,
        bool2: false,
        bool3Array: [
          true,
          true
        ],
        byte: ['00'],
        byte2: 'ab',
        byte3: '03',
        char: ['m'],
        date: '2023-01-17',
        doubleint: [17],
        doubleword: 175,
        int: 21,
        intarray: [
          20,
          28
        ],
        real: 99.87000274658203,
        time: 1900,
        timeofDay: '12:36:39.0',
        word: 198
      }
    }]);
  });
  it('should properly handle multiple read nodes running in parallel', async () => {
    const node1 = new S7ReadNode('id', [], {
      destinationPath: 'test',
      hostTemplate: 'localhost',
      portTemplate: 4567,
      rackTemplate: 0,
      slotTemplate: 1,
      timeoutTemplate: 5000,
      readInstructions: [
        {
          dbTemplate: 1,
          offsetTemplate: 0,
          dataTypeTemplate: 'DINT',
          key: 'doubleint'
        }
      ]
    });
    const node2 = new S7ReadNode('id', [], {
      destinationPath: 'test',
      hostTemplate: 'localhost',
      portTemplate: 4567,
      rackTemplate: 0,
      slotTemplate: 1,
      timeoutTemplate: 5000,
      readInstructions: [
        {
          dbTemplate: 1,
          offsetTemplate: 12,
          dataTypeTemplate: 'INT',
          key: 'int'
        }
      ]
    });
    const [ output, output2 ] = await Promise.all([
      node1.run({}, {}),
      node2.run({}, {})
    ]);
    output[1].should.deepEqual(
      {
        test: {
          doubleint: 17
        }
      }
    );
    output2[1].should.deepEqual(
      {
        test: {
          int: 21
        }
      }
    );
  });
  it('should properly handle some reads failing and some succeeding', async () => {
    const node = new S7ReadNode('id', [], {
      destinationPath: 'test',
      hostTemplate: 'localhost',
      portTemplate: 4567,
      rackTemplate: 0,
      slotTemplate: 1,
      timeoutTemplate: 5000,
      readInstructions: [
        {
          dbTemplate: 1,
          offsetTemplate: 0,
          dataTypeTemplate: 'DINT',
          key: 'doubleint'
        },
        {
          dbTemplate: 1,
          offsetTemplate: 10000,
          dataTypeTemplate: 'INT',
          key: 'int'
        }
      ]
    });

    const output = await node.run({}, {});
    output[1].test.should.deepEqual({
      doubleint: 17,
      errors: [{
        key: 'int',
        message: 'Failed to read key int. CPU : Address out of range',
        type: 'S7_READ_ERROR'
      }]
    });
  });
  it('should properly read the first value of boolean arrays when only reading one value', async () => {
    const node = new S7ReadNode('id', [], {
      destinationPath: 'test',
      hostTemplate: 'localhost',
      portTemplate: 4567,
      rackTemplate: 0,
      slotTemplate: 1,
      timeoutTemplate: 5000,
      readInstructions: [
        {
          dbTemplate: 1,
          offsetTemplate: 58,
          dataTypeTemplate: 'BOOL',
          key: 'bool1'
        },
        {
          dbTemplate: 1,
          offsetTemplate: 32,
          dataTypeTemplate: 'BOOL',
          key: 'bool2'
        },
        {
          dbTemplate: 1,
          offsetTemplate: 30,
          dataTypeTemplate: 'BOOL',
          key: 'bool3'
        },
        {
          dbTemplate: 1,
          offsetTemplate: 4,
          dataTypeTemplate: 'BOOL',
          key: 'bool4'
        },
        {
          dbTemplate: 1,
          offsetTemplate: 22,
          dataTypeTemplate: 'BOOL',
          key: 'bool5'
        }
      ]
    });

    const output = await node.run({}, {});
    output[1].test.should.deepEqual({
      bool1: false,
      bool2: true,
      bool3: true,
      bool4: true,
      bool5: false
    });
  });
});
