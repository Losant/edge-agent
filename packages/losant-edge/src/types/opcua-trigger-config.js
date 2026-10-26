import t from 'tcomb';
import OpcuaSessionConfig from './opcua-session-config.js';
import OpcuaItemConfig from './opcua-item-config.js';

const OpcuaTriggerConfig = OpcuaSessionConfig.extend({
  name: t.String,
  type: t.enums.of(['opcua']),
  monitoredItems: t.list(OpcuaItemConfig)
}, {
  name: 'OpcuaTriggerConfig',
  strict: true,
  defaultProps: {
    monitoredItems: []
  }
});

export default OpcuaTriggerConfig;
