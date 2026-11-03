import '../common.js';
import ReadOpcUa from '../../src/nodes/opcua-read-node.js';
import errors from 'losant-nodejs-utils/src/errors.js';
import { getServerInfo } from '../lib/opcua-test-server.js';

/*
OPENSSL_CONF=./foo.cnf openssl req -newkey rsa:2048 -nodes -keyout key.pem -x509 -days 365 -out certificate.pem

The opcua server is pedantic that dataEncipherment and keyEncipherment
are on and that a URI alt name exists

foo.cnf:
[req]
distinguished_name  = req_distinguished_name
x509_extensions     = v3_req
prompt              = no
[req_distinguished_name]
C           = US
ST          = VA
L           = SomeCity
O           = MyCompany
OU          = MyDivision
CN          = *.testDomainOne.com
[alt_names]
URI.0 = testDomainOne.com
[v3_req]
keyUsage           = keyEncipherment, dataEncipherment, nonRepudiation, digitalSignature
extendedKeyUsage   = serverAuth
subjectAltName = @alt_names
*/

const fakeCert = `-----BEGIN CERTIFICATE-----
MIIDuDCCAqCgAwIBAgIUDzUrT5RBz9kvBcYzIwNNUSXn9SwwDQYJKoZIhvcNAQEL
BQAwdDELMAkGA1UEBhMCVVMxCzAJBgNVBAgMAlZBMREwDwYDVQQHDAhTb21lQ2l0
eTESMBAGA1UECgwJTXlDb21wYW55MRMwEQYDVQQLDApNeURpdmlzaW9uMRwwGgYD
VQQDDBMqLnRlc3REb21haW5PbmUuY29tMB4XDTIxMTIxNDIxNTcyNFoXDTIyMTIx
NDIxNTcyNFowdDELMAkGA1UEBhMCVVMxCzAJBgNVBAgMAlZBMREwDwYDVQQHDAhT
b21lQ2l0eTESMBAGA1UECgwJTXlDb21wYW55MRMwEQYDVQQLDApNeURpdmlzaW9u
MRwwGgYDVQQDDBMqLnRlc3REb21haW5PbmUuY29tMIIBIjANBgkqhkiG9w0BAQEF
AAOCAQ8AMIIBCgKCAQEAwP8SZzTGbF//N1B29/tDvldG86Y5m5Bd4MsGhGHE1J8h
DhJ/UiqOYKgG9Rft/2JBNfLDEHvqzPZOU5cmh4919HxZuEtz+fYqqzvJNfpL418m
dasyWIRShNESjsZxLZPB5k+JAuGdD0a54GbFAV2RiksxG/MTYK1YJ+Vb3vRO53BO
2HyD9lYUTw9hKTjqJQWUnxM3tjjg1kHibP4ZIBrWArdPg6V2H2YGJGUpLzynUN3X
G4iMQqE88flIoirzLNlYkB2JLXmG9ZrHhTahfmvyYozSeMBqd2AS5HsaHqmSEVNW
nKHFVajgbZMHj94Xzt0Ht/u8bpvhl/U77yrJKMVm2QIDAQABo0IwQDALBgNVHQ8E
BAMCBPAwEwYDVR0lBAwwCgYIKwYBBQUHAwEwHAYDVR0RBBUwE4YRdGVzdERvbWFp
bk9uZS5jb20wDQYJKoZIhvcNAQELBQADggEBAGzNEYYLODka2qlsJCN2rjeY8az5
WQFE5olidotfGMyx3tUJHcBYJbdIfY68ZDmrKb9ZgCJDIrz6KASyL6zAhzrBS/x1
7kKu1srBBJvTKXR3l/PVESxj6vjMeyHPT6VRFcWHVUUyhuL+ter6M0bgZloGuLx7
oAcff3iiUW04LGUhnR7ZiMjCR7c9g/oErgarnHnPVXMc2lgsMU87utu4o2xeip/9
XDNEZgWpJd9e91m3cHdo1+Svjt7movdkE1sFDnSvQ2wENcAQ/Qqydvh8oVAZiXJ8
bqCuk9J73yhG7+iAVMlXX7Wo6C64U2gdpJjw95W/MMZypPO3wqbZpRYhGGc=
-----END CERTIFICATE-----`;

