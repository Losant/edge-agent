import '../common.js';
import ModbusWriteNode from '../../src/nodes/modbus-write-node.js';
import ModbusReadNode from '../../src/nodes/modbus-read-node.js';
import modbusTestFramework from '../lib/modbus-test-framework.js';

let currentRegisters = { };
const vector = {
  setRegister: function(addr, value) {
    if (addr === 6) { throw new Error('fake error'); }
    currentRegisters[addr] = value;
  },
  getHoldingRegister: function(addr) {
    if (addr === 6) { throw new Error('fake error'); }
    return currentRegisters[addr];
  }
};

const commonAbstractTests = (serverWrapper) => {

  it('should correctly read written values', async function() {
    const configRead = {
      ...serverWrapper.basicNodeConfig,
      readInstructions: [
        { typeTemplate: 'holding-register', addressTemplate: 4, key: 'output1' },
        { typeTemplate: 'holding-register', addressTemplate: 5, key: 'output2' },
        { typeTemplate: 'holding-register', addressTemplate: 6, key: 'output3' }

      ],
      destinationPath: 'readDestination'
    };
    const configWrite = {
      ...serverWrapper.basicNodeConfig,
      writeInstructions: [
        { typeTemplate: 'holding-register', addressTemplate: 4, valueTemplate: 100, key: 'output1' },
        { typeTemplate: 'holding-register', addressTemplate: 5, valueTemplate: 101 },
        { typeTemplate: 'holding-register', addressTemplate: 6, valueTemplate: 102 }
      ],
      destinationPath: 'writeDestination'
    };
    const payload = { data: { ...serverWrapper.basicNodeData } };


    const readNode = new ModbusReadNode('id', [[]], configRead);
    const writeNode = new ModbusWriteNode('id', [[]], configWrite);

    let result = await readNode.run({}, payload);
    result[1].readDestination.should.deepEqual({
      output1: [ 123 ],
      output2: [ 0 ],
      errors: [ {
        message: 'Modbus exception 4: Slave device failure (device reports internal error)',
        type: 'MODBUS_READ_ERROR'
      } ]
    });

    result = await writeNode.run({}, payload);
    result[1].writeDestination.should.deepEqual({
      'output1': true,
      'addr-5': true,
      'errors': [ {
        message: 'Modbus exception 4: Slave device failure (device reports internal error)',
        type: 'MODBUS_WRITE_ERROR'
      } ]
    });

    result = await readNode.run({}, payload);
    result[1].readDestination.should.deepEqual({
      output1: [ 100 ],
      output2: [ 101 ],
      errors: [ {
        message: 'Modbus exception 4: Slave device failure (device reports internal error)',
        type: 'MODBUS_READ_ERROR'
      } ]
    });
  });
};

describe('Modbus Read And Write Nodes', () => {

  beforeEach(() => {
    currentRegisters = { 4: 123 };
  });

  modbusTestFramework({
    vector,
    sharedTestGenerator: commonAbstractTests
  });

});
