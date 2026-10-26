import t from 'tcomb';
import { prop } from 'omnibelt';
import {
  UDP_ADDRESS_DEFAULT
} from '../constants.js';
import {
  UdpAddress
} from './lib/refinements.js';

const UdpConf = t.struct({
  address: UdpAddress
}, {
  name: 'UdpConf',
  strict: true,
  defaultProps: {
    address: UDP_ADDRESS_DEFAULT
  }
});

UdpConf.fromArgs = prop('udp');

export default UdpConf;
