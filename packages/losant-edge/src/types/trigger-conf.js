import t from 'tcomb';
import OpcuaTriggerConfig from './opcua-trigger-config.js';
import MqttClientTriggerTomlConfig from './mqtt-client-trigger-toml-config.js';
import BeckhoffTriggerTomlConfig from './beckhoff-trigger-toml-config.js';
import { prop } from 'omnibelt';
import { configError } from '../lib/configuration-error.js';

const TriggerConf = t.union([BeckhoffTriggerTomlConfig, OpcuaTriggerConfig, MqttClientTriggerTomlConfig], 'TriggerConf');
TriggerConf.dispatch = (value) => {
  switch (value?.type) {
    case 'opcua':
      return OpcuaTriggerConfig;
    case 'mqttClient':
      return MqttClientTriggerTomlConfig;
    case 'beckhoff':
      return BeckhoffTriggerTomlConfig;
    default:
      throw configError(`${value?.type} is not a valid trigger config type.`);
  }
};

TriggerConf.fromArgs = prop('triggers');

export default TriggerConf;
