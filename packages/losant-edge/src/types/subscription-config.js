import t from 'tcomb';

const SubscriptionConfig = t.struct({
  mqttTopic: t.String, // for type 'external' this is actually the client config name
  triggerType: t.String,
  integrationId: t.maybe(t.enums.of(['local', 'losant', 'external']))
}, {
  name: 'SubscriptionConfig',
  strict: true
});

export default SubscriptionConfig;
