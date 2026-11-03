import jsforce from '@jsforce/jsforce-node';
import * as payloadHelper from 'losant-handlebars';
import { isNil } from 'omnibelt';
import errors from 'losant-nodejs-utils/src/errors.js';
import resolveValueByLookupType from './lib/resolve-value-by-lookup-type.js';

const OBJ_STR_SET = new Set(['object', 'string']);
const NUM_SET = new Set(['number']);
const OBJ_SET = new Set(['object']);

const VALID_ACTIONS = {
  count: {
    conditions: { index: 0, type: OBJ_STR_SET, required: false, default: {} }
  },
  create: {
    record: { index: 0, type: OBJ_SET, required: true }
  },
  destroy: {
    recordId: { index: 0, type: new Set(['string']), required: true }
  },
  find: {
    conditions: { index: 0, type: OBJ_STR_SET, required: false, default: {} },
    fields: { index: 1, type: OBJ_STR_SET, required: false },
    limit: { index: 2, type: NUM_SET, required: false, part: true },
    offset: { index: 2, type: NUM_SET, required: false, part: true }
  },
  update: {
    record: { index: 0, type: OBJ_SET, required: true }
  }
};

class SalesforceNode {
  /* Example Config:
  {
    username: <String - Required: template for salesforce username>,
    password: <String - Required: template for salesforce password>,
    token: <String - Optional: template for salesforce security token, appended to the password>,
    sobjectType: <String - Required: template for sobject type>,
    action: <String - Required: template for action (count|create|destroy|find|update)>,
    resultPath: <String - Optional: payload path for the result: { success, errors, items } for find, { success, errors, count } for count, the Salesforce response for create|update|destroy, or { success: false, errors: [message] } on failure>,
    params: [
      {
        name: <String - Required: template for the param name. Valid names depend on action (see Notes)>,
        type: <String - Required: json|string|path|templateParts. Other lookup types are accepted; an unknown type is treated as json>,
        value: <Object (for templateParts) or String - Required: skipped if empty>
      }
    ]
  }
  Notes:
    Param names per action:
      count: conditions (object or string, optional)
      create: record (object, required)
      destroy: recordId (string, required)
      find: conditions (object or string, optional), fields (object or string, optional), limit (number, optional), offset (number, optional)
      update: record (object, required)
    Params with an unknown name for the action are ignored. A param of the wrong type, or a missing required param, throws.
    A missing username, password, sobject type, or valid action throws.
    Salesforce login and request failures do not throw. They are written to resultPath as { success: false, errors: [message] }.
  */

  constructor(id, outputIds, config) {
    this.id = id;
    this.outputIds = outputIds;
    this.username = config.username;
    this.password = config.password;
    this.token = config.token;
    this.sobjectType = config.sobjectType;
    this.action = config.action;
    this.resultPath = config.resultPath;
    this.params = config.params;
  }

  async run(context, payload) {
    const username = payloadHelper.renderToString(this.username, payload);
    if (!username) { throw errors.MissingField({ title: 'Salesforce Username' }); }

    let password = payloadHelper.renderToString(this.password, payload);
    if (!password) { throw errors.MissingField({ title: 'Salesforce Password' }); }

    const sobjectType = payloadHelper.renderToString(this.sobjectType, payload);
    if (!sobjectType) { throw errors.MissingField({ title: 'SObject Type' }); }

    const action = payloadHelper.renderToString(this.action, payload);
    const expectedArgs = VALID_ACTIONS[action];
    if (!expectedArgs) { throw errors.MissingField({ title: 'Action' }); }

    if (this.token) {
      const token = payloadHelper.renderToString(this.token, payload);
      if (token) { password = password + token; }
    }

    const methodArgs = [];
    (this.params || []).map((param) => {
      if (!param.name || !param.value) { return; }
      const name = payloadHelper.renderToString(param.name, payload);
      if (!name) { return; }

      const info = expectedArgs[name];
      if (!info) { return; }

      let value = param.value;
      if (param.type === 'templateParts') {
        value = {};
        Object.keys(param.value || {}).forEach((partKey) => {
          value[partKey] = payloadHelper.render(param.value[partKey], payload);
        });
      } else {
        value = resolveValueByLookupType({
          inputValue: value,
          lookupType: param.type,
          payload,
          title: `Param ${name}`,
          defaultLookup: 'json'
        });
      }

      if (typeof value === 'string' && info.type.has('number')) {
        value = Number(value);
        if (!isFinite(value)) { value = null; }
      }

      if (isNil(value)) { return; }

      if (!info.type.has(typeof value)) {
        throw errors.Validation({ message: `Param ${name} is not of the correct type` });
      }

      if (info.part) {
        methodArgs[info.index] = methodArgs[info.index] || {};
        methodArgs[info.index][name] = value;
      } else {
        methodArgs[info.index] = value;
      }

      return value;
    });

    Object.keys(expectedArgs).forEach((argName) => {
      const info = expectedArgs[argName];
      const val = methodArgs[info.index];
      if (isNil(val)) {
        if (info.required) {
          throw errors.MissingField({ title: argName });
        } else if (info.part) {
          methodArgs[info.index] = {};
        } else {
          methodArgs[info.index] = info.default || null;
        }
      }
    });
    let result;
    try {
      const conn = new jsforce.Connection();
      await conn.login(username, password);
      const sobj = conn.sobject(sobjectType);
      result = await sobj[action].apply(sobj, methodArgs);
      if (action === 'find') {
        result = {
          errors: [],
          items: result,
          success: true
        };
      } else if (action === 'count') {
        result = {
          errors: [],
          count: result,
          success: true
        };
      }
    } catch (err) {
      result = {
        success: false,
        errors: [String(err)]
      };
    }
    if (this.resultPath) { payload = payloadHelper.set(this.resultPath, result, payload); }
    return [this.outputIds, payload];
  }

}

export default SalesforceNode;
