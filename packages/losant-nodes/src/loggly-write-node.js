import writeLoggly from './lib/write-loggly.js';
import * as payloadHelper from 'losant-handlebars';
import errors from 'losant-nodejs-utils/src/errors.js';
import resolveValueByLookupType from './lib/resolve-value-by-lookup-type.js';
import { THIRTY_S_MS } from 'losant-nodejs-utils/src/constants/time.js';
import { mapSerialP } from 'omnibelt';
import { isTimeoutError } from './lib/common.js';

const TIMEOUT_RESULT = { success: false, error: 'Request timed out.' };

const handleLogs = (loadedLogs = [], payload) => {
  return loadedLogs.map((field) => {
    const resultField = {};

    if (field.messageTemplate) {
      resultField.message = payloadHelper.renderToString(field.messageTemplate, payload);
    }
    if (field.jsonTemplate) {
      const value = resolveValueByLookupType({
        inputValue: field.jsonTemplate,
        lookupType: 'json',
        payload,
        title: 'JSON',
        blankJsonToUndefined: true
      });
      if (value) { resultField.json = value; }
    }

    if (field.tagsTemplate) {
      let tags = [];
      (field.tagsTemplate.split(',') || []).forEach((tag) => {
        let renderedTag = payloadHelper.render(tag, payload);
        if (!Array.isArray(renderedTag)) { renderedTag = String(renderedTag).split(','); }
        tags = [ ...tags, ...renderedTag ];
      });
      resultField.tags = tags;
    }
    return resultField;
  });
};

class LogglyWriteNode {

  /* Example Config:
  {
    apiTokenTemplate: <String - Required unless credentialNameTemplate is set: template for the Loggly client token>,
    credentialNameTemplate: <String - Optional: template for the name of a Loggly credential supplying the token. When set, apiTokenTemplate is ignored>,
    writeMethod: <String - Optional: how the log entries are supplied (individualFields|jsonTemplate|payloadPath). Default individualFields>,
    writeFields: [ used when writeMethod = individualFields. Default []
      {
        messageTemplate: <String - Optional: template for the log message>,
        jsonTemplate: <String - Optional: template for a JSON object to log>,
        tagsTemplate: <String - Optional: comma-separated list of tag templates>
      }
      (an entry with neither a message nor json is skipped and reported as { success: true })
    ],
    writeJsonTemplate: <String - Required if writeMethod = jsonTemplate: template that renders to a JSON log entry or array of entries>,
    writePayloadPath: <String - Required if writeMethod = payloadPath: payload path of a log entry or array of entries>,
    resultPath: <String - Optional: payload path for { success, results } or { error, success: false }>
  }
  Notes:
    When writeMethod is jsonTemplate or payloadPath, each entry is an object with the keys message, json, and tags (unsuffixed, not messageTemplate/jsonTemplate/tagsTemplate).
    Entries are written one at a time. results contains one item per entry: { success: true, ...response }, or { success: false, error } on failure or timeout.
    success is false if any entry failed.
    A missing token, a missing credential, or a credential loading error throws.
    Errors resolving the log entries (such as no log data found) do not throw. They are written to resultPath as { error, success: false } if it is set.
  */

  constructor(id, outputIds, config) {
    this.id = id;
    this.outputIds = outputIds;
    this.apiTokenTemplate = config.apiTokenTemplate;
    this.credentialNameTemplate = config.credentialNameTemplate;
    this.writeMethod = config.writeMethod || 'individualFields';
    this.writeFields = config.writeFields || [];
    this.writeJsonTemplate = config.writeJsonTemplate;
    this.writePayloadPath = config.writePayloadPath;
    this.resultPath = config.resultPath;
  }

  async run(context, payload) {
    let loadedLogs;

    let token;
    if (this.credentialNameTemplate) {
      token = await context.loadCredential({
        credentialNameTemplate: this.credentialNameTemplate,
        type: 'loggly',
        applicationId: context.applicationId,
        payload,
        secretOnly: true
      });
    } else {
      token = payloadHelper.renderToString(this.apiTokenTemplate, payload);
      if (!token) { throw errors.MissingField({ title: 'Token' }); }
    }

    try {
      if (this.writeMethod === 'individualFields') {
        loadedLogs = handleLogs(this.writeFields, payload);
      } else {
        const jsonTemplate = this.writeMethod === 'jsonTemplate';

        const data = resolveValueByLookupType({
          inputValue: jsonTemplate ? this.writeJsonTemplate : this.writePayloadPath,
          lookupType: jsonTemplate ? 'jsonTemplate' : 'payloadPath',
          payload,
          title: jsonTemplate ? 'JSON' : 'Payload Path',
          blankJsonToUndefined: true
        });
        if (!data) { throw errors.Validation({ message: 'Log data not found' }); }
        loadedLogs = Array.isArray(data) ? data : [data];
      }
    } catch (e) {
      if (this.resultPath) { payload = payloadHelper.set(this.resultPath, { error: e.message, success: false }, payload); }
      return [this.outputIds, payload];
    }

    let noErrors = true;
    let hasTimedOut = false;
    let timeout = context.externalTimeout || THIRTY_S_MS;
    const results = await mapSerialP(async (log) => {
      let res;
      const startTime = Date.now();
      if (hasTimedOut || !timeout) {
        return TIMEOUT_RESULT;
      }
      if (!log.json && !log.message) { return { success: true }; }
      try {
        const response = await writeLoggly({ token, msg: log.message, json: log.json, tags: log.tags, timeout });
        res = { success: true, ...response.data };
      } catch (err) {
        if (noErrors) { noErrors = false; }
        if (isTimeoutError(err)) {
          hasTimedOut = true;
          res = TIMEOUT_RESULT;
        } else {
          res = { success: false, error: err.response?.data || err.message };
        }
      }
      // the amount of timeout left
      timeout = timeout - (Date.now() - startTime);
      if (timeout < 0) { timeout = 0; }
      return res;
    }, loadedLogs);

    if (this.resultPath) {
      payload = payloadHelper.set(this.resultPath, { success: noErrors, results }, payload);
    }
    return [this.outputIds, payload];
  }
}

export default LogglyWriteNode;
