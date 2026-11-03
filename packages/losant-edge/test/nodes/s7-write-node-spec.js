import { s7Server } from '../common.js';
import errors from 'losant-nodejs-utils/src/errors.js';
import S7WriteNode from '../../src/nodes/s7-write-node.js';
import { reset as resetConnections } from '../../src/lib/s7-connections.js';
import { S7_BASE_TESTING_DATA } from './s7-read-node-spec.js';
import { validateRenderWriteValue } from '../../src/lib/s7-utils.js';

describe('S7WriteNode', () => {
  before(() => {
    s7Server.RegisterArea(s7Server.srvAreaDB, 1, Buffer.from(new Array(70).fill(0), 'hex'));
  });
  after(() => {
    s7Server.UnregisterArea(s7Server.srvAreaDB, 1);
  });
  beforeEach(() => {
    resetConnections();
  });
  afterEach(async () => {
    await S7WriteNode.shutdown();
  });

  it('should throw an error if write instructions are empty', async () => {
    const node = new S7WriteNode('id', [], {});
    return node.run({}, {}).should.be.rejectedWith(errors.Validation({ message: 'writeInstructions are required for S7 write.' }));
  });
  it('should throw an error if write instructions are empty array', async () => {
    const node = new S7WriteNode('id', [['nid1']], { writeInstructionsType: 'payloadPath', writeInstructions: 'instructs' });
    return node.run({}, { instructs: [] }).should.be.rejectedWith(errors.Validation({ message: 'writeInstructions are required for S7 write.' }));
  });
  it('should throw an error if data type is empty', async () => {
    const node = new S7WriteNode('id', [['nid1']], {
      writeInstructions: [
        {
          dbTemplate: 16,
          offsetTemplate: 0,
          valueTemplate: 1,
          dataTypeTemplate: '',
          key: 'doubleint'
        }
      ]
    });
    return node.run({}, {}).should.be.rejectedWith(errors.Validation({ message: 'Data Type is required.' }));
  });
  it('should throw an error if data type is not valid', async () => {
    const node = new S7WriteNode('id', [['nid1']], {
      writeInstructions: [
        {
          dbTemplate: 16,
          offsetTemplate: 0,
          valueTemplate: 1,
          dataTypeTemplate: 'fakeType',
          key: 'doubleint'
        }
      ]
    });
    return node.run({}, {}).should.be.rejectedWith(errors.Validation({ message: 'fakeType is not a valid Data Type.' }));
  });
  it('should throw an error if database is not a valid integer', async () => {
    const node = new S7WriteNode('id', [['nid1']], {
      writeInstructions: [
        {
          dbTemplate: 'abcd',
          offsetTemplate: 0,
          valueTemplate: 1,
          dataTypeTemplate: 'WORD',
          key: 'word'
        }
      ]
    });
    return node.run({}, {}).should.be.rejectedWith(errors.Validation({ message: 'Database must be an integer between 0 and 65535.' }));
  });
  it('should throw an error if database is not provided', async () => {
    const node = new S7WriteNode('id', [['nid1']], {
      writeInstructions: [
        {
          offsetTemplate: 0,
          valueTemplate: 1,
          dataTypeTemplate: 'WORD',
          key: 'word'
        }
      ]
    });
    return node.run({}, {}).should.be.rejectedWith(errors.Validation({ message: 'Database is required.' }));
  });
  it('should throw an error if offset is not a valid integer', async () => {
    const node = new S7WriteNode('id', [['nid1']], {
      writeInstructions: [
        {
          dbTemplate: 16,
          offsetTemplate: -1,
          valueTemplate: 1,
          dataTypeTemplate: 'INT',
          key: 'int'
        }
      ]
    });
    return node.run({}, {}).should.be.rejectedWith(errors.Validation({ message: 'Offset must be an integer between 0 and 2147483646.' }));
  });
  it('should throw an error if offset is not provided', async () => {
    const node = new S7WriteNode('id', [['nid1']], {
      writeInstructions: [
        {
          dbTemplate: 16,
          valueTemplate: 1,
          dataTypeTemplate: 'INT',
          key: 'int'
        }
      ]
    });
    return node.run({}, {}).should.be.rejectedWith(errors.Validation({ message: 'Offset is required.' }));
  });
  it('should throw an error if key is not a string', async () => {
    const node = new S7WriteNode('id', [['nid1']], {
      writeInstructions: [
        {
          dbTemplate: 16,
          offsetTemplate: 1,
          valueTemplate: 1,
          dataTypeTemplate: 'INT',
          key: 10
        }
      ]
    });
    return node.run({}, {}).should.be.rejectedWith(errors.Validation({ message: 'Key must be a string.' }));
  });
  it('should throw an error if key is matches the errors special path', async () => {
    const node = new S7WriteNode('id', [['nid1']], {
      writeInstructions: [
        {
          dbTemplate: 16,
          offsetTemplate: 1,
          valueTemplate: 1,
          dataTypeTemplate: 'INT',
          key: 'errors'
        }
      ]
    });
    return node.run({}, {}).should.be.rejectedWith(errors.Validation({ message: 'Keys cannot contain the special path errors.' }));
  });
  it('should throw an error if host is not provided', async () => {
    const node = new S7WriteNode('id', [['nid1']], {
      destinationPath: 'test',
      rackTemplate: 0,
      slotTemplate: 1,
      timeoutTemplate: 100,
      writeInstructions: [
        {
          dbTemplate: 16,
          offsetTemplate: 1,
          valueTemplate: 1,
          dataTypeTemplate: 'INT',
          key: 'test'
        }
      ]
    });
    return node.run({}, {}).should.be.rejectedWith(errors.Validation({ message: 'Host is required.' }));
  });
  it('should throw an error if port is invalid', async () => {
    const node = new S7WriteNode('id', [['nid1']], {
      destinationPath: 'test',
      hostTemplate: 'localhost',
      portTemplate: '{{foo}}',
      rackTemplate: 0,
      slotTemplate: 1,
      timeoutTemplate: 100,
      writeInstructions: [
        {
          dbTemplate: 16,
          offsetTemplate: 1,
          valueTemplate: 1,
          dataTypeTemplate: 'INT',
          key: 'test'
        }
      ]
    });
    return node.run({}, { foo: 'a' }).should.be.rejectedWith(errors.Validation({ message: 'S7 port number (a) is invalid.' }));
  });
  it('should throw an error if instructions are empty', async () => {
    const node = new S7WriteNode('id', [['nid1']], {
      destinationPath: 'test',
      hostTemplate: 'localhost',
      rackTemplate: 0,
      slotTemplate: 1,
      timeoutTemplate: 100,
      writeInstructions: []
    });
    return node.run({}, {}).should.be.rejectedWith(errors.Validation({ message: 'writeInstructions are required for S7 write.' }));
  });
  it('should throw an error if arrayOfValues is selected but no array is provided', async () => {
    const node = new S7WriteNode('id', [['nid1']], {
      destinationPath: 'test',
      hostTemplate: 'localhost',
      portTemplate: 4567,
      rackTemplate: 0,
      slotTemplate: 1,
      timeoutTemplate: 100,
      writeInstructions: [
        {
          dbTemplate: 16,
          offsetTemplate: 1,
          valueTypeTemplate: 'arrayOfValues',
          valueTemplate: 'foo',
          dataTypeTemplate: 'INT',
          key: 'test'
        }
      ]
    });
    return node.run({}, { foo: 'bar' }).should.be.rejectedWith(errors.Validation({ message: 'Value must be an array.' }));
  });
  it('should throw an error if no value is provided', async () => {
    const node = new S7WriteNode('id', [['nid1']], {
      destinationPath: 'test',
      hostTemplate: 'localhost',
      portTemplate: 4567,
      rackTemplate: 0,
      slotTemplate: 1,
      timeoutTemplate: 100,
      writeInstructions: [
        {
          dbTemplate: 16,
          offsetTemplate: 1,
          valueTypeTemplate: 'singleValue',
          valueTemplate: '',
          dataTypeTemplate: 'INT',
          key: 'test'
        }
      ]
    });
    return node.run({}, { foo: 'bar' }).should.be.rejectedWith(errors.Validation({ message: 'Value is required for write.' }));
  });
  it('should throw an error if an invalid type is provided to a number data type', async () => {
    const node = new S7WriteNode('id', [['nid1']], {
      destinationPath: 'test',
      hostTemplate: 'localhost',
      portTemplate: 4567,
      rackTemplate: 0,
      slotTemplate: 1,
      timeoutTemplate: 100,
      writeInstructions: [
        {
          dbTemplate: 16,
          offsetTemplate: 1,
          valueTypeTemplate: 'singleValue',
          valueTemplate: { foo: 'bar' },
          dataTypeTemplate: 'INT',
          key: 'test'
        }
      ]
    });
    return node.run({}, { foo: 'bar' }).should.be.rejectedWith(errors.Validation({ message: 'Invalid value provided for INT data type. Must be a valid number.' }));
  });
  it('should throw an error if a non-string value is provided to a string data type', async () => {
    const node = new S7WriteNode('id', [['nid1']], {
      destinationPath: 'test',
      hostTemplate: 'localhost',
      portTemplate: 4567,
      rackTemplate: 0,
      slotTemplate: 1,
      timeoutTemplate: 100,
      writeInstructions: [
        {
          dbTemplate: 16,
          offsetTemplate: 1,
          valueTemplate: 20,
          dataTypeTemplate: 'CHAR',
          key: 'test'
        }
      ]
    });
    return node.run({}, { foo: 'bar' }).should.be.rejectedWith(errors.Validation({ message: 'Invalid value provided for CHAR data type. Must be a string.' }));
  });
  it('should throw an error if a non-hex value is provided to the BYTE type', async () => {
    const node = new S7WriteNode('id', [['nid1']], {
      destinationPath: 'test',
      hostTemplate: 'localhost',
      portTemplate: 4567,
      rackTemplate: 0,
      slotTemplate: 1,
      timeoutTemplate: 100,
      writeInstructions: [
        {
          dbTemplate: 16,
          offsetTemplate: 1,
          valueTemplate: 'GG',
          dataTypeTemplate: 'BYTE',
          key: 'test'
        }
      ]
    });
    return node.run({}, { foo: 'bar' }).should.be.rejectedWith(errors.Validation({ message: 'Invalid value provided for BYTE data type. Must be valid hex characters.' }));
  });
  it('should throw an error if a long string value is provided to the CHAR data type', async () => {
    const node = new S7WriteNode('id', [['nid1']], {
      destinationPath: 'test',
      hostTemplate: 'localhost',
      portTemplate: 4567,
      rackTemplate: 0,
      slotTemplate: 1,
      timeoutTemplate: 100,
      writeInstructions: [
        {
          dbTemplate: 16,
          offsetTemplate: 1,
          valueTemplate: 'foo',
          dataTypeTemplate: 'CHAR',
          key: 'test'
        }
      ]
    });
    return node.run({}, { foo: 'bar' }).should.be.rejectedWith(errors.Validation({ message: 'Invalid value provided for CHAR data type. Must be a single ascii character.' }));
  });
  it('should throw an error if a non ascii character is provided to the CHAR data type', async () => {
    const node = new S7WriteNode('id', [['nid1']], {
      destinationPath: 'test',
      hostTemplate: 'localhost',
      portTemplate: 4567,
      rackTemplate: 0,
      slotTemplate: 1,
      timeoutTemplate: 100,
      writeInstructions: [
        {
          dbTemplate: 16,
          offsetTemplate: 1,
          valueTemplate: '🐸',
          dataTypeTemplate: 'CHAR',
          key: 'test'
        }
      ]
    });
    return node.run({}, { foo: 'bar' }).should.be.rejectedWith(errors.Validation({ message: 'Invalid value provided for CHAR data type. Must be a single ascii character.' }));
  });
  it('should throw an error if a non-integer value is provided to an integer data type', async () => {
    const node = new S7WriteNode('id', [['nid1']], {
      destinationPath: 'test',
      hostTemplate: 'localhost',
      portTemplate: 4567,
      rackTemplate: 0,
      slotTemplate: 1,
      timeoutTemplate: 100,
      writeInstructions: [
        {
          dbTemplate: 16,
          offsetTemplate: 1,
          valueTemplate: 10.7,
          dataTypeTemplate: 'WORD',
          key: 'test'
        }
      ]
    });
    return node.run({}, { foo: 'bar' }).should.be.rejectedWith(errors.Validation({ message: 'Invalid value provided for WORD data type. Must be an integer.' }));
  });
  it('should throw an error if an out of range value is provided to an INT data type', async () => {
    const node = new S7WriteNode('id', [['nid1']], {
      destinationPath: 'test',
      hostTemplate: 'localhost',
      portTemplate: 4567,
      rackTemplate: 0,
      slotTemplate: 1,
      timeoutTemplate: 100,
      writeInstructions: [
        {
          dbTemplate: 16,
          offsetTemplate: 1,
          valueTemplate: 32768,
          dataTypeTemplate: 'INT',
          key: 'test'
        }
      ]
    });
    return node.run({}, { foo: 'bar' }).should.be.rejectedWith(errors.Validation({ message: 'Invalid value provided for INT data type. Must be between -32768 and 32767.' }));
  });
  it('should throw an error if an out of range value is provided to a WORD data type', async () => {
    const node = new S7WriteNode('id', [['nid1']], {
      destinationPath: 'test',
      hostTemplate: 'localhost',
      portTemplate: 4567,
      rackTemplate: 0,
      slotTemplate: 1,
      timeoutTemplate: 100,
      writeInstructions: [
        {
          dbTemplate: 16,
          offsetTemplate: 1,
          valueTemplate: -1,
          dataTypeTemplate: 'WORD',
          key: 'test'
        }
      ]
    });
    return node.run({}, { foo: 'bar' }).should.be.rejectedWith(errors.Validation({ message: 'Invalid value provided for WORD data type. Must be between 0 and 65535.' }));
  });
  it('should throw an error if an out of range value is provided to a DINT data type', async () => {
    const node = new S7WriteNode('id', [['nid1']], {
      destinationPath: 'test',
      hostTemplate: 'localhost',
      portTemplate: 4567,
      rackTemplate: 0,
      slotTemplate: 1,
      timeoutTemplate: 100,
      writeInstructions: [
        {
          dbTemplate: 16,
          offsetTemplate: 1,
          valueTemplate: -2147483649,
          dataTypeTemplate: 'DINT',
          key: 'test'
        }
      ]
    });
    return node.run({}, { foo: 'bar' }).should.be.rejectedWith(errors.Validation({ message: 'Invalid value provided for DINT data type. Must be between -2147483648 and 2147483647.' }));
  });
  it('should throw an error if an out of range value is provided to a DWORD data type', async () => {
    const node = new S7WriteNode('id', [['nid1']], {
      destinationPath: 'test',
      hostTemplate: 'localhost',
      portTemplate: 4567,
      rackTemplate: 0,
      slotTemplate: 1,
      timeoutTemplate: 100,
      writeInstructions: [
        {
          dbTemplate: 16,
          offsetTemplate: 1,
          valueTemplate: 4294967296,
          dataTypeTemplate: 'DWORD',
          key: 'test'
        }
      ]
    });
    return node.run({}, { foo: 'bar' }).should.be.rejectedWith(errors.Validation({ message: 'Invalid value provided for DWORD data type. Must be between 0 and 4294967295.' }));
  });
  it('should throw an error if a non-number value is provided to a REAL data type', async () => {
    const node = new S7WriteNode('id', [['nid1']], {
      destinationPath: 'test',
      hostTemplate: 'localhost',
      portTemplate: 4567,
      rackTemplate: 0,
      slotTemplate: 1,
      timeoutTemplate: 100,
      writeInstructions: [
        {
          dbTemplate: 16,
          offsetTemplate: 1,
          valueTemplate: 'foo',
          dataTypeTemplate: 'REAL',
          key: 'test'
        }
      ]
    });
    return node.run({}, { foo: 'bar' }).should.be.rejectedWith(errors.Validation({ message: 'Invalid value provided for REAL data type. Must be a valid number.' }));
  });
  it('should throw an error if an out of range value is provided to a REAL data type', async () => {
    const node = new S7WriteNode('id', [['nid1']], {
      destinationPath: 'test',
      hostTemplate: 'localhost',
      portTemplate: 4567,
      rackTemplate: 0,
      slotTemplate: 1,
      timeoutTemplate: 100,
      writeInstructions: [
        {
          dbTemplate: 16,
          offsetTemplate: 1,
          valueTemplate: -3.402823e+39,
          dataTypeTemplate: 'REAL',
          key: 'test'
        }
      ]
    });
    return node.run({}, { foo: 'bar' }).should.be.rejectedWith(errors.Validation({ message: 'Invalid value provided for REAL data type. Must be between -3.402823e+38 and 3.402823e+38.' }));
  });
  it('should throw an error if a non-date value is provided to a DATE data type', async () => {
    const node = new S7WriteNode('id', [['nid1']], {
      destinationPath: 'test',
      hostTemplate: 'localhost',
      portTemplate: 4567,
      rackTemplate: 0,
      slotTemplate: 1,
      timeoutTemplate: 100,
      writeInstructions: [
        {
          dbTemplate: 16,
          offsetTemplate: 1,
          valueTemplate: 'hello',
          dataTypeTemplate: 'DATE',
          key: 'test'
        }
      ]
    });
    return node.run({}, { foo: 'bar' }).should.be.rejectedWith(errors.Validation({ message: 'Invalid value provided for DATE data type. Must be a valid date or integer.' }));
  });
  it('should throw an error if an out of range value is provided to a DATE data type', async () => {
    const node = new S7WriteNode('id', [['nid1']], {
      destinationPath: 'test',
      hostTemplate: 'localhost',
      portTemplate: 4567,
      rackTemplate: 0,
      slotTemplate: 1,
      timeoutTemplate: 100,
      writeInstructions: [
        {
          dbTemplate: 16,
          offsetTemplate: 1,
          valueTemplate: '01/01/1989',
          dataTypeTemplate: 'DATE',
          key: 'test'
        }
      ]
    });
    return node.run({}, { foo: 'bar' }).should.be.rejectedWith(errors.Validation({ message: 'Out of range value provided for DATE data type. Must be a date between 01/01/1990 and 12/31/2168 or an integer between 0 and 65378.' }));
  });
  it('should throw an error if an out of range value is provided to a TIME_OF_DAY data type', async () => {
    const node = new S7WriteNode('id', [['nid1']], {
      destinationPath: 'test',
      hostTemplate: 'localhost',
      portTemplate: 4567,
      rackTemplate: 0,
      slotTemplate: 1,
      timeoutTemplate: 100,
      writeInstructions: [
        {
          dbTemplate: 16,
          offsetTemplate: 1,
          valueTemplate: -1,
          dataTypeTemplate: 'TIME_OF_DAY',
          key: 'test'
        }
      ]
    });
    return node.run({}, { foo: 'bar' }).should.be.rejectedWith(errors.Validation({ message: 'Invalid value provided for TIME_OF_DAY data type. Must be a valid time.' }));
  });
  it('should return an error when unable to connect to the PLC', async () => {
    const node = new S7WriteNode('id', [], {
      destinationPath: 'test',
      hostTemplate: 'localhost',
      portTemplate: 4568,
      rackTemplate: 0,
      slotTemplate: 1,
      timeoutTemplate: 100,
      writeInstructions: [
        {
          dbTemplate: 1,
          offsetTemplate: 0,
          valueTemplate: 1,
          dataTypeTemplate: 'DINT',
          key: 'doubleint'
        }
      ]
    });

    const output = await node.run({}, {});
    output[1].test.should.deepEqual({
      errors: [{
        message: 'Failed to connect.  TCP : Connection refused',
        type: 'S7_WRITE_ERROR'
      }]
    });
  });
  it('should return an errors list when unable to successfully to the PLC', async () => {
    const node = new S7WriteNode('id', [], {
      destinationPath: 'test',
      hostTemplate: 'localhost',
      portTemplate: 4567,
      rackTemplate: 0,
      slotTemplate: 1,
      timeoutTemplate: 100,
      writeInstructions: [
        {
          dbTemplate: 16,
          offsetTemplate: 0,
          dataTypeTemplate: 'DINT',
          valueTemplate: 90,
          key: 'doubleint'
        }
      ]
    });

    const output = await node.run({}, {});
    output[1].test.should.deepEqual({
      doubleint: false,
      errors: [{
        key: 'doubleint',
        message: 'Failed to write key doubleint. CPU : Item not available',
        type: 'S7_WRITE_ERROR'
      }]
    });
  });
  it('should properly write and format data properly', async () => {
    const instructions = [
      [
        {
          dbTemplate: 1,
          offsetTemplate: 0,
          dataTypeTemplate: 'DINT',
          valueTemplate: '{{doubleint}}',
          key: 'doubleint'
        },
        {
          dbTemplate: 1,
          offsetTemplate: 4,
          dataTypeTemplate: 'BOOL',
          valueTemplate: '{{bool1}}',
          key: 'bool1'
        },
        {
          dbTemplate: 1,
          offsetTemplate: 6,
          dataTypeTemplate: 'WORD',
          valueTemplate: '{{word}}',
          key: 'word'
        },
        {
          dbTemplate: 1,
          offsetTemplate: 8,
          dataTypeTemplate: 'DWORD',
          valueTemplate: '{{doubleword}}',
          key: 'doubleword'
        },
        {
          dbTemplate: 1,
          offsetTemplate: 12,
          dataTypeTemplate: 'INT',
          valueTemplate: '{{int}}',
          key: 'int'
        },
        {
          dbTemplate: 1,
          offsetTemplate: 14,
          dataTypeTemplate: 'REAL',
          valueTemplate: '{{real}}',
          key: 'real'
        }
      ],
      [
        {
          dbTemplate: 1,
          offsetTemplate: 20,
          dataTypeTemplate: 'DATE',
          valueTemplate: '{{date}}',
          key: 'date'
        },
        {
          dbTemplate: 1,
          offsetTemplate: 22,
          dataTypeTemplate: 'BOOL',
          valueTypeTemplate: 'arrayOfValues',
          valueTemplate: 'boolArray',
          key: 'boolArray'
        },
        {
          dbTemplate: 1,
          offsetTemplate: 24,
          dataTypeTemplate: 'BYTE',
          valueTemplate: '{{byte}}',
          key: 'byte'
        },
        {
          dbTemplate: 1,
          offsetTemplate: 26,
          dataTypeTemplate: 'INT',
          valueTypeTemplate: 'arrayOfValues',
          valueTemplate: 'intarray',
          key: 'intarray'
        },
        {
          dbTemplate: 1,
          offsetTemplate: 30,
          dataTypeTemplate: 'BOOL',
          valueTypeTemplate: 'arrayOfValues',
          valueTemplate: 'bool3Array',
          key: 'bool3Array'
        },
        {
          arrayLengthTemplate: 18,
          dbTemplate: 1,
          offsetTemplate: 32,
          dataTypeTemplate: 'BOOL',
          valueTypeTemplate: 'arrayOfValues',
          valueTemplate: 'bigBoolArray',
          key: 'bigBoolArray'
        },
        {
          dbTemplate: 1,
          offsetTemplate: 36,
          dataTypeTemplate: 'BYTE',
          valueTemplate: '{{byte2}}',
          key: 'byte2'
        }
      ],
      [
        {
          dbTemplate: 1,
          offsetTemplate: 37,
          dataTypeTemplate: 'BYTE',
          valueTemplate: '{{byte3}}',
          key: 'byte3'
        },
        {
          dbTemplate: 1,
          offsetTemplate: 38,
          dataTypeTemplate: 'REAL',
          valueTypeTemplate: 'arrayOfValues',
          valueTemplate: 'arrayOfReal',
          key: 'arrayOfReal'
        }
      ],
      [
        {
          dbTemplate: 1,
          offsetTemplate: 18,
          dataTypeTemplate: 'BOOL',
          valueTemplate: '{{bool2}}',
          key: 'bool2'
        },
        {
          dbTemplate: 1,
          offsetTemplate: 58,
          dataTypeTemplate: 'BOOL',
          valueTypeTemplate: 'arrayOfValues',
          valueTemplate: 'anotherBoolArray',
          key: 'anotherBoolArray'
        },
        {
          dbTemplate: 1,
          offsetTemplate: 60,
          dataTypeTemplate: 'CHAR',
          valueTemplate: '{{char}}',
          key: 'char'
        },
        {
          dbTemplate: 1,
          offsetTemplate: 62,
          dataTypeTemplate: 'TIME',
          valueTemplate: '{{time}}',
          key: 'time'
        },
        {
          dbTemplate: 1,
          offsetTemplate: 66,
          dataTypeTemplate: 'TIME_OF_DAY',
          valueTemplate: '{{timeofDay}}',
          key: 'timeofDay'
        }
      ]
    ];
    const basePayload = {
      anotherBoolArray: [
        'false',
        false,
        false,
        false,
        true,
        'true',
        true,
        false,
        false,
        false,
        false,
        false
      ],
      bool2: false,
      char: 'm',
      time: 1900,
      timeofDay: '12:36:39.0',
      arrayOfReal: [
        5.699999809265137,
        9.899999618530273,
        7.599999904632568,
        3.0999999046325684,
        8.109999656677246
      ],
      byte3: '03',
      bool1: true,
      doubleint: 17,
      doubleword: 175,
      int: 21,
      real: 99.87000274658203,
      word: 198,
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
      bool3Array: [
        true,
        true
      ],
      byte: '00',
      byte2: 'ab',
      date: '2023-01-17',
      intarray: [
        20,
        28
      ]
    };
    const expectedOutputs = [
      {
        bool1: true,
        doubleint: true,
        doubleword: true,
        int: true,
        real: true,
        word: true
      },
      {
        bigBoolArray: true,
        boolArray: true,
        bool3Array: true,
        byte: true,
        byte2: true,
        date: true,
        intarray: true
      },
      {
        arrayOfReal: true,
        byte3: true
      },
      {
        anotherBoolArray: true,
        bool2: true,
        char: true,
        time: true,
        timeofDay: true
      }
    ];
    const nodes = instructions.map((writeInstructions) => {
      return new S7WriteNode('id', ['someoutputID'], {
        destinationPath: 'test',
        hostTemplate: 'localhost',
        portTemplate: 4567,
        rackTemplate: 0,
        slotTemplate: 1,
        timeoutTemplate: 5000,
        writeInstructions
      });
    });
    const results = await Promise.all([
      nodes[0].run({}, basePayload),
      nodes[1].run({}, basePayload),
      nodes[2].run({}, basePayload),
      nodes[3].run({}, basePayload)
    ]);
    results.forEach((output, index) => {
      output[1].test.should.deepEqual(expectedOutputs[index]);
    });
    [...s7Server.GetArea(s7Server.srvAreaDB, 1)].should.deepEqual(S7_BASE_TESTING_DATA);
  });
  it('should properly handle using both "payloadPath" for writeInstructionsType and "arrayOfValues" for valueType', async () => {
    const basePayload = {
      test: [
        {
          db: 1,
          offset: 58,
          dataType: 'BOOL',
          valueType: 'arrayOfValues',
          value: [
            'false',
            false,
            false,
            false,
            true,
            'true',
            true,
            false,
            false,
            false,
            false,
            false
          ],
          key: 'anotherBoolArray'
        }
      ]
    };
    const node = new S7WriteNode('id', ['someoutputID'], {
      destinationPath: 'test',
      hostTemplate: 'localhost',
      portTemplate: 4567,
      rackTemplate: 0,
      slotTemplate: 1,
      timeoutTemplate: 5000,
      writeInstructionsType: 'payloadPath',
      writeInstructions: 'test'
    });
    const output = await node.run({}, basePayload);
    output[1].test.should.deepEqual({ anotherBoolArray: true });
    [...s7Server.GetArea(s7Server.srvAreaDB, 1)].should.deepEqual(S7_BASE_TESTING_DATA);
  });

  describe('validateRenderWriteValue', () => {
    it('should accept date objects for DATE data type', async () => {
      const value = new Date('11/27/1998 01:23:45 +0000'); // 3252 days after 01/01/1990
      const expected = 3252;

      const result = validateRenderWriteValue(value, 'singleValue', 'DATE');

      result.readUInt16BE().should.equal(expected);
    });
    it('should accept date strings for DATE data type', async () => {
      const value = '11/27/1998'; // 3252 days after 01/01/1990
      const expected = 3252;

      const result = validateRenderWriteValue(value, 'singleValue', 'DATE');

      result.readUInt16BE().should.equal(expected);
    });
    it('should accept days since 01/01/1990 for DATE data type', async () => {
      const value = '5';
      const expected = 5;

      const result = validateRenderWriteValue(value, 'singleValue', 'DATE');

      result.readUInt16BE().should.equal(expected);
    });
    it('should accept date objects for TIME_OF_DAY data type', async () => {
      const value = new Date('11/27/1998 01:23:45 +0000'); // 01*60*60*1000 + 23*60*1000 + 45*1000 = 5,025,000
      const expected = 5025000;

      const result = validateRenderWriteValue(value, 'singleValue', 'TIME_OF_DAY');

      result.readInt32BE().should.equal(expected);
    });
    it('should accept date strings for TIME_OF_DAY data type', async () => {
      const value = '11/27/1998 01:23:45 +0000'; // 01*60*60*1000 + 23*60*1000 + 45*1000 = 5,025,000
      const expected = 5025000;

      const result = validateRenderWriteValue(value, 'singleValue', 'TIME_OF_DAY');

      result.readInt32BE().should.equal(expected);
    });
    it('should accept time strings for TIME_OF_DAY data type', async () => {
      const value = '01:23:45'; // 01*60*60*1000 + 23*60*1000 + 45*1000 = 5,025,000
      const expected = 5025000;

      const result = validateRenderWriteValue(value, 'singleValue', 'TIME_OF_DAY');

      result.readInt32BE().should.equal(expected);
    });
    it('should accept numbers for TIME_OF_DAY data type', async () => {
      const value = 5025000;
      const expected = 5025000;

      const result = validateRenderWriteValue(value, 'singleValue', 'TIME_OF_DAY');

      result.readInt32BE().should.equal(expected);
    });
    it('should accept numbers as strings for TIME_OF_DAY data type', async () => {
      const value = '5025000';
      const expected = 5025000;

      const result = validateRenderWriteValue(value, 'singleValue', 'TIME_OF_DAY');

      result.readInt32BE().should.equal(expected);
    });
  });
});
