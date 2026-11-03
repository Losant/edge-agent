import t from 'tcomb';
import {
  ServerPort, BeckhoffSymbolName, AmsNetId, CycleTimeMs
} from './lib/refinements.js';
import { MAX_EXTERNAL_CALL_TIME } from '../constants.js';
import { isPlainObject } from 'omnibelt';

const SubscriptionItemObj = t.list(t.struct({
  name: BeckhoffSymbolName
}));

const SubscriptionItemStr = t.list(t.String);

const SubscriptionItems = t.union([ SubscriptionItemStr, SubscriptionItemObj ]);
SubscriptionItems.dispatch = (value) => {
  return isPlainObject(value[0]) ? SubscriptionItemObj : SubscriptionItemStr;
};


const BeckhoffTriggerTOMLConfig = t.struct({
  name: t.String,
  type: t.enums.of(['beckhoff']),
  localAmsNetId: AmsNetId,
  localAdsPort: ServerPort,
  targetAmsNetId: AmsNetId,
  targetAdsPort: ServerPort,
  routerHost: t.String,
  routerTcpPort: ServerPort,
  cycleTimeMs: CycleTimeMs,
  subscriptionItems: SubscriptionItems,
  timeout: t.Number
}, {
  name: 'BeckhoffTriggerTOMLConfig',
  strict: true,
  defaultProps: {
    localAdsPort: 37250,
    targetAdsPort: 851,
    routerTcpPort: 48898,
    timeout: MAX_EXTERNAL_CALL_TIME,
    cycleTimeMs: 10000 // default to 10 seconds
  }
});

export default BeckhoffTriggerTOMLConfig;
