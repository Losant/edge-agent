import ads from 'ads-client';
import { sinon } from '../common.js';
import {
  queueInstructions,
  getClient,
  cleanClients,
  reset
} from '../../src/lib/connections/beckhoff.js';

const baseConfig = () => ({
  localAmsNetId: '192.168.5.221.1.2',
  localAdsPort: 32750,
  targetAmsNetId: '5.123.154.18.1.1',
  targetAdsPort: 851,
  routerAddress: '127.0.0.1',
  routerTcpPort: 48898,
  timeoutDelay: 5000
});
const symbolInfo = {
  name: 'GVL.A', type: 'DINT', size: 4, indexGroup: 1, indexOffset: 2, comment: ''
};
const readInstructions = [{ key: 'k1', name: 'GVL.A' }];

describe('Beckhoff Connections Lib', () => {
  beforeEach(() => {
    sinon.stub(ads.Client.prototype, 'connect').resolves();
    sinon.stub(ads.Client.prototype, 'disconnect').resolves();
    reset();
  });
  afterEach(async () => {
    await cleanClients();
  });

  describe('reads', () => {
    beforeEach(() => {
      sinon.stub(ads.Client.prototype, 'getSymbol').resolves(symbolInfo);
    });

    it('should return values from a successful read', async () => {
      sinon.stub(ads.Client.prototype, 'readRawMulti').resolves([{ command: { key: 'k1' }, value: Buffer.from([5]) }]);
      sinon.stub(ads.Client.prototype, 'convertFromRaw').resolves(5);
      const result = await queueInstructions(baseConfig(), readInstructions, 'READ');
      result.should.deepEqual({
        k1: {
          value: 5,
          symbol: {
            name: 'GVL.A', type: 'DINT', size: 4, indexGroup: 1, indexOffset: 2, comment: ''
          }
        }
      });
    });

    it('should report a per-key error when readRawMulti rejects', async () => {
      sinon.stub(ads.Client.prototype, 'readRawMulti').rejects(new Error('boom'));
      const result = await queueInstructions(baseConfig(), readInstructions, 'READ');
      result.should.deepEqual({
        errors: [{ type: 'BECKHOFF_READ_ERROR', message: 'boom', key: 'k1' }]
      });
    });

    it('should report a per-key error for every symbol when readRawMulti rejects', async () => {
      sinon.stub(ads.Client.prototype, 'readRawMulti').rejects(new Error('boom'));
      const result = await queueInstructions(baseConfig(), [ { key: 'k1', name: 'GVL.A' }, { key: 'k2', name: 'GVL.A' } ], 'READ');
      result.errors.map((e) => e.key).should.deepEqual([ 'k1', 'k2' ]);
    });

    it('should not throw when readRawMulti rejects with a non-Error', async () => {
      sinon.stub(ads.Client.prototype, 'readRawMulti').callsFake(() => Promise.reject('not an error object')); // eslint-disable-line prefer-promise-reject-errors
      const result = await queueInstructions(baseConfig(), readInstructions, 'READ');
      result.errors.length.should.equal(1);
      result.errors[0].type.should.equal('BECKHOFF_READ_ERROR');
      result.errors[0].message.should.equal('not an error object');
      result.errors[0].key.should.equal('k1');
    });

    it('should not throw when getSymbol rejects with a non-Error', async () => {
      ads.Client.prototype.getSymbol.callsFake(() => Promise.reject('not an error object')); // eslint-disable-line prefer-promise-reject-errors
      const result = await queueInstructions(baseConfig(), readInstructions, 'READ');
      result.errors.length.should.equal(1);
      result.errors[0].message.should.equal('not an error object');
      result.errors[0].key.should.equal('k1');
    });
  });

  describe('disconnect events', () => {
    it('should reset the client when a disconnect is the only listener while an instruction is queued', async () => {
      let emitted = false;
      sinon.stub(ads.Client.prototype, 'subscribeValue').callsFake(function() {
        if (!emitted) {
          emitted = true;
          this.emit('disconnect');
        }
        return Promise.resolve({});
      });
      sinon.stub(ads.Client.prototype, 'writeValue').resolves();
      const config = baseConfig();
      const cached = getClient(config);
      // simulate an existing subscription so the client subscribes on (re)connect
      cached.subscriptions.set('GVL.A', { 1000: { triggerIds: ['t'] } });
      const result = await queueInstructions(config, [{ key: 'k1', name: 'GVL.A', data: 1 }], 'WRITE');
      result.should.deepEqual({ k1: { success: true } });
      ads.Client.prototype.disconnect.called.should.be.true();
    });
  });

  describe('writes', () => {
    it('should not throw when writeValue rejects with a non-Error', async () => {
      sinon.stub(ads.Client.prototype, 'writeValue').callsFake(() => Promise.reject('nope')); // eslint-disable-line prefer-promise-reject-errors
      const result = await queueInstructions(baseConfig(), [{ key: 'k1', name: 'GVL.A', data: 1 }], 'WRITE');
      result.k1.should.deepEqual({ success: false });
      result.errors[0].type.should.equal('BECKHOFF_WRITE_ERROR');
      result.errors[0].message.should.equal('nope');
      result.errors[0].key.should.equal('k1');
    });
  });
});
