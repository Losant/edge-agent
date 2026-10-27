import t from 'tcomb';
import { prop } from 'omnibelt';
import {
  WEBSERVER_PORT_DEFAULT,
  WEBSERVER_ADDRESS_DEFAULT,
  WEBSERVER_ENABLED_DEFAULT
} from '../constants.js';
import {
  ServerPort, ServerAddress
} from './lib/refinements.js';
import SslConf from './ssl-conf.js';

const WebserverConf = t.struct({
  port: ServerPort,
  address: ServerAddress,
  username: t.maybe(t.String),
  password: t.maybe(t.String),
  ssl: t.maybe(SslConf),
  enabled: t.Boolean
}, {
  name: 'WebserverConf',
  strict: true,
  defaultProps: {
    port: WEBSERVER_PORT_DEFAULT,
    address: WEBSERVER_ADDRESS_DEFAULT,
    enabled: WEBSERVER_ENABLED_DEFAULT
  }
});

WebserverConf.fromArgs = prop('webserver');

export default WebserverConf;