const fakeKey = `-----BEGIN PRIVATE KEY-----
MIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQDA/xJnNMZsX/83
UHb3+0O+V0bzpjmbkF3gywaEYcTUnyEOEn9SKo5gqAb1F+3/YkE18sMQe+rM9k5T
lyaHj3X0fFm4S3P59iqrO8k1+kvjXyZ1qzJYhFKE0RKOxnEtk8HmT4kC4Z0PRrng
ZsUBXZGKSzEb8xNgrVgn5Vve9E7ncE7YfIP2VhRPD2EpOOolBZSfEze2OODWQeJs
/hkgGtYCt0+DpXYfZgYkZSkvPKdQ3dcbiIxCoTzx+UiiKvMs2ViQHYkteYb1mseF
NqF+a/JijNJ4wGp3YBLkexoeqZIRU1acocVVqOBtkweP3hfO3Qe3+7xum+GX9Tvv
KskoxWbZAgMBAAECggEAQH69GqpDSQJHmqeUKkjYmao29sNs6vSyuqV+Vw0JJvjK
phY+YCoCjIB6WruVeEvQeQPYdhDDJZ2GDV8srA6gH4TSwsjMSBMgrTp8gkJTy/cH
NjlwyK3nmaT4q6fbOJzxJlMb+U+GGg3LnhcZ7NvlAC8iiTGRHzSuih6Wtgo0uBh2
BxceHYiJp35Hzzj+aPgc3nZdrtCUyymGps4jsj47V+gvWdQG+JxkttSrlaMdyYH8
/QzR69Kb5B1P64xJDUAf2zwRTB/uVShIBm9c3uQhMIxN8pZrf9lbDbNey6EQYFYw
VRoo3oyUGOKH52Lb/iKdbN2apuBvUcJQYinXycPAVQKBgQDuFioAW1LzXIyMaRS3
JaPVXQXhrH/ZuRsgU73we9cGvWtIdZ6FPQCTCYrh+FCHrSthsgPUJveiZi1JYqDs
olBtUHGjIbSiLErRbHYrUUubi+cA9tcgABnZKyD8Fx11sGN91iRpE/I2q24cv+Ux
eMAfxVpZHAFNsxVC8YExBNHcmwKBgQDPhGp2XbIrMrsiHSobPvyvq37YjgnrhOwa
61DAUCzheAJcVlqf5VBz07WI8CA0ZEl/ZORP1cGdvYrvlizkfyLThxGNIzDt8BPU
xlcPBKi8njglkGa8Xylj07elhyhJe0/yFBw/sTiUEecA1drF2lHWvGqqd8AV1oZu
+UPIs3NPmwKBgDlP3Ix5b15lyO+D3Bi6VtXlrqTEgYJHrN/7SJ27MefNcSXgKmio
Zpr+kRAUVk5SwT6jO4i2WKYfMoeX1mUgLXwjATfjxTfEsb33/fovd6PZ6aGxyddK
Lu64Exib99t8unZwNhOVWZkPa1JAX0upZZZAS59nvmiV02hp+k9yeZJBAoGAa+yO
AelQ1C6aLG/Gik0D1cj3O2EDv71tncJsSNhpvwlPEP7IOwhkAxlD/GgGF7lgkCTE
qNCe1Y7SRzBvQJbuYdyJQEHhHJ4TckGE3Yaqyw3uXXrwM1+6gvSFOk1EopLDTT8w
Qd/FcRyuazzNfsDAd1Gel/GXsMPVPrncivDpM6kCgYAod5W93fm1WbjCIbh113Fb
yevSU7yjNkqruFDe06I14am5ie1gClYeyMY14asvVNFwcDYDg0vJqKz55EVNsf4t
088pZP9wWhg4ZC3EbBbqwY50VKDlHaBnIiP8VLTmFeag5sPiDqgSx6Ye8a4W6c1M
GoQNFWADEJU3r691fJ38xw==
-----END PRIVATE KEY-----`;

