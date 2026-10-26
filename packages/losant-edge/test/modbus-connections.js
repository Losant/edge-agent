import { sleep, defer } from 'omnibelt';
import ModbusRTU from 'modbus-serial';
import { sinon } from './common.js';
import { queueInstructions, cleanClients, reset } from '../src/lib/connections/modbus.js';

describe('Modbus Connections Lib', () => {
  let interval;
  beforeEach(() => {
    reset();
  });
  afterEach(() => {
    clearInterval(interval);
  });
  it('should not throw unhandled error when shutting down while instructions are still running', async () => {
    const NODE_TYPE = 'READ';
    const clientConfig = {
      connectionType: 'tcp',
      host: '192.168.200.157',
      port: '502',
      unitId: 1,
      endianness: 'big'
    };
    const deferredPromises = [];
    interval = setInterval(() => {
      const deferredP = queueInstructions(clientConfig, [{}, {}], NODE_TYPE, 2000);
      if (deferredP) {
        deferredPromises.push(deferredP);
      }
    }, 250);

    await sleep(250);
    await sleep(250);
    await sleep(250);
    await cleanClients();
    const results = await Promise.all(deferredPromises);
    results[0].should.deepEqual({
      errors: [
        { message: 'TCP Connection Timed Out', type: 'MODBUS_READ_ERROR' }
      ]
    });
  });

  describe('error events on the client', () => {
    const clientConfig = {
      connectionType: 'tcp',
      host: '127.0.0.1',
      port: 1502,
      unitId: 1,
      endianness: 'big'
    };
    const instructions = [{ type: 'holding-register', key: 'k', args: { address: 1, length: 1 } }];
    const extraFields = { endianness: 'big', areUnsignedInts: true };
    let closeStub, pendingRead, readStarted, client;
    beforeEach(() => {
      pendingRead = defer();
      readStarted = defer();
      sinon.stub(ModbusRTU.prototype, 'connectTCP').resolves();
      sinon.stub(ModbusRTU.prototype, 'readHoldingRegisters').callsFake(function() {
        client = this;
        readStarted.resolve();
        return pendingRead.promise;
      });
      closeStub = sinon.stub(ModbusRTU.prototype, 'close').callsFake((cb) => { cb(); });
    });

    afterEach(async () => {
      await cleanClients();
    });

    it('should not reset the client on an error event while an instruction is running', async () => {
      const resultP = queueInstructions({ ...clientConfig }, instructions, 'READ', 5000, extraFields);
      await readStarted.promise;
      client.emit('error', new Error('boom'));
      await sleep(50);
      closeStub.called.should.be.false();
      pendingRead.resolve({ buffer: Buffer.from([0, 7]) });
      const result = await resultP;
      // the error event is still reported on the instruction that was running
      result.should.deepEqual({ k: [7] });
    });

    it('should reset the client on an error event when no instruction is running', async () => {
      const resultP = queueInstructions({ ...clientConfig }, instructions, 'READ', 5000, extraFields);
      await readStarted.promise;
      pendingRead.resolve({ buffer: Buffer.from([0, 7]) });
      (await resultP).should.deepEqual({ k: [7] });
      closeStub.called.should.be.false();
      client.emit('error', new Error('boom'));
      await sleep(50);
      closeStub.calledOnce.should.be.true();
    });
  });
});
