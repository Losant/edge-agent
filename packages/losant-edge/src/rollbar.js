import Rollbar from 'rollbar';
const rollbarKey = process.env.ROLLBAR_KEY;
const isTestEnv = process.env.NODE_ENV === 'test';
import { AGENT_VERSION } from './constants.js';
import { noop } from 'omnibelt';

let rollbar;
if (rollbarKey && !isTestEnv) {
  rollbar = new Rollbar({
    itemsPerMinute: 5,
    accessToken: rollbarKey,
    captureUncaught: false,
    captureUnhandledRejections: false,
    exitOnUncaughtException: false,
    enabled: true,
    verbose: process.env.NODE_ENV !== 'production',
    payload: {
      version: AGENT_VERSION.version
    }
  });
} else {
  rollbar = new Rollbar({
    accessToken: '',
    captureUncaught: false,
    captureUnhandledRejections: false,
    exitOnUncaughtException: false,
    enabled: true,
    transmit: false,
    verbose: true
  });
}
rollbar.client.logger.error = noop;
rollbar.client.logger.log = noop;

export default rollbar;
