import dns from 'dns';
import util from 'util';
import { ensureArray, flatten, mapP, map, prop, pipe, uniq } from 'omnibelt';
import errors from '../errors.js';

// dns.lookup-compatible, but this package has zero opinion about which addresses are safe.
// Defaults to Node's real dns.lookup - deciding what "safe" means (public-IP-only,
// whitelists, localhost) is entirely up to the consumer, via setDnsLookup(); a consumer
// that never calls it gets Node's unmodified behavior.
let dnsLookupImpl = dns.lookup;

const lookup = (hostname, options, callback) => {
  if (!callback) {
    callback = options;
    options = undefined;
  }
  dnsLookupImpl(hostname, options, callback);
};

const dnsLookupAll = util.promisify(lookup);

const verifyHosts = (hosts) => {
  hosts = ensureArray(hosts);
  return mapP((host) => dnsLookupAll(host, { all: true }), hosts)
    .then(pipe(
      flatten,
      map(prop('address')),
      uniq
    ), () => {
      throw errors.Validation({ message: `Cannot resolve host: ${hosts}` });
    });
};

verifyHosts.lookup = lookup;

// Installs the dns.lookup-compatible function; pass null to restore the default (dns.lookup).
// Registering a different function while a non-default one is already installed throws - an
// explicit null first is how a caller signals it means to replace it. The same function
// twice, or restoring the untouched default, is always a no-op.
verifyHosts.setDnsLookup = (fn) => {
  if (fn === null) {
    dnsLookupImpl = dns.lookup;
    return;
  }
  if (dnsLookupImpl !== dns.lookup && dnsLookupImpl !== fn) {
    throw new Error('verifyHosts.setDnsLookup() was already called with a different function');
  }
  dnsLookupImpl = fn;
};

export default verifyHosts;
