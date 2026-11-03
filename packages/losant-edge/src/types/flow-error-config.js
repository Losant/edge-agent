import t from 'tcomb';

const FlowErrorConfig = t.struct({
  triggerId: t.String
}, {
  name: 'FlowErrorConfig',
  strict: true
});

export default FlowErrorConfig;
