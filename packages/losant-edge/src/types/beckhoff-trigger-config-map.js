import t from 'tcomb';
import BeckhoffTriggerTomlConfig from './beckhoff-trigger-toml-config.js';

const BeckhoffTriggerTomlConfigMap = t.dict(t.String, BeckhoffTriggerTomlConfig);

export default BeckhoffTriggerTomlConfigMap;
