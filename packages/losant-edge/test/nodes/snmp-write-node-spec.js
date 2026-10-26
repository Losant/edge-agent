import '../common.js';
import WriteSnmp from '../../src/nodes/snmp-write-node.js';
import snmp from 'net-snmp';

describe('SNMP Write Node', () => {
  it('should error on missing host', async () => {
    const node = new WriteSnmp('id', [['nid1']], { writeInstructionsType: 'templateStrings', writeInstructions: [ { oidTemplate: '1.3.6.1.4.1.3052.10.1.1.1.1.6.1.5.1', resultKey: 'resulties.here', type: 'OctetString', valueTemplate: 'hello there' } ] });
    await node.run({}, {}).should.be.rejectedWith({ message: 'Host is required.' });
  });
  it('should error on invalid host', async () => {
    const node = new WriteSnmp('id', [['nid1']], { hostTemplate: '{{ hostHere }}', writeInstructionsType: 'templateStrings', writeInstructions: [ { oidTemplate: '1.3.6.1.4.1.3052.10.1.1.1.1.6.1.5.1', resultKey: 'resulties.here', type: 'OctetString', valueTemplate: 'hello there' } ] });
    await node.run({}, { hostHere: 'abc' }).should.be.rejectedWith({ message: 'Cannot resolve host: abc' });
  });
  it('should correctly default community to public', () => {
    const node = new WriteSnmp('id', [['nid1']], { hostTemplate: '{{ hostHere }}' });
    node.communityTemplate.should.equal('public');
  });
  it('should default version to Version2c', () => {
    const node = new WriteSnmp('id', [['nid1']], { hostTemplate: '{{ hostHere }}' });
    node.snmpVersionTemplate.should.equal('Version2c');
  });
  it('should error on invalid version', async () => {
    const node = new WriteSnmp('id', [['nid1']], {
      hostTemplate: '{{ hostHere }}', portTemplate: '{{ helloPort }}', sourcePortTemplate: '601', snmpVersionTemplate: '{{ shhNotARealVersion }}', writeInstructionsType: 'templateStrings', writeInstructions: [ { oidTemplate: '1.3.6.1.4.1.3052.10.1.1.1.1.6.1.5.1', resultKey: 'resulties.here', type: 'OctetString', valueTemplate: 'hello there' } ]
    });
    await node.run({}, { hostHere: '127.0.0.1', helloPort: '123', shhNotARealVersion: 'Version4' }).should.be.rejectedWith({ message: 'Version "Version4" is invalid, must be one of the following values: Version1, Version2c, Version3.' });
  });
  it('should default port to 161', () => {
    const node = new WriteSnmp('id', [['nid1']], { hostTemplate: '{{ hostHere }}' });
    node.portTemplate.should.equal(161);
  });
  it('should error on invalid port number', async () => {
    const node = new WriteSnmp('id', [['nid1']], { hostTemplate: '{{ hostHere }}', portTemplate: '{{ helloPort }}', writeInstructionsType: 'templateStrings', writeInstructions: [ { oidTemplate: '1.3.6.1.4.1.3052.10.1.1.1.1.6.1.5.1', resultKey: 'resulties.here', type: 'OctetString', valueTemplate: 'hello there' } ] });
    await node.run({}, { hostHere: '127.0.0.1', helloPort: 'aabbbcc' }).should.be.rejectedWith({ message: 'Port "aabbbcc" is invalid, must be an integer between 0 and 65535.' });
  });
  it('should error on missing Version3 user name', async () => {
    const node = new WriteSnmp('id', [['nid1']], {
      hostTemplate: '{{ hostHere }}', portTemplate: '{{ helloPort }}', sourcePortTemplate: '601', snmpVersionTemplate: 'Version3', writeInstructionsType: 'templateStrings', writeInstructions: [ { oidTemplate: '1.3.6.1.4.1.3052.10.1.1.1.1.6.1.5.1', resultKey: 'resulties.here', type: 'OctetString', valueTemplate: 'hello there' } ]
    });
    await node.run({}, { hostHere: '127.0.0.1', helloPort: 3000 }).should.be.rejectedWith({ message: 'Username is required.' });
  });
  it('should default security level to none', async () => {
    const node = new WriteSnmp('id', [['nid1']], { hostTemplate: '{{ hostHere }}', portTemplate: '{{ helloPort }}', snmpVersionTemplate: 'Version3', nameTemplate: 'theNameOfMyUser' });
    node.securityLevelTemplate.should.equal('none');
  });
  it('should error on invalid security level', async () => {
    const node = new WriteSnmp('id', [['nid1']], {
      hostTemplate: '{{ hostHere }}', portTemplate: '{{ helloPort }}', snmpVersionTemplate: 'Version3', sourcePortTemplate: '601', nameTemplate: 'theNameOfMyUser', securityLevelTemplate: '{{ securityBoiii }}', writeInstructionsType: 'templateStrings', writeInstructions: [ { oidTemplate: '1.3.6.1.4.1.3052.10.1.1.1.1.6.1.5.1', resultKey: 'resulties.here', type: 'OctetString', valueTemplate: 'hello there' } ]
    });
    await node.run({}, { hostHere: '127.0.0.1', helloPort: 3000, securityBoiii: 'abbbba' }).should.be.rejectedWith({ message: 'Security level "abbbba" is invalid, must be one of the following values: none, auth, authAndEncrypt.' });
  });
  it('should require auth method and auth key if security level is not none', async () => {
    const node = new WriteSnmp('id', [['nid1']], {
      hostTemplate: '{{ hostHere }}', portTemplate: '{{ helloPort }}', sourcePortTemplate: '601', snmpVersionTemplate: 'Version3', nameTemplate: 'theNameOfMyUser', securityLevelTemplate: '{{ securityBoiii }}', writeInstructionsType: 'templateStrings', writeInstructions: [ { oidTemplate: '1.3.6.1.4.1.3052.10.1.1.1.1.6.1.5.1', resultKey: 'resulties.here', type: 'OctetString', valueTemplate: 'hello there' } ]
    });
    node.authMethodTemplate.should.equal('sha');
    await node.run({}, { hostHere: '127.0.0.1', helloPort: 3000, securityBoiii: 'auth' }).should.be.rejectedWith({ message: 'Auth key required.' });
  });
  it('should require encryption protocol and encryption key if security level is authAndEncrypt', async () => {
    const node = new WriteSnmp('id', [['nid1']], {
      hostTemplate: '{{ hostHere }}', portTemplate: '{{ helloPort }}', sourcePortTemplate: '601', snmpVersionTemplate: 'Version3', nameTemplate: 'theNameOfMyUser', securityLevelTemplate: '{{ securityBoiii }}', authKeyTemplate: '{{ authi }}', writeInstructionsType: 'templateStrings', writeInstructions: [ { oidTemplate: '1.3.6.1.4.1.3052.10.1.1.1.1.6.1.5.1', resultKey: 'resulties.here', type: 'OctetString', valueTemplate: 'hello there' } ]
    });
    await node.run({}, { hostHere: '127.0.0.1', helloPort: 3000, securityBoiii: 'authAndEncrypt', authi: 'thisisanauthkey' }).should.be.rejectedWith({ message: 'Encryption method "" is invalid, must be one of the following values: des, aes.' });
  });
  it('should correctly validate provided write instructions - template strings', async () => {
    const node = new WriteSnmp('id', [['nid1']], {
      hostTemplate: '{{ hostHere }}', portTemplate: '{{ helloPort }}', snmpVersionTemplate: 'Version1', nameTemplate: 'theNameOfMyUser', securityLevelTemplate: '{{ securityBoiii }}', authKeyTemplate: '{{ authi }}', writeInstructionsType: 'templateStrings', writeInstructions: 'WRONG'
    });
    await node.run({}, { hostHere: '127.0.0.1', helloPort: 3000, securityBoiii: 'authAndEncrypt', authi: 'thisisanauthkey' }).should.be.rejectedWith({ message: 'SNMP Write Node instructions must be an array.' });
    const node2 = new WriteSnmp('id', [['nid1']], {
      hostTemplate: '{{ hostHere }}', portTemplate: '{{ helloPort }}', snmpVersionTemplate: 'Version1', nameTemplate: 'theNameOfMyUser', securityLevelTemplate: '{{ securityBoiii }}', authKeyTemplate: '{{ authi }}', writeInstructionsType: 'templateStrings', writeInstructions: [ 'WRONG', 'NOT AN OBJECT' ]
    });
    await node2.run({}, { hostHere: '127.0.0.1', helloPort: 3000, securityBoiii: 'authAndEncrypt', authi: 'thisisanauthkey' }).should.be.rejectedWith({ message: 'Each SNMP Write Node instruction must be an object.' });
    const node3 = new WriteSnmp('id', [['nid1']], {
      hostTemplate: '{{ hostHere }}', portTemplate: '{{ helloPort }}', snmpVersionTemplate: 'Version1', nameTemplate: 'theNameOfMyUser', securityLevelTemplate: '{{ securityBoiii }}', authKeyTemplate: '{{ authi }}', writeInstructionsType: 'templateStrings', writeInstructions: [ { oidTemplate: '1.2.3.4', type: 'Integer' } ]
    });
    await node3.run({}, { hostHere: '127.0.0.1', helloPort: 3000, securityBoiii: 'authAndEncrypt', authi: 'thisisanauthkey' }).should.be.rejectedWith({ message: 'Invalid SNMP Value: undefined' });
  });
  it('should correctly validate provided write instructions - payload path', async () => {
    const node = new WriteSnmp('id', [['nid1']], {
      hostTemplate: '{{ hostHere }}', portTemplate: '{{ helloPort }}', snmpVersionTemplate: 'Version1', nameTemplate: 'theNameOfMyUser', securityLevelTemplate: '{{ securityBoiii }}', authKeyTemplate: '{{ authi }}', writeInstructionsType: 'payloadPath', writeInstructions: 'WRONG'
    });
    await node.run({}, { hostHere: '127.0.0.1', helloPort: 3000, securityBoiii: 'authAndEncrypt', authi: 'thisisanauthkey' }).should.be.rejectedWith({ message: 'SNMP Write Node instructions are required.' });
    const node2 = new WriteSnmp('id', [['nid1']], {
      hostTemplate: '{{ hostHere }}', portTemplate: '{{ helloPort }}', snmpVersionTemplate: 'Version1', nameTemplate: 'theNameOfMyUser', securityLevelTemplate: '{{ securityBoiii }}', authKeyTemplate: '{{ authi }}', writeInstructionsType: 'payloadPath', writeInstructions: 'nothing'
    });
    await node2.run({}, { hostHere: '127.0.0.1', helloPort: 3000, nothing: 'aaaa', securityBoiii: 'authAndEncrypt', authi: 'thisisanauthkey' }).should.be.rejectedWith({ message: 'SNMP Write Node instructions must be an array.' });
    const node3 = new WriteSnmp('id', [['nid1']], {
      hostTemplate: '{{ hostHere }}', portTemplate: '{{ helloPort }}', snmpVersionTemplate: 'Version1', nameTemplate: 'theNameOfMyUser', securityLevelTemplate: '{{ securityBoiii }}', authKeyTemplate: '{{ authi }}', writeInstructionsType: 'payloadPath', writeInstructions: 'nothing'
    });
    await node3.run({}, { hostHere: '127.0.0.1', helloPort: 3000, nothing: [], securityBoiii: 'authAndEncrypt', authi: 'thisisanauthkey' }).should.be.rejectedWith({ message: 'SNMP Write Node: At least one instruction is required.' });
    const node4 = new WriteSnmp('id', [['nid1']], {
      hostTemplate: '{{ hostHere }}', portTemplate: '{{ helloPort }}', snmpVersionTemplate: 'Version1', nameTemplate: 'theNameOfMyUser', securityLevelTemplate: '{{ securityBoiii }}', authKeyTemplate: '{{ authi }}', writeInstructionsType: 'payloadPath', writeInstructions: 'nothing'
    });
    await node4.run({}, { hostHere: '127.0.0.1', helloPort: 3000, nothing: [ 'aaaa', 'bbbb' ], securityBoiii: 'authAndEncrypt', authi: 'thisisanauthkey' }).should.be.rejectedWith({ message: 'Each SNMP Write Node instruction must be an object.' });
    await node4.run({}, { hostHere: '127.0.0.1', helloPort: 3000, nothing: [ { oid: '1.2.3.4' } ], securityBoiii: 'authAndEncrypt', authi: 'thisisanauthkey' }).should.be.rejectedWith({ message: 'SNMP Write Node instructions must have all of the following properties: oid, type, and value if type is not "Null".' });
  });
  describe('with fake agent', async () => {
    let agent, responses = [];
    beforeEach(() => {
      agent = snmp.createAgent({ port: 3000, accessControlModelType: snmp.AccessControlModelType.Simple }, (error, data) => {
        if (error) {
          responses.push(error);
          return;
        }
        responses.push(data.pdu.varbinds[0].requestValue);
      });
      const myScalarProvider = {
        name: 'testInt',
        type: snmp.MibProviderType.Scalar,
        oid: '1.3.6.1.2.1.1.1',
        scalarType: snmp.ObjectType.Integer,
        maxAccess: 3
      };
      const mib = agent.getMib();
      mib.registerProvider(myScalarProvider);
      mib.setScalarValue('testInt', 3);
      const myScalarBoolProvider = {
        name: 'testBool',
        type: snmp.MibProviderType.Scalar,
        oid: '1.3.6.1.2.1.1.2',
        scalarType: snmp.ObjectType.Boolean,
        maxAccess: 3
      };
      mib.registerProvider(myScalarBoolProvider);
      mib.setScalarValue('testBool', false);
      const myScalarStringProvider = {
        name: 'testStr',
        type: snmp.MibProviderType.Scalar,
        oid: '1.3.6.1.2.1.1.3',
        scalarType: snmp.ObjectType.OctetString,
        maxAccess: 3
      };
      mib.registerProvider(myScalarStringProvider);
      mib.setScalarValue('testStr', 'hello world');
      const authorizer = agent.getAuthorizer();
      authorizer.addCommunity('public');
      (authorizer.getAccessControlModel()).setCommunityAccess('public', snmp.AccessLevel.ReadWrite);
    });

    afterEach(() => {
      agent?.close();
      responses = [];
    });
    it('should correctly convert an integer passed in as a string', async () => {
      const expectedValues = [1, 11];
      let node = new WriteSnmp('id', [['nid1']], {
        hostTemplate: '{{ hostHere }}',
        portTemplate: '{{ helloPort }}',
        snmpVersionTemplate: 'Version1',
        nameTemplate: 'theNameOfMyUser',
        writeInstructionsType: 'templateStrings',
        writeInstructions: [ { oidTemplate: '1.3.6.1.2.1.1.1.0', type: 'Integer', valueTemplate: '1' } ]
      });
      await node.run({}, { hostHere: '127.0.0.1', helloPort: 3000 });
      node = new WriteSnmp('id', [['nid1']], {
        hostTemplate: '{{ hostHere }}',
        portTemplate: '{{ helloPort }}',
        snmpVersionTemplate: 'Version1',
        nameTemplate: 'theNameOfMyUser',
        writeInstructionsType: 'templateStrings',
        writeInstructions: [ { oidTemplate: '1.3.6.1.2.1.1.1.0', type: 'Integer', valueTemplate: '{{ add 1 10 }}' } ]
      });
      await node.run({}, { hostHere: '127.0.0.1', helloPort: 3000 });
      node = new WriteSnmp('id', [['nid1']], {
        hostTemplate: '{{ hostHere }}',
        portTemplate: '{{ helloPort }}',
        snmpVersionTemplate: 'Version1',
        nameTemplate: 'theNameOfMyUser',
        writeInstructionsType: 'templateStrings',
        writeInstructions: [ { oidTemplate: '1.3.6.1.2.1.1.1.0', type: 'Integer', valueTemplate: 'hello' } ]
      });
      await node.run({}, { hostHere: '127.0.0.1', helloPort: 3000 }).should.be.rejectedWith({ message: 'Invalid integer value for SNMP write: "hello".' });
      responses.should.deepEqual(expectedValues);
    });
    it('should correctly convert a boolean passed in as an int or a string', async () => {
      const expectedValues = [true, true, true, false, false];
      let node = new WriteSnmp('id', [['nid1']], {
        hostTemplate: '{{ hostHere }}', portTemplate: '{{ helloPort }}', snmpVersionTemplate: 'Version1', nameTemplate: 'theNameOfMyUser', writeInstructionsType: 'templateStrings', writeInstructions: [ { oidTemplate: '1.3.6.1.2.1.1.2.0', type: 'Boolean', valueTemplate: '1' } ]
      });
      await node.run({}, { hostHere: '127.0.0.1', helloPort: 3000, securityBoiii: 'authAndEncrypt', authi: 'thisisanauthkey' });
      node = new WriteSnmp('id', [['nid1']], {
        hostTemplate: '{{ hostHere }}', portTemplate: '{{ helloPort }}', snmpVersionTemplate: 'Version1', nameTemplate: 'theNameOfMyUser', writeInstructionsType: 'templateStrings', writeInstructions: [ { oidTemplate: '1.3.6.1.2.1.1.2.0', type: 'Boolean', valueTemplate: '{{ add 1 0 }}' } ]
      });
      await node.run({}, { hostHere: '127.0.0.1', helloPort: 3000, securityBoiii: 'authAndEncrypt', authi: 'thisisanauthkey' });
      node = new WriteSnmp('id', [['nid1']], {
        hostTemplate: '{{ hostHere }}', portTemplate: '{{ helloPort }}', snmpVersionTemplate: 'Version1', nameTemplate: 'theNameOfMyUser', writeInstructionsType: 'templateStrings', writeInstructions: [ { oidTemplate: '1.3.6.1.2.1.1.2.0', type: 'Boolean', valueTemplate: 1 } ]
      });
      await node.run({}, { hostHere: '127.0.0.1', helloPort: 3000, securityBoiii: 'authAndEncrypt', authi: 'thisisanauthkey' });
      node = new WriteSnmp('id', [['nid1']], {
        hostTemplate: '{{ hostHere }}', portTemplate: '{{ helloPort }}', snmpVersionTemplate: 'Version1', nameTemplate: 'theNameOfMyUser', writeInstructionsType: 'templateStrings', writeInstructions: [ { oidTemplate: '1.3.6.1.2.1.1.2.0', type: 'Boolean', valueTemplate: 0 } ]
      });
      await node.run({}, { hostHere: '127.0.0.1', helloPort: 3000, securityBoiii: 'authAndEncrypt', authi: 'thisisanauthkey' });
      node = new WriteSnmp('id', [['nid1']], {
        hostTemplate: '{{ hostHere }}', portTemplate: '{{ helloPort }}', snmpVersionTemplate: 'Version1', nameTemplate: 'theNameOfMyUser', writeInstructionsType: 'templateStrings', writeInstructions: [ { oidTemplate: '1.3.6.1.2.1.1.2.0', type: 'Boolean', valueTemplate: '0' } ]
      });
      await node.run({}, { hostHere: '127.0.0.1', helloPort: 3000, securityBoiii: 'authAndEncrypt', authi: 'thisisanauthkey' });
      responses.should.deepEqual(expectedValues);
    });
    it('should correctly convert a string passed in as an int or a bool', async () => {
      const expectedValues = ['1', 'false'];
      let node = new WriteSnmp('id', [['nid1']], {
        hostTemplate: '{{ hostHere }}', portTemplate: '{{ helloPort }}', snmpVersionTemplate: 'Version1', nameTemplate: 'theNameOfMyUser', writeInstructionsType: 'templateStrings', writeInstructions: [ { oidTemplate: '1.3.6.1.2.1.1.3.0', type: 'OctetString', valueTemplate: 1 } ]
      });
      await node.run({}, { hostHere: '127.0.0.1', helloPort: 3000, securityBoiii: 'authAndEncrypt', authi: 'thisisanauthkey' });
      node = new WriteSnmp('id', [['nid1']], {
        hostTemplate: '{{ hostHere }}', portTemplate: '{{ helloPort }}', snmpVersionTemplate: 'Version1', nameTemplate: 'theNameOfMyUser', writeInstructionsType: 'templateStrings', writeInstructions: [ { oidTemplate: '1.3.6.1.2.1.1.3.0', type: 'OctetString', valueTemplate: false } ]
      });
      await node.run({}, { hostHere: '127.0.0.1', helloPort: 3000, securityBoiii: 'authAndEncrypt', authi: 'thisisanauthkey' });
      responses.should.deepEqual(expectedValues);
    });
  });


});
