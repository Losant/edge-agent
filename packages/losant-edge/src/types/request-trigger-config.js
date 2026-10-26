import t from 'tcomb';

const HttpMethod = t.enums.of(['*', 'get', 'post', 'patch', 'put', 'delete', 'options'], 'HttpMethods');

const RequestTriggerConfig = t.struct({
  triggerId: t.String,
  method: t.maybe(HttpMethod),
  route: t.maybe(t.String)
}, {
  name: 'RequestTriggerConfig',
  strict: true
});

export default RequestTriggerConfig;
