import t from 'tcomb';

const UdpConfig = t.struct({
  udpPort: t.String,
  key: t.maybe(t.String),
  snmpTrapConfig: t.maybe(t.Object)
}, {
  name: 'UdpConfig',
  strict: true
});

export default UdpConfig;
