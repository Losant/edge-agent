import t from 'tcomb';
import SerialConfig from './serial-config.js';

const SerialConfigs = t.list(SerialConfig);

export default SerialConfigs;
