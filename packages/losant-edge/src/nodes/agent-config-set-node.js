import * as payloadHelper from 'losant-handlebars';
import LJSON from 'losant-nodejs-utils/src/ljson.js';
import errors from 'losant-nodejs-utils/src/errors.js';
import { isPlainObject, mergeDeepRight, isEmpty, isNil, isNilOrEmpty, compact } from 'omnibelt';
import fs from 'fs-extra';
import toml from '@iarna/toml';
import normalizeArgs from '../lib/normalize-args.js';
import process from 'process';

const cleanForTomlStringifyValues = (input) => {
  if (isNil(input)) { return; }

  if (Array.isArray(input)) {
    return input.map(cleanForTomlStringifyValues);
  } else if (typeof(input) === 'object') {
    if (!isPlainObject(input)) { return; }
    let result = {};
    Object.keys(input).forEach((key) => {
      const value = cleanForTomlStringifyValues(input[key]);
      if (!isNil(value)) {
        // intentionally using this so that dotted paths get automatically expanded
        result = payloadHelper.set(key, value, result);
      }
    });
    return isEmpty(result) ? undefined : result;
  }

  return input;
};

const tomlTriggerMerge = (currentTomlConfig, newTomlConfig) => {
  Object.keys(newTomlConfig).forEach((key) => {
    if (key === 'triggers' && currentTomlConfig.triggers?.length) {
      newTomlConfig.triggers.forEach((trigger, i) => {
        if (trigger === null) {
          currentTomlConfig.triggers[i] = null; // this means a removal of that index
          return;
        }

        if (isNilOrEmpty(trigger)) {
          return; // this means leave the current one alone
        }

        // if there is no old one at that index, just use the new one
        if (!currentTomlConfig.triggers[i]) {
          currentTomlConfig.triggers[i] = trigger;
          return;
        }

        // if the trigger type is changing, replace the whole trigger
        if (trigger.type && trigger.type !== currentTomlConfig.triggers[i].type) {
          currentTomlConfig.triggers[i] = trigger;
          return;
        }

        if (currentTomlConfig.triggers[i].type === 'opcua') {
          const monitoredItems = currentTomlConfig.triggers[i].monitoredItems || [];
          (trigger.monitoredItems || []).forEach((item, j) => {
            if (!monitoredItems[j]) {
              monitoredItems[j] = item;
            } else if (item === null) {
              monitoredItems[j] = null; // lets you remove a monitored item at an index
            } else if (!isNilOrEmpty(item)) {
              monitoredItems[j] = mergeDeepRight(monitoredItems[j], item);
            }
          });
          delete currentTomlConfig.triggers[i].monitoredItems;
          currentTomlConfig.triggers[i] = mergeDeepRight(currentTomlConfig.triggers[i], trigger);
          currentTomlConfig.triggers[i].monitoredItems = compact(monitoredItems);
        } else {
          currentTomlConfig.triggers[i] = mergeDeepRight(currentTomlConfig.triggers[i], trigger);
        }
      });
      currentTomlConfig.triggers = compact(currentTomlConfig.triggers);
    } else if (key === 'triggers') {
      currentTomlConfig.triggers = newTomlConfig.triggers;
    } else {
      currentTomlConfig[key] = mergeDeepRight(currentTomlConfig[key], newTomlConfig[key]);
    }
  });

  return currentTomlConfig;
};

class AgentConfigSetNode {

