import t from 'tcomb';
import Struct from './lib/struct.js';
import {
  BrokerProtocol, SslCertificate, ServerPort, MqttTopic
} from './lib/refinements.js';
import SslConf from './ssl-conf.js';
import FilePath from './file-path.js';
import { isNilOrEmpty } from 'omnibelt';
import fs from 'fs-extra';
import pem from 'pem';
import { configErrorFromException, configError } from '../lib/configuration-error.js';

const readCertificateInfo = pem.promisified.readCertificateInfo;

const MqttClientTriggerTomlConfig = Struct({
  name: t.String,
  type: t.enums.of(['mqttClient']),
  host: t.String,
  protocol: BrokerProtocol,
  port: t.maybe(ServerPort),
  clientId: t.maybe(t.String),
  username: t.maybe(t.String),
  password: t.maybe(t.String),
  clean: t.Boolean,
  disableSSLVerification: t.Boolean,
  clientSsl: t.maybe(SslConf),
  caCertificate: t.maybe(SslCertificate),
  caCertificatePath: t.maybe(FilePath),
  subscriptions: t.list(MqttTopic),
  protocolVersion: t.maybe(t.enums.of(['3.1.1', '5']))
}, {
  name: 'MqttClientTriggerTomlConfig',
  strict: true,
  defaultProps: {
    disableSSLVerification: false,
    protocol: 'mqtt',
    clean: true,
    protocolVersion: '3.1.1',
    subscriptions: []
  }
});

MqttClientTriggerTomlConfig.resolveAndValidate = async (mqttConf) => {
  if (isNilOrEmpty(mqttConf)) { return; }

  if (mqttConf.clientSsl) {
    mqttConf.clientSsl = await SslConf.resolveAndValidate(mqttConf.clientSsl);
  }

  if (isNilOrEmpty(mqttConf.caCertificate) && !isNilOrEmpty(mqttConf.caCertificatePath)) {
    try {
      mqttConf.caCertificate = await fs.readFile(mqttConf.caCertificatePath, 'utf8');
    } catch (e) {
      throw configErrorFromException(e, `read caCertificate from path ${mqttConf.caCertificatePath}`);
    }
  }

  if (!isNilOrEmpty(mqttConf.caCertificate)) {
    try {
      await readCertificateInfo(mqttConf.caCertificate);
    } catch {
      throw configError(`Provided caCertificate is invalid for MQTT Client config ${mqttConf.name}`);
    }
  }

  return mqttConf;
};

export default MqttClientTriggerTomlConfig;
