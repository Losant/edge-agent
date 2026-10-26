import t from 'tcomb';
import logger from './logger/index.js';
import FiredTrigger from './types/fired-trigger.js';
import { forEachSerialP, union } from 'omnibelt';
import { getClient, cleanClients, subscribeToSymbol, clientCache, setFireTrigger, configDoesNotMatch } from './lib/connections/beckhoff.js';
import { validateClientConfig } from './lib/beckhoff-utils.js';
import { BeckhoffConfigs, BeckhoffTriggerTomlConfigMap } from './types/index.js';

const TRIGGER_TYPE = 'beckhoff';

const stateDefault = () => ({
  beckhoffFire: null
});

const castAndValidateConfig = ({ localAdsPort, targetAdsPort, routerTcpPort, ...config }) => {
  config.localAdsPort = Number(localAdsPort);
  config.targetAdsPort = Number(targetAdsPort);
  config.routerTcpPort = Number(routerTcpPort);
  return validateClientConfig(config);
};

const BeckhoffManager = (tomlConfigs = {}) => {
  const state = stateDefault();
  tomlConfigs = BeckhoffTriggerTomlConfigMap(tomlConfigs);
  const fireTriggerFromSubscription = (payload, triggerIds) => {
    triggerIds.forEach((triggerId) => {
      state.beckhoffFire(FiredTrigger({
        triggerType: TRIGGER_TYPE,
        triggerId,
        payload
      }));
    });
  };

  const buildClientKeyToSubscription = async (beckhoffConfigs) => {
    const clientKeyToSubscriptionInfo = {};
    await forEachSerialP(async ({ triggerId, configName, cycleTimeMs, subscriptionItems, ...config }) => {
      if (configName) {
        if (!tomlConfigs[configName]) {
          logger.errorNoRollbar(`Beckhoff trigger config, ${configName} was not found.`);
          return;
        }
        ({ cycleTimeMs, subscriptionItems, ...config } = tomlConfigs[configName]);
      }
      let clientConfig;
      try {
        clientConfig = await castAndValidateConfig(config);
      } catch (e) {
        logger.errorNoRollbar(`Unable to validate Beckhoff client configuration for ${config.routerHost}:${config.routerTcpPort} at trigger ${triggerId} - ${e.message}`);
        return;
      }

      const { cacheKey, config: existingClientConfig } = getClient(clientConfig);
      if (configDoesNotMatch(existingClientConfig, clientConfig)) {
        logger.errorNoRollbar(`Unable to handle subscriptions for ${triggerId} an existing client is already using ${config.routerHost}:${config.routerTcpPort}.`);
        return;
      }
      subscriptionItems.forEach((item) => {
        const name = item?.name || item;
        if (!clientKeyToSubscriptionInfo[cacheKey]) {
          clientKeyToSubscriptionInfo[cacheKey] = {};
        }
        if (!clientKeyToSubscriptionInfo[cacheKey][name]) {
          clientKeyToSubscriptionInfo[cacheKey][name] = { [cycleTimeMs]: [] };
        }
        if (!clientKeyToSubscriptionInfo[cacheKey][name][cycleTimeMs]) {
          clientKeyToSubscriptionInfo[cacheKey][name][cycleTimeMs] = [];
        }
        clientKeyToSubscriptionInfo[cacheKey][name][cycleTimeMs].push(triggerId);
      });

    }, beckhoffConfigs);
    return clientKeyToSubscriptionInfo;
  };

  const updateClientsWithSubscriptions = async (clientKeyToSubscriptionInfo) => {
    await forEachSerialP(async ([ cacheKey, cachedClient ]) => {
      if (!clientKeyToSubscriptionInfo[cacheKey]) {
        if (cachedClient.subscriptions.size) {
          // all subscriptions were removed from this client...
          const { client, error } = await cachedClient.clientP;
          cachedClient.subscriptions = new Map();
          if (!error) {
            await client.unsubscribeAll();
          }
        }
        return;
      }
      const { client, error } = await cachedClient.clientP;
      if (error) {
        logger.errorNoRollbar(`Unable to connect to Beckhoff PLC to update subscriptions ${cachedClient.config.routerAddress}:${cachedClient.config.routerTcpPort} - ${error}`);
      }
      const clientHasErrored = !!error;
      const subNames = Array.from(cachedClient.subscriptions.keys());
      Object.keys(clientKeyToSubscriptionInfo[cacheKey]).forEach((name) => {
        if (!cachedClient.subscriptions.has(name)) {
          subNames.push(name);
        }
      });
      await forEachSerialP(async (name) => {
        if (!clientKeyToSubscriptionInfo[cacheKey][name]) {
          // this entire symbol was removed from this client
          const current = cachedClient.subscriptions.get(name);
          cachedClient.subscriptions.delete(name);
          if (!clientHasErrored) {
            await forEachSerialP(async ({ subscription }) => {
              if (subscription) {
                try {
                  await subscription.unsubscribe();
                } catch (e) {
                  logger.errorNoRollbar(`Beckhoff failed to unsubscribe to ${name} - ${e.message}`);
                }
              }
            }, Object.values(current));
          }
          return;
        }

        let cacheByCycleTime = cachedClient.subscriptions.get(name);
        if (!cacheByCycleTime) {
          // subscribing to a new name
          cacheByCycleTime = {};
          cachedClient.subscriptions.set(name, cacheByCycleTime);
          await forEachSerialP(async (cycleTime) => {
            cacheByCycleTime[cycleTime] = { triggerIds: clientKeyToSubscriptionInfo[cacheKey][name][cycleTime] };
            if (!clientHasErrored) {
              cacheByCycleTime[cycleTime].subscription = await subscribeToSymbol(client, name, cycleTime, cacheKey);
            }
          }, Object.keys(clientKeyToSubscriptionInfo[cacheKey][name]));
          return;
        }
        // updating cycle times & triggerIds on an existing subscription
        const originalSubsByCycle = Object.keys(cacheByCycleTime);
        const updatedCycleTimes = Object.keys(clientKeyToSubscriptionInfo[cacheKey][name]);
        const allCycleTimes = union(originalSubsByCycle, updatedCycleTimes);
        const originalCycleTimeSet = new Set(originalSubsByCycle);
        const updatedCycleTimeSet = new Set(updatedCycleTimes);

        await forEachSerialP(async (cycleTime) => {
          if (originalCycleTimeSet.has(cycleTime) && updatedCycleTimeSet.has(cycleTime)) {
            // existing cycle time for symbol, just overwrite the trigger ids
            // possibly nothing actually changed
            cacheByCycleTime[cycleTime].triggerIds = clientKeyToSubscriptionInfo[cacheKey][name][cycleTime];
            return;
          }

          if (originalCycleTimeSet.has(cycleTime)) {
            // cycle time was removed from this symbol.
            const { subscription } = cacheByCycleTime[cycleTime];
            delete cacheByCycleTime[cycleTime];
            if (subscription && !clientHasErrored) {
              try {
                await subscription.unsubscribe();
              } catch (e) {
                logger.errorNoRollbar(`Beckhoff failed to unsubscribe to ${name} - ${e.message}`);
              }
            }
            return;
          }
          // new cycle time for symbol
          cacheByCycleTime[cycleTime] = { triggerIds: clientKeyToSubscriptionInfo[cacheKey][name][cycleTime] };
          if (!clientHasErrored) {
            cacheByCycleTime[cycleTime].subscription = await subscribeToSymbol(client, name, cycleTime, cacheKey);
          }
        }, allCycleTimes);
      }, subNames);


    }, clientCache);
  };

  const setupSubscriptions = async (beckhoffConfigs) => {
    beckhoffConfigs = BeckhoffConfigs(beckhoffConfigs);
    const clientKeyToSubscriptionInfo = await buildClientKeyToSubscription(beckhoffConfigs);
    await updateClientsWithSubscriptions(clientKeyToSubscriptionInfo);
  };

  const initialize = async (beckhoffConfigs, fireTrigger) => {
    if (state.beckhoffFire) { throw new Error('Initialize has already been called'); }
    t.Function(fireTrigger);
    state.beckhoffFire = fireTrigger;
    setFireTrigger(fireTriggerFromSubscription);
    await setupSubscriptions(beckhoffConfigs);
  };

  const update = async (beckhoffConfigs) => {
    if (!state.beckhoffFire) { throw new Error('Beckhoff Manager must be initialized first'); }
    await setupSubscriptions(beckhoffConfigs);
  };

  const shutdown = async () => {
    await cleanClients();
    state.beckhoffFire = null;
  };

  return {
    // :: (BeckhoffConfigs, (FiredTrigger -> *)) -> Promise<Nil>
    initialize,

    // :: BeckhoffConfigs -> Promise<Nil>
    update,

    // SE: State is reset to default, manager will need to be reinitialized
    // :: -> Nil
    shutdown
  };

};

// :: (BeckhoffTriggerTomlConfigMap) -> BeckhoffManager
export default BeckhoffManager;
