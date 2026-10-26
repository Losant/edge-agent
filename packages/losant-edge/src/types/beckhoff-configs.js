import t from 'tcomb';
import BeckhoffConfig from './beckhoff-config.js';
import BeckhoffNamedConfig from './beckhoff-named-config.js';

const TomlOrBeckhhoffConfig = t.union([ BeckhoffConfig, BeckhoffNamedConfig ]);
TomlOrBeckhhoffConfig.dispatch = (value) => {
  return value.configName ? BeckhoffNamedConfig : BeckhoffConfig;
};
const BeckhoffConfigs = t.list(TomlOrBeckhhoffConfig);

export default BeckhoffConfigs;
