import '../common.js';
import AllenBradleyReadNode from '../../src/nodes/allen-bradley-read-node.js';
import { reset } from '../../src/lib/connections/allen-bradley.js';
import errors from 'losant-nodejs-utils/src/errors.js';

const PLC_PROPS =  {
  name: '1769-L16ER/B LOGIX5316ER',
  serial_number: 1625021281,
  slot: 0,
  time: null,
  version: '31.11',
  status: 12384,
  run: true,
  program: false,
  faulted: false,
  minorRecoverableFault: false,
  minorUnrecoverableFault: false,
  majorRecoverableFault: false,
  majorUnrecoverableFault: false,
  io_faulted: false
};

describe('Allen-Bradley Read Node', () => {
  it('should throw an error if read instructions are empty', async () => {
    const node = new AllenBradleyReadNode('id', [['nid1']], { readInstructions: [] });
    return node.run({}, {}).should.be.rejectedWith(errors.Validation({ message: 'Read instructions are required for Allen-Bradley read' }));
  });
  it('should throw an error if tag is empty', async () => {
    const node = new AllenBradleyReadNode('id', [['nid1']], { readInstructions: [ { tagTemplate: '', programTemplate: 'My_Program', key: 'key' } ] });
    return node.run({}, {}).should.be.rejectedWith(errors.Validation({ message: 'Tag is required.' }));
  });
  it('should throw an error if tag name is invalid', async () => {
    const node = new AllenBradleyReadNode('id', [['nid1']], { readInstructions: [ { tagTemplate: '@123', programTemplate: 'My_Program', key: 'key' } ] });
    return node.run({}, {}).should.be.rejectedWith(errors.Validation({ message: 'Tag name must be a valid string.' }));
  });
  it('should throw an error if program name is invalid', async () => {
    const node = new AllenBradleyReadNode('id', [['nid1']], { readInstructions: [ { tagTemplate: 'tag', programTemplate: '@My_Program', key: 'key' } ] });
    return node.run({}, {}).should.be.rejectedWith(errors.Validation({ message: 'Program name must be a valid string.' }));
  });
  it('should throw an error if a key is trying to map into the errors path', async () => {
    const node = new AllenBradleyReadNode('id', [['nid1']], { readInstructions: [ { tagTemplate: 'tag', programTemplate: 'My_Program', key: 'errors.err' } ] });
    return node.run({}, {}).should.be.rejectedWith(errors.Validation({ message: 'Keys cannot contain the special path errors or plcProperties.' }));
  });
  it('should throw an error if a key is trying to map into on of the plc properties', async () => {
    const node = new AllenBradleyReadNode('id', [['nid1']], { readInstructions: [ { tagTemplate: 'tag', programTemplate: 'My_Program', key: 'plcProperties.name' } ] });
    return node.run({}, {}).should.be.rejectedWith(errors.Validation({ message: 'Keys cannot contain the special path errors or plcProperties.' }));
  });
  it('should throw an error if host is empty', async () => {
    const config = {
      hostTemplate: '',
      slotTemplate: 0,
      keepRateTemplate: 0,
      readInstructions: [
        { tagTemplate: 'tag', programTemplate: 'My_Program', key: 'key' }
      ],
      destinationPath: 'destination'
    };
    const node = new AllenBradleyReadNode('id', [['nid1']], config);
    await node.run({}, {}).should.be.rejectedWith({ message: 'Host is required.' });
  });
  it('should throw an error if timeout is greater than default value', async () => {
    const config = {
      hostTemplate: 'localhost',
      slotTemplate: 0,
      keepRateTemplate: 0,
      timeoutTemplate: '45000',
      readInstructions: [
        { tagTemplate: 'tag', programTemplate: 'My_Program', key: 'key' }
      ],
      destinationPath: 'destination'
    };
    const node = new AllenBradleyReadNode('id', [['nid1']], config);
    await node.run({ externalTimeout: 30000 }, {}).should.be.rejectedWith({ message: 'timeoutTemplate cannot be greater than 30 seconds.' });
  });
  it('should throw an error if tag name and program conflict', async () => {
    const config = {
      hostTemplate: 'localhost',
      slotTemplate: 0,
      keepRateTemplate: 0,
      readInstructions: [
        { tagTemplate: 'Program:MainProgram.tag', programTemplate: 'My_Program', key: 'key' }
      ],
      destinationPath: 'destination'
    };
    const node = new AllenBradleyReadNode('id', [['nid1']], config);
    await node.run({ externalTimeout: 30000 }, {}).should.be.rejectedWith({ message: 'Tag name (Program:MainProgram.tag) conflicts with given program name (My_Program).' });
  });
  it('should throw an error the same tag name is requested twice', async () => {
    const config = {
      hostTemplate: 'localhost',
      slotTemplate: 0,
      keepRateTemplate: 0,
      readInstructions: [
        { tagTemplate: 'Program:MainProgram.tag', key: 'key' },
        { tagTemplate: 'tag', programTemplate: 'MainProgram', key: 'key' }
      ],
      destinationPath: 'destination'
    };
    const node = new AllenBradleyReadNode('id', [['nid1']], config);
    await node.run({ externalTimeout: 30000 }, {}).should.be.rejectedWith({ message: 'Cannot read to the same tag (tag) twice.' });
  });
  it('should throw an error the same tag name is requested twice', async () => {
    const config = {
      hostTemplate: 'localhost',
      slotTemplate: 0,
      keepRateTemplate: 0,
      readInstructions: [
        { tagTemplate: 'tag', programTemplate: 'MainProgram', key: 'key' },
        { tagTemplate: 'tag', programTemplate: 'MainProgram', key: 'key' }
      ],
      destinationPath: 'destination'
    };
    const node = new AllenBradleyReadNode('id', [['nid1']], config);
    await node.run({ externalTimeout: 30000 }, {}).should.be.rejectedWith({ message: 'Cannot read to the same tag (tag) twice.' });
  });
  it('should throw an error if host is invalid', async () => {
    reset();
    const config = {
      hostTemplate: 'localhope',
      slotTemplate: 0,
      keepRateTemplate: 0,
      readInstructions: [
        { tagTemplate: 'tag', programTemplate: 'My_Program', key: 'key' }
      ],
      destinationPath: 'destination'
    };
    const node = new AllenBradleyReadNode('id', [['nid1']], config);
    await node.run({ externalTimeout: 10000 }, {}).should.be.resolvedWith([
      [ [ 'nid1' ] ],
      {
        destination:  {
          errors: [ {
            type: 'Allen-Bradley_READ_ERROR',
            message: 'Cannot resolve host: localhope'
          } ]
        }
      }
    ]);
  });
  it('should throw an error if slot is a string', async () => {
    const config = {
      hostTemplate: '1.2.3.4',
      slotTemplate: 'slot',
      keepRateTemplate: 0,
      readInstructions: [
        { tagTemplate: 'tag', programTemplate: 'My_Program', key: 'key' }
      ],
      destinationPath: 'destination'
    };
    const node = new AllenBradleyReadNode('id', [['nid1']], config);
    return node.run({}, {}).should.be.rejectedWith({ message: 'Slot must be a valid integer.' });
  });
  it('should throw an error if slot is negative', async () => {
    const config = {
      hostTemplate: '1.2.3.4',
      slotTemplate: -5,
      keepRateTemplate: 0,
      readInstructions: [
        { tagTemplate: 'tag', programTemplate: 'My_Program', key: 'key' }
      ],
      destinationPath: 'destination'
    };
    const node = new AllenBradleyReadNode('id', [['nid1']], config);
    return node.run({}, {}).should.be.rejectedWith({ message: 'Slot must be an integer between 0 and 255' });
  });
  it('should throw an error if keep alive rate is a string', async () => {
    const config = {
      hostTemplate: '1.2.3.4',
      slotTemplate: 0,
      keepRateTemplate: 'rate',
      readInstructions: [
        { tagTemplate: 'tag', programTemplate: 'My_Program', key: 'key' }
      ],
      destinationPath: 'destination'
    };
    const node = new AllenBradleyReadNode('id', [['nid1']], config);
    return node.run({}, {}).should.be.rejectedWith({ message: 'Keep Alive rate must be a valid integer.' });
  });
  it('should throw an error if keep alive rate is negative', async () => {
    const config = {
      hostTemplate: '1.2.3.4',
      slotTemplate: 0,
      keepRateTemplate: -1,
      readInstructions: [
        { tagTemplate: 'tag', programTemplate: 'My_Program', key: 'key' }
      ],
      destinationPath: 'destination'
    };
    const node = new AllenBradleyReadNode('id', [['nid1']], config);
    return node.run({}, {}).should.be.rejectedWith({ message: 'Keep Alive rate must be between 0(off) and 300(s).' });
  });
  it('should throw an error if the payload read instructions is not an array', async () => {
    const config = {
      hostTemplate: '1.2.3.4',
      slotTemplate: 0,
      keepRateTemplate: 0,
      readInstructionsType: 'payloadPath',
      readInstructions: 'myInstructions',
      destinationPath: 'destination'
    };
    const payload = {
      myInstructions: {},
      data: {
        host: '127.0.0.1',
        port: 8080
      }
    };
    const node = new AllenBradleyReadNode('id', [['nid1']], config);
    return node.run({}, payload).should.be.rejectedWith(errors.Validation({
      message: 'Read instructions must be an array.'
    }));
  });
  it('should throw an error if tag in the payload path is empty', async function() {
    const config = {
      hostTemplate: '1.2.3.4',
      slotTemplate: 0,
      keepRateTemplate: 200,
      readInstructionsType: 'payloadPath',
      readInstructions: 'instructions',
      destinationPath: 'destination'
    };
    const node = new AllenBradleyReadNode('id', [['nid1']], config);
    return node.run({}, {
      instructions: [
        { program: 'MainProgram', key: 'testDint' } // Missing tag
      ]
    }).should.be.rejectedWith(errors.Validation({ message: 'Tag is required.' }));
  });
  it('should throw an error if program name in the payload path is invalid', async function() {
    const config = {
      hostTemplate: '1.2.3.4',
      slotTemplate: 0,
      keepRateTemplate: 200,
      readInstructionsType: 'payloadPath',
      readInstructions: 'instructions',
      destinationPath: 'destination'
    };
    const node = new AllenBradleyReadNode('id', [['nid1']], config);
    return node.run({}, {
      instructions: [
        { tag: 'test_dint', program: '@Main_Program', key: 'testDint' } // invalid program name
      ]
    }).should.be.rejectedWith(errors.Validation({ message: 'Program name must be a valid string.' }));
  });
  it.skip('should wait for multiple runs and timeout both if controller not found', async () => {
    // it appears the socket is not closing when it times out, also may have a memory leak
    const config = {
      hostTemplate: '1.2.3.4',
      slotTemplate: 0,
      keepRateTemplate: 200,
      readInstructions: [
        { tagTemplate: 'tag', programTemplate: 'My_Program', key: 'key' }
      ],
      destinationPath: 'destination'
    };
    const node = new AllenBradleyReadNode('id', [['nid1']], config);
    await Promise.all([
      node.run({}, {}).should.be.rejectedWith({ message: 'TIMEOUT occurred while attempting to establish TCP connection with Controller.' }),
      node.run({}, {}).should.be.rejectedWith({ message: 'TIMEOUT occurred while attempting to establish TCP connection with Controller.' })
    ]);
  });
  //uncomment and modify for testing real device
  describe.skip('Real Allen Bradley Machine', () => {
    it('should fail properly to read a tag with a length too long', async () => {
      const config = {
        hostTemplate: '192.168.5.10',
        slotTemplate: 0,
        keepRateTemplate: 200,
        readInstructions: [
          { tagTemplate: 'test_udt_1.array_of_dints', programTemplate: 'MainProgram', key: 'array', lengthTemplate: 100 }
        ],
        destinationPath: 'destination'
      };
      const node = new AllenBradleyReadNode('id', [['nid1']], config);
      const output = await node.run({ externalTimeout: 30000 }, {});
      output[1].destination.should.deepEqual({
        plcProperties: PLC_PROPS,
        errors: [
          {
            type: 'Allen-Bradley_READ_ERROR',
            message: {
              extendedStatus: [ 8453 ],
              generalStatusCode: 255,
              message: 'Could not complete Allen-Bradley request.'
            }
          }
        ]
      });
    }).timeout(60000);
    it('should read a good tag, fail to read a tag and then read a good tag again', async () => {
      const config = {
        hostTemplate: '192.168.5.10',
        slotTemplate: 0,
        keepRateTemplate: 200,
        readInstructions: [
          { tagTemplate: 'test_bool', programTemplate: 'MainProgram', key: 'testBoolean' }
        ],
        destinationPath: 'destination'
      };
      const config2 = {
        hostTemplate: '192.168.5.10',
        slotTemplate: 0,
        keepRateTemplate: 200,
        readInstructions: [
          { tagTemplate: 'multi_array_strings[100,1,1]', programTemplate: 'MainProgram', key: 'output' }
        ],
        destinationPath: 'destination'
      };
      const goodNode = new AllenBradleyReadNode('id', [['nid1']], config);
      const badNode = new AllenBradleyReadNode('id2', [['nid2']], config2);
      const output = await goodNode.run({ externalTimeout: 30000 }, {});
      output[1].destination.testBoolean.should.equal(false);
      const output2 = await badNode.run({ externalTimeout: 30000 }, {});
      output2[1].destination.errors.should.deepEqual([
        {
          type: 'Allen-Bradley_READ_ERROR',
          message: {
            generalStatusCode: 5,
            extendedStatus: [],
            message: 'Could not complete Allen-Bradley request.'
          }
        }
      ]);
      const output3 = await goodNode.run({ externalTimeout: 30000 }, {});
      output3[1].destination.testBoolean.should.equal(false);
    }).timeout(120 * 1000);
    it('should not read one tag to two keys', async () => {
      const config = {
        hostTemplate: '192.168.5.10',
        slotTemplate: 0,
        keepRateTemplate: 200,
        readInstructions: [
          { tagTemplate: 'test_bool', programTemplate: 'MainProgram', key: 'testBoolean' },
          { tagTemplate: 'test_bool', programTemplate: 'MainProgram', key: 'testBoolean2' }
        ],
        destinationPath: 'destination'
      };
      const node = new AllenBradleyReadNode('id', [['nid1']], config);
      await node.run({ externalTimeout: 10000 }, {}).should.be.rejectedWith({
        message: 'Cannot read to the same tag (test_bool) twice.'
      });
    });
    it('should not read one tag to two keys when program is on the tag', async () => {
      const config = {
        hostTemplate: '192.168.5.10',
        slotTemplate: 0,
        keepRateTemplate: 200,
        readInstructions: [
          { tagTemplate: 'Program:MainProgram.test_bool', programTemplate: '', key: 'testBoolean' },
          { tagTemplate: 'test_bool', programTemplate: 'MainProgram', key: 'testBoolean2' }
        ],
        destinationPath: 'destination'
      };
      const node = new AllenBradleyReadNode('id', [['nid1']], config);
      await node.run({ externalTimeout: 10000 }, {}).should.be.rejectedWith({
        message: 'Cannot read to the same tag (test_bool) twice.'
      });
    });
    it('should read two tags that are the same name but different programs', async () => {
      const config = {
        hostTemplate: '192.168.5.10',
        slotTemplate: 0,
        keepRateTemplate: 200,
        readInstructions: [
          { tagTemplate: 'test_bool', programTemplate: 'MainProgram', key: 'testBoolean' },
          { tagTemplate: 'test_bool', programTemplate: '', key: 'testBoolean2' }
        ],
        destinationPath: 'destination'
      };
      const node = new AllenBradleyReadNode('id', [['nid1']], config);
      const output = await node.run({ externalTimeout: 10000 }, {});
      output[1].destination.should.deepEqual({
        plcProperties: PLC_PROPS,
        testBoolean: false,
        testBoolean2: false
      });
    });
    // this test will hang open after complete for about 40 seconds to wait for timers to fire
    // https://github.com/SerafinTech/ST-node-ethernet-ip/issues/77
    it('should output values', async () => {
      const config = {
        hostTemplate: '192.168.5.10',
        slotTemplate: 0,
        keepRateTemplate: 200,
        readInstructions: [
          { tagTemplate: 'test_custom_string', programTemplate: 'MainProgram', key: 'testCustomString' },
          { tagTemplate: 'test_dint', programTemplate: 'MainProgram', key: 'testDint' },
          { tagTemplate: 'test_bool', programTemplate: '', key: 'testBooleanCont' },
          { tagTemplate: 'test_custom_string', programTemplate: '', key: 'testCustomStringCont' },
          { tagTemplate: 'test_dint', programTemplate: '', key: 'testDintCont' },
          { tagTemplate: 'multi_array_dints', programTemplate: 'MainProgram', key: 'firstArray' },
          { tagTemplate: 'multi_array_dints_1', programTemplate: 'MainProgram', key: 'secondArray' },
          { tagTemplate: 'multi_array_strings', programTemplate: 'MainProgram', key: 'strArray' }
        ],
        destinationPath: 'destination'
      };
      const node = new AllenBradleyReadNode('id', [['nid1']], config);
      const output = await node.run({ externalTimeout: 10000 }, {});
      output[1].destination.should.deepEqual({
        plcProperties: PLC_PROPS,
        testCustomString: '',
        testCustomStringCont: '',
        testDint: 23456,
        testDintCont: 23456,
        testBooleanCont: false,
        firstArray: 100,
        secondArray: 0,
        strArray: 'hello'
      });
    });
    it('should timeout', async () => {
      const config = {
        hostTemplate: '192.168.5.10',
        slotTemplate: 0,
        keepRateTemplate: 200,
        readInstructions: [
          { tagTemplate: 'test_bool', programTemplate: 'MainProgram', key: 'testBoolean' },
          { tagTemplate: 'test_custom_string', programTemplate: 'MainProgram', key: 'testCustomString' },
          { tagTemplate: 'test_dint', programTemplate: 'MainProgram', key: 'testDint' },
          { tagTemplate: 'test_bool', programTemplate: '', key: 'testBooleanCont' },
          { tagTemplate: 'test_custom_string', programTemplate: '', key: 'testCustomStringCont' },
          { tagTemplate: 'test_dint', programTemplate: '', key: 'testDintCont' }
        ],
        destinationPath: 'destination'
      };
      const node = new AllenBradleyReadNode('id', [['nid1']], config);
      const startTime = Date.now();
      const externalTimeout = 50;
      const output = await node.run({ externalTimeout }, {});
      const endTime = Date.now();
      output[1].destination.errors.should.deepEqual([{
        type: 'Allen-Bradley_READ_ERROR',
        message: 'TIMEOUT occurred while writing Reading Tag Group.'
      }]);
      (endTime - startTime).should.be.greaterThanOrEqual(externalTimeout);
    });

    it('should handle error when reading non existing tags', async () => {
      const config = {
        hostTemplate: '192.168.5.10',
        slotTemplate: 0,
        keepRateTemplate: 200,
        readInstructions: [
          { tagTemplate: 'test_does_not_exist', programTemplate: 'MainProgram', key: 'badTag' }
        ],
        destinationPath: 'destination'
      };
      const node = new AllenBradleyReadNode('id', [['nid1']], config);
      const externalTimeout = 5000;
      const output = await node.run({ externalTimeout }, {});
      output[1].destination.errors.should.deepEqual([{
        type: 'Allen-Bradley_READ_ERROR',
        message: 'Tag not found.',
        tag: 'test_does_not_exist',
        key: 'badTag'
      }]);
    });

    it('should read first item from an array', async () => {
      const config = {
        hostTemplate: '192.168.5.10',
        slotTemplate: 0,
        keepRateTemplate: 200,
        readInstructions: [
          { tagTemplate: 'test_udt_1.array_of_dints', programTemplate: 'MainProgram', key: 'ints' }
        ],
        destinationPath: 'destination'
      };
      const node = new AllenBradleyReadNode('id', [['nid1']], config);
      const firstRead = await node.run({ externalTimeout: 30000 }, {});
      firstRead[1].destination.should.deepEqual({
        plcProperties: PLC_PROPS,
        ints: 3
      });
      node.readInstructions = [
        { tagTemplate: 'test_udt_1.array_of_dints', programTemplate: 'MainProgram', key: 'ints', lengthTemplate: 1 }
      ];
      const secondRead = await node.run({ externalTimeout: 30000 }, {});
      secondRead[1].destination.should.deepEqual({
        plcProperties: PLC_PROPS,
        ints: firstRead[1].destination.ints
      });
    });

    it('should do weird reads properly', async () => {
      const config = {
        hostTemplate: '192.168.5.10',
        slotTemplate: 0,
        keepRateTemplate: 200,
        readInstructions: [
          { tagTemplate: 'test_dint.0', programTemplate: 'MainProgram', key: 'test_int' },
          { tagTemplate: 'test_dint', programTemplate: 'MainProgram', key: 'test_int1' },
          { tagTemplate: 'multi_array_dints', programTemplate: 'MainProgram', key: 'firstArray', lengthTemplate: 3 },
          { tagTemplate: 'test_udt_1', programTemplate: 'MainProgram', key: 'all' },
          { tagTemplate: 'test_udt_1.bool_1', programTemplate: 'MainProgram', key: 'bool_1' },
          { tagTemplate: 'test_udt_1.array_of_strings', programTemplate: 'MainProgram', key: 'strings_list', lengthTemplate: 15 },
          { tagTemplate: 'test_udt_1.array_of_ints[0]', programTemplate: 'MainProgram', key: 'oneInt' },
          { tagTemplate: 'test_udt_1.array_of_strings[0]', programTemplate: '', key: 'oneStr' },
          { tagTemplate: 'test_dint.34', programTemplate: 'MainProgram', key: 'test_int34' },
          { tagTemplate: 'test_udt_1.array_of_dints', programTemplate: 'MainProgram', key: 'ints', lengthTemplate: 10 }
        ],
        destinationPath: 'destination'
      };
      const node = new AllenBradleyReadNode('id', [['nid1']], config);
      const output = await node.run({ externalTimeout: 30000 }, {});
      output[1].destination.should.deepEqual({
        errors: [{
          type: 'Allen-Bradley_READ_ERROR',
          message: 'Tag bit index must be between 0 and 31, received 34',
          key: 'test_int34',
          tag: 'test_dint.34'
        }],
        plcProperties: PLC_PROPS,
        all: {
          array_of_ints: [
            1, 0, 0, 0, 0,
            0, 0, 0, 0, 0
          ],
          ZZZZZZZZZZtest_udt_11: 0,
          bool_1: false,
          array_of_strings: [
            'newValue', 'oneVaue', 'two', 'boo', 'foo', '',
            '', '', '', '', '', '',
            '', '', ''
          ],
          array_of_dints: [
            3, 88, 99, 0,
            0, 0, 0, 0, 0, 0
          ]
        },
        ints: output[1].destination.all?.array_of_dints,
        bool_1: false,
        strings_list: output[1].destination.all?.array_of_strings,
        oneInt: output[1].destination.all?.array_of_ints[0],
        test_int: false,
        test_int1: 23456,
        firstArray: [ 100, 2, 3 ],
        oneStr: 'three'
      });
    }).timeout(60 * 1000);
  });
});
