import LJSON from 'losant-nodejs-utils/src/ljson.js';
import * as payloadHelper from 'losant-handlebars';
import errors from 'losant-nodejs-utils/src/errors.js';
import { isNil } from 'omnibelt';
import resolveValueByLookupType from './lib/resolve-value-by-lookup-type.js';

class GetValueNode {

  /* Example Config:
  {
    keyName: <String - Required unless getAll is true: Template for the storage key name>,
    valuePath: <String - Required: Payload path where the value is placed>,
    defaultValue: <String - Optional: Value to place in valuePath if the key does not exist or its stored value is falsy. If omitted, null is used>,
    defaultValueType: <String - Optional: How defaultValue is resolved. One of json, template, or path. Default template>,
    getAll: <Boolean - Optional: If true, places an object of all key/values for the workflow in valuePath. Default false>
  }
  Notes:
    When getAll is true, keyName, defaultValue and defaultValueType are ignored.
    Errors: Throws a missing field error if keyName renders empty and getAll is false.
  */

  constructor(id, outputIds, config) {
    this.id = id;
    this.outputIds = outputIds;
    this.keyName = config.keyName;
    this.valuePath = config.valuePath;
    this.defaultValue = config.defaultValue;
    this.defaultValueType = config.defaultValueType || 'template';
    this.getAll = config.getAll || false;
  }

  resolveDefaultValue(payload) {
    if (isNil(this.defaultValue)) {
      return null;
    }

    return resolveValueByLookupType({
      inputValue: this.defaultValue,
      lookupType: this.defaultValueType,
      payload,
      title: 'Default Value'
    });
  }

  async run(context, payload) {
    let value;
    if (this.getAll) {
      value = await context.kvStore.getAll(context.applicationId, context.flowId);
    } else {
      const storeKey = payloadHelper.renderToString(this.keyName, payload);
      if (!storeKey) { throw errors.MissingField({ title: 'Storage Key' }); }

      value = await context.kvStore.get(context.applicationId, context.flowId, storeKey);
      value = value ? LJSON.parse(value) : this.resolveDefaultValue(payload);
    }
    payload = payloadHelper.set(this.valuePath, value, payload);
    return [this.outputIds, payload];
  }

}

export default GetValueNode;
