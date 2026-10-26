import '../common.js';
import CallOpcUa from '../../src/nodes/opcua-call-node.js';
import errors from 'losant-nodejs-utils/src/errors.js';

describe('OPC UA Call Node', () => {
  // many test are covered within opcua-read-spec
  it('should throw an error if call instructions are empty', async () => {
    const node = new CallOpcUa('id', [['nid1']], {});
    return node.run({}, {}).should.be.rejectedWith(errors.Validation({ message: 'Call Instructions are required for OPC UA Call Node.' }));
  });
  it('should throw an error if call instructions path is missing', async () => {
    const node = new CallOpcUa('id', [['nid1']], { callInstructionsType: 'payloadPath', callInstructions: 'instructs' });
    return node.run({}, {}).should.be.rejectedWith(errors.Validation({ message: 'Each call instruction must be an object.' }));
  });
  it('should throw an error if object namespace is empty', async () => {
    const node = new CallOpcUa('id', [['nid1']], { callInstructions: { nameSpaceTemplate: '', identifierTemplate: 'App' } });
    return node.run({}, {}).should.be.rejectedWith(errors.Validation({ message: 'Object Namespace Index is required.' }));
  });
  it('should throw an error if object namespace is not an integer', async () => {
    const node = new CallOpcUa('id', [['nid1']], { callInstructions: { nameSpaceTemplate: 'two', identifierTemplate: 'App' } });
    return node.run({}, {}).should.be.rejectedWith(errors.Validation({ message: 'Object Namespace Index must be a valid integer.' }));
  });
  it('should throw an error if object namespace is a negative', async () => {
    const node = new CallOpcUa('id', [['nid1']], { callInstructions: { nameSpaceTemplate: '-2', identifierTemplate: 'App' } });
    return node.run({}, {}).should.be.rejectedWith(errors.Validation({ message: 'Object Namespace must be an integer between 0 and 255.' }));
  });
  it('should throw an error if method namespace is empty', async () => {
    const node = new CallOpcUa('id', [['nid1']], { callInstructions: { nameSpaceTemplate: '2', identifierTemplate: 's=App' } });
    return node.run({}, {}).should.be.rejectedWith(errors.Validation({ message: 'Method Namespace Index is required.' }));
  });
  it('should throw an error if method namespace is not an integer', async () => {
    const node = new CallOpcUa('id', [['nid1']], {
      callInstructions: {
        nameSpaceTemplate: '1',
        identifierTemplate: 'i=1000',
        methodNsTemplate: 'amp',
        methodIdTemplate: 'i=1050'
      }
    } );
    return node.run({}, {}).should.be.rejectedWith(errors.Validation({ message: 'Method Namespace Index must be a valid integer.' }));
  });
  it('should throw an error if method namespace is a negative', async () => {
    const node = new CallOpcUa('id', [['nid1']], {
      callInstructions: {
        nameSpaceTemplate: '1',
        identifierTemplate: 'i=1000',
        methodNsTemplate: '-2',
        methodIdTemplate: 'i=1050'
      }
    } );
    return node.run({}, {}).should.be.rejectedWith(errors.Validation({ message: 'Method Namespace must be an integer between 0 and 255.' }));
  });
  it('should throw an error if data type is missing', async () => {
    const config = {
      uriTemplate: 'opc.tcp://localhost:4335/UA/Server',
      securityPolicyTemplate: 'None',
      securityModeTemplate: 'None',
      destinationPath: 'destination',
      callInstructions: {
        nameSpaceTemplate: '1',
        identifierTemplate: 'i=1000',
        methodNsTemplate: '1',
        methodIdTemplate: 'i=1050',
        methodArguments: [
          {
            dataTypeTemplate: '',
            arrayTypeTemplate: 'h h',
            valueTemplate: '3'
          }
        ]
      }
    };
    const node = new CallOpcUa('id', [['nid1']], config );
    return node.run({ flowVersionId: '123' }, {}).should.be.rejectedWith('Data Type is required.');
  });
  it('should throw an error on non OPC UA data types', async () => {
    const config = {
      uriTemplate: 'opc.tcp://localhost:4335/UA/Server',
      securityPolicyTemplate: 'None',
      securityModeTemplate: 'None',
      destinationPath: 'destination',
      callInstructions: {
        nameSpaceTemplate: '1',
        identifierTemplate: 'i=1000',
        methodNsTemplate: '1',
        methodIdTemplate: 'i=1050',
        methodArguments: [
          {
            dataTypeTemplate: 'Big Number',
            arrayTypeTemplate: 'h h',
            valueTemplate: '3'
          }
        ]
      }
    };
    const node = new CallOpcUa('id', [['nid1']], config );
    return node.run({ flowVersionId: '123' }, {}).should.be.rejectedWith('"Big Number" is not a valid/supported OPC UA data type.');
  });
  it('should throw an error on non OPC UA array types', async () => {
    const config = {
      uriTemplate: 'opc.tcp://localhost:4335/UA/Server',
      securityPolicyTemplate: 'None',
      securityModeTemplate: 'None',
      destinationPath: 'destination',
      callInstructions: {
        nameSpaceTemplate: '1',
        identifierTemplate: 'i=1000',
        methodNsTemplate: '1',
        methodIdTemplate: 'i=1050',
        methodArguments: [
          {
            dataTypeTemplate: 'UInt32',
            arrayTypeTemplate: 'hmmm',
            valueTemplate: '3'
          }
        ]
      }
    };
    const node = new CallOpcUa('id', [['nid1']], config );
    return node.run({ flowVersionId: '123' }, {}).should.be.rejectedWith('"hmmm" is not a valid/supported OPC UA array type.');
  });
  it('should error for missing method argument', async () => {
    const config = {
      uriTemplate: 'opc.tcp://localhost:4335/UA/Server',
      securityPolicyTemplate: 'None',
      securityModeTemplate: 'None',
      destinationPath: 'destination',
      callInstructions: {
        nameSpaceTemplate: '1',
        identifierTemplate: 'i=1000',
        methodNsTemplate: '1',
        methodIdTemplate: 'i=1059',
        methodArguments: [
          {
            dataTypeTemplate: 'UInt32',
            valueTemplate: '3'
          }
        ]
      }
    };
    const node = new CallOpcUa('id', [['nid1']], config );
    const output =  await node.run({ flowVersionId: '123' }, {});
    output[1].destination.errors[0].should.deepEqual({
      type: 'OPC-UA_CALL_ERROR',
      message: 'The client did not specify all of the input arguments for the method.'
    });
  });
  it('should error for wrong method id', async () => {
    const config = {
      uriTemplate: 'opc.tcp://localhost:4335/UA/Server',
      securityPolicyTemplate: 'None',
      securityModeTemplate: 'None',
      destinationPath: 'destination',
      callInstructions: {
        nameSpaceTemplate: '1',
        identifierTemplate: 'i=1000',
        methodNsTemplate: '1',
        methodIdTemplate: 'i=1055',
        methodArguments: []
      }
    };
    const node = new CallOpcUa('id', [['nid1']], config );
    const output =  await node.run({ flowVersionId: '123' }, {});
    output[1].destination.errors[0].should.deepEqual({
      type: 'OPC-UA_CALL_ERROR',
      message: 'The method id does not refer to a method for the specified object.'
    });
  });
  it('should fail on bad DateTime', async () => {
    const config = {
      uriTemplate: 'opc.tcp://localhost:4335/UA/Server',
      securityPolicyTemplate: 'None',
      securityModeTemplate: 'None',
      destinationPath: 'destination',
      callInstructions: {
        nameSpaceTemplate: '1',
        identifierTemplate: 'i=1000',
        methodNsTemplate: '1',
        methodIdTemplate: 'i=1055',
        methodArguments: [
          {
            dataTypeTemplate: 'DateTime',
            sourceTypeTemplate: 'path',
            valueTemplate: 'arrayVal'
          }
        ]
      }
    };
    const node = new CallOpcUa('id', [['nid1']], config );
    return node.run({ flowVersionId: '123' }, { arrayVal: 'bob' }).should.be.rejectedWith(
      'Value is not a valid DateTime.');
  });
  it('should call using an array', async () => {
    const config = {
      uriTemplate: 'opc.tcp://localhost:4335/UA/Server',
      securityPolicyTemplate: 'None',
      securityModeTemplate: 'None',
      destinationPath: 'destination',
      callInstructions: {
        nameSpaceTemplate: '1',
        identifierTemplate: 'i=1000',
        methodNsTemplate: '1',
        methodIdTemplate: 'i=1055',
        methodArguments: [
          {
            dataTypeTemplate: 'String',
            arrayTypeTemplate: 'Array',
            sourceTypeTemplate: 'path',
            valueTemplate: 'arrayVal'
          }
        ]
      }
    };
    const node = new CallOpcUa('id', [['nid1']], config );
    const output =  await node.run({ flowVersionId: '123' }, { arrayVal: ['1', '2', '3', '4'] });
    // let it fail after on missing method
    output[1].destination.errors[0].should.deepEqual({
      type: 'OPC-UA_CALL_ERROR',
      message: 'The method id does not refer to a method for the specified object.'
    });
  });
  it('should call a method', async () => {
    const config = {
      uriTemplate: 'opc.tcp://localhost:4335/UA/Server',
      securityPolicyTemplate: 'None',
      securityModeTemplate: 'None',
      destinationPath: 'destination',
      callInstructions: {
        nameSpaceTemplate: '1',
        identifierTemplate: 'i=1000',
        methodNsTemplate: '1',
        methodIdTemplate: 'i=1059',
        methodArguments: [
          {
            dataTypeTemplate: 'UInt32',
            arrayTypeTemplate: 'Scalar',
            valueTemplate: '3'
          },
          {
            dataTypeTemplate: 'UInt32',
            arrayTypeTemplate: 'Scalar',
            valueTemplate: '25'
          }
        ]
      }
    };
    const node = new CallOpcUa('id', [['nid1']], config );
    const output =  await node.run({ flowVersionId: '123' }, {});
    output[1].destination.result.should.deepEqual([[
      'Woof!!!!!!!!!!!!!!!!!!!!!!!!',
      'Woof!!!!!!!!!!!!!!!!!!!!!!!!',
      'Woof!!!!!!!!!!!!!!!!!!!!!!!!'
    ]]);
  });
  it('should call a method from a payload path', async () => {
    const config = {
      uriTemplate: 'opc.tcp://localhost:4335/UA/Server',
      securityPolicyTemplate: 'None',
      securityModeTemplate: 'None',
      destinationPath: 'destination',
      callInstructionsType: 'payloadPath',
      callInstructions: 'instructions'
    };
    const node = new CallOpcUa('id', [['nid1']], config );
    const output =  await node.run({ flowVersionId: '123' }, {
      instructions: {
        nameSpace: '1',
        identifier: 'i=1000',
        methodNs: '1',
        methodId: 'i=1059',
        methodArguments: [
          {
            dataType: 'UInt32',
            arrayType: 'Scalar',
            value: '3'
          },
          {
            dataType: 'UInt32',
            arrayType: 'Scalar',
            value: '25'
          }
        ]
      }
    });
    output[1].destination.result.should.deepEqual([[
      'Woof!!!!!!!!!!!!!!!!!!!!!!!!',
      'Woof!!!!!!!!!!!!!!!!!!!!!!!!',
      'Woof!!!!!!!!!!!!!!!!!!!!!!!!'
    ]]);
  });
});
