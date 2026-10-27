import { socat } from '../common.js';
import SerialWrite from '../../src/nodes/serial-write-node.js';

describe('SerialWriteNode', () => {
  beforeEach(async () => {
    await socat.listenSideB();
  });

  it('should write to a node', async () => {
    const node = new SerialWrite('id', [[1]], {
      pathTemplate: socat.serialPathSideA,
      writeTemplate: '{{ writeMe }}',
      resultPath: 'result'
    });
    const result = await node.run({}, { writeMe: 'hello-world' });
    result[1].result.should.equal(true);
    await socat.waitForSideB('hello-world');
    socat.receivedSideB().should.deepEqual('hello-world');
  });

  it('should write to a node, with encoding', async () => {
    const node = new SerialWrite('id', [[1]], {
      pathTemplate: socat.serialPathSideA,
      writeTemplate: '{{ writeMe }}',
      encodeTemplate: '{{ encoding }}',
      resultPath: 'result'
    });
    const result = await node.run({}, { writeMe: '77686174', encoding: 'hex' });
    result[1].result.should.equal(true);
    await socat.waitForSideB('what');
    socat.receivedSideB().should.deepEqual('what');
  });

  it('should error if pathTemplate is not defined', async () => {
    const node = new SerialWrite('id', [[1]], {
      pathTemplate: '{{ path }}',
      writeTemplate: '{{ writeMe }}',
      resultPath: 'result'
    });
    await node.run({}, {}).should.be.rejectedWith({
      type: 'Validation',
      message: 'Path Template is required for Serial Write Node.'
    });
    socat.receivedSideB().should.deepEqual('');
  });

  it('should error if writeTemplate is not defined', async () => {
    const node = new SerialWrite('id', [[1]], {
      pathTemplate: '{{ path }}',
      writeTemplate: '{{ writeMe }}',
      resultPath: 'result'
    });
    await node.run({}, { path: socat.serialPathSideA }).should.be.rejectedWith({
      type: 'Validation',
      message: 'Write Template is required for Serial Write Node.'
    });
    socat.receivedSideB().should.deepEqual('');
  });

  it('should error if pathTemplate is protected', async () => {
    const node = new SerialWrite('id', [[1]], {
      pathTemplate: '.{{ path }}',
      writeTemplate: '{{ writeMe }}',
      resultPath: 'result'
    });
    await node.run({}, { path: socat.serialPathSideA }).should.be.rejectedWith({
      type: 'Validation',
      message: 'Cannot access within the protected Losant Edge Agent directory.'
    });
    socat.receivedSideB().should.deepEqual('');
  });

  it('should error if pathTemplate is does not exist', async () => {
    const node = new SerialWrite('id', [[1]], {
      pathTemplate: '/tmp{{ path }}',
      writeTemplate: 'hello',
      resultPath: 'result'
    });
    const result = await node.run({}, { path: socat.serialPathSideA });
    result[1].result.should.deepEqual({
      error: `Error: No such file or directory, cannot open /tmp${socat.serialPathSideA}`
    });
    socat.receivedSideB().should.deepEqual('');
  }).timeout(20000);

  it('should error if encoding is not valid', async () => {
    const node = new SerialWrite('id', [[1]], {
      pathTemplate: '{{ path }}',
      writeTemplate: '{{ writeMe }}',
      resultPath: 'result',
      encodeTemplate: '{{ encode }}'
    });
    await node.run({}, {
      path: socat.serialPathSideA,
      writeMe: 'hello-world',
      encode: 'hexadecimal'
    }).should.be.rejectedWith({
      type: 'Validation',
      message: 'Encoding must be one of the following: ascii, utf8, utf16le, ucs2, base64, latin1, binary, hex.'
    });
    socat.receivedSideB().should.deepEqual('');
  });

  it('should error if baud rate is not a number', async () => {
    const node = new SerialWrite('id', [[1]], {
      pathTemplate: '{{ path }}',
      writeTemplate: '{{ writeMe }}',
      resultPath: 'result',
      encodeTemplate: '{{ encode }}',
      baudRateTemplate: '{{ notBaudRate }}'
    });
    await node.run({}, {
      path: socat.serialPathSideA,
      writeMe: 'hello-world',
      encode: 'hex'
    }).should.be.rejectedWith({
      type: 'Validation',
      message: 'Baud Rate is required.'
    });
    socat.receivedSideB().should.deepEqual('');
  });

  it('should error if baud rate is not a valid number', async () => {
    const node = new SerialWrite('id', [[1]], {
      pathTemplate: '{{ path }}',
      writeTemplate: '{{ writeMe }}',
      resultPath: 'result',
      encodeTemplate: '{{ encode }}',
      baudRateTemplate: '{{ baud }}'
    });
    await node.run({}, {
      path: socat.serialPathSideA,
      writeMe: 'hello-world',
      encode: 'hex',
      baud: -10
    }).should.be.rejectedWith({
      type: 'Validation',
      message: 'Baud Rate -10 is not valid, must be a positive integer.'
    });
    socat.receivedSideB().should.deepEqual('');
  });

  it('should run with additional connection properties set', async () => {
    await socat.reset();
    await socat.listenSideB({
      baudRate: 1200,
      dataBits: 5,
      stopBits: 2,
      rtscts: true
    });
    const node = new SerialWrite('id', [[1]], {
      pathTemplate: socat.serialPathSideA,
      writeTemplate: '{{ writeMe }}',
      resultPath: 'result',
      baudRateTemplate: '{{ baud }}',
      dataBitsTemplate: '{{ dataBits }}',
      stopBitsTemplate: '{{ stopBits }}',
      rtsctsTemplate: '{{ rtscts }}'
    });
    const result = await node.run({}, {
      writeMe: 'hello-world',
      baud: 1200,
      dataBits: 5,
      stopBits: 2,
      rtscts: true
    });
    result[1].result.should.equal(true);
    await socat.waitForSideB('hello-world');
    socat.receivedSideB().should.deepEqual('hello-world');
  });

  it('should error if parity is not a valid value', async () => {
    const node = new SerialWrite('id', [[1]], {
      pathTemplate: '{{ path }}',
      writeTemplate: '{{ writeMe }}',
      resultPath: 'result',
      encodeTemplate: '{{ encode }}',
      parityTemplate: '{{ parity }}'
    });
    await node.run({}, {
      path: socat.serialPathSideA,
      writeMe: 'hello-world',
      encode: 'hex',
      parity: 'incorrect'
    }).should.be.rejectedWith({
      type: 'Validation',
      message: 'Parity Template incorrect is not valid, valid parity values include none, even, mark, odd, space.'
    });
    socat.receivedSideB().should.deepEqual('');
  });

  it('should error if dataBits is not a valid value', async () => {
    const node = new SerialWrite('id', [[1]], {
      pathTemplate: '{{ path }}',
      writeTemplate: '{{ writeMe }}',
      resultPath: 'result',
      encodeTemplate: '{{ encode }}',
      dataBitsTemplate: '{{ dataBits }}'
    });
    await node.run({}, {
      path: socat.serialPathSideA,
      writeMe: 'hello-world',
      encode: 'hex',
      dataBits: 9
    }).should.be.rejectedWith({
      type: 'Validation',
      message: 'Data Bits Template 9 is not valid, valid data bits include 5, 6, 7, 8.'
    });
    socat.receivedSideB().should.deepEqual('');
  });

  it('should error if stopBits is not a valid value', async () => {
    const node = new SerialWrite('id', [[1]], {
      pathTemplate: '{{ path }}',
      writeTemplate: '{{ writeMe }}',
      resultPath: 'result',
      encodeTemplate: '{{ encode }}',
      stopBitsTemplate: '{{ stopBits }}'
    });
    await node.run({}, {
      path: socat.serialPathSideA,
      writeMe: 'hello-world',
      encode: 'hex',
      stopBits: 3
    }).should.be.rejectedWith({
      type: 'Validation',
      message: 'Stop Bits Template 3 is not valid, valid stop bits include 1, 2.'
    });
    socat.receivedSideB().should.deepEqual('');
  });
});
