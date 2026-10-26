import t from 'tcomb';

const RedisConfig = t.struct({
  host: t.String,
  port: t.maybe(t.String),
  password: t.maybe(t.String),
  topic: t.String,
  triggerId: t.String // redis trigger ids are globally uniq, they contain the flow ID
}, {
  name: 'RedisConfig',
  strict: true
});

export default RedisConfig;
