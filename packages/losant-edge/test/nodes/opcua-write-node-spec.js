import '../common.js';
import WriteOpcUa from '../../src/nodes/opcua-write-node.js';
import ReadOpcUa from '../../src/nodes/opcua-read-node.js';
import errors from 'losant-nodejs-utils/src/errors.js';

describe('OPC UA Write Node', () => {
  it('should throw an error if write instructions are empty', async () => {
    const node = new WriteOpcUa('id', [['nid1']], {});
    return node.run({}, {}).should.be.rejectedWith(errors.Validation({ message: 'writeInstructions are required for OPC UA write.' }));
  });
  it('should throw an error if namespace is empty', async () => {
    const node = new WriteOpcUa('id', [['nid1']], { writeInstructions: [ { nameSpaceTemplate: '', identifierTemplate: 'App' } ] });
    return node.run({}, {}).should.be.rejectedWith(errors.Validation({ message: 'Namespace Index is required.' }));
  });
  it('should throw an error if namespace is not an integer', async () => {
    const node = new WriteOpcUa('id', [['nid1']], { writeInstructions: [ { nameSpaceTemplate: 'two', identifierTemplate: 'App' } ] });
    return node.run({}, {}).should.be.rejectedWith(errors.Validation({ message: 'Namespace Index must be a valid integer.' }));
  });
  it('should throw an error if namespace is a negative', async () => {
    const node = new WriteOpcUa('id', [['nid1']], { writeInstructions: [ { nameSpaceTemplate: '-2', identifierTemplate: 'App' } ] });
    return node.run({}, {}).should.be.rejectedWith(errors.Validation({ message: 'Namespace must be an integer between 0 and 255.' }));
  });
  it('should throw an error if URI is empty', async () => {
    const config = {
      uriTemplate: '',
      securityPolicyTemplate: '',
      securityModeTemplate: '',
      writeInstructions: [
        { nameSpaceTemplate: '2', identifierTemplate: 's=Application.Main.int_test', valueTemplate: 5 }
      ],
      destinationPath: 'destination'
    };
    const node = new WriteOpcUa('id', [['nid1']], config );
    return node.run({}, {}).should.be.rejectedWith({ message: 'OPC UA URI endpoint is required.' });
  });
  it('should throw an error if security mode is none while policy exists', async () => {
    const config = {
      uriTemplate: 'opc.tcp://192.168.1.2:1234',
      securityPolicyTemplate: 'Basic256Rsa15',
      securityModeTemplate: '',
      writeInstructions: [
        { nameSpaceTemplate: '2', identifierTemplate: 's=Application.Main.int_test', valueTemplate: 5 }
      ],
      destinationPath: 'destination'
    };
    const node = new WriteOpcUa('id', [['nid1']], config );
    return node.run({}, {}).should.be.rejectedWith({ message: 'Security mode must be provided if security policy is provided.' });
  });
  it('should error for missing node', async () => {
    const randomVal = Math.random();
    const config = {
      uriTemplate: 'opc.tcp://localhost:4335/UA/Server',
      securityPolicyTemplate: 'None',
      securityModeTemplate: 'None',
      writeInstructions: [
        { nameSpaceTemplate: '1', identifierTemplate: 's=Something', valueTemplate: randomVal }
      ],
      destinationPath: 'destination'
    };
    const node = new WriteOpcUa('id', [['nid1']], config );
    const output =  await node.run({ flowVersionId: '123' }, {});
    output[1].destination.errors[0].should.deepEqual({
      type: 'OPC-UA_WRITE_ERROR',
      message: 'The node id refers to a node that does not exist in the server address space.'
    });
  });
  it('should write a double to a byte string ID', async () => {
    const randomVal = Math.random();
    const config = {
      uriTemplate: 'opc.tcp://localhost:4335/UA/Server',
      securityPolicyTemplate: 'None',
      securityModeTemplate: 'None',
      writeInstructions: [
        { nameSpaceTemplate: '1', identifierTemplate: 'b=1020FFAA', valueTemplate: randomVal }
      ],
      destinationPath: 'destination'
    };
    const node = new WriteOpcUa('id', [['nid1']], config );
    const output =  await node.run({ flowVersionId: '123' }, {});
    output[1].destination.write.should.equal('success');

    // verify new value
    const config2 = {
      uriTemplate: 'opc.tcp://localhost:4335/UA/Server',
      securityPolicyTemplate: 'None',
      securityModeTemplate: 'None',
      readInstructions: [
        { nameSpaceTemplate: '1', identifierTemplate: 'b=1020FFAA', key: 'val' }
      ],
      destinationPath: 'destination'
    };
    const node2 = new ReadOpcUa('id', [['nid1']], config2 );
    const output2 =  await node2.run({ flowVersionId: '123' }, {});
    output2[1].destination.val.should.equal(randomVal);
  });
  it('should write a string to node', async () => {
    const dateNow = new Date();
    const dayTime = dateNow.toLocaleTimeString();
    const config = {
      uriTemplate: 'opc.tcp://localhost:4335/UA/Server',
      securityPolicyTemplate: 'None',
      securityModeTemplate: 'None',
      writeInstructions: [
        { nameSpaceTemplate: '1', identifierTemplate: 's=MyVar3', valueTemplate: dayTime }
      ],
      destinationPath: 'destination'
    };
    const node = new WriteOpcUa('id', [['nid1']], config );
    const output =  await node.run({ flowVersionId: '123' }, {});
    output[1].destination.write.should.equal('success');

    // verify new value
    const config2 = {
      uriTemplate: 'opc.tcp://localhost:4335/UA/Server',
      securityPolicyTemplate: 'None',
      securityModeTemplate: 'None',
      readInstructions: [
        { nameSpaceTemplate: '1', identifierTemplate: 's=MyVar3', key: 'val' }
      ],
      destinationPath: 'destination'
    };
    const node2 = new ReadOpcUa('id', [['nid1']], config2 );
    const output2 =  await node2.run({ flowVersionId: '123' }, {});
    output2[1].destination.val.should.equal(dayTime);
  });
  it('should error when node is an array but value is not', async () => {
    const randomVal = Math.random();
    const config = {
      uriTemplate: 'opc.tcp://localhost:4335/UA/Server',
      securityPolicyTemplate: 'None',
      securityModeTemplate: 'None',
      writeInstructions: [
        { nameSpaceTemplate: '1', identifierTemplate: 's=MyVar4', valueTemplate: randomVal }
      ],
      destinationPath: 'destination'
    };
    const node = new WriteOpcUa('id', [['nid1']], config );
    const output =  await node.run({ flowVersionId: '123' }, {});
    output[1].destination.errors[0].should.deepEqual({
      type: 'OPC-UA_WRITE_ERROR',
      message: 'Value must also be an array when writing to an array node.'
    });
  });
  it('should write to an array', async () => {
    const randomVal = Math.random();
    const config = {
      uriTemplate: 'opc.tcp://localhost:4335/UA/Server',
      securityPolicyTemplate: 'None',
      securityModeTemplate: 'None',
      writeInstructions: [
        {
          nameSpaceTemplate: '1',
          identifierTemplate: 's=MyVar4',
          sourceTypeTemplate: 'path',
          valueTemplate: 'arrayVal'
        }
      ],
      destinationPath: 'destination'
    };
    const node = new WriteOpcUa('id', [['nid1']], config );
    const output =  await node.run({ flowVersionId: '123' }, { arrayVal: [randomVal+1, randomVal+2, randomVal+3, randomVal+4] });
    output[1].destination.write.should.equal('success');

    // verify new value
    const config2 = {
      uriTemplate: 'opc.tcp://localhost:4335/UA/Server',
      securityPolicyTemplate: 'None',
      securityModeTemplate: 'None',
      readInstructions: [
        { nameSpaceTemplate: '1', identifierTemplate: 's=MyVar4', key: 'val' }
      ],
      destinationPath: 'destination'
    };
    const node2 = new ReadOpcUa('id', [['nid1']], config2 );
    const output2 =  await node2.run({ flowVersionId: '123' }, {});
    output2[1].destination.val.should.deepEqual([randomVal+1, randomVal+2, randomVal+3, randomVal+4]);
  });
  it('should write multiple values to nodes', async () => {
    const randomVal = Math.random();
    const dateNow = new Date();
    const dayTime = dateNow.toLocaleTimeString();
    const config = {
      uriTemplate: 'opc.tcp://localhost:4335/UA/Server',
      securityPolicyTemplate: 'None',
      securityModeTemplate: 'None',
      writeInstructions: [
        { nameSpaceTemplate: '1', identifierTemplate: 'b=1020FFAA', valueTemplate: randomVal },
        { nameSpaceTemplate: '1', identifierTemplate: 's=MyVar3', valueTemplate: dayTime }
      ],
      destinationPath: 'destination'
    };
    const node = new WriteOpcUa('id', [['nid1']], config );
    const output =  await node.run({ flowVersionId: '123' }, {});
    output[1].destination.write.should.equal('success');

    // verify new value
    const config2 = {
      uriTemplate: 'opc.tcp://localhost:4335/UA/Server',
      securityPolicyTemplate: 'None',
      securityModeTemplate: 'None',
      readInstructions: [
        { nameSpaceTemplate: '1', identifierTemplate: 'b=1020FFAA', key: 'val1' },
        { nameSpaceTemplate: '1', identifierTemplate: 's=MyVar3', key: 'val2' }
      ],
      destinationPath: 'destination'
    };
    const node2 = new ReadOpcUa('id', [['nid1']], config2 );
    const output2 =  await node2.run({ flowVersionId: '123' }, {});
    output2[1].destination.val1.should.equal(randomVal);
    output2[1].destination.val2.should.equal(dayTime);
  });
  it('should write a double to a byte string ID from a payload path', async () => {
    const randomVal = Math.random();
    const config = {
      uriTemplate: 'opc.tcp://localhost:4335/UA/Server',
      securityPolicyTemplate: 'None',
      securityModeTemplate: 'None',
      writeInstructionsType: 'payloadPath',
      writeInstructions: 'instructions',
      destinationPath: 'destination'
    };
    const node = new WriteOpcUa('id', [['nid1']], config );
    const output =  await node.run({ flowVersionId: '123' }, {
      instructions: [
        { nameSpace: '1', identifier: 'b=1020FFAA', value: randomVal }
      ]
    });
    output[1].destination.write.should.equal('success');

    // verify new value
    const config2 = {
      uriTemplate: 'opc.tcp://localhost:4335/UA/Server',
      securityPolicyTemplate: 'None',
      securityModeTemplate: 'None',
      readInstructions: [
        { nameSpaceTemplate: '1', identifierTemplate: 'b=1020FFAA', key: 'val' }
      ],
      destinationPath: 'destination'
    };
    const node2 = new ReadOpcUa('id', [['nid1']], config2 );
    const output2 =  await node2.run({ flowVersionId: '123' }, {});
    output2[1].destination.val.should.equal(randomVal);
  });
});
