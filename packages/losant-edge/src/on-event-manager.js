import { groupBy, prop } from 'omnibelt';
import t from 'tcomb';
import { resetTo } from './utils.js';
import FiredTrigger from './types/fired-trigger.js';
import OnEventConfigs from './types/on-event-configs.js';

const stateDefault = () => ({
  configsByType: { onBoot: [], onConnect: [], onDisconnect: [], onSync: [] },
  onTriggerFire: null
});

const OnEventManager = () => {
  const state = stateDefault();

  const fireOnEvent = (event) => {
    const fireFunc = async (data = {}) => {
      const firingTriggers = state.configsByType[event];
      if (!firingTriggers || !firingTriggers.length) { return; }
      firingTriggers.forEach((firedTrigger) => {
        if (event === 'onSync' && !firedTrigger.syncTypes.includes(data.syncType)) { return; }

        // intentionally not awaiting the completion
        // of these workflows - waiting will end up blocking
        // other parts of the agent for no good reason
        state.onTriggerFire(FiredTrigger({
          triggerId: firedTrigger.eventId,
          triggerType: event,
          payload: { time: new Date(), data }
        }));
      });
    };
    return fireFunc;
  };

  const fireOnBoot = fireOnEvent('onBoot');

  const fireOnConnect = fireOnEvent('onConnect');

  const fireOnDisconnect = fireOnEvent('onDisconnect');

  const fireOnSync = fireOnEvent('onSync');

  const setStateConfigs = (onEventConfigs) => {
    state.configsByType = groupBy(prop('event'), onEventConfigs);
  };

  const initialize = async (onEventConfigs, onTriggerFire) => {
    if (state.onTriggerFire) { throw new Error('Initialize has already been called'); }
    onEventConfigs = OnEventConfigs(onEventConfigs);
    t.Function(onTriggerFire);
    state.onTriggerFire = onTriggerFire;
    setStateConfigs(onEventConfigs);

    await fireOnBoot();
  };

  const update = async (onEventConfigs) => {
    if (!state.onTriggerFire) { throw new Error('On Event manager must be initialized first'); }
    setStateConfigs(onEventConfigs);
  };

  const shutdown = () => {
    resetTo(stateDefault, state);
  };

  return {
    // :: (OnConfigs, (FiredTrigger -> *)) -> Promise<Nil>
    initialize,

    // :: OnConfigs -> Promise<Nil>
    update,

    fireOnBoot,

    fireOnConnect,

    fireOnDisconnect,

    fireOnSync,

    // SE: State is reset to default, manager will need to be reinitialized
    // :: -> Nil
    shutdown
  };

};

// :: () -> OnEventManager
export default OnEventManager;

