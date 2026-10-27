import errors from 'losant-nodejs-utils/src/errors.js';

class ScopedKeyValueStore {
  constructor(baseStore, scope) {
    scope = `${scope}/`;

    ['get', 'set', 'del', 'lock', 'latch'].forEach((method) => {
      this[method] = (appId, flowId, storeKey, ...params) => {
        return baseStore[method](appId, flowId, `${scope}${storeKey}`, ...params);
      };
    });

    this.incr = async (appId, flowId, storeKey, amount) => {
      const scopedStoreKey = `${scope}${storeKey}`;
      try {
        return await baseStore.incr(appId, flowId, scopedStoreKey, amount);
      } catch (e) {
        if (e.type === 'WorkflowStorage' && e.message.includes(scopedStoreKey)) {
          throw errors.WorkflowStorage({
            message: e.message.replace(scopedStoreKey, storeKey)
          });
        } else {
          throw e;
        }
      }
    };

    this.getAllKeys = async (...params) => {
      const results = await baseStore.getAllKeys(...params);
      const filteredResults = [];
      results.forEach((key) => {
        if (!key.startsWith(scope)) { return; }
        filteredResults.push(key.substring(scope.length));
      });
      return filteredResults;
    };

    this.getAll = async (...params) => {
      const results = await baseStore.getAll(...params);
      const filteredResults = {};
      Object.entries(results).forEach(([key, value]) => {
        if (!key.startsWith(scope)) { return; }
        filteredResults[key.substring(scope.length)] = value;
      });
      return filteredResults;
    };

    this.delMany = async (appId, flowId, storeKeys) => {
      storeKeys = storeKeys.map((storeKey) => {
        return `${scope}${storeKey}`;
      });
      return baseStore.delMany(appId, flowId, storeKeys);
    };

    this.delAll = async (appId, flowId) => {
      const results = await baseStore.getAllKeys(appId, flowId);
      const filteredResults = [];
      results.forEach((key) => {
        if (!key.startsWith(scope)) { return; }
        filteredResults.push(key);
      });
      return baseStore.delMany(appId, flowId, filteredResults);
    };
  }
}

export default ScopedKeyValueStore;
