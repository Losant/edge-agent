import { toString, clamp, toNumber } from 'omnibelt';
import AsyncLock from 'async-lock';
import errors from 'losant-nodejs-utils/src/errors.js';
import logger from '../logger/index.js';
import LJSON from 'losant-nodejs-utils/src/ljson.js';

const KeyValueStore = (sublevelDb) => {
  const lockHolder = new AsyncLock({ timeout: 59000 });

  const inMemoryStore = new Map();
  const saveInterval = clamp(500, Infinity, toNumber(process.env.KVSTORE_SAVE_INTERVAL) || 5000);
  let saveIntervalId;

  const _saveKeys = async () => {
    const batchOps = [];
    inMemoryStore.forEach((entry, key) => {
      if (!entry.changed) { return; }
      if (entry.value === null) {
        batchOps.push({ key, type: 'del' });
        inMemoryStore.delete(key);
      } else {
        entry.changed = false;
        batchOps.push({ key, value: entry.value, type: 'put' });
      }
    });
    if (!batchOps.length) { return; }

    try {
      await sublevelDb.batch(batchOps);
    } catch (err) {
      if (err.message && err.message.startsWith('IO Error')) {
        logger.errorNoRollbar(`Workflow Storage Error - ${err.message}`);
      } else {
        logger.error(err);
      }
    }
  };

  const _get = (completeKey) => {
    return inMemoryStore.has(completeKey) ?
      inMemoryStore.get(completeKey).value :
      null;
  };

  const _has = (completeKey) => {
    return _get(completeKey) !== null;
  };

  const _put = (completeKey, value) => {
    if (_get(completeKey) !== value) {
      inMemoryStore.set(completeKey, { value, changed: true });
    }
  };

  const _del = (completeKey) => {
    if (!_has(completeKey)) { return false; }
    inMemoryStore.set(completeKey, { value: null, changed: true });
    return true;
  };

  const addToStoreByIterator = async (nextValue, iterator) => {
    if (!nextValue) { return; }
    inMemoryStore.set(nextValue[0], { value: nextValue[1] });
    const newNext = await iterator.next();
    return addToStoreByIterator(newNext, iterator);
  };

  const initialize = async () => {
    if (saveIntervalId) { return; }

    inMemoryStore.clear();
    await sublevelDb.open();
    const iterator = sublevelDb.iterator();
    await addToStoreByIterator(await iterator.next(), iterator);
    await iterator.close();
    saveIntervalId = setInterval(_saveKeys, saveInterval);
  };

  const shutdown = async () => {
    if (!saveIntervalId) { return; }
    clearInterval(saveIntervalId);
    saveIntervalId = null;
    await _saveKeys();
    inMemoryStore.clear();
  };

  const getAll = async (appId, flowId, parseValues = true) => {
    const results = {};
    const keyStart = `${appId}/${flowId}/`;
    inMemoryStore.forEach((entry, key) => {
      if (!key.startsWith(keyStart)) { return; }
      if (entry.value === null) { return; }
      results[key.substring(keyStart.length)] = parseValues ? LJSON.parse(entry.value) : entry.value;
    });
    return results;
  };

  const getAllKeys = async (appId, flowId) => {
    const results = [];
    const keyStart = `${appId}/${flowId}/`;
    inMemoryStore.forEach((entry, key) => {
      if (!key.startsWith(keyStart)) { return; }
      if (entry.value === null) { return; }
      results.push(key.substring(keyStart.length));
    });
    return results;
  };

  const get = async (appId, flowId, storeKey) => {
    const completeKey = `${appId}/${flowId}/${storeKey}`;
    return _get(completeKey);
  };

  const set = async (appId, flowId, storeKey, storeValue) => {
    const completeKey = `${appId}/${flowId}/${storeKey}`;
    storeValue = toString(storeValue);
    _put(completeKey, storeValue);
    return storeValue;
  };

  const incr = async (appId, flowId, storeKey, amount) => {
    amount = parseFloat(amount);
    if (!isFinite(amount)) {
      throw errors.WorkflowStorage({
        message: 'Amount is not a number, cannot be used to increment/decrement'
      });
    }
    const completeKey = `${appId}/${flowId}/${storeKey}`;
    const value = parseFloat(_get(completeKey) || 0);
    if (!isFinite(value)) {
      throw errors.WorkflowStorage({
        message: `Value at ${storeKey} is not a number, cannot be incremented/decremented`
      });
    }
    const newValue = toString(value + amount);
    _put(completeKey, newValue);
    return newValue;
  };

  const del = async (appId, flowId, storeKey) => {
    const completeKey = `${appId}/${flowId}/${storeKey}`;
    const value = _get(completeKey);
    _del(completeKey);
    return value;
  };

  const delAll = async (appId, flowId) => {
    let counter = 0;
    const keyStart = `${appId}/${flowId}/`;
    inMemoryStore.forEach((value, completeKey) => {
      if (!completeKey.startsWith(keyStart)) { return; }
      if (_del(completeKey)) { counter++; }
    });
    return counter;
  };

  const delMany = async (appId, flowId, storeKeys) => {
    let counter = 0;
    storeKeys.forEach((storeKey) => {
      const completeKey = `${appId}/${flowId}/${storeKey}`;
      if (_del(completeKey)) { counter++; }
    });
    return counter;
  };

  const lock = async (appId, flowId, storeKey, critical) => {
    const completeKey = `${appId}/${flowId}/${storeKey}`;
    return lockHolder.acquire(completeKey, critical);
  };

  const latch = async (appId, flowId, storeKey, shouldLatch, shouldReset) => {
    const completeKey = `${appId}/${flowId}/${storeKey}`;
    let isLatched = _has(completeKey);
    const wasLatched = isLatched;
    let branch = false;
    if (shouldReset) { isLatched = false; }
    if (shouldLatch) {
      if (!isLatched) { branch = true; }
      isLatched = true;
    }
    if (isLatched) {
      _put(completeKey, '1');
    } else {
      _del(completeKey);
    }
    return { wasLatched, isLatched, branch };
  };

  return {
    // :: (String, String, Bool) -> Promise<Object>
    getAll,

    // :: (String, String) -> Promise<Array>
    getAllKeys,

    // :: (String, String, String) -> Promise<String | null>
    get,

    // :: (String, String, String, String) -> Promise<String>
    set,

    // :: (String, String, String, Number) -> Promise<String>
    incr,

    // :: (String, String, String) -> Promise<String | null>
    del,

    // :: (String, String) -> Promise<Number>
    delAll,

    // :: (String, String, Array[String]) -> Promise<Number>
    delMany,

    // :: (String, String, String, () -> Promise<*>) -> Promise<*>
    lock,

    // :: (String, String, String, Bool, Bool) -> Promise<Object>
    latch,

    // :: () -> Promise<undefined>
    initialize,

    // :: () -> Promise<undefined>
    shutdown
  };
};

// :: (LevelManager) -> KeyValueStore
export default KeyValueStore;
