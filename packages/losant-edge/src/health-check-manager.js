import Hapi from '@hapi/hapi';
import logger from './logger/index.js';
import HealthCheckConf from './types/health-check-conf.js';
import { AGENT_VERSION } from './constants.js';

const HealthCheckManager = (healthCheckConf, managers) => {
  healthCheckConf = HealthCheckConf(healthCheckConf);

  const server = new Hapi.Server({
    port: healthCheckConf.port,
    address: healthCheckConf.address
  });

  const requestHandler = async (request, h) => {
    const gatewayStatus = { connected: false };

    if (managers.gateway) {
      gatewayStatus.connected = managers.gateway.isConnected();
      gatewayStatus.connectedAt = managers.gateway.lastConnectTime;
      gatewayStatus.disconnectedAt = managers.gateway.lastDisconnectTime;
    }

    const responseObj = {
      version: `${AGENT_VERSION}`,
      gatewayStatus
    };

    const status = (healthCheckConf.offlineIsUnhealthy && !gatewayStatus.connected) ? 500 : 200;

    return h.response(JSON.stringify(responseObj))
      .header('content-type', 'application/json')
      .header('cache-control', 'no-cache, no-store, must-revalidate')
      .header('pragma', 'no-cache')
      .code(status);
  };

  server.route({
    method: ['get'],
    path: '/{path*}',
    handler: requestHandler
  });

  const initialize = async () => {
    try {
      if (healthCheckConf.enabled) {
        await server.start();
        logger.verbose(`Health Check Endpoint started at: http://${healthCheckConf.address}:${healthCheckConf.port}`);
      } else {
        logger.verbose('Health Check Endpoint disabled');
      }
    } catch (e) {
      logger.errorNoRollbar(`Failed to start Health Check Endpoint ${e.name}: ${e.message}`);
    }
  };

  const shutdown = async () => {
    if (healthCheckConf.enabled) {
      await server.stop();
    }
  };

  return {
    initialize,
    shutdown
  };
};

export default HealthCheckManager;
