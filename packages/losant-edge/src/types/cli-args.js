import t from 'tcomb';
import { CONF_PATH_DEFAULT } from '../constants.js';
import Struct from './lib/struct.js';
import FilePath from './file-path.js';
import LoggerOut from './logger-out.js';
import LoggerLevel from './logger-level.js';
import {
  DeviceId, ServerPort, ServerAddress, AccessKey, AccessSecret,
  BrokerProtocol, SslKey, SslCertificate, UdpAddress
} from './lib/refinements.js';
import PeripheralUpdatesOptions from './peripheral-updates-options.js';
import ReplayOrderOptions from './replay-order-options.js';

// NOTE: Because any of these (except config) can be configured via config,
//       defaults live after `confPath` has been processed.
const CliArgs = Struct({
  confPath: FilePath,
  loggerOut: t.maybe(LoggerOut),
  loggerLevel: t.maybe(LoggerLevel),
  storePath: t.maybe(FilePath),
  brokerHost: t.maybe(t.String),
  apiHost: t.maybe(t.String),
  brokerProtocol: t.maybe(BrokerProtocol),
  // NOTE: when resolving ssl, paths are only looked at if the
  //       non-path fields are empty
  brokerClientSslKeyPath: t.maybe(FilePath),
  brokerClientSslCertPath: t.maybe(FilePath),
  brokerClientSslKey: t.maybe(SslKey),
  brokerClientSslCert: t.maybe(SslCertificate),
  queueOfflineMessages: t.maybe(t.Boolean),
  offlineMessageReplayOrder: t.maybe(ReplayOrderOptions),
  subscribeToPeripheralUpdates: t.maybe(PeripheralUpdatesOptions),
  deviceId: t.maybe(DeviceId),
  accessKey: t.maybe(AccessKey),
  accessSecret: t.maybe(AccessSecret),
  udpAddress: t.maybe(UdpAddress),
  webserverPort: t.maybe(ServerPort),
  webserverAddress: t.maybe(ServerAddress),
  webserverUsername: t.maybe(t.String),
  webserverPassword: t.maybe(t.String),
  webserverEnabled: t.maybe(t.Boolean),
  // NOTE: when resolving ssl, paths are only looked at if the
  //       non-path fields are empty
  webserverSslKeyPath: t.maybe(FilePath),
  webserverSslCertPath: t.maybe(FilePath),
  webserverSslBundlePath: t.maybe(FilePath),
  webserverSslKey: t.maybe(SslKey),
  webserverSslCert: t.maybe(SslCertificate),
  webserverSslBundle: t.maybe(SslCertificate),
  workflowDirectory: t.maybe(FilePath),
  localBrokerPort: t.maybe(ServerPort),
  localBrokerAddress: t.maybe(ServerAddress),
  localBrokerUsername: t.maybe(t.String),
  localBrokerPassword: t.maybe(t.String),
  localBrokerEnabled: t.maybe(t.Boolean),
  // NOTE: when resolving ssl, paths are only looked at if the
  //       non-path fields are empty
  localBrokerSslKeyPath: t.maybe(FilePath),
  localBrokerSslCertPath: t.maybe(FilePath),
  localBrokerSslBundlePath: t.maybe(FilePath),
  localBrokerSslKey: t.maybe(SslKey),
  localBrokerSslCert: t.maybe(SslCertificate),
  localBrokerSslBundle: t.maybe(SslCertificate),

  healthCheckEnabled: t.maybe(t.Boolean),
  healthCheckPort: t.maybe(ServerPort),
  healthCheckAddress: t.maybe(ServerAddress),
  healthCheckOfflineIsUnhealthy: t.maybe(t.Boolean),

  otlpCollectorUrl: t.maybe(t.String),
  otlpCollectorAuthType: t.maybe(t.enums.of(['none', 'basic', 'bearer', 'clientCert'])),
  otlpCollectorUsername: t.maybe(t.String),
  otlpCollectorPassword: t.maybe(t.String),
  otlpCollectorBearerToken: t.maybe(t.String),
  otlpCollectorClientCertPath: t.maybe(FilePath),
  otlpCollectorClientKeyPath: t.maybe(FilePath),
  otlpCollectorCaCertPath: t.maybe(FilePath),
  otlpCollectorDisableSSLVerification: t.maybe(t.Boolean),
  // pre-parsed from a JSON string by get-env-args.js; validated for real
  // shape by OtlpCollectorConf.
  otlpCollectorResourceAttributes: t.maybe(t.Object),

  otelReportingEnabled: t.maybe(t.Boolean),
  otelReportingIntervalSeconds: t.maybe(t.Number)
}, {
  name: 'CliArgs',
  defaultProps: {
    confPath: CONF_PATH_DEFAULT
  }
});

export default CliArgs;
