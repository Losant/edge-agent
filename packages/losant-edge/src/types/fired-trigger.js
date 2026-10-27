import t from 'tcomb';
import TriggerType from './trigger-type.js';

const FiredTrigger = t.struct({
  payload: t.Object,
  triggerId: t.String,
  triggerType: TriggerType,
  // used to differentiate the different kinds of mqttTopic triggers
  integrationId: t.maybe(t.enums.of(['local', 'losant', 'external']))
}, {
  name: 'FiredTrigger',
  strict: true,
  defaultProps: {
    payload: {}
  }
});

export default FiredTrigger;
