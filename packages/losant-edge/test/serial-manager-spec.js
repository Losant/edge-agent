import { should, socat } from './common.js';
import { sleep } from 'omnibelt';
import SerialManager from '../src/serial-manager.js';

const waitForLength = async (array, length) => {
  if (array.length >= length) { return; }
  await sleep(10);
  return waitForLength(array, length);
};

describe('Serial Manager', () => {
  let serialManager;

  beforeEach(async () => {
    await socat.listenSideB();
  });

  afterEach(async () => {
    if (serialManager) {
      await serialManager.shutdown();
      serialManager = null;
    }
  });

  it('should not initialize a port if delimiter and byteLength are both given', async () => {
    const serialId = 'anId1';
    serialManager = SerialManager();
    await serialManager.initialize([{
      serialId,
      path: socat.serialPathSideA,
      baudRate: 9600,
      delimiter: '-',
      byteLength: '8'
    }], async () => {
      throw Error('Shots Fired...PEW PEW..this test should not have fired a trigger.');
    });
    await sleep(100);

    const ports = serialManager.getPorts();
    ports.length.should.equal(0);
    socat.receivedSideB().should.deepEqual('');
  });

  it('should write to the serial first', async () => {
    const serialId = 'anId1';
    const triggers = [];
    serialManager = SerialManager();
    await serialManager.initialize([{
      serialId,
      path: socat.serialPathSideA,
      baudRate: 9600,
      delimiter: '-',
      writeOnOpen: 'hello world-',
      writeOnOpenEncoding: 'utf8'
    }], async (triggerFire) => {
      triggers.push(triggerFire);
      await sleep(0);
    });
    await sleep(100);
    socat.receivedSideB().should.deepEqual('hello world-');

    triggers.length.should.equal(0);
    await socat.writeSideB('good-bye-');
    await waitForLength(triggers, 2);
    triggers[0].payload.data.serial.should.equal('good');
    triggers[1].payload.data.serial.should.equal('bye');

    socat.receivedSideB().should.deepEqual('hello world-');
  });

  it('should trigger on serial delimiter communication event', async () => {
    const serialId = 'anId1';
    const triggers = [];
    serialManager = SerialManager();
    await serialManager.initialize([{
      serialId,
      path: socat.serialPathSideA,
      baudRate: 9600,
      delimiter: '-'
    }], async (triggerFire) => {
      triggers.push(triggerFire);
      await sleep(0);
    });
    await sleep(100);

    triggers.length.should.equal(0);
    await socat.writeSideB('Hi-ROBO-COP!- - -abc-');
    await waitForLength(triggers, 6);
    triggers[0].triggerId.should.equal(serialId);
    triggers[0].triggerType.should.equal('serial');
    should.exist(triggers[0].payload.time);
    // should that ready be removed but it also indicates
    triggers[0].payload.data.serial.should.equal('Hi');
    triggers[1].payload.data.serial.should.equal('ROBO');
    triggers[2].payload.data.serial.should.equal('COP!');
    triggers[3].payload.data.serial.should.equal(' ');
    triggers[4].payload.data.serial.should.equal(' ');
    triggers[5].payload.data.serial.should.equal('abc');

    triggers.length.should.equal(6);
    await socat.writeSideB('wait for it...');
    await sleep(50);
    triggers.length.should.equal(6);
    await socat.writeSideB('-');
    await waitForLength(triggers, 7);
    triggers[6].payload.data.serial.should.equal('wait for it...');

    socat.receivedSideB().should.deepEqual('');
  });

  it('should trigger on serial delimiter communication event (newline)', async () => {
    const serialId = 'anId1';
    const triggers = [];
    serialManager = SerialManager();
    await serialManager.initialize([{
      serialId,
      path: socat.serialPathSideA,
      baudRate: 9600,
      delimiter: '\\n'
    }], async (triggerFire) => {
      triggers.push(triggerFire);
      await sleep(0);
    });
    await sleep(100);

    triggers.length.should.equal(0);
    await socat.writeSideB('hi\n Robo\n Cop\n Phew\n Phew\n');
    await waitForLength(triggers, 5);
    triggers[0].triggerId.should.equal(serialId);
    triggers[0].triggerType.should.equal('serial');
    should.exist(triggers[0].payload.time);
    triggers[0].payload.data.serial.should.equal('hi');
    triggers[1].payload.data.serial.should.equal(' Robo');
    triggers[2].payload.data.serial.should.equal(' Cop');
    triggers[3].payload.data.serial.should.equal(' Phew');
    triggers[4].payload.data.serial.should.equal(' Phew');

    triggers.length.should.equal(5);
    await socat.writeSideB('wait for it...');
    await sleep(50);
    triggers.length.should.equal(5);
    await socat.writeSideB('\n');
    await waitForLength(triggers, 6);
    triggers[5].payload.data.serial.should.equal('wait for it...');

    socat.receivedSideB().should.deepEqual('');
  });

  it('should trigger on serial byte length communication event', async () => {
    const serialId = 'anId1';
    const triggers = [];
    serialManager = SerialManager();
    await serialManager.initialize([{
      serialId,
      path: socat.serialPathSideA,
      baudRate: 9600,
      byteLength: '8'
    }], async (triggerFire) => {
      triggers.push(triggerFire);
      await sleep(0);
    });
    await sleep(100);

    triggers.length.should.equal(0);
    await socat.writeSideB('Hi Robot!!!!!!!!');
    await waitForLength(triggers, 2);
    triggers[0].triggerId.should.equal(serialId);
    triggers[0].triggerType.should.equal('serial');
    should.exist(triggers[0].payload.time);
    triggers[0].payload.data.serial.should.equal('Hi Robot');
    triggers[1].payload.data.serial.should.equal('!!!!!!!!');

    triggers.length.should.equal(2);
    await socat.writeSideB('wait...');
    await sleep(50);
    triggers.length.should.equal(2);
    await socat.writeSideB('!');
    await waitForLength(triggers, 3);
    triggers[2].payload.data.serial.should.equal('wait...!');

    socat.receivedSideB().should.deepEqual('');
  });

  it('should handle updates', async () => {
    const serialId = 'anId1';
    const triggers = [];
    serialManager = SerialManager();
    await serialManager.initialize([{
      serialId,
      path: socat.serialPathSideA,
      baudRate: 9600,
      byteLength: '8',
      writeOnOpen: 'first config'
    }], async (triggerFire) => {
      triggers.push(triggerFire);
      await sleep(0);
    });
    await sleep(100);
    socat.receivedSideB().should.deepEqual('first config');

    triggers.length.should.equal(0);
    await socat.writeSideB('Hi Robot!!!!!!!!');
    await waitForLength(triggers, 2);
    triggers[0].triggerId.should.equal(serialId);
    triggers[0].triggerType.should.equal('serial');
    should.exist(triggers[0].payload.time);
    triggers[0].payload.data.serial.should.equal('Hi Robot');
    triggers[1].payload.data.serial.should.equal('!!!!!!!!');

    await serialManager.update([{
      serialId,
      path: socat.serialPathSideA,
      baudRate: 9600,
      delimiter: '-',
      writeOnOpen: ' second config'
    }], async (triggerFire) => {
      triggers.push(triggerFire);
      await sleep(0);
    });
    await sleep(100);
    socat.receivedSideB().should.deepEqual('first config second config');

    triggers.length.should.equal(2);
    await socat.writeSideB('hello-');
    await waitForLength(triggers, 3);
    triggers[2].payload.data.serial.should.equal('hello');

    socat.receivedSideB().should.deepEqual('first config second config');
  });

  it('should reopen itself when someone else closes it.', async () => {
    serialManager = SerialManager();
    const serialId = 'anId1';
    const triggers = [];
    await serialManager.initialize([{
      serialId,
      path: socat.serialPathSideA,
      baudRate: 9600,
      delimiter: '-',
      writeOnOpen: 'hello-'
    }], async (data) => {
      triggers.push(data);
      await sleep(0);
    });
    await sleep(100);
    socat.receivedSideB().should.deepEqual('hello-');
    let ports = serialManager.getPorts();
    ports[0].isOpen.should.be.true();
    triggers.length.should.equal(0);

    triggers.length.should.equal(0);
    await socat.writeSideB('world-');
    await waitForLength(triggers, 1);
    triggers[0].payload.data.serial.should.equal('world');

    await new Promise((resolve) => ports[0].close(resolve));
    ports = serialManager.getPorts();
    ports[0].isOpen.should.be.false();
    await sleep(1300); // retry reopen time
    ports = serialManager.getPorts();
    ports[0].isOpen.should.be.true();
    triggers.length.should.equal(1);
    socat.receivedSideB().should.deepEqual('hello-hello-');

    triggers.length.should.equal(1);
    await socat.writeSideB('world-');
    await waitForLength(triggers, 2);
    triggers[1].payload.data.serial.should.equal('world');

    // kicking off a close to ensure we kill the timeout this has started and actually close ourselves.
    ports = serialManager.getPorts();
    ports[0].isOpen.should.be.true();
    await new Promise((resolve) => ports[0].close(resolve));
    should.exist(ports[0].losTimeout);
    await serialManager.shutdown();
    should(ports[0].losTimeout).equal(null);
    ports = serialManager.getPorts();
    ports.length.should.equal(0);

    socat.receivedSideB().should.deepEqual('hello-hello-');
  });

  it('should connect with additional connection options set', async () => {
    await socat.reset();
    await socat.listenSideB({
      baudRate: 9600,
      parity: 'even',
      dataBits: 7,
      stopBits: 2,
      rtscts: true
    });

    const serialId = 'anId1';
    const triggers = [];
    serialManager = SerialManager();
    await serialManager.initialize([{
      serialId,
      path: socat.serialPathSideA,
      baudRate: 9600,
      parity: 'even',
      dataBits: 7,
      stopBits: 2,
      rtscts: true,
      delimiter: '-',
      writeOnOpen: 'hello world-'
    }], async (triggerFire) => {
      triggers.push(triggerFire);
      await sleep(0);
    });
    await sleep(100);
    socat.receivedSideB().should.deepEqual('hello world-');

    triggers.length.should.equal(0);
    await socat.writeSideB('good-bye-');
    await waitForLength(triggers, 2);
    triggers[0].payload.data.serial.should.equal('good');
    triggers[1].payload.data.serial.should.equal('bye');

    socat.receivedSideB().should.deepEqual('hello world-');
  });

  it('should not initialize with invalid baud rate', async () => {
    const serialId = 'anId1';
    serialManager = SerialManager();
    await serialManager.initialize([{
      serialId,
      path: socat.serialPathSideA,
      baudRate: 0,
      parity: 'even',
      dataBits: 7,
      stopBits: 2,
      rtscts: true,
      delimiter: '-',
      writeOnOpen: 'hello world-'
    }], async () => {
      throw Error('This test was not supposed to fire a trigger!');
    });
    await sleep(100);

    const ports = serialManager.getPorts();
    ports.length.should.equal(0);
    socat.receivedSideB().should.deepEqual('');
  });

  it('should work when openOnWriteEncoding and delimiterEncoding are hex values', async () => {
    const serialId = 'anId1';
    const triggers = [];
    serialManager = SerialManager();
    await serialManager.initialize([{
      serialId,
      path: socat.serialPathSideA,
      baudRate: 9600,
      encoding: 'utf8',
      delimiter: '2D',
      delimiterEncoding: 'hex',
      writeOnOpen: 'c2a55a2D',
      writeOnOpenEncoding: 'hex'
    }], async (triggerFire) => {
      triggers.push(triggerFire);
      await sleep(0);
    });
    await sleep(100);
    socat.receivedSideB().should.deepEqual('¥Z-');

    triggers.length.should.equal(0);
    await socat.writeSideB('good-bye-');
    await waitForLength(triggers, 2);
    triggers[0].payload.data.serial.should.equal('good');
    triggers[1].payload.data.serial.should.equal('bye');

    socat.receivedSideB().should.deepEqual('¥Z-');
  });

});
