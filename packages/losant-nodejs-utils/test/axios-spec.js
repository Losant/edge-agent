import axios from '../src/axios.js';
import verifyHosts from '../src/utils/verify-hosts.js';
import http from 'http';
import https from 'https';

describe('#axios', () => {
  afterEach(() => {
    verifyHosts.setDnsLookup(null);
    axios.resolveCustomAgents(null);
  });

  describe('url validation', () => {

    // Only the checks this package still performs on its own. Rejection by resolved
    // address belongs to whatever network-access policy the consumer registers, and is
    // covered alongside that policy rather than here.
    const urls = {
      'ftp://1.1.1.1':     { error: 'Invalid URL (protocol must be http:, https:): ftp://1.1.1.1' },
      'totally|not|valid': { error: 'Invalid URL: totally|not|valid' }
    };

    Object.keys(urls).forEach((key) => {
      it(`rejects bad url: ${key}`, async () => {
        await axios({ method: 'get', url: key }).should.be.rejectedWith({ message: urls[key].error });
      });
    });

  });

  describe('hook registration', () => {
    it('leaves agents untouched when no resolver is registered', async () => {
      // Agent wrapping lives in the registered policy, not here - with nothing registered
      // the caller's agent must come back exactly as it was passed.
      const httpAgent = new http.Agent();
      try {
        await axios({ method: 'get', url: 'http://127.0.0.1:1', httpAgent });
      } catch {}
      httpAgent.should.not.have.property('origCreateSocket');
    });

    it('uses the agents the registered resolver returns', async () => {
      const httpAgent = new http.Agent();
      const httpsAgent = new https.Agent();
      // axiosWrapper hands the resolver the same options object it then writes the
      // returned agents onto, so holding a reference to it shows what axios was called with.
      let requestOptions;
      axios.resolveCustomAgents((axiosOptions, wrapperOptions) => {
        requestOptions = axiosOptions;
        wrapperOptions.should.deepEqual({ allowInternalNetwork: true });
        return { httpAgent, httpsAgent };
      });
      try {
        await axios({ method: 'get', url: 'http://127.0.0.1:1' }, { allowInternalNetwork: true });
      } catch {}
      requestOptions.url.should.equal('http://127.0.0.1:1');
      requestOptions.httpAgent.should.equal(httpAgent);
      requestOptions.httpsAgent.should.equal(httpsAgent);
    });

    it('leaves agents untouched when the resolver returns nothing', async () => {
      const httpAgent = new http.Agent();
      axios.resolveCustomAgents(() => undefined);
      try {
        await axios({ method: 'get', url: 'http://127.0.0.1:1', httpAgent });
      } catch {}
      httpAgent.should.not.have.property('origCreateSocket');
    });
  });

  describe('resolveCustomAgents', () => {
    it('clears the registered resolver when passed null', async () => {
      axios.resolveCustomAgents(() => ({ httpAgent: new http.Agent(), httpsAgent: new https.Agent() }));
      axios.resolveCustomAgents(null);
      // Back to fail-open: the caller's own agent comes through untouched.
      const httpAgent = new http.Agent();
      try {
        await axios({ method: 'get', url: 'http://127.0.0.1:1', httpAgent });
      } catch {}
      httpAgent.should.not.have.property('origCreateSocket');
    });

    it('is idempotent for the same function - re-registering does not throw', () => {
      const fn = () => undefined;
      (() => {
        axios.resolveCustomAgents(fn);
        axios.resolveCustomAgents(fn);
      }).should.not.throw();
    });

    it('throws when a different function tries to register over an existing one', () => {
      axios.resolveCustomAgents(() => 'first');
      (() => axios.resolveCustomAgents(() => 'second'))
        .should.throw(/axiosWrapper\.resolveCustomAgents\(\) was already called with a different function/);
    });
  });
});
