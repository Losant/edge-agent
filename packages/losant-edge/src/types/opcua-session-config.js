import t from 'tcomb';
import { SslCertificate, OpcuaUri, SamplingInterval } from './lib/refinements.js';
import { SecurityPolicy, MessageSecurityMode } from 'node-opcua';

const OpcuaSessionConfig = t.struct({
  opcuaId: t.String,
  uri: OpcuaUri,
  username: t.maybe(t.String),
  password: t.maybe(t.String),
  securityPolicy: t.enums.of(Object.keys(SecurityPolicy)),
  securityMode: t.enums.of(Object.keys(MessageSecurityMode)),
  cert: t.maybe(SslCertificate),
  privateKey: t.maybe(t.String), // variation is high
  samplingInterval: SamplingInterval,
  eventFilter: t.Array
}, {
  name: 'OpcuaSessionConfig',
  strict: true,
  defaultProps: {
    opcuaId: '0', // from trigger config
    securityPolicy: 'None',
    securityMode: 'None',
    samplingInterval: '100',
    eventFilter: []
  }
});

export default OpcuaSessionConfig;
