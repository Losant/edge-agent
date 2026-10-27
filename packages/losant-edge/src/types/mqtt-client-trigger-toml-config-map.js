import t from 'tcomb';
import MqttClientTriggerTomlConfig from './mqtt-client-trigger-toml-config.js';

const MqttClientTriggerTomlConfigMap = t.dict(t.String, MqttClientTriggerTomlConfig);

export default MqttClientTriggerTomlConfigMap;
