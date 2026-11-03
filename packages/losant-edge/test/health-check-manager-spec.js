import os from 'node:os';
import { nock } from './common.js';
import axios from 'losant-nodejs-utils/src/axios.js';
import HealthCheckManager from '../src/health-check-manager.js';
import { AGENT_VERSION } from '../src/constants.js';

const findNonLoopbackIPv4 = () => {
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const iface of ifaces || []) {
      if (iface.family === 'IPv4' && !iface.internal) { return iface.address; }
    }
  }
  return null;
};

describe('Health Check Manager', function() {
  let healthCheckManager;
  beforeEach(() => {
    nock.enableNetConnect('localhost');
  });

  afterEach(async () => {
    if (healthCheckManager) {
      await healthCheckManager.shutdown();
      healthCheckManager = null;
    }
  });

  it('should respond, default response', async () => {
    healthCheckManager = HealthCheckManager({ port: 45454 }, {});
    await healthCheckManager.initialize();

    const response = await axios({
      method: 'get',
      url: 'http://localhost:45454/'
    });

    response.status.should.deepEqual(200);
    response.data.should.deepEqual({
      version: `${AGENT_VERSION}`,
      gatewayStatus: {
        connected: false
      }
    });
    ({ ...(response.headers.toJSON()) }).should.deepEqual({
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-cache, no-store, must-revalidate',
      'pragma': 'no-cache',
      'content-length': '55',
      'accept-ranges': 'bytes',
      'date': response.headers.date,
      'connection': 'close'
    });
  });

  it('should be reachable on a non-loopback interface when bound to 0.0.0.0', async function() {
    const nonLoopbackIp = findNonLoopbackIPv4();
    if (!nonLoopbackIp) { return this.skip(); }

    nock.enableNetConnect(nonLoopbackIp);

    healthCheckManager = HealthCheckManager(
      { port: 45454, address: '0.0.0.0' },
      {}
    );
    await healthCheckManager.initialize();

    const response = await axios({
      method: 'get',
      url: `http://${nonLoopbackIp}:45454/`
    });

    response.status.should.deepEqual(200);
    response.data.should.deepEqual({
      version: `${AGENT_VERSION}`,
      gatewayStatus: {
        connected: false
      }
    });
  });

  it('should not be reachable on a non-loopback interface when bound to default 127.0.0.1', async function() {
    const nonLoopbackIp = findNonLoopbackIPv4();
    if (!nonLoopbackIp) { return this.skip(); }

    nock.enableNetConnect(nonLoopbackIp);

    healthCheckManager = HealthCheckManager({ port: 45454 }, {});
    await healthCheckManager.initialize();

    await axios({
      method: 'get',
      url: `http://${nonLoopbackIp}:45454/`,
      timeout: 1000
    }).should.be.rejected();
  });

  it('should respond, gateway offline unhealthy', async () => {
    const fakeGateway = {};
    healthCheckManager = HealthCheckManager(
      { port: 45454, offlineIsUnhealthy: true },
      { gateway: fakeGateway }
    );
    await healthCheckManager.initialize();

    fakeGateway.isConnected = () => true;

    let response = await axios({
      method: 'get',
      url: 'http://localhost:45454/',
      validateStatus: () => true
    });

    response.status.should.deepEqual(200);
    response.data.should.deepEqual({
      version: `${AGENT_VERSION}`,
      gatewayStatus: {
        connected: true
      }
    });
    ({ ...(response.headers.toJSON()) }).should.deepEqual({
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-cache, no-store, must-revalidate',
      'pragma': 'no-cache',
      'content-length': '54',
      'accept-ranges': 'bytes',
      'date': response.headers.date,
      'connection': 'close'
    });

    fakeGateway.isConnected = () => false;

    response = await axios({
      method: 'get',
      url: 'http://localhost:45454/',
      validateStatus: () => true
    });

    response.status.should.deepEqual(500);
    response.data.should.deepEqual({
      version: `${AGENT_VERSION}`,
      gatewayStatus: {
        connected: false
      }
    });
    ({ ...(response.headers.toJSON()) }).should.deepEqual({
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-cache, no-store, must-revalidate',
      'pragma': 'no-cache',
      'content-length': '55',
      'date': response.headers.date,
      'connection': 'close'
    });
  });

});