describe('OPC UA Read Node', () => {
  it('should throw an error if read instructions are empty', async () => {
    const node = new ReadOpcUa('id', [['nid1']], {});
    return node.run({}, {}).should.be.rejectedWith(errors.Validation({ message: 'readInstructions are required for OPC UA read.' }));
  });
  it('should throw an error if read instructions are empty array', async () => {
    const node = new ReadOpcUa('id', [['nid1']], { readInstructionsType: 'payloadPath', readInstructions: 'instructs' });
    return node.run({}, { instructs: [] }).should.be.rejectedWith(errors.Validation({ message: 'readInstructions are required for OPC UA read.' }));
  });
  it('should throw an error if namespace is empty', async () => {
    const node = new ReadOpcUa('id', [['nid1']], { readInstructions: [ { nameSpaceTemplate: '', identifierTemplate: 'App', key: 'key' } ] });
    return node.run({}, {}).should.be.rejectedWith(errors.Validation({ message: 'Namespace Index is required.' }));
  });
  it('should throw an error if namespace is not an integer', async () => {
    const node = new ReadOpcUa('id', [['nid1']], { readInstructions: [ { nameSpaceTemplate: 'two', identifierTemplate: 'App', key: 'key' } ] });
    return node.run({}, {}).should.be.rejectedWith(errors.Validation({ message: 'Namespace Index must be a valid integer.' }));
  });
  it('should throw an error if namespace is a negative', async () => {
    const node = new ReadOpcUa('id', [['nid1']], { readInstructions: [ { nameSpaceTemplate: '-2', identifierTemplate: 'App', key: 'key' } ] });
    return node.run({}, {}).should.be.rejectedWith(errors.Validation({ message: 'Namespace must be an integer between 0 and 255.' }));
  });
  it('should throw an error if a key is trying to map into the errors path', async () => {
    const node = new ReadOpcUa('id', [['nid1']], { readInstructions: [ { nameSpaceTemplate: '1', identifierTemplate: 'App', key: 'errors.err' } ] });
    return node.run({}, {}).should.be.rejectedWith(errors.Validation({ message: 'Keys cannot contain the special path errors.' }));
  });
  it('should throw an error if a key is not a string', async () => {
    const node = new ReadOpcUa('id', [['nid1']], { readInstructionsType: 'payloadPath', readInstructions: 'instructs' });
    return node.run({}, { instructs: [ { nameSpace: '1', identifier: 'App', key: 1 } ] })
      .should.be.rejectedWith(errors.Validation({ message: 'Key must be a string.' }));
  });
  it('should throw an error if URI is empty or invalid', async () => {
    let config = {
      uriTemplate: '',
      securityPolicyTemplate: '',
      securityModeTemplate: '',
      readInstructions: [
        { nameSpaceTemplate: '1', identifierTemplate: 'App', key: 'key' }
      ],
      destinationPath: 'destination'
    };
    let node = new ReadOpcUa('id', [['nid1']], config);
    await node.run({}, {}).should.be.rejectedWith({ message: 'OPC UA URI endpoint is required.' });

    config = {
      uriTemplate: 'localhost',
      securityPolicyTemplate: '',
      securityModeTemplate: '',
      readInstructions: [
        { nameSpaceTemplate: '1', identifierTemplate: 'App', key: 'key' }
      ],
      destinationPath: 'destination'
    };
    node = new ReadOpcUa('id', [['nid1']], config);
    await node.run({}, {}).should.be.rejectedWith({ message: 'OPC UA URI endpoint "localhost" is invalid.' });

    config = {
      uriTemplate: 'HTTPS://localhope:4335/UA/Server',
      securityPolicyTemplate: '',
      securityModeTemplate: '',
      readInstructions: [
        { nameSpaceTemplate: '1', identifierTemplate: 'App', key: 'key' }
      ],
      destinationPath: 'destination'
    };
    node = new ReadOpcUa('id', [['nid1']], config);
    await node.run({}, {}).should.be.rejectedWith({ message: 'Cannot resolve host: localhope' });
  });
  it('should throw an error if security mode is none while policy exists', async () => {
    const config = {
      uriTemplate: 'opc.tcp://192.168.1.2:1234',
      securityPolicyTemplate: 'Basic256Rsa15',
      securityModeTemplate: 'None',
      readInstructions: [
        { nameSpaceTemplate: '1', identifierTemplate: 'App', key: 'key' }
      ],
      destinationPath: 'destination'
    };
    const node = new ReadOpcUa('id', [['nid1']], config);
    return node.run({}, {}).should.be.rejectedWith({ message: 'Security mode must be provided if security policy is provided.' });
  });
  it('should throw an error if policy is none while mode exists', async () => {
    const config = {
      uriTemplate: 'opc.tcp://192.168.1.2:1234',
      securityPolicyTemplate: 'None',
      securityModeTemplate: 'Sign',
      readInstructions: [
        { nameSpaceTemplate: '1', identifierTemplate: 'App', key: 'key' }
      ],
      destinationPath: 'destination'
    };
    const node = new ReadOpcUa('id', [['nid1']], config);
    return node.run({}, {}).should.be.rejectedWith({ message: 'Security policy must be provided if security mode is provided.' });
  });
  it('should throw an error if cert or key are missing while security exists', async () => {
    const config = {
      uriTemplate: 'opc.tcp://192.168.1.2:1234',
      securityPolicyTemplate: 'Basic256Rsa15',
      securityModeTemplate: 'Sign',
      readInstructions: [
        { nameSpaceTemplate: '1', identifierTemplate: 'App', key: 'key' }
      ],
      destinationPath: 'destination'
    };
    const node = new ReadOpcUa('id', [['nid1']], config);
    return node.run({}, {}).should.be.rejectedWith({ message: 'Certificate and private key must be provided if security is set.' });
  });
  it('should throw an error if cert or key are invalid', async () => {
    const config = {
      uriTemplate: 'opc.tcp://192.168.1.2:1234',
      securityPolicyTemplate: 'Basic256Rsa15',
      securityModeTemplate: 'Sign',
      certTemplate: 'umm',
      privateKeyTemplate: 'umm',
      readInstructions: [
        { nameSpaceTemplate: '1', identifierTemplate: 'App', key: 'key' }
      ],
      destinationPath: 'destination'
    };
    const node = new ReadOpcUa('id', [['nid1']], config);
    return node.run({}, {}).should.be.rejectedWith({ message: 'Certificate must start and end with proper formatting.' });
  });
  it('should return error for missing node', async () => {
    const config = {
      uriTemplate: 'opc.tcp://localhost:4335/UA/Server',
      securityPolicyTemplate: 'None',
      securityModeTemplate: 'None',
      readInstructions: [
        { nameSpaceTemplate: '1', identifierTemplate: 's=Something', key: 'var1' }
      ],
      destinationPath: 'destination'
    };
    const node = new ReadOpcUa('id', [['nid1']], config);
    const output = await node.run({ flowVersionId: '123' }, {});
    output[1].destination.errors[0].should.deepEqual({
      type: 'OPC-UA_READ_ERROR',
      message: 'The node id refers to a node that does not exist in the server address space.'
    });
  });
  it('should error for unauthorized user', async () => {
    const config = {
      uriTemplate: 'opc.tcp://localhost:4335/UA/Server',
      securityPolicyTemplate: 'None',
      securityModeTemplate: 'None',
      usernameTemplate: 'Bob',
      passwordTemplate: 'passIt',
      readInstructions: [
        { nameSpaceTemplate: '1', identifierTemplate: 's=MyVar3', key: 'val' }
      ],
      destinationPath: 'destination'
    };
    let node = new ReadOpcUa('id', [['nid1']], config);
    const output = await node.run({ flowVersionId: '123' }, {});
    output[1].destination.val.should.equal('winter of our discontent');

    config.usernameTemplate = 'nope';
    config.passwordTemplate = 'nope';
    node = new ReadOpcUa('id', [['nid1']], config);
    await node.run({ flowVersionId: '124' }, {}).should.be.rejectedWith({
      title: 'OPC UA Session Error',
      message: 'BadUserAccessDenied (0x801f0000)'
    });

    getServerInfo().usersAuthed.should.deepEqual([
      { username: 'Bob', password: 'passIt' },
      { username: 'nope', password: 'nope' }
    ]);
  });
  it('should throw error when changing security on same workflow', async () => {
    const node0 = new ReadOpcUa('id', [['nid1']], {
      uriTemplate: 'opc.tcp://localhost:4335/UA/Server',
      securityPolicyTemplate: 'None',
      securityModeTemplate: 'None',
      readInstructionsType: 'payloadPath',
      readInstructions: 'instructions',
      destinationPath: 'destination'
    });
    const output0 = await node0.run({ flowVersionId: '123' }, {
      instructions: [
        { nameSpace: '1', identifier: 'b=1020FFAA' }
      ]
    });
    output0[1].destination['1020FFAA'].should.equal(10);

    const config = {
      uriTemplate: 'opc.tcp://localhost:4335/UA/Server',
      securityPolicyTemplate: 'Basic256Rsa15',
      securityModeTemplate: 'Sign',
      certTemplate: fakeCert,
      privateKeyTemplate: fakeKey,
      readInstructions: [
        { nameSpaceTemplate: '1', identifierTemplate: 'b=1020FFAA', key: 'val' }
      ],
      destinationPath: 'destination'
    };
    const node = new ReadOpcUa('id', [['nid1']], config);
    await node.run({ flowVersionId: '123' }, {}).should.be.rejectedWith({
      title: 'OPC UA Session Error',
      message: 'Security credentials do not match current session.'
    });
    getServerInfo().certsTrusted.length.should.equal(0);
  });
  it('should throw on non-readable node', async () => {
    const config = {
      uriTemplate: 'opc.tcp://localhost:4335/UA/Server',
      securityPolicyTemplate: 'None',
      securityModeTemplate: 'None',
      readInstructions: [
        { nameSpaceTemplate: '0', identifierTemplate: 'i=85', key: 'val' }
      ],
      destinationPath: 'destination'
    };
    const node = new ReadOpcUa('id', [['nid1']], config);
    const output = await node.run({ flowVersionId: '123' }, {});
    output[1].destination.errors[0].should.deepEqual({
      type: 'OPC-UA_READ_ERROR',
      message: 'The attribute is not supported for the specified Node.'
    });
  });
  it('should read string with security enabled', async () => {
    const config = {
      uriTemplate: 'opc.tcp://localhost:4335/UA/Server',
      securityPolicyTemplate: 'Basic256Sha256',
      securityModeTemplate: 'Sign',
      certTemplate: fakeCert,
      privateKeyTemplate: fakeKey,
      readInstructions: [
        { nameSpaceTemplate: '1', identifierTemplate: 's=MyVar3', key: 'val' }
      ],
      destinationPath: 'destination'
    };
    const node = new ReadOpcUa('id', [['nid1']], config);
    const output = await node.run({ flowVersionId: '321' }, {});
    output[1].destination.val.should.equal('winter of our discontent');
    getServerInfo().certsTrusted.length.should.equal(1);
  });
  it('should error for deprecated security mode Basic128Rsa15', async () => {
    const config = {
      uriTemplate: 'opc.tcp://localhost:4335/UA/Server',
      securityPolicyTemplate: 'Basic128Rsa15',
      securityModeTemplate: 'Sign',
      certTemplate: fakeCert,
      privateKeyTemplate: fakeKey,
      readInstructions: [
        { nameSpaceTemplate: '1', identifierTemplate: 's=MyVar3', key: 'val' }
      ],
      destinationPath: 'destination'
    };
    const node = new ReadOpcUa('id', [['nid1']], config);
    await node.run({ flowVersionId: '321' }, {}).should.be.rejectedWith({
      message: 'Security Policy Basic128Rsa15 is deprecated.'
    });
  });
  it('should read a double from a byte string ID', async () => {
    const config = {
      uriTemplate: 'opc.tcp://localhost:4335/UA/Server',
      securityPolicyTemplate: 'None',
      securityModeTemplate: 'None',
      readInstructions: [
        { nameSpaceTemplate: '1', identifierTemplate: 'b=1020FFAA', key: 'val' }
      ],
      destinationPath: 'destination'
    };
    const node = new ReadOpcUa('id', [['nid1']], config);
    const output = await node.run({ flowVersionId: '123' }, {});
    output[1].destination.val.should.equal(10);
  });
  it('should read values from an array', async () => {
    const config = {
      uriTemplate: 'opc.tcp://localhost:4335/UA/Server',
      securityPolicyTemplate: 'None',
      securityModeTemplate: 'None',
      readInstructions: [
        { nameSpaceTemplate: '1', identifierTemplate: 's=MyVar4', key: 'val' }
      ],
      destinationPath: 'destination'
    };
    const node = new ReadOpcUa('id', [['nid1']], config);
    const output = await node.run({ flowVersionId: '123' }, {});
    output[1].destination.val.should.deepEqual([0.0, 1.1, 2.2, 3.3]);
  });
  it('should read multiple values at one time', async () => {
    const config = {
      uriTemplate: 'opc.tcp://localhost:4335/UA/Server',
      securityPolicyTemplate: 'None',
      securityModeTemplate: 'None',
      readInstructions: [
        { nameSpaceTemplate: '1', identifierTemplate: 'b=1020FFAA', key: 'val1' },
        { nameSpaceTemplate: '1', identifierTemplate: 's=MyVar3', key: 'val2' }
      ],
      destinationPath: 'destination'
    };
    const node = new ReadOpcUa('id', [['nid1']], config);
    const output = await node.run({ flowVersionId: '123' }, {});
    output[1].destination.val1.should.equal(10);
    output[1].destination.val2.should.equal('winter of our discontent');
  });
  it('should read multiple values from a payload path', async () => {
    const config = {
      uriTemplate: 'opc.tcp://localhost:4335/UA/Server',
      securityPolicyTemplate: 'None',
      securityModeTemplate: 'None',
      readInstructionsType: 'payloadPath',
      readInstructions: 'instructions',
      destinationPath: 'destination'
    };
    const node = new ReadOpcUa('id', [['nid1']], config);
    const output = await node.run({ flowVersionId: '123' }, {
      instructions: [
        { nameSpace: '1', identifier: 'b=1020FFAA', key: 'val1' },
        { nameSpace: '1', identifier: 's=MyVar3', key: 'val2' }
      ]
    });
    output[1].destination.val1.should.equal(10);
    output[1].destination.val2.should.equal('winter of our discontent');
  });
  it('should default keys for reads', async () => {
    const config = {
      uriTemplate: 'opc.tcp://localhost:4335/UA/Server',
      securityPolicyTemplate: 'None',
      securityModeTemplate: 'None',
      readInstructionsType: 'payloadPath',
      readInstructions: 'instructions',
      destinationPath: 'destination'
    };
    const node = new ReadOpcUa('id', [['nid1']], config);
    const output = await node.run({ flowVersionId: '123' }, {
      instructions: [
        { nameSpace: '1', identifier: 'b=1020FFAA' },
        { nameSpace: '1', identifier: 's=MyVar3' },
        { nameSpace: '1', identifier: 's=1234' }
      ]
    });
    output[1].destination.should.deepEqual({
      '1234': 'my key is a number, thats silly',
      '1020FFAA': 10,
      'MyVar3': 'winter of our discontent'
    });

  });
});
