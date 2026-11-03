import t from 'tcomb';

const BeckhoffNamedConfigs = t.struct({
  triggerId: t.String,
  configName: t.String
}, {
  name: 'BeckhoffNamedConfigs',
  strict: true
});

export default BeckhoffNamedConfigs;
