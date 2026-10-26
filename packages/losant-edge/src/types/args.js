import { applySpec, prop } from 'omnibelt';
import Struct from './lib/struct.js';
import LoggerConf from './logger-conf.js';
import GatewayConf from './gateway-conf.js';
import LevelDbConf from './level-db-conf.js';
import WebserverConf from './webserver-conf.js';
import WorkflowConf from './workflow-conf.js';
import UdpConf from './udp-conf.js';
import LocalBrokerConfig from './local-broker-config.js';
import CliArgs from './cli-args.js';
import TriggerConf from './trigger-conf.js';
import HealthCheckConf from './health-check-conf.js';
import OtlpCollectorConf from './otlp-collector-conf.js';
import OtelReportingConf from './otel-reporting-conf.js';
import t from 'tcomb';

const Args = Struct({
  gateway: GatewayConf,
  localBroker: LocalBrokerConfig,
  logger: LoggerConf,
  originalCliArgs: t.maybe(CliArgs),
  store: LevelDbConf,
  triggers: t.maybe(t.list(TriggerConf)),
  udp: UdpConf,
  workflow: WorkflowConf,
  webserver: WebserverConf,
  healthCheck: HealthCheckConf,
  otlpCollector: t.maybe(OtlpCollectorConf),
  otelReporting: t.maybe(OtelReportingConf)
}, {
  name: 'Args',
  defaultProps: {
    gateway: {},
    localBroker: {},
    logger: {},
    store: {},
    triggers: [],
    udp: {},
    workflow: {},
    webserver: {},
    healthCheck: {}
  }
});

// :: CliArgs -> Args
Args.fromCliArgs =
  applySpec({
    logger: {
      out: prop('loggerOut'),
      level: prop('loggerLevel')
    },
    gateway: {
      host: prop('brokerHost'),
      protocol: prop('brokerProtocol'),
      apiHost: prop('apiHost'),
      id: prop('deviceId'),
      key: prop('accessKey'),
      secret: prop('accessSecret'),
      queueOfflineMessages: prop('queueOfflineMessages'),
      subscribeToPeripheralUpdates: prop('subscribeToPeripheralUpdates'),
      offlineMessageReplayOrder: prop('offlineMessageReplayOrder'),
      clientSsl: {
        key: prop('brokerClientSslKey'),
        certificate: prop('brokerClientSslCert'),
        keyPath: prop('brokerClientSslKeyPath'),
        certificatePath: prop('brokerClientSslCertPath')
      }
    },
    store: {
      path: prop('storePath')
    },
    udp: {
      address: prop('udpAddress')
    },
    workflow: {
      directory: prop('workflowDirectory')
    },
    webserver: {
      port: prop('webserverPort'),
      address: prop('webserverAddress'),
      username: prop('webserverUsername'),
      password: prop('webserverPassword'),
      enabled: prop('webserverEnabled'),
      ssl: {
        key: prop('webserverSslKey'),
        certificate: prop('webserverSslCert'),
        bundle: prop('webserverSslBundle'),
        keyPath: prop('webserverSslKeyPath'),
        certificatePath: prop('webserverSslCertPath'),
        bundlePath: prop('webserverSslBundlePath')
      }
    },
    localBroker: {
      port: prop('localBrokerPort'),
      address: prop('localBrokerAddress'),
      username: prop('localBrokerUsername'),
      password: prop('localBrokerPassword'),
      enabled: prop('localBrokerEnabled'),
      ssl: {
        key: prop('localBrokerSslKey'),
        certificate: prop('localBrokerSslCert'),
        bundle: prop('localBrokerSslBundle'),
        keyPath: prop('localBrokerSslKeyPath'),
        certificatePath: prop('localBrokerSslCertPath'),
        bundlePath: prop('localBrokerSslBundlePath')
      }
    },
    healthCheck: {
      enabled: prop('healthCheckEnabled'),
      port: prop('healthCheckPort'),
      address: prop('healthCheckAddress'),
      offlineIsUnhealthy: prop('healthCheckOfflineIsUnhealthy')
    },
    otlpCollector: {
      url: prop('otlpCollectorUrl'),
      authType: prop('otlpCollectorAuthType'),
      username: prop('otlpCollectorUsername'),
      password: prop('otlpCollectorPassword'),
      bearerToken: prop('otlpCollectorBearerToken'),
      clientCertPath: prop('otlpCollectorClientCertPath'),
      clientKeyPath: prop('otlpCollectorClientKeyPath'),
      caCertPath: prop('otlpCollectorCaCertPath'),
      disableSSLVerification: prop('otlpCollectorDisableSSLVerification'),
      resourceAttributes: prop('otlpCollectorResourceAttributes')
    },
    otelReporting: {
      enabled: prop('otelReportingEnabled'),
      intervalSeconds: prop('otelReportingIntervalSeconds')
    },
    originalCliArgs: (cliArgs) => cliArgs
  });

export default Args;
