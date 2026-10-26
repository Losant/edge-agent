import t from 'tcomb';
import UdpConfig from './udp-config.js';

const UdpConfigs = t.list(UdpConfig);

export default UdpConfigs;
