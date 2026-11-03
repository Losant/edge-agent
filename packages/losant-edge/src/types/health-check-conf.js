import t from 'tcomb';
import { prop } from 'omnibelt';
import { ServerPort, ServerAddress } from './lib/refinements.js';
import {
  HEALTH_CHECK_PORT_DEFAULT,
  HEALTH_CHECK_ADDRESS_DEFAULT,
  HEALTH_CHECK_ENABLED_DEFAULT,
  HEALTH_CHECK_OFFLINE_IS_UNHEALTHY_DEFAULT
} from '../constants.js';

const HealthCheckConfig = t.struct({
  enabled: t.Boolean,
  port: ServerPort,
  address: ServerAddress,
  offlineIsUnhealthy: t.Boolean
}, {
  name: 'HealthCheckConfig',
  strict: true,
  defaultProps: {
    enabled: HEALTH_CHECK_ENABLED_DEFAULT,
    port: HEALTH_CHECK_PORT_DEFAULT,
    address: HEALTH_CHECK_ADDRESS_DEFAULT,
    offlineIsUnhealthy: HEALTH_CHECK_OFFLINE_IS_UNHEALTHY_DEFAULT
  }
});

HealthCheckConfig.fromArgs = prop('healthCheck');
export default HealthCheckConfig;
