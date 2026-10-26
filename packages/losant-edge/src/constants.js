import t from 'tcomb';
import ENCODING_LIST from 'losant-nodejs-utils/src/constants/encoding-list.js';
import semver from 'losant-nodejs-utils/src/utils/semver.js';
import { toNumber, clampPositive } from 'omnibelt';
import pkg from '../package.json' with { type: 'json' };
import fromPackageRoot from './lib/from-package-root.js';
import { ID_ZERO_STR } from 'losant-nodejs-utils/src/constants/id-zero.js';

export const MAX_EXTERNAL_CALL_TIME = clampPositive(toNumber(process.env.MAX_EXTERNAL_CALL_TIME) || 30000);

export const PARITY = [ 'none', 'even', 'mark', 'odd', 'space' ];

export const DATA_BITS = [ 5, 6, 7, 8 ];

export const STOP_BITS = [ 1, 2 ];

export const DEFAULT_SERIAL_CONFIG = {
  encoding: 'utf8',
  baudRate: '9600',
  dataBits: 8,
  parity: 'none',
  rtscts: false,
  stopBits: 1
};

export const ENCODINGS = t.enums.of(ENCODING_LIST, 'ENCODINGS');

ENCODINGS.allows = ENCODING_LIST;

export const IS_ENV_PROD = process.env.NODE_ENV === 'production';
export const NOT_ENV_PROD = !IS_ENV_PROD;
export const FIVE_MEGA_BYTES = 5242880;
export const MAX_MESSAGE_SIZE = 256 * 1024;

export const SNMP_VERSIONS = [
  'Version1',
  'Version2c',
  'Version3'
];

export const SNMP_SECURITY_LEVELS = [
  'none',
  'auth',
  'authAndEncrypt'
];

export const SNMP_AUTH_METHODS = [
  'sha',
  'md5',
  'none'
];

export const SNMP_ENCRYPTION_METHODS = [
  'des',
  'aes'
];

export const PACKAGE_ROOT_DIR = fromPackageRoot();
export const PROJECT_ROOT_DIR = fromPackageRoot('..', '..');
export const AGENT_VERSION = semver.parse(pkg.version);
export const CONF_PATH_DEFAULT = process.env.CONF_PATH_DEFAULT || fromPackageRoot('losant-edge-agent-config.toml');
export const LOGGER_OUT_DEFAULT = process.env.LOGGER_OUT_DEFAULT || 'console';
export const LOGGER_LEVEL_DEFAULT = process.env.LOGGER_LEVEL_DEFAULT || 'info';
export const STORE_PATH_DEFAULT = process.env.STORE_PATH_DEFAULT || fromPackageRoot('losant-edge-agent-store.db');
export const GATEWAY_ID_DEFAULT = ID_ZERO_STR;
export const BROKER_HOST_DEFAULT = 'broker.losant.com';
export const BROKER_PROTOCOL_DEFAULT = 'mqtts';
export const UDP_ADDRESS_DEFAULT = '0.0.0.0';
export const WEBSERVER_PORT_DEFAULT = toNumber(process.env.WEBSERVER_PORT_DEFAULT) || 8080;
export const WEBSERVER_ADDRESS_DEFAULT = '0.0.0.0';
export const WEBSERVER_ENABLED_DEFAULT = true;
export const WORKFLOW_DIRECTORY_DEFAULT = process.env.WORKFLOW_DIRECTORY_DEFAULT || fromPackageRoot('workflows');
export const LOCAL_BROKER_ENABLED_DEFAULT = false;
export const LOCAL_BROKER_ADDRESS_DEFAULT = '0.0.0.0';
export const LOCAL_BROKER_PORT_DEFAULT = 1883;
export const QUEUE_OFFLINE_MESSAGES_DEFAULT = true;
export const SUBSCRIBE_TO_PERIPHERAL_UPDATES_DEFAULT = true;
export const OFFLINE_MESSAGE_REPLAY_ORDER_DEFAULT = 'oldestFirst';
export const PLATFORM_TOPIC_BASE = process.env.PLATFORM_TOPIC_BASE || 'losant';
export const BROADCAST_UPDATE_TOPIC_BASE = process.env.BROADCAST_UPDATE_TOPIC_BASE || '$SYS';
export const HEALTH_CHECK_PORT_DEFAULT = toNumber(process.env.HEALTH_CHECK_PORT_DEFAULT) || 8010;
export const HEALTH_CHECK_ADDRESS_DEFAULT = '127.0.0.1';
export const HEALTH_CHECK_ENABLED_DEFAULT = true;
export const HEALTH_CHECK_OFFLINE_IS_UNHEALTHY_DEFAULT = false;

export const MQTT_HUMAN_ERROR_MSG_MAP = {
  ENETUNREACH: 'could not connect to host',
  ENETRESET: 'could not connect to host',
  ENETDOWN: 'could not connect to host',
  ENONET: 'could not connect to host',
  ENOTFOUND: 'could not resolve host',
  ECONNREFUSED: 'connection refused',
  5: 'access key/secret rejected',
  4: 'error while authenticating'
};
