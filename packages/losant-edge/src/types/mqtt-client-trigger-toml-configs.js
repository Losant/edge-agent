import t from 'tcomb';
import MqttClientTriggerTomlConfig from './mqtt-client-trigger-toml-config.js';

const MqttClientTriggerTomlConfigs = t.list(MqttClientTriggerTomlConfig);

export default MqttClientTriggerTomlConfigs;
