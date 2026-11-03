import { clamp, toNumber } from 'omnibelt';

const minReconnect = 5 * 1000;
const reconnectPeriod = clamp(minReconnect, Number.MAX_SAFE_INTEGER, toNumber(process.env.MQTT_RECONNECT_INTERVAL) || (30 * 1000));
const reconnectVariability = clamp(minReconnect, reconnectPeriod, toNumber(process.env.MQTT_RECONNECT_VARIABILITY) || (15 * 1000));
const connectTimeout = clamp(5 * 1000, Number.MAX_SAFE_INTEGER, toNumber(process.env.MQTT_CONNECT_TIMEOUT) || (30 * 1000));

// 0 is allowed for keepalive, and it needs to be in seconds for mqtt client
const keepalive = clamp(0, Number.MAX_SAFE_INTEGER,
  isFinite(process.env.MQTT_KEEPALIVE) ? Math.ceil(toNumber(process.env.MQTT_KEEPALIVE) / 1000) : 60
);

// :: (GatewayConf, GatewayStoresType) -> MqttOptions
const buildMqttOptions = (gatewayConf, gatewayStores) => {

  // by default 30 seconds +/- 15 seconds
  let variablePeriod = reconnectPeriod + (1 - Math.random() * 2) * reconnectVariability;
  if (variablePeriod < minReconnect) { variablePeriod = minReconnect; }

  const baseSettings = {
    connectTimeout,
    reconnectPeriod: variablePeriod,
    queueQoSZero: false,
    resubscribe: false,
    clean: true,
    keepalive
  };

  const gatewayConfSettings = {
    clientId: gatewayConf.id
  };
  if (gatewayConf.clientSsl) {
    gatewayConfSettings.cert = gatewayConf.clientSsl.certificate;
    gatewayConfSettings.key = gatewayConf.clientSsl.key;
  } else {
    gatewayConfSettings.username = gatewayConf.key;
    gatewayConfSettings.password = gatewayConf.secret;
  }
  return {
    ...baseSettings,
    ...gatewayConfSettings,
    ...gatewayStores
  };
};

export default buildMqttOptions;
