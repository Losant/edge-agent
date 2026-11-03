import '../common.js';
import ModbusWriteNode from '../../src/nodes/modbus-write-node.js';
import ModbusReadNode from '../../src/nodes/modbus-read-node.js';

// this can be tested on uno with https://www.modbusdriver.com/diagslave.html and socat
// download diagslave curl --output diagslave.tgz  https://www.modbusdriver.com/downloads/diagslave.tgz
// install socat with apt install socat
// socat and diagslae will need to started on different terminals.
// first start socat "socat -d -d pty,raw,echo=0 pty,raw,echo=0"
// two named links in output like /dev/pts/3 and /dev/pts/4 will be created
// then start the diagslave "~/diagslave/x86_64-linux-gnu/diagslave -b 9600 -p none -a 1 -m ascii <second PTY output from socat>"
// I had trouble running pnpm edge:test directly
// so either attempt to run this test only and disable socat in the common file OR
// import modbus write and modbus read node on the repl and then
// copy and paste this test into the repl without the should assertions.

describe.skip('Serial Modbus Read Write Node', () => {
  it('should write the current value and then read it from the same register over serial', async function() {
    const config = {
      pathTemplate: '{{path}}',
      connectionTypeTemplate: 'asciiSerial',
      parityTemplate: 'none'
    };
    const configRead = {
      ...config,
      pathTemplate: '{{path}}',
      connectionTypeTemplate: 'asciiSerial',
      parityTemplate: 'none',
      readInstructions: [{ typeTemplate: 'holding-register', addressTemplate: 4, key: 'output' }],
      destinationPath: 'readDestination',
      unitIdTemplate: '1',
      dataBitsTemplate: '8'
    };
    const configWrite = {
      ...config,
      pathTemplate: '{{path}}',
      connectionTypeTemplate: 'asciiSerial',
      parityTemplate: 'none',
      writeInstructions: [{ typeTemplate: 'holding-register', addressTemplate: 4, valueTemplate: 100 }],
      destinationPath: 'writeDestination'
    };
    const payload = { path: '/dev/pts/3' }; // path is the first PTY output from socat
    const writeNode = new ModbusWriteNode('id', [[1]], configWrite);
    const output = await writeNode.run({}, payload);
    output[1].writeDestination.should.deepEqual({ 'addr-4': true });


    const readNode = new ModbusReadNode('id', [[1]], configRead);
    const readResult = await readNode.run({}, payload);
    readResult[1].readDestination.should.deepEqual({ output: [ 100 ] });
  });
});
