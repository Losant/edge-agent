import { sleep, toString } from 'omnibelt';
import autoBind from 'losant-nodejs-utils/src/utils/auto-bind.js';
import errors from 'losant-nodejs-utils/src/errors.js';
import LJSON from 'losant-nodejs-utils/src/ljson.js';

class FakeKeyValueStore {
  constructor() {
    autoBind(this);

    this._values = new Map();
    this._locks = new Map();
  }

  async getAll(appId, flowId, parseValues = true) {
    await sleep(0);
    const results = {};
    const keyStart = `${appId}/${flowId}/`;
    this._values.forEach((value, key) => {
      if (!key.startsWith(keyStart)) { return; }
      results[key.substring(keyStart.length)] = parseValues ? LJSON.parse(value) : value;
    });
    return results;
  }

  async getAllKeys(appId, flowId) {
    await sleep(0);
    const results = [];
    const keyStart = `${appId}/${flowId}/`;
    this._values.forEach((entry, key) => {
      if (!key.startsWith(keyStart)) { return; }
      results.push(key.substring(keyStart.length));
    });
    return results;
  }

  async get(appId, flowId, storeKey) {
    await sleep(0);
    const completeKey = `${appId}/${flowId}/${storeKey}`;
    return this._values.has(completeKey) ?
      this._values.get(completeKey) : null;
  }

  async set(appId, flowId, storeKey, storeValue) {
    await sleep(0);
    const completeKey = `${appId}/${flowId}/${storeKey}`;
    storeValue = toString(storeValue);
    this._values.set(completeKey, storeValue);
    return storeValue;
  }

  async incr(appId, flowId, storeKey, amount) {
    amount = parseFloat(amount);
    if (!isFinite(amount)) {
      throw errors.WorkflowStorage({
        message: 'Amount is not a number, cannot be used to increment/decrement'
      });
    }
    await sleep(0);
    const completeKey = `${appId}/${flowId}/${storeKey}`;
    const value = parseFloat(this._values.get(completeKey) || 0);
    if (!isFinite(value)) {
      throw errors.WorkflowStorage({
        message: `Value at ${storeKey} is not a number, cannot be incremented/decremented`
      });
    }
    const newValue = toString(value + amount);
    this._values.set(completeKey, newValue);
    return newValue;
  }

  async del(appId, flowId, storeKey) {
    await sleep(0);
    const completeKey = `${appId}/${flowId}/${storeKey}`;
    const value = this._values.has(completeKey) ?
      this._values.get(completeKey) : null;
    this._values.delete(completeKey);
    return value;
  }

  async delAll(appId, flowId) {
    await sleep(0);
    let counter = 0;
    const keyStart = `${appId}/${flowId}/`;
    this._values.forEach((value, completeKey) => {
      if (!completeKey.startsWith(keyStart)) { return; }
      if (this._values.delete(completeKey)) { counter++; }
    });
    return counter;
  }

  async delMany(appId, flowId, storeKeys) {
    await sleep(0);
    let counter = 0;
    storeKeys.forEach((storeKey) => {
      if (this._values.delete(`${appId}/${flowId}/${storeKey}`)) { counter++; }
    });
    return counter;
  }

  async lock(appId, flowId, storeKey, critical) {
    await sleep(0);
    const completeKey = `${appId}/${flowId}/${storeKey}`;
    const currentLock = this._locks.get(completeKey);
    if (currentLock) { await currentLock; }
    const newLock = (async () => {
      await critical();
      this._locks.delete(completeKey);
    })();
    this._locks.set(completeKey, newLock);
    await newLock;
  }

  async latch(appId, flowId, storeKey, shouldLatch, shouldReset) {
    const completeKey = `${appId}/${flowId}/${storeKey}`;
    let isLatched = this._values.has(completeKey);
    const wasLatched = isLatched;
    let branch = false;
    if (shouldReset) { isLatched = false; }
    if (shouldLatch) {
      if (!isLatched) { branch = true; }
      isLatched = true;
    }
    if (isLatched) {
      this._values.set(completeKey, '1');
    } else {
      this._values.delete(completeKey);
    }

    return { wasLatched, isLatched, branch };
  }
}

export default new FakeKeyValueStore();
