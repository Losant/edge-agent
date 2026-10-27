import * as payloadHelper from 'losant-handlebars';
import LJSON from 'losant-nodejs-utils/src/ljson.js';

const compareFunctions = {
  percent: (oldVal, newVal, threshold) => {
    const branchPath = Math.abs((newVal - oldVal) / oldVal) * 100 >= threshold;
    return [branchPath, branchPath];
  },
  percentInc: (oldVal, newVal, threshold) => {
    const branchPath = ((newVal - oldVal) / oldVal) * 100 >= threshold;
    return [branchPath, branchPath || newVal < oldVal];
  },
  percentDec: (oldVal, newVal, threshold) => {
    const branchPath = (-(newVal - oldVal) / oldVal) * 100 >= threshold;
    return [branchPath, branchPath || newVal > oldVal];
  },
  value: (oldVal, newVal, threshold) => {
    const branchPath = (Math.abs(newVal - oldVal) >= threshold);
    return [branchPath, branchPath];
  },
  valueInc: (oldVal, newVal, threshold) => {
    const branchPath = ((newVal - oldVal) >= threshold);
    return [branchPath, branchPath || newVal < oldVal];
  },
  valueDec: (oldVal, newVal, threshold) => {
    const branchPath = (-(newVal - oldVal) >= threshold);
    return [branchPath, branchPath || newVal > oldVal];
  },
  any: (oldVal, newVal) => {
    const branchPath = oldVal !== newVal;
    return [branchPath, branchPath];
  }
};

class BranchOnChangeNode {

  /* Example Config:
  {
    valuePath: <String - Required: payload path of the value to check>,
    changeType: <String - Optional: template resolving to one of percent|percentInc|percentDec|value|valueInc|valueDec|any. Blank means any. An unrecognized type never takes the true path>,
    changeThreshold: <String - Required for every changeType except any: template resolving to the amount of change required (a percentage for the percent types, an absolute amount for the value types). If it does not resolve to a number the true path is never taken>,
    prevValuePath: <String - Optional: payload path for the previously stored value as { value, time }, where time is the epoch milliseconds when that value was stored. Not set if no value was stored yet>,
    onChangeIdTemplate: <String - Optional: template that adds a key to the stored value, so a single node can track separate previous values (for example one per device)>
  }
  Notes:
  Outputs: outputIds[0] is the false path (no qualifying change), outputIds[1] is the true path (a qualifying change occurred).
  The previous value is stored per application, workflow, node id, and onChangeIdTemplate (when set).
  Change types: percent and value compare the absolute change; percentInc and valueInc only trigger on an increase; percentDec and valueDec only trigger on a decrease; any triggers when the value is not strictly equal to the stored one.
  For changeTypes other than any, the value at valuePath must be a number or convertible to a number (blank strings are not valid). If it is not, the false path is taken and the stored value is not updated.
  If no value has been stored previously, the false path is taken and the current value is stored.
  The stored value is updated when the true path is taken, and for the Inc and Dec types also when the value moves in the opposite direction. Otherwise the stored value is kept as the baseline, so change is measured against the last stored value rather than the last seen value.
  */

  constructor(id, outputIds, config) {
    this.id = id;
    this.outputIds = outputIds;
    this.valuePath = config.valuePath;
    this.prevValuePath = config.prevValuePath;
    this.changeType = config.changeType;
    this.onChangeIdTemplate = config.onChangeIdTemplate;
    this.changeThreshold = config.changeThreshold;
  }

  compareFunc(type, threshold, oldVal, newVal) {
    const func = compareFunctions[type];
    return func ? func(oldVal, newVal, threshold) : [false, false];
  }

  castValue(type, value) {
    if (type === 'any') { return value; }
    return Number(value);
  }

  isValidValue(type, value) {
    if (type === 'any') { return true; }
    // don't allow blank strings to just cast to 0
    if (typeof value === 'string' && value.trim() === '') { return false; }
    value = Number(value);
    return !Number.isNaN(value);
  }

  async run(context, payload) {
    let threshold = Number(payloadHelper.render(this.changeThreshold, payload));
    if (Number.isNaN(threshold)) { threshold = Infinity; }

    const changeType = payloadHelper.renderToString(this.changeType, payload).trim() || 'any';

    let newValue = payloadHelper.lookup(this.valuePath, payload);

    let storeKey = `onchange/${this.id}`;
    if (this.onChangeIdTemplate) {
      // not changing this to renderToString intentionally
      // because this would modify existing undefined/null behavior
      storeKey = `${storeKey}/${String(payloadHelper.render(this.onChangeIdTemplate, payload))}`;
    }

    let branchPath   = false;
    let oldValue     = null;
    if (!this.isValidValue(changeType, newValue)) {
      if (this.prevValuePath) {
        const storeVal = await context.kvStore.get(context.applicationId, context.flowId, storeKey);
        oldValue = storeVal ? LJSON.parse(storeVal) : null;
      }
    } else {
      newValue = this.castValue(changeType, newValue);
      await context.kvStore.lock(context.applicationId, context.flowId, storeKey, async () => {
        let storeVal = await context.kvStore.get(context.applicationId, context.flowId, storeKey);
        let shouldStore;
        if (storeVal) {
          oldValue = LJSON.parse(storeVal);
          [branchPath, shouldStore] = this.compareFunc(changeType, threshold, oldValue.value, newValue);
        } else {
          shouldStore = true;
        }

        if (shouldStore) {
          storeVal = LJSON.stringify({ value: newValue, time: Date.now() });
          await context.kvStore.set(context.applicationId, context.flowId, storeKey, storeVal);
        }
      });
    }
    if (this.prevValuePath && oldValue) { payload = payloadHelper.set(this.prevValuePath, oldValue, payload); }
    const resultIds = this.outputIds[Number(branchPath)];
    return [resultIds, payload];
  }

}

export default BranchOnChangeNode;
