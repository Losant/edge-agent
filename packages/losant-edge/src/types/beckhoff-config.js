import t from 'tcomb';
import { MAX_EXTERNAL_CALL_TIME } from '../constants.js';

const BeckhoffConfig = t.struct({
  triggerId: t.String,
  localAmsNetId: t.String,
  localAdsPort: t.String,
  targetAmsNetId: t.String,
  targetAdsPort: t.String,
  routerHost: t.String,
  routerTcpPort: t.String,
  cycleTimeMs: t.Number,
  subscriptionItems: t.list(t.struct({
    name: t.String
  })),
  timeout: t.Number
}, {
  name: 'BeckhoffConfig',
  strict: true,
  defaultProps: {
    localAdsPort: '37250',
    targetAdsPort: '851',
    routerTcpPort: '48898',
    timeout: MAX_EXTERNAL_CALL_TIME,
    cycleTimeMs: 10000 // default to 10 seconds
  }
});

export default BeckhoffConfig;
