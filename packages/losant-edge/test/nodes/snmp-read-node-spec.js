import '../common.js';
import ReadSnmp from '../../src/nodes/snmp-read-node.js';

describe('SNMP Read Node', () => {
  it('should error on missing host', async () => {
    const node = new ReadSnmp('id', [['nid1']], { readInstructions: [ { oidTemplate: '1.3.6.1.4.1.3052.10.1.1.1.1.6.1.5.1', resultKey: 'resulties.here' }] });
    await node.run({}, {}).should.be.rejectedWith({ message: 'Host is required.' });
  });
  it('should error on invalid host', async () => {
    const node = new ReadSnmp('id', [['nid1']], { hostTemplate: '{{ hostHere }}', readInstructions: [ { oidTemplate: '1.3.6.1.4.1.3052.10.1.1.1.1.6.1.5.1', resultKey: 'resulties.here' }] });
    await node.run({}, { hostHere: 'abc' }).should.be.rejectedWith({ message: 'Cannot resolve host: abc' });
  });
  it('should correctly default community to public', () => {
    const node = new ReadSnmp('id', [['nid1']], { hostTemplate: '{{ hostHere }}' });
    node.communityTemplate.should.equal('public');
  });
  it('should default version to Version2c', () => {
    const node = new ReadSnmp('id', [['nid1']], { hostTemplate: '{{ hostHere }}' });
    node.snmpVersionTemplate.should.equal('Version2c');
  });
  it('should error on invalid version', async () => {
    const node = new ReadSnmp('id', [['nid1']], { hostTemplate: '{{ hostHere }}', portTemplate: '{{ helloPort }}', sourcePortTemplate: '601', snmpVersionTemplate: '{{ shhNotARealVersion }}', readInstructions: [ { oidTemplate: '1.3.6.1.4.1.3052.10.1.1.1.1.6.1.5.1', resultKey: 'resulties.here' }] });
    await node.run({}, { hostHere: '127.0.0.1', helloPort: '123', shhNotARealVersion: 'Version4' }).should.be.rejectedWith({ message: 'Version "Version4" is invalid, must be one of the following values: Version1, Version2c, Version3.' });
  });
  it('should default port to 161', () => {
    const node = new ReadSnmp('id', [['nid1']], { hostTemplate: '{{ hostHere }}' });
    node.portTemplate.should.equal(161);
  });
  it('should error on invalid port number', async () => {
    const node = new ReadSnmp('id', [['nid1']], { hostTemplate: '{{ hostHere }}', sourcePortTemplate: '601', portTemplate: '{{ helloPort }}', readInstructions: [ { oidTemplate: '1.3.6.1.4.1.3052.10.1.1.1.1.6.1.5.1', resultKey: 'resulties.here' }] });
    await node.run({}, { hostHere: '127.0.0.1', helloPort: 'aabbbcc' }).should.be.rejectedWith({ message: 'Port "aabbbcc" is invalid, must be an integer between 0 and 65535.' });
  });
  it('should error on invalid port number', async () => {
    const node = new ReadSnmp('id', [['nid1']], { hostTemplate: '{{ hostHere }}', sourcePortTemplate: '{{ aaa }}', portTemplate: '{{ helloPort }}', readInstructions: [ { oidTemplate: '1.3.6.1.4.1.3052.10.1.1.1.1.6.1.5.1', resultKey: 'resulties.here' }] });
    await node.run({}, { hostHere: '127.0.0.1', helloPort: '1223', aaa: 'not a number bro' }).should.be.rejectedWith({ message: 'Source port "not a number bro" is invalid, must be an integer between 0 and 65535.' });
  });
  it('should error on missing Version3 user name', async () => {
    const node = new ReadSnmp('id', [['nid1']], { hostTemplate: '{{ hostHere }}', sourcePortTemplate: '601', portTemplate: '{{ helloPort }}', snmpVersionTemplate: 'Version3', readInstructions: [ { oidTemplate: '1.3.6.1.4.1.3052.10.1.1.1.1.6.1.5.1', resultKey: 'resulties.here' }] });
    await node.run({}, { hostHere: '127.0.0.1', helloPort: 3000 }).should.be.rejectedWith({ message: 'Username is required.' });
  });
  it('should default security level to none', async () => {
    const node = new ReadSnmp('id', [['nid1']], { hostTemplate: '{{ hostHere }}', portTemplate: '{{ helloPort }}', snmpVersionTemplate: 'Version3', nameTemplate: 'theNameOfMyUser' });
    node.securityLevelTemplate.should.equal('none');
  });
  it('should error on invalid auth method', async () => {
    const node = new ReadSnmp('id', [['nid1']], {
      hostTemplate: '{{ hostHere }}', portTemplate: '{{ helloPort }}', sourcePortTemplate: '601', snmpVersionTemplate: 'Version3', nameTemplate: 'theNameOfMyUser', securityLevelTemplate: 'auth', authMethodTemplate: '{{ authBoiii }}', readInstructions: [ { oidTemplate: '1.3.6.1.4.1.3052.10.1.1.1.1.6.1.5.1', resultKey: 'resulties.here' }]
    });
    await node.run({}, { hostHere: '127.0.0.1', helloPort: 3000, authBoiii: 'abbbba' }).should.be.rejectedWith({ message: 'Auth method "abbbba" is invalid, must be one of the following values: sha, md5, none.' });
  });
  it('should error on invalid security level', async () => {
    const node = new ReadSnmp('id', [['nid1']], {
      hostTemplate: '{{ hostHere }}', portTemplate: '{{ helloPort }}', sourcePortTemplate: '601', snmpVersionTemplate: 'Version3', nameTemplate: 'theNameOfMyUser', securityLevelTemplate: '{{ securityBoiii }}', readInstructions: [ { oidTemplate: '1.3.6.1.4.1.3052.10.1.1.1.1.6.1.5.1', resultKey: 'resulties.here' }]
    });
    await node.run({}, { hostHere: '127.0.0.1', helloPort: 3000, securityBoiii: 'abbbba' }).should.be.rejectedWith({ message: 'Security level "abbbba" is invalid, must be one of the following values: none, auth, authAndEncrypt.' });
  });
  it('should require auth method and auth key if security level is not none', async () => {
    const node = new ReadSnmp('id', [['nid1']], {
      hostTemplate: '{{ hostHere }}', portTemplate: '{{ helloPort }}', sourcePortTemplate: '601', snmpVersionTemplate: 'Version3', nameTemplate: 'theNameOfMyUser', securityLevelTemplate: '{{ securityBoiii }}', readInstructions: [ { oidTemplate: '1.3.6.1.4.1.3052.10.1.1.1.1.6.1.5.1', resultKey: 'resulties.here' }]
    });
    node.authMethodTemplate.should.equal('sha');
    await node.run({}, { hostHere: '127.0.0.1', helloPort: 3000, securityBoiii: 'auth' }).should.be.rejectedWith({ message: 'Auth key required.' });
  });
  it('should require encryption protocol and encryption key if security level is authAndEncrypt', async () => {
    const node = new ReadSnmp('id', [['nid1']], {
      hostTemplate: '{{ hostHere }}', portTemplate: '{{ helloPort }}', sourcePortTemplate: '601', snmpVersionTemplate: 'Version3', nameTemplate: 'theNameOfMyUser', securityLevelTemplate: '{{ securityBoiii }}', authKeyTemplate: '{{ authi }}', readInstructions: [ { oidTemplate: '1.3.6.1.4.1.3052.10.1.1.1.1.6.1.5.1', resultKey: 'resulties.here' }]
    });
    await node.run({}, { hostHere: '127.0.0.1', helloPort: 3000, securityBoiii: 'authAndEncrypt', authi: 'thisisanauthkey' }).should.be.rejectedWith({ message: 'Encryption method "" is invalid, must be one of the following values: des, aes.' });
  });
  it('should correctly validate provided read instructions - template strings', async () => {
    const node = new ReadSnmp('id', [['nid1']], {
      hostTemplate: '{{ hostHere }}', portTemplate: '{{ helloPort }}', snmpVersionTemplate: 'Version1', nameTemplate: 'theNameOfMyUser', securityLevelTemplate: '{{ securityBoiii }}', authKeyTemplate: '{{ authi }}', readInstructionsType: 'templateStrings', readInstructions: 'WRONG'
    });
    await node.run({}, { hostHere: '127.0.0.1', helloPort: 3000, securityBoiii: 'authAndEncrypt', authi: 'thisisanauthkey' }).should.be.rejectedWith({ message: 'SNMP Read Node instructions must be an array.' });
    const node2 = new ReadSnmp('id', [['nid1']], {
      hostTemplate: '{{ hostHere }}', portTemplate: '{{ helloPort }}', snmpVersionTemplate: 'Version1', nameTemplate: 'theNameOfMyUser', securityLevelTemplate: '{{ securityBoiii }}', authKeyTemplate: '{{ authi }}', readInstructionsType: 'templateStrings', readInstructions: [ 'WRONG', 'NOT AN OBJECT' ]
    });
    await node2.run({}, { hostHere: '127.0.0.1', helloPort: 3000, securityBoiii: 'authAndEncrypt', authi: 'thisisanauthkey' }).should.be.rejectedWith({ message: 'Each SNMP Read Node instruction must be an object.' });
  });
  it('should correctly validate provided read instructions - payload path', async () => {
    const node = new ReadSnmp('id', [['nid1']], {
      hostTemplate: '{{ hostHere }}', portTemplate: '{{ helloPort }}', snmpVersionTemplate: 'Version1', nameTemplate: 'theNameOfMyUser', securityLevelTemplate: '{{ securityBoiii }}', authKeyTemplate: '{{ authi }}', readInstructionsType: 'payloadPath', readInstructions: 'WRONG'
    });
    await node.run({}, { hostHere: '127.0.0.1', helloPort: 3000, securityBoiii: 'authAndEncrypt', authi: 'thisisanauthkey' }).should.be.rejectedWith({ message: 'SNMP Read Node instructions are required.' });
    const node2 = new ReadSnmp('id', [['nid1']], {
      hostTemplate: '{{ hostHere }}', portTemplate: '{{ helloPort }}', snmpVersionTemplate: 'Version1', nameTemplate: 'theNameOfMyUser', securityLevelTemplate: '{{ securityBoiii }}', authKeyTemplate: '{{ authi }}', readInstructionsType: 'payloadPath', readInstructions: 'nothing'
    });
    await node2.run({}, { hostHere: '127.0.0.1', helloPort: 3000, nothing: 'aaaa', securityBoiii: 'authAndEncrypt', authi: 'thisisanauthkey' }).should.be.rejectedWith({ message: 'SNMP Read Node instructions must be an array.' });
    const node3 = new ReadSnmp('id', [['nid1']], {
      hostTemplate: '{{ hostHere }}', portTemplate: '{{ helloPort }}', snmpVersionTemplate: 'Version1', nameTemplate: 'theNameOfMyUser', securityLevelTemplate: '{{ securityBoiii }}', authKeyTemplate: '{{ authi }}', readInstructionsType: 'payloadPath', readInstructions: 'nothing'
    });
    await node3.run({}, { hostHere: '127.0.0.1', helloPort: 3000, nothing: [], securityBoiii: 'authAndEncrypt', authi: 'thisisanauthkey' }).should.be.rejectedWith({ message: 'SNMP Read Node: At least one instruction is required.' });
    const node4 = new ReadSnmp('id', [['nid1']], {
      hostTemplate: '{{ hostHere }}', portTemplate: '{{ helloPort }}', snmpVersionTemplate: 'Version1', nameTemplate: 'theNameOfMyUser', securityLevelTemplate: '{{ securityBoiii }}', authKeyTemplate: '{{ authi }}', readInstructionsType: 'payloadPath', readInstructions: 'nothing'
    });
    await node4.run({}, { hostHere: '127.0.0.1', helloPort: 3000, nothing: [ 'aaaa', 'bbbb' ], securityBoiii: 'authAndEncrypt', authi: 'thisisanauthkey' }).should.be.rejectedWith({ message: 'Each SNMP Read Node instruction must be an object.' });
    await node4.run({}, { hostHere: '127.0.0.1', helloPort: 3000, nothing: [ { oid: '1.2.3.4' } ], securityBoiii: 'authAndEncrypt', authi: 'thisisanauthkey' }).should.be.rejectedWith({ message: 'SNMP Read Node instructions must have both oid and resultKey properties.' });
  });
});
