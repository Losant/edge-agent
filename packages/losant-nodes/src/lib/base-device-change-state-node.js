import * as payloadHelper from 'losant-handlebars';
import LJSON from 'losant-nodejs-utils/src/ljson.js';
import errors from 'losant-nodejs-utils/src/errors.js';
import enforceTime from 'losant-nodejs-utils/src/utils/enforce-time.js';
import { trim, isNil } from 'omnibelt';
import { isValidObjectId } from 'losant-nodejs-utils/src/bson.js';

class BaseDeviceChangeStateNode {

  /* Example Config:
  { attrDataMethod: <String - Optional: form of attr input (individualFields|jsonTemplate|payloadPath). Default individualFields>,
    attrInfos: [
      0 or more of:
      { key: <String - Required: template for name of attribute. Entries with a blank key or valueTemplate are skipped>,
        valueTemplate: <String - Required: template for value of attribute. Entries that render to null or undefined are skipped> }
    ],
    attrJsonTemplate: <String - Optional: JSON template for attr json if jsonTemplate attrDataMethod>,
    attrPayloadPath: <String - Optional: payload path for attr obj if payloadPath attrDataMethod>,
    deviceId: <String - Required: template for the device ID, or a payload path to it when deviceIdTemplateType is jsonPath. Must be a valid ObjectId>,
    deviceIdTemplateType: <String - Optional: One of stringTemplate|jsonPath. Default stringTemplate>,
    metaTemplate: <String - Optional: template for the meta attribute, or a payload path to it when metaTemplateType is jsonPath>,
    metaTemplateType: <String - Optional: One of stringTemplate|jsonTemplate|jsonPath. Default stringTemplate. jsonTemplate parses the rendered string as JSON>,
    timeSourceType: <String - Optional: One of payloadTime|now|payloadPath. Default payloadTime, which uses the time on the payload, falling back to the time on the original payload>,
    timeSourcePath: <String - Optional: payload path to time value (if timeSourceType is payloadPath)>,
    flowVersionTemplate: <String - Optional: template for flowVersion field on state payload. Uses 'default' if it renders blank>,
    resultPath: <String - Optional: payload path to store { success: true } or { error: { type, message } }>
  }

  Notes: Errors with a statusCode are written to resultPath when it is set. Otherwise NotFound errors are swallowed and the node continues, which preserves existing behavior, and all other errors are thrown.
  */

  constructor(id, outputIds, config) {
    this.id = id;
    this.outputIds = outputIds;
    this.attrDataMethod = config.attrDataMethod || 'individualFields';
    this.attrInfos = config.attrInfos || [];
    this.attrJsonTemplate = config.attrJsonTemplate;
    this.attrPayloadPath = config.attrPayloadPath;
    this.deviceId = config.deviceId;
    this.deviceIdTemplateType = config.deviceIdTemplateType;
    this.metaTemplate = config.metaTemplate;
    this.metaTemplateType = config.metaTemplateType;
    this.timeSourceType = config.timeSourceType;
    this.timeSourcePath = config.timeSourcePath;
    this.flowVersionTemplate = config.flowVersionTemplate;
    this.resultPath = config.resultPath;
  }

  checkInfiniteLoop() { /* no-op by default */ }

  async run(context, payload) {
    try {
      let deviceId = this.deviceId;
      if (this.deviceIdTemplateType === 'jsonPath') {
        deviceId = payloadHelper.lookup(deviceId, payload);
      } else {
        deviceId = payloadHelper.renderToString(deviceId, payload);
      }
      deviceId = trim(deviceId);
      if (!isValidObjectId(deviceId)) {
        throw errors.Validation({ message: `Invalid device ID: ${deviceId}.` });
      }

      this.checkInfiniteLoop(context, deviceId);

      let stateTime = payload?.time || context.originalPayload.time;
      if (this.timeSourceType === 'now') {
        stateTime = new Date();
      } else if (this.timeSourceType === 'payloadPath') {
        stateTime = payloadHelper.lookup(this.timeSourcePath, payload);
        stateTime = enforceTime(stateTime);
      }

      let data;
      if (this.attrDataMethod === 'payloadPath') {
        data = payloadHelper.lookup(this.attrPayloadPath, payload);
      } else if (this.attrDataMethod === 'jsonTemplate') {
        data = payloadHelper.render(this.attrJsonTemplate, payload);
      } else {
        data = {};
        this.attrInfos.forEach((attrInfo) => {
          if (!attrInfo.valueTemplate || !attrInfo.key) { return; }

          const value = payloadHelper.render(attrInfo.valueTemplate, payload);
          if (isNil(value)) { return; }

          const key = payloadHelper.renderToString(attrInfo.key, payload).trim();
          if (!key) { return; }

          data[key] = value;
        });
      }

      if (typeof(data) === 'string') {
        try {
          data = LJSON.parse(data);
        } catch { }
        // we explicitly let it go through,
        // they can see the error in the application log
      }

      let meta;
      if (this.metaTemplate) {
        if (this.metaTemplateType === 'jsonPath') {
          meta = payloadHelper.lookup(this.metaTemplate, payload);
        } else {
          meta = payloadHelper.renderToString(this.metaTemplate, payload);
          if (this.metaTemplateType === 'jsonTemplate') {
            meta = LJSON.parse(meta);
          }
        }
      }

      let flowVersion;
      if (this.flowVersionTemplate) {
        flowVersion = payloadHelper.renderToString(this.flowVersionTemplate, payload) || 'default';
      }

      // support the following forms:
      // [{ time, flowVersion, meta, data: { att1, attr2, ... } }, ...]
      // [{ attr1, attr2, ... }, ...]
      // { time, flowVersion, meta, data: { att1, attr2, ... } }
      // { attr1, attr2, ... }

      let finalState;
      const baseState = { time: Number(stateTime) };
      if (meta) { baseState.meta = meta; }
      if (flowVersion) { baseState.flowVersion = flowVersion; }
      if (Array.isArray(data)) {
        finalState = data.map((entry) => {
          if (entry && entry.data && typeof(entry.data) === 'object') {
            return { ...baseState, ...entry };
          } else {
            return { data: entry, ...baseState };
          }
        });
      } else {
        if (data && data.data && typeof(data.data) === 'object') {
          finalState = { ...baseState, ...data };
        } else {
          finalState = { data, ...baseState };
        }
      }

      await this.sendState(context, deviceId, finalState);
      payload = payloadHelper.set(this.resultPath, { success: true }, payload);
    } catch (err) {
      if (this.resultPath && err.statusCode) {
        const errObj = { error: { type: err.type, message: err.message } };
        payload = payloadHelper.set(this.resultPath, errObj, payload);
      } else if (err.type !== 'NotFound') { // keeping with existing behavior
        throw err;
      }
    }

    return [this.outputIds, payload];
  }

}

export default BaseDeviceChangeStateNode;
