import t from 'tcomb';
import RedisConfig from './redis-config.js';

const RedisConfigs = t.list(RedisConfig);

export default RedisConfigs;
