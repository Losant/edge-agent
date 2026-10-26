import t from 'tcomb';
import { prop } from 'omnibelt';
import {
  LOCAL_BROKER_ENABLED_DEFAULT,
  LOCAL_BROKER_ADDRESS_DEFAULT,
  LOCAL_BROKER_PORT_DEFAULT
} from '../constants.js';
import {
  ServerPort, ServerAddress
} from './lib/refinements.js';
import SslConf from './ssl-conf.js';

const LocalBrokerConfig = t.struct({
  port: ServerPort,
  address: ServerAddress,
  username: t.maybe(t.String),
  password: t.maybe(t.String),
  ssl: t.maybe(SslConf),
  enabled: t.Boolean
}, {
  name: 'LocalBrokerConfig',
  strict: true,
  defaultProps: {
    enabled: LOCAL_BROKER_ENABLED_DEFAULT,
    port: LOCAL_BROKER_PORT_DEFAULT,
    address: LOCAL_BROKER_ADDRESS_DEFAULT
  }
});

LocalBrokerConfig.fromArgs = prop('localBroker');
export default LocalBrokerConfig;
