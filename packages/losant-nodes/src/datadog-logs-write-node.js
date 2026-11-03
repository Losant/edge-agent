import { client, v2 } from '@datadog/datadog-api-client';
import * as payloadHelper from 'losant-handlebars';
import errors from 'losant-nodejs-utils/src/errors.js';
import { keys, defer, isPlainObject, pick } from 'omnibelt';
import verifyHosts from 'losant-nodejs-utils/src/utils/verify-hosts.js';
import resolveValueByLookupType from './lib/resolve-value-by-lookup-type.js';
import ljsonRender from './lib/ljson-render.js';

const pluckDDFields = pick([
  'ddsource',
  'ddtags',
  'hostname',
  'message',
  'service',
  'additionalProperties'
]);

const convertTagsToStr = (tags) => {
  if (!tags || typeof tags === 'string') { return tags || ''; }
  const strTags = [];
  keys(tags).forEach((key) => {
    const value = tags[key];
    if (Array.isArray(value)) {
      value.forEach((v) => {
        strTags.push(`${key}:${v}`);
      });
    } else {
      strTags.push(`${key}:${value}`);
    }
  });
  return strTags.join(',');
};

const validateLog = (log) => {
  if (!isPlainObject(log)) {
    throw errors.Validation({ message: 'Log must be an object' });
  }
  const ddLog = { ...log };
  if (!ddLog.message) {
    throw errors.MissingField({ title: 'Message' });
  }
  if (ddLog.attributes) {
    ddLog.additionalProperties = ddLog.attributes;
    delete ddLog.attributes;
  }
  if (ddLog.additionalProperties && !isPlainObject(ddLog.additionalProperties)) {
    throw errors.Validation({ message: 'Attributes field must be an object.' });
  }
  if (ddLog.source) {
    ddLog.ddsource = ddLog.source;
    delete ddLog.source;
  }
  if (ddLog.tags) {
    ddLog.ddtags = convertTagsToStr(ddLog.tags);
    delete ddLog.tags;
  }
  [ 'message', 'ddsource', 'hostname', 'source' ].forEach((fieldName) => {
    if (ddLog[fieldName]) {
      ddLog[fieldName] = `${ddLog[fieldName]}`;
    }
  });
  return ddLog;
};

class DatadogLogsWriteNode {

  /* Example Config:
  Logs are sent with the Datadog Send Logs API: https://docs.datadoghq.com/api/latest/logs/?site=us5#send-logs
  Log item type: https://github.com/DataDog/datadog-api-client-typescript/blob/v1.51.0/packages/datadog-api-client-v2/models/HTTPLogItem.ts#L12
  {
    apiKeyTemplate: <String - Required unless credentialNameTemplate is set: Datadog API key (https://docs.datadoghq.com/account_management/api-app-keys/)>,
    siteTemplate: <String - Optional: Datadog site host. Default datadoghq.com. Ignored when credentialNameTemplate is set.
      Datadog also allows private installs (https://docs.datadoghq.com/getting_started/site/)
      but the main sites are datadoghq.com, us3.datadoghq.com, us5.datadoghq.com, datadoghq.eu, ap1.datadoghq.com, ap2.datadoghq.com, ddog-gov.com>,
    credentialNameTemplate: <String - Optional: name of a Datadog credential that supplies the API key and site. When set, apiKeyTemplate and siteTemplate are ignored>,
    writeMethod: <String - Optional: how the logs are provided, one of individualFields, jsonTemplate, or payloadPath. Default individualFields>,
    writeFields: <Array - Optional: used when writeMethod is individualFields. An array of objects, one per log> [
      {
        messageTemplate: <String - Required: the log message>,
        sourceTemplate: <String - Optional: the technology from which the log originated (sent as ddsource)>,
        hostnameTemplate: <String - Optional: the name of the originating host of the log>,
        serviceTemplate: <String - Optional: the name of the application or service generating the log events>,
        tagsTemplate: <String - Optional: tags to send with the log. A comma separated string, or a template that renders to an array or object of tags>,
        attributesTemplate: <String - Optional: JSON template for an object of extra fields or attributes to include with the log.
          The date and status attributes are special. date sets the time of the log and can be up to 18 days in the past.
          status sets the log level, for example info, error, or warning>
      }
    ],
    writeJsonTemplate: <String - Required when writeMethod is jsonTemplate: JSON template that renders to a log object or an array of log objects>,
    writePayloadPath: <String - Required when writeMethod is payloadPath: payload path to a log object or an array of log objects>,
    resultPath: <String - Optional: payload path for { success: true } or { success: false, error: { message: '<title> (<status>) <detail>' } }>
  }
  Notes:
    Each log must be an object with a message. For jsonTemplate and payloadPath, the keys message, ddsource (or source), ddtags (or tags), hostname, service, and additionalProperties (or attributes) are sent. Other keys are dropped.
    Failures of the Datadog request do not throw. They are only reported when resultPath is set, otherwise they are silently ignored.
    A missing API key or site, an invalid log, an invalid template, or a host that fails verification throws.
  */

