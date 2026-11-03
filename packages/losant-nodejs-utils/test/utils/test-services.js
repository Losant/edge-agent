import net from 'net';

// Backing services some suites need. Hosts default to localhost, which is
// where `pnpm test:env:up` publishes them; CI points them at compose
// service names instead.
const services = {
  redis: () => ({ host: process.env.REDIS_HOST_CI || 'localhost', port: Number(process.env.REDIS_PORT_CI) || 6379 }),
  redisCluster: () => ({ host: process.env.REDIS_HOST_CLUSTER || 'localhost', port: 7379 }),
  mongo: () => ({ host: process.env.MONGO_HOST_CI || 'localhost', port: 27017 }),
  mosquitto: () => ({ host: process.env.MOSQUITTO_HOST || 'localhost', port: 1888 })
};

const canConnect = ({ host, port }, timeout) => {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const done = (ok) => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeout, () => done(false));
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
  });
};

export const serviceTarget = (name) => services[name]();

// :: ([String], Object) -> Promise [String]
export const unreachableServices = async (names, { timeout = 2000 } = {}) => {
  const reachable = await Promise.all(names.map((name) => canConnect(services[name](), timeout)));
  return names.filter((name, i) => !reachable[i]);
};

// Fails with the start command when a service isn't reachable, instead of
// each test hanging until its timeout.
export const requireServices = async (names, opts) => {
  const missing = await unreachableServices(names, opts);
  if (missing.length) {
    const described = missing.map((name) => {
      const { host, port } = services[name]();
      return `${name} (${host}:${port})`;
    });
    throw new Error([
      `Test services not reachable: ${described.join(', ')}`,
      'Start them with `pnpm test:env:up`.'
    ].join('\n'));
  }
};

// Marks a suite as needing a backing service. Never skips: these tests are
// what prove the agent works against the real service. The check runs when
// the suite starts, so a run that never reaches this suite (e.g. one spec
// file) doesn't need the service.
export const describeService = (name, title, fn) => {
  if (!services[name]) { throw new Error(`Unknown test service: ${name}`); }
  return describe(title, function(...args) {
    before(() => requireServices([ name ]));
    return fn.apply(this, args);
  });
};
