import '../common.js';
import BrowseOpcUa from '../../src/nodes/opcua-browse-node.js';
import errors from 'losant-nodejs-utils/src/errors.js';

describe('OPC UA Browse Node', () => {
  it('should throw an error if id path is wrong format', async () => {
    const node = new BrowseOpcUa('id', [['nid1']], { browseInstructions: [ { nameSpaceTemplate: '', identifierTemplate: 's=App' } ] });
    return node.run({}, {}).should.be.rejectedWith(errors.Validation({ message: 'Identifier path is in the wrong format.' }));
  });
  it('should throw an error if identifier is empty', async () => {
    const node = new BrowseOpcUa('id', [['nid1']], { browseInstructions: [ { nameSpaceTemplate: '1', identifierTemplate: '' } ] });
    return node.run({}, {}).should.be.rejectedWith(errors.Validation({ message: 'Identifier is required.' }));
  });
  it('should throw an error if identifier is not a string', async () => {
    const node = new BrowseOpcUa('id', [['nid1']], { browseInstructionsType: 'payloadPath', browseInstructions: 'instructs' });
    return node.run({}, { instructs: [ { nameSpace: '1', identifier: 1 } ] })
      .should.be.rejectedWith(errors.Validation({ message: 'Identifier must be a string.' }));
  });
  it('should throw an error if namespace is not an integer', async () => {
    const node = new BrowseOpcUa('id', [['nid1']], { browseInstructions: [ { nameSpaceTemplate: 'two', identifierTemplate: 'App' } ] });
    return node.run({}, {}).should.be.rejectedWith(errors.Validation({ message: 'Namespace Index must be a valid integer.' }));
  });
  it('should throw an error if namespace is a negative', async () => {
    const node = new BrowseOpcUa('id', [['nid1']], { browseInstructions: [ { nameSpaceTemplate: '-2', identifierTemplate: 'App' } ] });
    return node.run({}, {}).should.be.rejectedWith(errors.Validation({ message: 'Namespace must be an integer between 0 and 255.' }));
  });
  it('should throw an error if URI is empty', async () => {
    const config = {
      uriTemplate: '',
      securityPolicyTemplate: '',
      securityModeTemplate: '',
      browseInstructions: [
        { nameSpaceTemplate: '1', identifierTemplate: 'App' }
      ],
      destinationPath: 'destination'
    };
    const node = new BrowseOpcUa('id', [['nid1']], config );
    return node.run({}, {}).should.be.rejectedWith({ message: 'OPC UA URI endpoint is required.' });
  });
  it('should throw an error if security mode is none while policy exists', async () => {
    const config = {
      uriTemplate: 'opc.tcp://192.168.1.2:1234',
      securityPolicyTemplate: 'Basic256Rsa15',
      securityModeTemplate: '',
      browseInstructions: [
        { nameSpaceTemplate: '1', identifierTemplate: 'App' }
      ],
      destinationPath: 'destination'
    };
    const node = new BrowseOpcUa('id', [['nid1']], config );
    return node.run({}, {}).should.be.rejectedWith({ message: 'Security mode must be provided if security policy is provided.' });
  });
  it('should throw an error if policy is none while mode exists', async () => {
    const config = {
      uriTemplate: 'opc.tcp://192.168.1.2:1234',
      securityPolicyTemplate: 'None',
      securityModeTemplate: 'Sign',
      browseInstructions: [
        { nameSpaceTemplate: '1', identifierTemplate: 'App' }
      ],
      destinationPath: 'destination'
    };
    const node = new BrowseOpcUa('id', [['nid1']], config );
    return node.run({}, {}).should.be.rejectedWith({ message: 'Security policy must be provided if security mode is provided.' });
  });
  it('should throw an error if cert or key is missing while security exists', async () => {
    const config = {
      uriTemplate: 'opc.tcp://192.168.1.2:1234',
      securityPolicyTemplate: 'Basic256Rsa15',
      securityModeTemplate: 'Sign',
      browseInstructions: [
        { nameSpaceTemplate: '1', identifierTemplate: 'App' }
      ],
      destinationPath: 'destination'
    };
    const node = new BrowseOpcUa('id', [['nid1']], config );
    return node.run({}, {}).should.be.rejectedWith({ message: 'Certificate and private key must be provided if security is set.' });
  });
  it('should throw error when unable to convert string ID', async () => {
    const config = {
      uriTemplate: 'opc.tcp://localhost:4335/UA/Server',
      securityPolicyTemplate: 'None',
      securityModeTemplate: 'None',
      browseInstructions: [
        { nameSpaceTemplate: '1', identifierTemplate: 'MyDevice' }
      ],
      destinationPath: 'destination'
    };
    const node = new BrowseOpcUa('id', [['nid1']], config );
    const output = await node.run({ flowVersionId: '123' }, {});
    output[1].destination.errors[0].should.deepEqual({
      type: 'OPC-UA_BROWSE_ERROR',
      message: 'String cannot be coerced to a nodeId : ns=1;MyDevice'
    });
  });
  it('should browse root folder by default', async () => {
    const config = {
      uriTemplate: 'opc.tcp://localhost:4335/UA/Server',
      securityPolicyTemplate: 'None',
      securityModeTemplate: 'None',
      browseInstructions: [
        { nameSpaceTemplate: '', identifierTemplate: '' }
      ],
      destinationPath: 'destination'
    };
    const node = new BrowseOpcUa('id', [['nid1']], config );
    const output =  await node.run({ flowVersionId: '123' }, {});
    // strip and compare
    output[1].destination.should.deepEqual({
      RootFolder: [
        {
          browseName: 'Objects',
          displayName: 'locale=null text=Objects',
          nodeId: 'ns=0;i=85',
          namespace: 0,
          identifier: 85,
          identifierType: 'Numeric',
          namespaceUri: 'null',
          isForward: true,
          nodeClass: 'Object (1)'
        },
        {
          browseName: 'Types',
          displayName: 'locale=null text=Types',
          nodeId: 'ns=0;i=86',
          namespace: 0,
          identifier: 86,
          identifierType: 'Numeric',
          namespaceUri: 'null',
          isForward: true,
          nodeClass: 'Object (1)'
        },
        {
          browseName: 'Views',
          displayName: 'locale=null text=Views',
          nodeId: 'ns=0;i=87',
          namespace: 0,
          identifier: 87,
          identifierType: 'Numeric',
          namespaceUri: 'null',
          isForward: true,
          nodeClass: 'Object (1)'
        }
      ]
    });
  });
  it('should browse while working from address name', async () => {
    const config = {
      uriTemplate: 'opc.tcp://localhost:4335/UA/Server',
      securityPolicyTemplate: 'None',
      securityModeTemplate: 'None',
      browseInstructions: [
        { nameSpaceTemplate: '', identifierTemplate: '/Objects' } // this is root only
      ],
      destinationPath: 'destination'
    };
    const node = new BrowseOpcUa('id', [['nid1']], config );
    const output =  await node.run({ flowVersionId: '123' }, {});
    output[1].destination.should.deepEqual({
      Objects: [
        {
          browseName: 'Locations',
          displayName: 'locale=null text=Locations',
          identifier: 31915,
          identifierType: 'Numeric',
          isForward: true,
          namespace: 0,
          namespaceUri: 'null',
          nodeClass: 'Object (1)',
          nodeId: 'ns=0;i=31915'
        },
        {
          browseName: 'Server',
          displayName: 'locale=null text=Server',
          nodeId: 'ns=0;i=2253',
          namespace: 0,
          identifier: 2253,
          identifierType: 'Numeric',
          namespaceUri: 'null',
          isForward: true,
          nodeClass: 'Object (1)'
        },
        {
          browseName: 'Aliases',
          displayName: 'locale=null text=Aliases',
          nodeId: 'ns=0;i=23470',
          namespace: 0,
          identifier: 23470,
          identifierType: 'Numeric',
          namespaceUri: 'null',
          isForward: true,
          nodeClass: 'Object (1)'
        },
        {
          browseName: '1:MyDevice',
          displayName: 'locale=null text=MyDevice',
          nodeId: 'ns=1;i=1000',
          namespace: 1,
          identifier: 1000,
          identifierType: 'Numeric',
          namespaceUri: 'null',
          isForward: true,
          nodeClass: 'Object (1)'
        },
        {
          browseName: '1:Tank',
          displayName: 'locale=null text=Tank',
          nodeId: 'ns=1;i=1002',
          namespace: 1,
          identifier: 1002,
          identifierType: 'Numeric',
          namespaceUri: 'null',
          isForward: true,
          nodeClass: 'Object (1)'
        }
      ]
    });
  });
  it('should browse while working from node ID', async () => {
    const config = {
      uriTemplate: 'opc.tcp://localhost:4335/UA/Server',
      securityPolicyTemplate: 'None',
      securityModeTemplate: 'None',
      browseInstructions: [
        { nameSpaceTemplate: '1', identifierTemplate: 'i=1000' } // this is root only
      ],
      destinationPath: 'destination'
    };
    const node = new BrowseOpcUa('id', [['nid1']], config );
    const output =  await node.run({ flowVersionId: '123' }, {});
    output[1].destination.should.deepEqual({
      i_1000: [
        {
          browseName: '1:MyVar1',
          displayName: 'locale=null text=MyVar1',
          nodeId: 'ns=1;i=1001',
          namespace: 1,
          identifier: 1001,
          identifierType: 'Numeric',
          namespaceUri: 'null',
          isForward: true,
          nodeClass: 'Variable (2)'
        },
        {
          browseName: '1:MyVar2',
          displayName: 'locale=null text=MyVar2',
          nodeId: 'ns=1;b=1020FFAA',
          namespace: 1,
          identifier: '1020FFAA',
          identifierType: 'Byte String',
          namespaceUri: 'null',
          isForward: true,
          nodeClass: 'Variable (2)'
        },
        {
          browseName: '1:MyVar3',
          displayName: 'locale=null text=MyVar3',
          nodeId: 'ns=1;s=MyVar3',
          namespace: 1,
          identifier: 'MyVar3',
          identifierType: 'String',
          namespaceUri: 'null',
          isForward: true,
          nodeClass: 'Variable (2)'
        },
        {
          browseName: '1:MyVar4',
          displayName: 'locale=null text=MyVar4',
          nodeId: 'ns=1;s=MyVar4',
          namespace: 1,
          identifier: 'MyVar4',
          identifierType: 'String',
          namespaceUri: 'null',
          isForward: true,
          nodeClass: 'Variable (2)'
        },
        {
          browseName: '1:1234',
          displayName: 'locale=null text=1234',
          identifier: '1234',
          identifierType: 'String',
          isForward: true,
          namespace: 1,
          namespaceUri: 'null',
          nodeClass: 'Variable (2)',
          nodeId: 'ns=1;s=1234'
        },
        {
          browseName: '1:Bark',
          displayName: 'locale=null text=Bark',
          identifier: 1059,
          identifierType: 'Numeric',
          isForward: true,
          namespace: 1,
          namespaceUri: 'null',
          nodeClass: 'Method (4)',
          nodeId: 'ns=1;i=1059'
        }
      ]
    });
  });
  it('should browse root folder by default from payload path', async () => {
    const config = {
      uriTemplate: 'opc.tcp://localhost:4335/UA/Server',
      securityPolicyTemplate: 'None',
      securityModeTemplate: 'None',
      browseInstructionsType: 'payloadPath',
      browseInstructions: 'instructions',
      destinationPath: 'destination'
    };
    const node = new BrowseOpcUa('id', [['nid1']], config );
    const output =  await node.run({ flowVersionId: '123' }, {
      instructions: [
        { nameSpace: '', identifier: '' }
      ]
    });
    // strip and compare
    output[1].destination.should.deepEqual({
      RootFolder: [
        {
          browseName: 'Objects',
          displayName: 'locale=null text=Objects',
          nodeId: 'ns=0;i=85',
          namespace: 0,
          identifier: 85,
          identifierType: 'Numeric',
          namespaceUri: 'null',
          isForward: true,
          nodeClass: 'Object (1)'
        },
        {
          browseName: 'Types',
          displayName: 'locale=null text=Types',
          nodeId: 'ns=0;i=86',
          namespace: 0,
          identifier: 86,
          identifierType: 'Numeric',
          namespaceUri: 'null',
          isForward: true,
          nodeClass: 'Object (1)'
        },
        {
          browseName: 'Views',
          displayName: 'locale=null text=Views',
          nodeId: 'ns=0;i=87',
          namespace: 0,
          identifier: 87,
          identifierType: 'Numeric',
          namespaceUri: 'null',
          isForward: true,
          nodeClass: 'Object (1)'
        }
      ]
    });
  });
  it('should browse root folder by default for no path', async () => {
    const config = {
      uriTemplate: 'opc.tcp://localhost:4335/UA/Server',
      securityPolicyTemplate: 'None',
      securityModeTemplate: 'None',
      browseInstructionsType: 'payloadPath',
      browseInstructions: 'noPath',
      destinationPath: 'destination'
    };
    const node = new BrowseOpcUa('id', [['nid1']], config );
    const output =  await node.run({ flowVersionId: '123' }, {});
    // strip and compare
    output[1].destination.should.deepEqual({
      RootFolder: [
        {
          browseName: 'Objects',
          displayName: 'locale=null text=Objects',
          nodeId: 'ns=0;i=85',
          namespace: 0,
          identifier: 85,
          identifierType: 'Numeric',
          namespaceUri: 'null',
          isForward: true,
          nodeClass: 'Object (1)'
        },
        {
          browseName: 'Types',
          displayName: 'locale=null text=Types',
          nodeId: 'ns=0;i=86',
          namespace: 0,
          identifier: 86,
          identifierType: 'Numeric',
          namespaceUri: 'null',
          isForward: true,
          nodeClass: 'Object (1)'
        },
        {
          browseName: 'Views',
          displayName: 'locale=null text=Views',
          nodeId: 'ns=0;i=87',
          namespace: 0,
          identifier: 87,
          identifierType: 'Numeric',
          namespaceUri: 'null',
          isForward: true,
          nodeClass: 'Object (1)'
        }
      ]
    });
  });

  it.skip('should error on connect to a non OPC UA server', async () => {
    const config = {
      uriTemplate: 'opc.tcp://localhost:123',
      securityPolicyTemplate: '',
      securityModeTemplate: '',
      browseInstructions: [
        { nameSpaceTemplate: '0', identifierTemplate: 'i=85' }
      ],
      destinationPath: 'destination'
    };
    const node = new BrowseOpcUa('id', [['nid1']], config);
    await node.run({ flowVersionId: '123' }, {}).should.be.rejectedWith({
      title: 'OPC UA Connection Error',
      message: 'connect ECONNREFUSED 127.0.0.1:123'
    });
  });
  it.skip('should not return duplicates on browse', async () => {
    const config = {
      uriTemplate: 'opc.tcp://localhost:53530/OPCUA/SimulationServer',
      securityPolicyTemplate: '',
      securityModeTemplate: '',
      browseInstructions: [
        { nameSpaceTemplate: '5', identifierTemplate: 's=MyObjectsFolder' }
      ],
      destinationPath: 'destination'
    };
    const node = new BrowseOpcUa('id', [['nid1']], config);
    const output =  await node.run({ flowVersionId: '123' }, {});
    // strip and compare
    output[1].destination.should.deepEqual({
      MyObjectsFolder: [
        {
          browseName: '5:MyDevice',
          displayName: 'locale=en text=MyDevice',
          nodeId: 'ns=5;s=MyDevice',
          namespace: 5,
          identifier: 'MyDevice',
          identifierType: 'String',
          namespaceUri: 'null',
          isForward: true,
          nodeClass: 'Object (1)'
        }
      ]
    });
  });
});