  /* Example Config:
  {
    configSourceMethod: <String - Optional: form of input (individualFields|jsonTemplate|payloadPath). Default individualFields>,
    configSource: <Array|String - Optional: depends on configSourceMethod. For individualFields, an array of
      { keyTemplate, valueTemplate } pairs (keys may be dotted paths). For jsonTemplate, a JSON template that
      renders to an object. For payloadPath, a payload path to an object or JSON string. Default []>,
    resultPath: <String - Optional: payload path at which to place { success: true } or
      { success: false, error: { type, message } }>
  }
  Notes:
    The new values are merged into the existing config file and the agent is then
    reloaded with SIGHUP. Triggers are merged by index: null removes that index, an
    empty value leaves it alone, and changing a trigger's type replaces it entirely.
    For opcua triggers, monitoredItems are merged by index in the same way.
    An empty configSource skips the file update and only triggers the reload.
    Invalid configSource input (not an array for individualFields, invalid JSON,
    not an object) throws a validation error. Config validation and write failures
    do not throw. They are written to resultPath as success: false with an error
    type from validation, CONFIG_WRITE_ERROR, or CONFIG_RELOAD_ERROR.
  */

  constructor(id, outputIds, config) {
    this.id = id;
    this.outputIds = outputIds;
    this.configSourceMethod = config.configSourceMethod || 'individualFields';
    this.resultPath = config.resultPath;
    this.configSource = config.configSource || [];
  }

  async run(context, payload) {

    let newTomlConfig;
    if (this.configSourceMethod === 'individualFields') {
      if (!Array.isArray(this.configSource)) {
        throw errors.Validation({ message: 'configSource must be an array.' });
      }

      newTomlConfig = {};
      this.configSource.forEach((fieldPair) => {
        const key = payloadHelper.renderToString(fieldPair?.keyTemplate, payload).trim();
        if (!key) { return; }

        const value = payloadHelper.render(fieldPair.valueTemplate, payload);

        newTomlConfig = payloadHelper.set(key, value, newTomlConfig);
      });
    } else {
      if (this.configSourceMethod === 'jsonTemplate') {
        newTomlConfig = payloadHelper.render(this.configSource, payload);
      } else {
        newTomlConfig = payloadHelper.lookup(this.configSource, payload);
      }

      if (typeof(newTomlConfig) === 'string') {
        try {
          newTomlConfig = LJSON.parse(newTomlConfig);
        } catch {
          throw errors.InvalidJsonTemplate({ title: 'configSource' });
        }
      }

      if (!isPlainObject(newTomlConfig)) {
        throw errors.Validation({ message: 'configSource must render to an object.' });
      }
    }

    if (!isEmpty(newTomlConfig)) {
      const currentFullConfig = context.getCurrentAgentConfig();
      let currentTomlConfig = {};

      try {
        currentTomlConfig = toml.parse(
          await fs.readFile(currentFullConfig.originalCliArgs.confPath, 'utf8')
        );
      } catch {}

      if (newTomlConfig.triggers) { // triggers can not be simply merged
        currentTomlConfig = tomlTriggerMerge(currentTomlConfig, newTomlConfig);
      } else {
        currentTomlConfig = mergeDeepRight(currentTomlConfig, newTomlConfig);
      }

      const newToml = cleanForTomlStringifyValues(currentTomlConfig);

      try {
        await normalizeArgs(currentFullConfig.originalCliArgs, newToml);
      } catch (e) {
        payload = payloadHelper.set(this.resultPath, {
          success: false,
          error: {
            type: e.type,
            message: e.message
          }
        }, payload);
        return [this.outputIds, payload];
      }

      try {
        await fs.outputFile(currentFullConfig.originalCliArgs.confPath, toml.stringify(newToml));
      } catch {
        payload = payloadHelper.set(this.resultPath, {
          success: false,
          error: {
            type: 'CONFIG_WRITE_ERROR',
            message: `Error writing updated configuration file to ${currentFullConfig.originalCliArgs.confPath}`
          }
        }, payload);
        return [this.outputIds, payload];
      }
    }

    try {
      process.kill(process.pid, 'SIGHUP');
    } catch {
      payload = payloadHelper.set(this.resultPath, {
        success: false,
        error: {
          type: 'CONFIG_RELOAD_ERROR',
          message: 'Error triggering agent configuration reload'
        }
      }, payload);
      return [this.outputIds, payload];
    }

    payload = payloadHelper.set(this.resultPath, { success: true }, payload);
    return [this.outputIds, payload];
  }

}

export default AgentConfigSetNode;
