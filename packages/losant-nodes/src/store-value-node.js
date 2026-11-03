import LJSON from 'losant-nodejs-utils/src/ljson.js';
import * as payloadHelper from 'losant-handlebars';
import errors from 'losant-nodejs-utils/src/errors.js';
import ljsonRender from './lib/ljson-render.js';
import { isPopulatedString, toNumber } from 'omnibelt';

const maxStorageSize  = 16*1024;
const validValueTypes = new Set(['clear', 'decr', 'incr', 'json', 'number', 'path', 'template']);
const incrValueTypes  = new Set(['incr', 'decr']);

const renderToNumber = (value, payload) => {
  const rendered = payloadHelper.render(value, payload);
  const number = toNumber(rendered);
  if (!isFinite(number)) {
    throw errors.Validation({ message: `Value '${rendered}' is not a valid number` });
  }
  return number;
};

const valueByType = {
  clear: () => undefined,
  decr: (value, payload) => {
    const v = renderToNumber(value, payload);
    return -v;
  },
  incr: renderToNumber,
  json:  (value, payload) => {
    return ljsonRender(value, payload, 'Value');
  },
  number: renderToNumber,
  path: payloadHelper.lookup,
  template: payloadHelper.renderToString
};

class StoreValueNode {

  /* Example Config:
  {
    keyName: <String - Required, except when valueType is 'clear': template for the storage key name. 'clear' with no keyName removes all keys for the workflow>,
    valueType: <String - Optional: clear|decr|incr|json|number|path|template. Default path. Any other value is treated as path>,
    value: <String - Optional: the value to store. Its meaning depends on valueType: a payload path (path), a JSON template (json), a string template (template), or a template that renders to a number (number, incr, decr). Ignored for clear>,
    resultPath: <String - Optional: payload path for the result of the operation>,

    legacy:
    valuePath: <String - Optional: payload path of the value to store. Only used when the effective valueType is path and value is not set>
  }
  Notes:
    If the value resolves to undefined, the value stored at the key is deleted instead of set. This happens for valueType clear, and for valueType path when the path does not exist.
    clear with no keyName removes every key and resultPath receives { removed: <number of keys removed> }.
    incr and decr add to, or subtract from, the number stored at the key, and resultPath receives the new value.
    For all other operations resultPath receives the value stored at the key, or the previous value when the key was deleted. If there is no value, resultPath receives null.
    Values must serialize to less than 16KB or the node throws.
  */

  constructor(id, outputIds, config) {
    this.id = id;
    this.outputIds = outputIds;
    this.keyName = config.keyName;
    this.valueType = validValueTypes.has(config.valueType) ? config.valueType : 'path';
    this.value = config.value;
    this.resultPath = config.resultPath;
    if (this.valueType === 'path') {
      if (!this.value && config.valuePath) { this.value = config.valuePath; }
    }
  }

  async run(context, payload) {
    if (this.keyName === undefined && this.valueType === 'clear') {
      const removed = await context.kvStore.delAll(context.applicationId, context.flowId);
      if (this.resultPath) {
        payload = payloadHelper.set(this.resultPath, { removed }, payload);
      }
      return [this.outputIds, payload];
    }

    const storeKey = payloadHelper.renderToString(this.keyName, payload);
    if (!storeKey) { throw errors.MissingField({ title: 'Storage Key' }); }

    let value = valueByType[this.valueType](this.value, payload);
    if (value === undefined) {
      value = await context.kvStore.del(context.applicationId, context.flowId, storeKey);
    } else {
      value = LJSON.stringify(value);
      const valLen = value.length;
      if (valLen >= maxStorageSize) {
        throw errors.TooLarge({
          maximum: maxStorageSize,
          size: valLen,
          title: 'Storage Value'
        });
      }

      if (incrValueTypes.has(this.valueType)) {
        value = await context.kvStore.incr(context.applicationId, context.flowId, storeKey, value);
      } else {
        value = await context.kvStore.set(context.applicationId, context.flowId, storeKey, value);
      }

    }
    if (isPopulatedString(this.resultPath)) {
      value = isPopulatedString(value) ? LJSON.parse(value) : null;
      payload = payloadHelper.set(this.resultPath, value, payload);
    }
    return [this.outputIds, payload];
  }

}

export default StoreValueNode;
