import t from 'tcomb';

const OpcuaNamedConfig = t.struct({
  opcuaId: t.String,
  configName: t.String
}, {
  name: 'OpcuaNamedConfig',
  strict: true
});

export default OpcuaNamedConfig;
