import '../common.js';
import SnmpSubtree from '../../src/nodes/snmp-get-subtree-node.js';

describe('SNMP Get Subtree Node', () => {
  it('should error on missing host', async () => {
    const node = new SnmpSubtree('id', [['nid1']], { rootOidTemplate: '0.0.0.0' });
    await node.run({}, {}).should.be.rejectedWith({ message: 'Host is required.' });
  });
  it('should error on invalid host', async () => {
    const node = new SnmpSubtree('id', [['nid1']], { hostTemplate: '{{ hostHere }}', rootOidTemplate: '0.0.0.0' });
    await node.run({}, { hostHere: 'abc' }).should.be.rejectedWith({ message: 'Cannot resolve host: abc' });
  });
  it('should correctly default community to public', () => {
    const node = new SnmpSubtree('id', [['nid1']], { hostTemplate: '{{ hostHere }}' });
    node.communityTemplate.should.equal('public');
  });
  it('should default version to Version2c', () => {
    const node = new SnmpSubtree('id', [['nid1']], { hostTemplate: '{{ hostHere }}' });
    node.snmpVersionTemplate.should.equal('Version2c');
  });
  it('should error on invalid version', async () => {
    const node = new SnmpSubtree('id', [['nid1']], { hostTemplate: '{{ hostHere }}', sourcePortTemplate: '601', portTemplate: '{{ helloPort }}', snmpVersionTemplate: '{{ shhNotARealVersion }}', rootOidTemplate: '0.0.0.0' });
    await node.run({}, { hostHere: '127.0.0.1', helloPort: '123', shhNotARealVersion: 'Version4' }).should.be.rejectedWith({ message: 'Version "Version4" is invalid, must be one of the following values: Version1, Version2c, Version3.' });
  });
  it('should default port to 161', () => {
    const node = new SnmpSubtree('id', [['nid1']], { hostTemplate: '{{ hostHere }}' });
    node.portTemplate.should.equal(161);
  });
  it('should error on invalid port number', async () => {
    const node = new SnmpSubtree('id', [['nid1']], { hostTemplate: '{{ hostHere }}', sourcePortTemplate: '601', portTemplate: '{{ helloPort }}', rootOidTemplate: '0.0.0.0' });
    await node.run({}, { hostHere: '127.0.0.1', helloPort: 'aabbbcc' }).should.be.rejectedWith({ message: 'Port "aabbbcc" is invalid, must be an integer between 0 and 65535.' });
  });
  it('should error on missing Version3 user name', async () => {
    const node = new SnmpSubtree('id', [['nid1']], { hostTemplate: '{{ hostHere }}', portTemplate: '{{ helloPort }}', sourcePortTemplate: '601', snmpVersionTemplate: 'Version3', rootOidTemplate: '0.0.0.0' });
    await node.run({}, { hostHere: '127.0.0.1', helloPort: 3000 }).should.be.rejectedWith({ message: 'Username is required.' });
  });
  it('should default security level to none', async () => {
    const node = new SnmpSubtree('id', [['nid1']], { hostTemplate: '{{ hostHere }}', portTemplate: '{{ helloPort }}', snmpVersionTemplate: 'Version3', nameTemplate: 'theNameOfMyUser' });
    node.securityLevelTemplate.should.equal('none');
  });
  it('should error on invalid security level', async () => {
    const node = new SnmpSubtree('id', [['nid1']], {
      hostTemplate: '{{ hostHere }}', portTemplate: '{{ helloPort }}', snmpVersionTemplate: 'Version3', sourcePortTemplate: '601', nameTemplate: 'theNameOfMyUser', securityLevelTemplate: '{{ securityBoiii }}', rootOidTemplate: '0.0.0.0'
    });
    await node.run({}, { hostHere: '127.0.0.1', helloPort: 3000, securityBoiii: 'abbbba' }).should.be.rejectedWith({ message: 'Security level "abbbba" is invalid, must be one of the following values: none, auth, authAndEncrypt.' });
  });
  it('should require auth method and auth key if security level is not none', async () => {
    const node = new SnmpSubtree('id', [['nid1']], {
      hostTemplate: '{{ hostHere }}', portTemplate: '{{ helloPort }}', sourcePortTemplate: '601', snmpVersionTemplate: 'Version3', nameTemplate: 'theNameOfMyUser', securityLevelTemplate: '{{ securityBoiii }}', rootOidTemplate: '0.0.0.0'
    });
    node.authMethodTemplate.should.equal('sha');
    await node.run({}, { hostHere: '127.0.0.1', helloPort: 3000, securityBoiii: 'auth' }).should.be.rejectedWith({ message: 'Auth key required.' });
  });
  it('should require encryption protocol and encryption key if security level is authAndEncrypt', async () => {
    const node = new SnmpSubtree('id', [['nid1']], {
      hostTemplate: '{{ hostHere }}', portTemplate: '{{ helloPort }}', sourcePortTemplate: '601', snmpVersionTemplate: 'Version3', nameTemplate: 'theNameOfMyUser', securityLevelTemplate: '{{ securityBoiii }}', authKeyTemplate: '{{ authi }}', rootOidTemplate: '0.0.0.0'
    });
    await node.run({}, { hostHere: '127.0.0.1', helloPort: 3000, securityBoiii: 'authAndEncrypt', authi: 'thisisanauthkey' }).should.be.rejectedWith({ message: 'Encryption method "" is invalid, must be one of the following values: des, aes.' });
  });
  it('should require oidTemplate', async () => {
    const node = new SnmpSubtree('id', [['nid1']], { hostTemplate: '{{ hostHere }}' });
    await node.run({}, { hostHere: 'abc' }).should.be.rejectedWith({ message: 'Root OID required.' });
  });
  it('should error on invalid oids', async () => {
    const node = new SnmpSubtree('id', [['nid1']], { hostTemplate: '{{ hostHere }}', rootOidTemplate: '{{oid}}' });
    await node.run({}, { hostHere: 'abc' }).should.be.rejectedWith({ message: 'Root OID required.' });
    await node.run({}, { hostHere: 'abc', oid: '1' }).should.be.rejectedWith({ message: 'Invalid SNMP OID: 1' });
    await node.run({}, { hostHere: 'abc', oid: '9.1' }).should.be.rejectedWith({ message: 'Invalid SNMP OID: 9.1' });
    await node.run({}, { hostHere: 'abc', oid: '...' }).should.be.rejectedWith({ message: 'Invalid SNMP OID: ...' });
    await node.run({}, { hostHere: 'abc', oid: '1 2 . 3' }).should.be.rejectedWith({ message: 'Invalid SNMP OID: 1 2 . 3' });
  });
});
