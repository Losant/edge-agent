import { test, toString, toNumber, equalsAny, compose } from 'omnibelt';
import t from 'tcomb';
import Custom from './custom.js';
import { ONE_HOUR_MS } from 'losant-nodejs-utils/src/constants/time.js';
import { isIpAddress } from 'losant-nodejs-utils/src/utils/ip-helpers.js';
const OBJECT_ID_REG_EXP_PART = '[A-Fa-f\\d]{24}';
const OBJECT_ID_REG_EXP = new RegExp(`^${OBJECT_ID_REG_EXP_PART}$`);
const CN_DEBUG_KEY_REG_EXP = new RegExp(`^${OBJECT_ID_REG_EXP_PART}(-cn)?$`);
const CN_FLOW_ID = new RegExp(`^${OBJECT_ID_REG_EXP_PART}-[^\\\\%]{1,255}$`);
const ICN_FLOW_ID = new RegExp(`^instance-${OBJECT_ID_REG_EXP_PART}$`);

export const DeviceId = Custom(
  compose(
    test(OBJECT_ID_REG_EXP),
    toString
  ),
  'DeviceId'
);

export const AccessKey = Custom(
  (value) => {
    return test(/^[A-Fa-f\d]{8}-[A-Fa-f\d]{4}-[A-Fa-f\d]{4}-[A-Fa-f\d]{4}-[A-Fa-f\d]{12}$/, toString(value));
  },
  'AccessKey'
);

export const AccessSecret = Custom(
  (value) => {
    return test(/^[A-Fa-f\d]{64}$/, toString(value));
  },
  'AccessSecret'
);

export const BrokerProtocol = Custom(
  equalsAny([
    'mqtts://', 'mqtt://', 'ws://', 'wss://',
    'mqtts', 'mqtt', 'ws', 'wss'
  ]),
  'BrokerProtocol'
);

export const ServerPort = Custom(
  (value) => {
    const n = toNumber(value);
    return isFinite(n) && n >= 1 && n <= 65535 && n % 1 === 0;
  },
  'ServerPort'
);

export const ServerAddress = Custom(isIpAddress, 'ServerAddress');

export const UdpAddress = Custom(isIpAddress, 'UdpAddress');

export const SslCertificate = Custom(
  (value) => {
    value = toString(value).trim();
    return value.startsWith('-----BEGIN CERTIFICATE-----') &&
      value.endsWith('-----END CERTIFICATE-----');
  },
  'SSLCertificate'
);

export const SslKey = Custom(
  (value) => {
    value = toString(value).trim();
    return (
      value.startsWith('-----BEGIN PRIVATE KEY-----') &&
        value.endsWith('-----END PRIVATE KEY-----')
    ) || (
      value.startsWith('-----BEGIN RSA PRIVATE KEY-----') &&
        value.endsWith('-----END RSA PRIVATE KEY-----')
    ) || (
      value.startsWith('-----BEGIN EC PRIVATE KEY-----') &&
        value.endsWith('-----END EC PRIVATE KEY-----')
    );
  },
  'SSLKey'
);

export const ObjectIdStr = t.refinement(
  t.String,
  test(OBJECT_ID_REG_EXP),
  'ObjectIdStr'
);

export const ObjectIdOrCustomNodeId = Custom(
  (value) => {
    value = toString(value);
    return test(OBJECT_ID_REG_EXP, value) ||
      test(CN_FLOW_ID, value) ||
      test(ICN_FLOW_ID, value);
  },
  'ObjectIdOrCustomNodeId'
);

export const DebuggingKey = Custom(
  (value) => {
    return test(CN_DEBUG_KEY_REG_EXP, toString(value));
  }
);

export const OpcuaUri = Custom(
  (value) => {
    value = toString(value);
    return ['opc.tcp:', 'http:', 'https:'].some((prefix) => value.startsWith(prefix));
  },
  'OpcuaUri'
);

export const Namespace = t.refinement(
  t.String,
  test(/^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/), // 0-255 string
  'Namespace'
);

export const SamplingInterval = t.refinement(
  t.String,
  test(/^([1-9][0-9]*)$/), // integer 1 or greater
  'SamplingInterval'
);

export const MqttTopic = t.refinement(
  t.String,
  (value) => value && Buffer.byteLength(value, 'utf8') <= 255 && !value.includes('\0'),
  'MqttTopic'
);

export const BeckhoffSymbolName = t.refinement(
  t.String,
  test(/^[a-zA-Z_.][0-9a-zA-Z_.]{0,254}$/),
  'SymbolName'
);

export const AmsNetId = t.refinement(
  t.String,
  test(/^(([0-9]|[1-9][0-9]|1[0-9][0-9]|25[0-5]|2[0-4][0-9])\.){5}([0-9]|[1-9][0-9]|1[0-9][0-9]|25[0-5]|2[0-4][0-9])$/),
  'AmsNetId'
);

export const CycleTimeMs = t.refinement(
  t.Number,
  (value) => {
    return value >= 10 && value <= ONE_HOUR_MS;
  },
  'cycleTimeMs'
);
