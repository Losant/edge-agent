import t from 'tcomb';
import SubscriptionConfig from './subscription-config.js';
import { mapRejectNil } from 'omnibelt';

const SubscriptionConfigs = t.list(SubscriptionConfig);

SubscriptionConfigs.getLocalBrokerSubs = (subs) => {
  const topicSet = new Set();
  subs.forEach((sub) => {
    if (sub.triggerType === 'mqttTopic' && sub.integrationId === 'local') {
      topicSet.add(sub.mqttTopic);
    }
  });
  return Array.from(topicSet);
};

SubscriptionConfigs.getLosantBrokerSubs = (subs) => {
  return mapRejectNil((sub) => {
    return (sub.integrationId === 'losant' || !sub.integrationId) ? sub : null;
  }, subs);
};

SubscriptionConfigs.getExternalConfigNames = (subs) => {
  return mapRejectNil((sub) => {
    return sub.integrationId === 'external' ? sub.mqttTopic : null;
  }, subs);
};

export default SubscriptionConfigs;
