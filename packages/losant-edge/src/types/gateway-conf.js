import { prop } from 'omnibelt';
import t from 'tcomb';
import {
  BROKER_HOST_DEFAULT,
  BROKER_PROTOCOL_DEFAULT,
  GATEWAY_ID_DEFAULT,
  QUEUE_OFFLINE_MESSAGES_DEFAULT,
  SUBSCRIBE_TO_PERIPHERAL_UPDATES_DEFAULT,
  OFFLINE_MESSAGE_REPLAY_ORDER_DEFAULT
} from '../constants.js';
import Struct from './lib/struct.js';
import {
  DeviceId, AccessKey, AccessSecret, BrokerProtocol
} from './lib/refinements.js';
import SslConf from './ssl-conf.js';
import PeripheralUpdatesOptions from './peripheral-updates-options.js';
import ReplayOrderOptions from './replay-order-options.js';

const GatewayConf = Struct({
  host: t.String,
  protocol: BrokerProtocol,
  apiHost: t.maybe(t.String),
  id: DeviceId,
  key: t.maybe(AccessKey),
  secret: t.maybe(AccessSecret),
  clientSsl: t.maybe(SslConf),
  queueOfflineMessages: t.Boolean,
  offlineMessageReplayOrder: ReplayOrderOptions,
  subscribeToPeripheralUpdates: PeripheralUpdatesOptions
}, {
  name: 'GatewayConf',
  strict: true,
  defaultProps: {
    id: GATEWAY_ID_DEFAULT,
    queueOfflineMessages: QUEUE_OFFLINE_MESSAGES_DEFAULT,
    host: BROKER_HOST_DEFAULT,
    protocol: BROKER_PROTOCOL_DEFAULT,
    subscribeToPeripheralUpdates: SUBSCRIBE_TO_PERIPHERAL_UPDATES_DEFAULT,
    offlineMessageReplayOrder: OFFLINE_MESSAGE_REPLAY_ORDER_DEFAULT
  }
});

// :: Args -> GatewayConf
GatewayConf.fromArgs = prop('gateway');

Object.defineProperties(GatewayConf.prototype, {
  url: {
    get() {
      return `${this.protocol}${this.protocol.endsWith('/') ? '' : '://'}${this.host}`;
    }
  },
  apiUrl: {
    get() {
      const apiHost = this.apiHost || this.host.replace(/^broker\./, 'api.');
      const apiProtocol = (this.protocol.startsWith('mqtts') || this.protocol.startsWith('wss')) ?
        'https://' : 'http://';
      return `${apiProtocol}${apiHost}`;
    }
  }
});

export default GatewayConf;