  constructor(id, outputIds, config) {
    this.id = id;
    this.outputIds = outputIds;
    this.apiKeyTemplate = config.apiKeyTemplate;
    this.siteTemplate = config.siteTemplate || 'datadoghq.com';
    this.credentialNameTemplate = config.credentialNameTemplate;

    this.writeMethod = config.writeMethod || 'individualFields';
    this.writeFields = config.writeFields || [];
    this.writeJsonTemplate = config.writeJsonTemplate;
    this.writePayloadPath = config.writePayloadPath;
    this.resultPath = config.resultPath;
  }

  async getAuth(context, payload) {
    let apiKey, site;
    if (this.credentialNameTemplate) {
      ({ apiKey, site } = await context.loadCredential({
        credentialNameTemplate: this.credentialNameTemplate,
        type: 'datadog',
        applicationId: context.applicationId,
        payload
      }));
    } else {
      apiKey = payloadHelper.renderToString(this.apiKeyTemplate, payload);
      if (!apiKey) {
        throw errors.MissingField({ title: 'API Key Template' });
      }
      site = payloadHelper.renderToString(this.siteTemplate, payload);
      if (!site) {
        throw errors.MissingField({ title: 'Site Template' });
      }
      await verifyHosts(site);
    }
    return { apiKey, site };
  }

  async run(context, payload) {
    const { apiKey: apiKeyAuth, site } = await this.getAuth(context, payload);

    let body = [];

    if (this.writeMethod === 'individualFields') {
      this.writeFields.forEach(({
        messageTemplate, sourceTemplate, hostnameTemplate, serviceTemplate, tagsTemplate, attributesTemplate
      }) => {
        const log = {
          message: payloadHelper.renderToString(messageTemplate, payload)
        };
        if (sourceTemplate) {
          log.ddsource = payloadHelper.renderToString(sourceTemplate, payload);
        }
        if (hostnameTemplate) {
          log.hostname = payloadHelper.renderToString(hostnameTemplate, payload);
        }
        if (serviceTemplate) {
          log.service = payloadHelper.renderToString(serviceTemplate, payload);
        }
        if (tagsTemplate) {
          log.tags = payloadHelper.render(tagsTemplate, payload);
        }
        if (attributesTemplate) {
          log.additionalProperties = ljsonRender(attributesTemplate, payload, 'Attributes Template', true) || {};
        }
        body.push(validateLog(log));
      });
    } else {
      body = resolveValueByLookupType({
        inputValue: this.writeMethod === 'jsonTemplate' ? this.writeJsonTemplate : this.writePayloadPath,
        lookupType: this.writeMethod,
        payload,
        title: this.writeMethod === 'jsonTemplate' ? 'JSON' : 'Payload Path',
        blankJsonToUndefined: true
      });
      if (!body) {
        throw errors.Validation({ message: 'A log with a message is required.' });
      }
      if (!Array.isArray(body)) {
        body = [ body ];
      }
      body = body.map((param) => {
        return pluckDDFields(validateLog(param));
      });
    }
    let timeout;
    try {
      const waitForRequest = defer();
      const ac = new AbortController();
      ac.signal.addEventListener('abort', () => {
        waitForRequest.reject(errors.NodeTimeout({ title: 'Datadog Log: Write' }));
      }, { once: true });
      const configuration = client.createConfiguration({
        authMethods: { apiKeyAuth },
        httpConfig: {
          signal: ac.signal
        }
      });
      configuration.setServerVariables({ site: site });
      const logger = new v2.LogsApi(configuration);
      timeout = setTimeout(() => {
        return ac.abort();
      }, context.externalTimeout);
      logger.submitLog({ body }).then(waitForRequest.resolve).catch(waitForRequest.reject);
      await waitForRequest.promise;
      clearTimeout(timeout);
      if (this.resultPath) {
        payload = payloadHelper.set(this.resultPath, { success: true }, payload);
      }
    } catch (e) {
      if (timeout) {
        clearTimeout(timeout);
      }
      if (this.resultPath) {
        let msg = '';
        if (e.body?.errors?.[0]) {
          if (e.body.errors[0].title) {
            msg += `${e.body.errors[0].title}`;
          }
          if (e.body.errors[0].status) {
            msg += ` (${e.body.errors[0].status})`;
          }
          if (e.body.errors[0].detail) {
            msg += ` ${e.body.errors[0].detail}`;
          }
        } else {
          msg = e.message;
        }
        payload = payloadHelper.set(
          this.resultPath,
          { success: false, error: { message: msg || 'Unknown Reason' } },
          payload
        );
      }
    }

    return [this.outputIds, payload];
  }
}

export default DatadogLogsWriteNode;
