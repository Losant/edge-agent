import { isNil, isPlainObject } from 'omnibelt';
import * as payloadHelper from 'losant-handlebars';
import errors from 'losant-nodejs-utils/src/errors.js';
import resolveValueByLookupType from 'losant-nodes/src/lib/resolve-value-by-lookup-type.js';
import { AGENT_VERSION } from '../constants.js';
import { nowNano, timeToNano, resolveAttributes, resolveSeverityNumber, makeLogRecord } from '../lib/otel-utils.js';
import { DEFAULT_SCOPE_NAME, LOGS_PATH } from '../lib/otel-constants.js';
import OtelWriteNodeBase from '../lib/otel-write-node-base.js';

class OtelLogsWriteNode extends OtelWriteNodeBase {

  /* Example Config:
  Writes log records to an OpenTelemetry collector over OTLP/HTTP.
  https://opentelemetry.io/docs/specs/otlp/#otlphttp
  {
    connectionSource: <String - Optional: inline|agentConfig. Default inline. agentConfig uses the Edge Agent's [otlpCollector] config for url/auth/TLS instead of the fields below; resourceAttributes* below still apply and are merged on top of the agent's resourceAttributes, with this node's value winning on a key conflict>,
    collectorUrlTemplate: <String - Required unless connectionSource is agentConfig: base URL of the collector, e.g. http://collector:4318, optionally with a path prefix for a collector behind a gateway, e.g. https://gateway.internal/otlp. Trailing slashes are ignored. A query, a fragment, credentials, or a URL already ending in /v1/metrics, /v1/logs, or /v1/traces are rejected>,
    resourceAttributesWriteMethod: <String - Optional: individualFields|jsonTemplate|payloadPath. Default individualFields>,
    resourceAttributesFields: <[Object] - Optional: used when resourceAttributesWriteMethod is individualFields. Each entry is { keyTemplate: <String - Required>, valueTemplate: <String - Required> }. Values render typed, so a value template that is a bare mustache resolving to a number or boolean exports as intValue/doubleValue/boolValue rather than stringValue>,
    resourceAttributesJsonTemplate: <String - Optional: used when resourceAttributesWriteMethod is jsonTemplate. Template that renders to a flat object of resource attributes>,
    resourceAttributesPayloadPath: <String - Optional: used when resourceAttributesWriteMethod is payloadPath. Path to a flat object in the payload>,
    scopeNameTemplate: <String - Optional: instrumentation scope name. Default gea-otel-write>,
    scopeVersionTemplate: <String - Optional: instrumentation scope version. Default is the Edge Agent version>,
    authType: <String - Optional: none|bearer|basic|clientCert. Default none>,
    bearerTokenTemplate: <String - Required if authType is bearer>,
    usernameTemplate: <String - Required if authType is basic>,
    passwordTemplate: <String - Optional: used if authType is basic>,
    clientCertTemplateType: <String - Optional: diskPath|stringTemplate. Default diskPath>,
    clientCertTemplate: <String - Required if authType is clientCert: certificate path or PEM, per clientCertTemplateType>,
    clientKeyTemplateType: <String - Optional: diskPath|stringTemplate. Default diskPath>,
    clientKeyTemplate: <String - Required if authType is clientCert: key path or PEM, per clientKeyTemplateType>,
    caCertTemplateType: <String - Optional: diskPath|stringTemplate. Default diskPath>,
    caCertTemplate: <String - Optional: CA certificate path or PEM, per caCertTemplateType. Ignored when disableSSLVerification is true>,
    disableSSLVerification: <Boolean - Optional: skips server certificate verification. Default false>,
    logsWriteMethod: <String - Optional: individualFields|jsonTemplate|payloadPath. Default individualFields>,
    logRecords: <[Object] - Optional: used when logsWriteMethod is individualFields. Each entry is one log record:
      {
        bodyTemplate: <String - Required: log message body. Must render to a non-blank value>,
        severityTemplate: <String - Required: a number 1-24, or one of TRACE, DEBUG, INFO, WARN/WARNING, ERROR, FATAL (case-insensitive)>,
        eventNameTemplate: <String - Optional: event name>,
        observedTimestampTemplate: <String - Optional: epoch ms, epoch seconds, or any parsable date. Default is the time the node ran>,
        timestampTemplate: <String - Optional: same formats as observedTimestampTemplate. Omitted from the record if blank>,
        attributesWriteMethod: <String - Optional: individualFields|jsonTemplate|payloadPath. Default individualFields>,
        attributesFields: <[Object] - Optional: used when attributesWriteMethod is individualFields. Each entry is { keyTemplate, valueTemplate }. Values render typed, as for resourceAttributesFields>,
        attributesJsonTemplate: <String - Optional: used when attributesWriteMethod is jsonTemplate. Template that renders to a flat object of log record attributes>,
        attributesPayloadPath: <String - Optional: used when attributesWriteMethod is payloadPath. Path to a flat object in the payload>
      }>,
    logsJsonTemplate: <String - Required if logsWriteMethod is jsonTemplate: template that renders to one OTLP log record object or an array of them>,
    logsPayloadPath: <String - Required if logsWriteMethod is payloadPath: path to one OTLP log record object or an array of them>,
    resultPath: <String - Optional: payload path for { success: true, logCount } or { success: false, error: { type, message } }. If omitted, nothing is written to the payload>
  }
  Notes:
    With jsonTemplate and payloadPath, the log record objects are embedded verbatim in the request as OTLP log records.
    If there are zero log records, nothing is sent and the result is { success: true, logCount: 0 }.
    A collector that took the request but dropped part of it adds rejectedLogRecords and rejectedMessage to the success result.
    Configuration errors (an unrenderable template, a required field that resolves to nothing, a malformed collector URL, an unreadable certificate) throw.
    Only a failed send is written to resultPath as success false, with an error type of OTEL_COLLECTOR_RESPONSE_ERROR (non-2xx response),
    OTEL_COLLECTOR_REQUEST_ERROR (collector unreachable), or NodeTimeout.
    See OtelWriteNodeBase in ../lib/otel-write-node-base.js for the shared connection/send/error-handling contract this node implements.
  */

