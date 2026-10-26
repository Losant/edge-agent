import { should } from '../common.js';
import WriteAllenBradley from '../../src/nodes/allen-bradley-write-node.js';
import ReadAllenBradley from '../../src/nodes/allen-bradley-read-node.js';
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

const DEFAULT_CONFIG = {
  hostTemplate: '192.168.5.10',
  slotTemplate: 0,
  destinationPath: 'destination'
};

describe('Allen-Bradley Write Node', () => {
  it('should pass with boolean string but fail with host', async () => {
    const node = new WriteAllenBradley('id', [['nid1']], { writeInstructions: [ { tagTemplate: 'tag', programTemplate: 'My_Program', valueTemplate: 'false' } ] });
    return node.run({ externalTimeout: 30000 }, {}).should.be.rejectedWith(errors.Validation({ message: 'Host is required.' }));
  });
  it('should error when trying to write more than the max allowed values in an array', async () => {
    const writeNode = new WriteAllenBradley('id', [['nid1']], {
      ...DEFAULT_CONFIG,
      writeInstructions: [ { valueTemplate: new Array(300).fill('1'), tagTemplate: 'array_of_dints', programTemplate: 'MainProgram' } ]
    });
    await writeNode.run({ externalTimeout: 2000 }, {}).should.be.rejectedWith({
      message: 'Value has excceed max length of 255.'
    });
  });
  describe.skip('Real Allen Bradley Machine', () => {
    [
      { instruct: { tagTemplate: 'test_dint.0', programTemplate: 'MainProgram', key: 'test_int' }, values: [ true, false ] },
      { instruct: { tagTemplate: 'test_bool', programTemplate: 'MainProgram', key: 'testBoolean' }, values: [ true, false ] },
      { instruct: { tagTemplate: 'test_bool', programTemplate: '', key: 'testBoolean' }, values: [ true, false ] },
      { instruct: { tagTemplate: 'test_udt_1.bool_1', programTemplate: 'MainProgram', key: 'testBoolean' }, values: [ true, false ] },
      { instruct: { tagTemplate: 'test_custom_string', programTemplate: 'MainProgram', key: 'test_custom_string' }, values: [ 'hey prog2', 'hey cont2' ] },
      { instruct: { tagTemplate: 'test_custom_string', programTemplate: '', key: 'test_custom_string' }, values: [ 'hey prog2', 'hey cont2' ] },
      { instruct: { tagTemplate: 'test_string', programTemplate: 'MainProgram', key: 'testString' }, values: [ 'really really really really long name', 'short1' ] },
      { instruct: { tagTemplate: 'test_dint', programTemplate: 'MainProgram', key: 'dInt' }, values: [ 12345, 23456 ] },
      { instruct: { tagTemplate: 'test_dint', programTemplate: '', key: 'dInt' }, values: [ 12345, 23456 ] },
      { instruct: { tagTemplate: 'Program:MainProgram.test_dint', programTemplate: '', key: 'dInt' }, values: [ 112345, 23456 ] },
      { instruct: { tagTemplate: 'test_udt_1.array_of_strings[0]', programTemplate: '', key: 'dInt' }, values: [ 'foo', 'bar' ] },
      { instruct: { tagTemplate: 'multi_array_dints[0,0,0]', programTemplate: '', key: 'dInt' }, values: [ 1, 2 ] },
      { instruct: { tagTemplate: 'multi_array_dints[1,1,0]', programTemplate: '', key: 'dInt' }, values: [ 1, 2 ] },
      { instruct: { tagTemplate: 'multi_array_strings[1,1,0]', programTemplate: '', key: 'dInt' }, values: [ 1234 ], outputs: [ '1234' ] },
      { instruct: { tagTemplate: 'multi_array_strings[1,1,1]', programTemplate: '', key: 'dInt' }, values: [ 3456 ], outputs: [ '3456' ] },
      { instruct: { tagTemplate: 'test_udt_1.array_of_strings', programTemplate: '', key: 'dInt', lengthTemplate: 2 }, values: [ [ 'one', 'two' ], [ 'three', 'four' ] ] },
      { instruct: { tagTemplate: 'test_udt_1.array_of_dints', programTemplate: 'MainProgram', key: 'ints', lengthTemplate: 3 }, values: [ [ 111, 222, 333 ], [ 44, 88, 99 ] ] },
      { instruct: { tagTemplate: 'test_udt_1.array_of_dints', programTemplate: 'MainProgram', key: 'firstIntOfList' }, values: [ 1, 2, 3 ] },
      { instruct: { tagTemplate: 'test_udt_1.array_of_ints', programTemplate: 'MainProgram', key: 'firstIntWithLength', lengthTemplate: 1 }, values: [ 3, 2, 1 ] }
    ].forEach(({ instruct, values, outputs = [] }) => {
      values.forEach((value, i) => {
        it(`should write to ${value} to ${instruct.tagTemplate}`, async () => {
          const externalTimeout = 30000;

          const writeNode = new WriteAllenBradley('id', [['nid1']], {
            ...DEFAULT_CONFIG,
            writeInstructions: [ { valueTemplate: value, tagTemplate: instruct.tagTemplate, programTemplate: instruct.programTemplate } ]
          });
          const writeOutput = await writeNode.run({ externalTimeout }, {});
          writeOutput[1].destination.should.deepEqual({
            write: 'success',
            plcProperties: PLC_PROPS
          });
          should.not.exist(writeOutput[1].destination.errors);
          writeOutput[1].destination.write.should.equal('success');

          const readNode = new ReadAllenBradley('id', [['nid1']], {
            ...DEFAULT_CONFIG,
            readInstructions: [ { tagTemplate: instruct.tagTemplate, programTemplate: instruct.programTemplate, key: instruct.key, lengthTemplate: instruct.lengthTemplate } ]
          });
          const readOutput = await readNode.run({ externalTimeout }, {});
          should.not.exist(readOutput[1].destination.errors);
          readOutput[1].destination.should.deepEqual({
            [instruct.key]: outputs[i] || value,
            plcProperties: PLC_PROPS
          });
        }).timeout(60 * 1000);
      });
    });
    it('should handle writing to non existing tags', async () => {
      const config = {
        hostTemplate: '192.168.5.10',
        slotTemplate: 0,
        keepRateTemplate: 200,
        writeInstructions: [
          { tagTemplate: 'test_does_not_exist', programTemplate: 'MainProgram', valueTemplate: 'badTag' },
          { tagTemplate: 'test_udt_1.bool_1.does_not_exist', programTemplate: 'MainProgram', valueTemplate: 'badTag2' },
          { tagTemplate: 'test_udt_1.bool_1.0', programTemplate: 'MainProgram', valueTemplate: 0 }
        ],
        destinationPath: 'destination'
      };
      const node1 = new WriteAllenBradley('id', [['nid1']], config);
      const externalTimeout = 30000;
      const output1 = await node1.run({ externalTimeout }, {});
      output1[1].destination.write.should.equal('fail');
      output1[1].destination.errors.should.deepEqual([
        {
          type: 'Allen-Bradley_WRITE_ERROR',
          message: 'Tag not found.',
          tag: 'test_does_not_exist'
        },
        {
          type: 'Allen-Bradley_WRITE_ERROR',
          message: 'Tag not found.',
          tag: 'test_udt_1.bool_1.does_not_exist'
        },
        {
          type: 'Allen-Bradley_WRITE_ERROR',
          message: 'Bit Indexes can only be used on SINT, INT, DINT, or BIT_STRING data types.'
        }
      ]);
    }).timeout(51 * 1000);
    it('should writing and reading int arrays', async () => {
      const input = [ 100, 2, 3 ];
      let config = {
        hostTemplate: '192.168.5.10',
        slotTemplate: 0,
        keepRateTemplate: 200,
        writeInstructionsType: 'payloadPath',
        writeInstructions: 'instructions',
        destinationPath: 'destination'
      };
      const node1 = new WriteAllenBradley('id', [['nid1']], config);
      const externalTimeout = 30000;
      const output1 = await node1.run({ externalTimeout }, {
        instructions: [
          { tag: 'multi_array_dints', program: 'MainProgram', value: input }
        ]
      });
      output1[1].destination.should.deepEqual({
        plcProperties: PLC_PROPS,
        write: 'success'
      });
      config = {
        hostTemplate: '192.168.5.10',
        slotTemplate: 0,
        keepRateTemplate: 200,
        readInstructions: [
          { tagTemplate: 'multi_array_dints', programTemplate: 'MainProgram', key: 'array', lengthTemplate: input.length }
        ],
        destinationPath: 'destination'
      };
      const node2 = new ReadAllenBradley('id', [['nid1']], config);
      const output2 = await node2.run({ externalTimeout }, {});
      output2[1].destination.should.deepEqual({
        plcProperties: PLC_PROPS,
        array: input
      });
      should.exist(output2);
      should.not.exist(output2[1].destination.errors);
      output2[1].destination.array.should.deepEqual(input);
    }).timeout(51 * 1000);
    it('should writing and reading multi dimensional str arrays', async () => {
      const input = [ 'hello', 'world', 'there' ];
      let config = {
        hostTemplate: '192.168.5.10',
        slotTemplate: 0,
        keepRateTemplate: 200,
        writeInstructionsType: 'payloadPath',
        writeInstructions: 'instructions',
        destinationPath: 'destination'
      };
      const node1 = new WriteAllenBradley('id', [['nid1']], config);
      const externalTimeout = 30000;
      const output1 = await node1.run({ externalTimeout }, {
        instructions: [
          { tag: 'multi_array_strings', program: 'MainProgram', value: input }
        ]
      });
      output1[1].destination.write.should.equal('success');
      config = {
        hostTemplate: '192.168.5.10',
        slotTemplate: 0,
        keepRateTemplate: 200,
        readInstructions: [
          { tagTemplate: 'multi_array_strings', programTemplate: 'MainProgram', key: 'array', lengthTemplate: '3' }
        ],
        destinationPath: 'destination'
      };
      const node2 = new ReadAllenBradley('id', [['nid1']], config);
      const output2 = await node2.run({ externalTimeout }, {});
      should.exist(output2);
      should.not.exist(output2[1].destination.errors);
      output2[1].destination.array.should.deepEqual(input);
    }).timeout(51 * 1000);
    it('should writing and reading str arrays', async () => {
      const externalTimeout = 30000;
      const input = [ 'newValue', 'oneVaue', 'two', 'boo', 'foo' ];
      let config = {
        hostTemplate: '192.168.5.10',
        slotTemplate: 0,
        keepRateTemplate: 200,
        writeInstructions: [
          { tagTemplate: 'test_udt_1.array_of_strings', programTemplate: 'MainProgram', valueTemplate: input }
        ],
        destinationPath: 'destination'
      };
      const node1 = new WriteAllenBradley('id', [['nid1']], config);
      const output1 = await node1.run({ externalTimeout });
      output1[1].destination.write.should.equal('success');
      config = {
        hostTemplate: '192.168.5.10',
        slotTemplate: 0,
        keepRateTemplate: 200,
        readInstructions: [
          { tagTemplate: 'test_udt_1.array_of_strings', programTemplate: 'MainProgram', lengthTemplate: 5, key: 'array' }
        ],
        destinationPath: 'destination'
      };
      const node2 = new ReadAllenBradley('id', [['nid1']], config);
      const output2 = await node2.run({ externalTimeout }, {});
      should.not.exist(output2[1].destination.errors);
      output2[1].destination.array.should.deepEqual(input);
    }).timeout(51 * 1000);

    it('should writing,and reading empty strings', async () => {
      let config = {
        hostTemplate: '192.168.5.10',
        slotTemplate: 0,
        keepRateTemplate: 200,
        writeInstructionsType: 'payloadPath',
        writeInstructions: 'instructions',
        destinationPath: 'destination'
      };
      const node1 = new WriteAllenBradley('id', [['nid1']], config);
      const externalTimeout = 30000;
      const output1 = await node1.run({ externalTimeout }, {
        instructions: [
          { tag: 'test_custom_string', program: 'MainProgram', value: '' },
          { tag: 'test_string', program: 'MainProgram', value: '' }
        ]
      });
      output1[1].destination.write.should.equal('success');
      config = {
        hostTemplate: '192.168.5.10',
        slotTemplate: 0,
        keepRateTemplate: 200,
        readInstructions: [
          { tagTemplate: 'test_custom_string', programTemplate: 'MainProgram', key: 'str' },
          { tagTemplate: 'test_string', programTemplate: 'MainProgram', key: 'str1' }
        ],
        destinationPath: 'destination'
      };
      const node2 = new ReadAllenBradley('id', [['nid1']], config);
      const output2 = await node2.run({ externalTimeout }, {});
      output2[1].destination.str.should.equal('');
      output2[1].destination.str1.should.equal('');
      should.exist(output2);
      should.not.exist(output2[1].destination.errors);
    }).timeout(51 * 1000);
    it('should place an error on the payload when value is empty for booleans or numbers', async () => {
      const node = new WriteAllenBradley('id', [['nid1']], {
        ...DEFAULT_CONFIG,
        writeInstructions: [
          { tagTemplate: 'test_bool', programTemplate: '', valueTemplate: '' },
          { tagTemplate: 'test_dint', programTemplate: '', valueTemplate: '' }

        ]
      });
      const result = await node.run({ externalTimeout: 30000 }, {});
      result[1].destination.errors.should.deepEqual([
        {
          type: 'Allen-Bradley_WRITE_ERROR',
          message: 'Value is required.',
          tag: 'test_bool'
        },
        {
          type: 'Allen-Bradley_WRITE_ERROR',
          message: 'Value is required.',
          tag: 'test_dint'
        }
      ]);
    }).timeout(51 * 1000);
  });

});
