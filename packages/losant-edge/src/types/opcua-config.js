import OpcuaSessionConfig from './opcua-session-config.js';
import OpcuaItemConfig from './opcua-item-config.js';

const OpcuaConfig = OpcuaSessionConfig.extend(OpcuaItemConfig, 'OpcuaConfig');

export default OpcuaConfig;
