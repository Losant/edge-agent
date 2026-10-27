import should from 'should';
import verifyHosts from '../../src/utils/verify-hosts.js';

describe('#verifyHosts', () => {
  afterEach(() => { verifyHosts.setDnsLookup(null); });

  describe('lookup', () => {
    it('defaults to dns.lookup when nothing has been registered', (done) => {
      verifyHosts.lookup('localhost', (err, address) => {
        try {
          should.not.exist(err);
          should.exist(address);
          done();
        } catch (e) { done(e); }
      });
    });

    it('delegates to the registered function', (done) => {
      const fn = (hostname, options, callback) => callback(null, '1.2.3.4', 4);
      verifyHosts.setDnsLookup(fn);
      verifyHosts.lookup('example.com', (err, address, family) => {
        try {
          should.not.exist(err);
          address.should.equal('1.2.3.4');
          family.should.equal(4);
          done();
        } catch (e) { done(e); }
      });
    });

    it('passes options through to the registered function', (done) => {
      const fn = (hostname, options, callback) => callback(null, options);
      verifyHosts.setDnsLookup(fn);
      verifyHosts.lookup('example.com', { all: true }, (err, options) => {
        try {
          should.not.exist(err);
          options.should.deepEqual({ all: true });
          done();
        } catch (e) { done(e); }
      });
    });
  });

  describe('setDnsLookup', () => {
    it('restores the default dns.lookup when passed null', (done) => {
      verifyHosts.setDnsLookup((hostname, options, callback) => callback(null, '1.2.3.4', 4));
      verifyHosts.setDnsLookup(null);
      verifyHosts.lookup('localhost', (err, address) => {
        try {
          should.not.exist(err);
          address.should.not.equal('1.2.3.4');
          done();
        } catch (e) { done(e); }
      });
    });

    it('is idempotent for the same function - re-registering does not throw', () => {
      const fn = (hostname, options, callback) => callback(null, '1.2.3.4', 4);
      (() => {
        verifyHosts.setDnsLookup(fn);
        verifyHosts.setDnsLookup(fn);
      }).should.not.throw();
    });

    it('throws when a different function tries to register over an existing one', () => {
      verifyHosts.setDnsLookup((hostname, options, callback) => callback(null, '1.2.3.4', 4));
      (() => verifyHosts.setDnsLookup((hostname, options, callback) => callback(null, '5.6.7.8', 4)))
        .should.throw(/verifyHosts\.setDnsLookup\(\) was already called with a different function/);
    });
  });
});
