import '../common.js';
import ReadSnmp from '../../src/nodes/snmp-read-node.js';
import WriteSnmp from '../../src/nodes/snmp-write-node.js';
import SubtreeSnmp from '../../src/nodes/snmp-get-subtree-node.js';

describe.skip('SNMP nodes', () => {
  // made to run with SnmpSimulator program - https://www.ireasoning.com/snmpsimulator.shtml

  // update these to expected initial values and values to write
  const expectedVal = 44;
  const valToWrite = 2;
  it('should correctly read value from device with v1 and v2c', async () => {
    // test v1
    let node = new ReadSnmp('id', [['nid1']], {
      hostTemplate: '{{ hostHere }}', portTemplate: '{{ helloPort }}', sourcePortTemplate: '602', snmpVersionTemplate: 'Version1', communityTemplate: '{{ commhere }}', readInstructionsType: 'templateStrings', readInstructions: [ { oidTemplate: '1.3.6.1.2.1.1.6.0', resultKey: 'resulties.here' }], resultPath: 'big.result'
    });
    let res = await node.run({}, { hostHere: '127.0.0.1', commhere: 'public', helloPort: '1610' });
    res[0].should.deepEqual([['nid1']]);
    res[1].should.deepEqual({
      hostHere: '127.0.0.1',
      commhere: 'public',
      helloPort: '1610',
      big: {
        result: {
          resulties: { here: expectedVal }
        }
      }
    });
    // test v2c
    node = new ReadSnmp('id', [['nid1']], {
      hostTemplate: '{{ hostHere }}', portTemplate: '{{ helloPort }}', sourcePortTemplate: '602', snmpVersionTemplate: 'Version2c', communityTemplate: '{{ commhere }}', readInstructionsType: 'payloadPath', readInstructions: 'theThing', resultPath: 'big.result'
    });
    res = await node.run({}, { hostHere: '127.0.0.1', commhere: 'public', helloPort: 1610, theThing: [ { oid: '1.3.6.1.2.1.1.6.0', resultKey: 'resulties.here' }] });
    res[0].should.deepEqual([['nid1']]);
    res[1].should.deepEqual({
      hostHere: '127.0.0.1',
      commhere: 'public',
      helloPort: 1610,
      theThing: [ { oid: '1.3.6.1.2.1.1.6.0', resultKey: 'resulties.here' }],
      big: {
        result: {
          resulties: { here: expectedVal }
        }
      }
    });
  });
  it('should correctly write value to device', async () => {
    // test v1
    let writeNode = new WriteSnmp('id1', [['nid2']], {
      hostTemplate: '127.0.0.1', portTemplate: 1610, snmpVersionTemplate: 'Version1', communityTemplate: 'public', resultPath: 'res.here', writeInstructionsType: 'payloadPath', writeInstructions: 'hello'
    });
    let writeRes = await writeNode.run({}, { hello: [{ oid: '1.3.6.1.2.1.1.6.0', resultKey: 'resulties.here', type: 'Integer', value: 44 }] });
    writeRes[0].should.deepEqual([['nid2']]);
    writeRes[1].should.deepEqual({
      hello: [{ oid: '1.3.6.1.2.1.1.6.0', resultKey: 'resulties.here', type: 'Integer', value: expectedVal }],
      res: {
        here: {
          resulties: { here: expectedVal }
        }
      }
    });
    // read back value to confirm it saved
    let readNode = new ReadSnmp('id', [['nid1']], {
      hostTemplate: '{{ hostHere }}', portTemplate: '{{ helloPort }}', snmpVersionTemplate: 'Version1', communityTemplate: '{{ commhere }}', readInstructionsType: 'templateStrings', readInstructions: [ { oidTemplate: '1.3.6.1.2.1.1.6.0', resultKey: 'resulties.here' }], resultPath: 'big.result'
    });
    let readRes = await readNode.run({}, { hostHere: '127.0.0.1', commhere: 'public', helloPort: 1610 });
    readRes[0].should.deepEqual([['nid1']]);
    readRes[1].should.deepEqual({
      hostHere: '127.0.0.1',
      commhere: 'public',
      helloPort: 1610,
      big: {
        result: {
          resulties: { here: expectedVal }
        }
      }
    });
    // v2 time
    writeNode = new WriteSnmp('id1', [['nid2']], {
      hostTemplate: '127.0.0.1', snmpVersionTemplate: 'Version2c', portTemplate: 1610, sourcePortTemplate: '602', communityTemplate: 'public', resultPath: 'res.here', writeInstructions: [{ oidTemplate: '1.3.6.1.2.1.1.6.0', resultKey: 'resulties.here', type: 'Integer', valueTemplate: 2 }]
    });
    writeRes = await writeNode.run({}, {});
    writeRes[0].should.deepEqual([['nid2']]);
    writeRes[1].should.deepEqual({
      res: {
        here: {
          resulties: { here: valToWrite }
        }
      }
    });
    // read back value to confirm it saved (again)
    readNode = new ReadSnmp('id', [['nid1']], {
      hostTemplate: '{{ hostHere }}', portTemplate: '{{ helloPort }}', sourcePortTemplate: '602', snmpVersionTemplate: 'Version1', communityTemplate: '{{ commhere }}', readInstructionsType: 'templateStrings', readInstructions: [ { oidTemplate: '1.3.6.1.2.1.1.6.0', resultKey: 'resulties.here' }], resultPath: 'big.result'
    });
    readRes = await readNode.run({}, { hostHere: '127.0.0.1', commhere: 'public', helloPort: 1610 });
    readRes[0].should.deepEqual([['nid1']]);
    readRes[1].should.deepEqual({
      hostHere: '127.0.0.1',
      commhere: 'public',
      helloPort: 1610,
      big: {
        result: {
          resulties: { here: valToWrite }
        }
      }
    });
  });
  it('should correctly connect and read with Version3', async () => {
    const node = new ReadSnmp('id', [['nid1']], {
      hostTemplate: '{{ hostHere }}', portTemplate: '{{ helloPort }}', sourcePortTemplate: '602', snmpVersionTemplate: 'Version3', nameTemplate: 'newUser', securityLevelTemplate: 'authAndEncrypt', authMethodTemplate: 'md5', authKeyTemplate: 'abc12345', encryptionMethodTemplate: 'des', encryptionKeyTemplate: 'abc12345', readInstructionsType: 'templateStrings', readInstructions: [ { oidTemplate: '1.3.6.1.2.1.1.5.0', resultKey: 'resulties.here' }], resultPath: 'big.result'
    });
    const res = await node.run({}, { hostHere: '127.0.0.1', commhere: 'public', helloPort: 1610 });
    res[0].should.deepEqual([['nid1']]);
    res[1].should.deepEqual({
      hostHere: '127.0.0.1',
      commhere: 'public',
      helloPort: 1610,
      big: {
        result: {
          resulties: { here: expectedVal }
        }
      }
    });
  });
  it('should correctly write with Version3', async () => {
    const writeNode = new WriteSnmp('id1', [['nid2']], {
      hostTemplate: '127.0.0.1', snmpVersionTemplate: 'Version3', portTemplate: 1610, sourcePortTemplate: '602', nameTemplate: 'newUser', securityLevelTemplate: 'authAndEncrypt', authMethodTemplate: 'md5', authKeyTemplate: 'abc12345', encryptionMethodTemplate: 'des', encryptionKeyTemplate: 'abc12345', resultPath: 'res.here', writeInstructions: [{ oidTemplate: '1.3.6.1.2.1.1.6.0', resultKey: 'resulties.here', type: 'Integer', valueTemplate: 2 }]
    });
    const writeRes = await writeNode.run({}, {});
    writeRes[0].should.deepEqual([['nid2']]);
    writeRes[1].should.deepEqual({
      res: {
        here: {
          resulties: { here: valToWrite }
        }
      }
    });
    // read back value to confirm it saved
    const readNode = new ReadSnmp('id', [['nid1']], {
      hostTemplate: '{{ hostHere }}', portTemplate: '{{ helloPort }}', sourcePortTemplate: '602', snmpVersionTemplate: 'Version3', nameTemplate: 'admin', securityLevelTemplate: 'authAndEncrypt', authMethodTemplate: 'md5', authKeyTemplate: 'test-secret-key', encryptionMethodTemplate: 'des', encryptionKeyTemplate: 'test-secret-key', readInstructionsType: 'templateStrings', readInstructions: [ { oidTemplate: '1.3.6.1.4.1.3052.10.1.1.1.1.5.2.6.1', resultKey: 'resulties.here' }], resultPath: 'big.result'
    });
    const readRes = await readNode.run({}, { hostHere: '127.0.0.1', commhere: 'public', helloPort: 161 });
    readRes[0].should.deepEqual([['nid1']]);
    readRes[1].should.deepEqual({
      hostHere: '127.0.0.1',
      commhere: 'public',
      helloPort: 161,
      big: {
        result: {
          resulties: { here: valToWrite }
        }
      }
    });
  });
  it('should correctly get subtree values', async () => {
    const subtreeNode = new SubtreeSnmp('id1', [['nid1']], {
      hostTemplate: '127.0.0.1', portTemplate: 1610, snmpVersionTemplate: 'Version2c', communityTemplate: 'public', rootOidTemplate: '1.3.6.1.2.1.1', resultPath: 'theVals'
    });
    const subtreeRes = await subtreeNode.run({}, {});
    subtreeRes[0].should.deepEqual([['nid1']]);
    Object.keys(subtreeRes[1].theVals).length.should.equal(4);
  });
  it('should correct change buffer error message to string error message', async () => {
    const writeNode = new WriteSnmp('id1', [['nid2']], {
      hostTemplate: '127.0.0.1', portTemplate: 1610, snmpVersionTemplate: 'Version1', communityTemplate: 'public', resultPath: 'res.here', writeInstructionsType: 'payloadPath', writeInstructions: 'hello'
    });
    const writeRes = await writeNode.run({}, { hello: [{ oid: '1.3.6.1.2.1.1.6.0', resultKey: 'resulties.here', type: 'OctetString', value: 44 }] });
    writeRes[0].should.deepEqual([['nid2']]);
    writeRes[1].should.deepEqual({
      hello: [{ oid: '1.3.6.1.2.1.1.6.0', resultKey: 'resulties.here', type: 'OctetString', value: expectedVal }],
      res: {
        here: {
          errors: [{ message: 'argument must be a string', type: 'SNMP_WRITE_ERROR' }]
        }
      }
    });
  });
});