  constructor(id, outputIds, config) {
    super(id, outputIds, config);

    this.logsWriteMethod = config.logsWriteMethod || 'individualFields';
    this.logRecords = config.logRecords || [];
    this.logsJsonTemplate = config.logsJsonTemplate;
    this.logsPayloadPath = config.logsPayloadPath;

    // Title used in the timeout error message.
    this.nodeTitle = 'OpenTelemetry: Logs Write';
    this.otlpPath = LOGS_PATH;
    this.resultCountField = 'logCount';
    this.rejectedField = 'rejectedLogRecords';
  }

  // Returns the logRecords[] to embed in the request, one per configured row.
  buildItems(payload) {
    if (this.logsWriteMethod !== 'individualFields') {
      // These modes hand us already-OTLP-shaped log record objects, so they are
      // embedded as logRecords[] verbatim rather than run through makeLogRecord.
      const title = this.logsWriteMethod === 'jsonTemplate' ? 'Logs JSON' : 'Logs Payload Path';
      const resolved = resolveValueByLookupType({
        lookupType: this.logsWriteMethod,
        inputValue: this.logsWriteMethod === 'jsonTemplate' ? this.logsJsonTemplate : this.logsPayloadPath,
        payload,
        title,
        blankJsonToUndefined: true
      });

      if (isNil(resolved)) {
        throw errors.MissingField({ title });
      }
      const logRecords = Array.isArray(resolved) ? resolved : [resolved];
      logRecords.forEach((logRecord) => {
        if (!isPlainObject(logRecord)) {
          throw errors.Validation({ message: `${title} must resolve to an OTLP log record object, or an array of them.` });
        }
      });
      return logRecords;
    }

    // One clock read for the run, so every row without its own observed
    // timestamp shares the export's time rather than drifting by however long
    // the build took.
    const runTimeUnixNano = nowNano();
    const logRecords = [];
    this.logRecords.forEach((logRecord) => {
      // Every configured row has to produce a body. Blank-checked on the
      // trimmed render, as name/value are on the metrics node, so a
      // whitespace-only template counts as missing - but the untrimmed value
      // is what gets sent, since meaningful leading/trailing whitespace in a
      // log body (unlike a metric name) is plausible content, not padding.
      const body = payloadHelper.renderToString(logRecord.bodyTemplate, payload);
      if (!body.trim()) { throw errors.MissingField({ title: 'Body' }); }

      const renderedSeverity = payloadHelper.renderToString(logRecord.severityTemplate, payload).trim();
      const { severityNumber, severityText } = resolveSeverityNumber(renderedSeverity);

      const eventName = payloadHelper.renderToString(logRecord.eventNameTemplate, payload).trim();

      // Trimmed so an invisible trailing space in the editor does not throw
      // and take the whole export down with it.
      const renderedTimestamp = payloadHelper.renderToString(logRecord.timestampTemplate, payload).trim();
      const timeUnixNano = renderedTimestamp ? timeToNano(renderedTimestamp) : undefined;

      const renderedObserved = payloadHelper.renderToString(logRecord.observedTimestampTemplate, payload).trim();
      const observedTimeUnixNano = renderedObserved ? timeToNano(renderedObserved) : runTimeUnixNano;

      const attrObj = resolveAttributes({
        writeMethod: logRecord.attributesWriteMethod || 'individualFields',
        fields: logRecord.attributesFields,
        jsonTemplate: logRecord.attributesJsonTemplate,
        payloadPath: logRecord.attributesPayloadPath,
        payload,
        title: 'Attributes'
      });

      logRecords.push(makeLogRecord({
        body,
        severityNumber,
        severityText,
        eventName,
        timeUnixNano,
        observedTimeUnixNano,
        attrObj
      }));
    });
    return logRecords;
  }

  // Returns the JSON-stringified OTLP body. Headers and the https.Agent are
  // built by sendOtlpRequest from the connection object - deliberately not here,
  // so the client key and cert stay off anything a later change might log or
  // attach to a result.
  buildRequestBody(payload, connection, logRecords) {
    const scopeName = payloadHelper.renderToString(this.scopeNameTemplate, payload) || DEFAULT_SCOPE_NAME;
    const scopeVersion = payloadHelper.renderToString(this.scopeVersionTemplate, payload) || AGENT_VERSION.version;

    return JSON.stringify({
      resourceLogs: [{
        resource: { attributes: connection.resourceAttrs },
        scopeLogs: [{ scope: { name: scopeName, version: scopeVersion }, logRecords }]
      }]
    });
  }

}

export default OtelLogsWriteNode;
