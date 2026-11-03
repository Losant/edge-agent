import FiredTrigger from './types/fired-trigger.js';
import FlowErrorConfigs from './types/flow-error-configs.js';
import t from 'tcomb';
import logger from './logger/index.js';
import { resetTo } from './utils.js';

const TIMEOUT_BURST = 10;
const TIMEOUT_PERIOD = 1000;

const stateDefault = () => ({
  onErrorFire: null,
  configById: new Map()
});

const FlowErrorManager = () => {
  const state = stateDefault();

  const fireTrigger = async ({ now, triggerId, payload, errorInfo, context }) => {
    const config = state.configById.get(triggerId);
    if (!config) { return; }
    if (now - config.timeoutInfo.executeTime > TIMEOUT_PERIOD) {
      config.timeoutInfo.executeTime = now;
      config.timeoutInfo.numFires = 0;
    }
    if (config.timeoutInfo.numFires < TIMEOUT_BURST) {
      const newPayload = {
        time: now,
        data: { erroredPayload: payload, errorInfo }
      };
      if (context.originalPayload.data?.replyId) { newPayload.data.replyId = context.originalPayload.data?.replyId; }
      await state.onErrorFire(FiredTrigger({
        triggerId,
        triggerType: 'flowError',
        payload: newPayload
      }));
      config.timeoutInfo.numFires++;
    } else {
      logger.warn(`Throttled error trigger on ${triggerId}`);
    }
  };

  const fireOnError = async ({ errorInfo, triggerId, context, payload }) => {
    if (context.originalPayload.triggerType === 'flowError') { return; }
    const globalTriggerId = 'global-flowError';
    const now = new Date();
    await fireTrigger({ now, triggerId, payload, errorInfo, context }); // local trigger
    await fireTrigger({ now, triggerId: globalTriggerId, payload, errorInfo, context }); // device global trigger
  };

  const initialize = async (errorConfigs, onErrorFire) => {
    if (state.onErrorFire) { throw new Error('Initialize has already been called'); }
    errorConfigs = FlowErrorConfigs(errorConfigs);
    errorConfigs.forEach((config) => {
      state.configById.set(config.triggerId, {
        ...config,
        timeoutInfo: { executeTime: new Date(), numFires: 0 }
      });
    });
    t.Function(onErrorFire);
    state.onErrorFire = onErrorFire;
  };

  const update = async (errorConfigs) => {
    if (!state.onErrorFire) { throw new Error('Flow Error manager must be initialized first'); }
    errorConfigs = FlowErrorConfigs(errorConfigs);
    const newConfigs = new Map();
    errorConfigs.forEach((config) => {
      let updatedConfig = {};
      const currentConfig = state.configById.get(config.triggerId);
      if (currentConfig) {
        updatedConfig = { ...currentConfig, ...config };
      } else {
        updatedConfig = { ...config, timeoutInfo: { executeTime: new Date(), numFires: 0 } };
      }
      newConfigs.set(config.triggerId, updatedConfig);
    });
    state.configById = newConfigs;
  };

  const shutdown = async () => {
    resetTo(stateDefault, state);
  };

  return {
    fireOnError,

    // :: (ErrorConfigs, (FiredTrigger -> *)) -> Promise<Nil>
    initialize,

    // :: ErrorConfigs -> Promise<Nil>
    update,

    // SE: State is reset to default, manager will need to be reinitialized
    // :: -> Nil
    shutdown
  };
};

export default FlowErrorManager;
