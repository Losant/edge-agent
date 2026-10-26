import t from 'tcomb';
import OpcuaConfig from './opcua-config.js';
import OpcuaNamedConfig from './opcua-named-config.js';

const TomlOrOpcuaConfig = t.union([OpcuaNamedConfig, OpcuaConfig], 'TomlOrOpcuaConfig');
TomlOrOpcuaConfig.dispatch = (value) => {
  return value.configName ? OpcuaNamedConfig : OpcuaConfig;
};

const OpcuaConfigs = t.list(TomlOrOpcuaConfig);

export default OpcuaConfigs;
