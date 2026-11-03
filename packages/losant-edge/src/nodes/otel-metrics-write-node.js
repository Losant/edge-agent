import { isNil, isPlainObject } from 'omnibelt';
import * as payloadHelper from 'losant-handlebars';
import errors from 'losant-nodejs-utils/src/errors.js';
import resolveValueByLookupType from 'losant-nodes/src/lib/resolve-value-by-lookup-type.js';
import { AGENT_VERSION } from '../constants.js';
import { nowNano, timeToNano, resolveAttributes, makeGauge, makeSum } from '../lib/otel-utils.js';
import { DEFAULT_SCOPE_NAME, METRICS_PATH } from '../lib/otel-constants.js';
import OtelWriteNodeBase from '../lib/otel-write-node-base.js';

class OtelMetricsWriteNode extends OtelWriteNodeBase {

  /* Example Config:
  Writes metrics to an OpenTelemetry collector over OTLP/HTTP.
  https://opentelemetry.io/docs/specs/otlp/#otlphttp
  {
    connectionSource: <String - Optional: inline (default)|agentConfig. agentConfig uses
      the Edge Agent's [otlpCollector] config for url/auth/TLS instead of the fields
      below; resourceAttributes* below still apply and are merged on top of the agent's
      resourceAttributes, with this node's value winning on a key conflict>,
    collectorUrlTemplate: <String - Required unless connectionSource = agentConfig: base
      URL of the collector, e.g. http://collector:4318, optionally with a path prefix for
      a collector behind a gateway, e.g. https://gateway.example.com/otlp. Trailing slashes
      are ignored. A query, a fragment, credentials, or a URL already ending in
      /v1/metrics, /v1/logs, or /v1/traces are rejected>,
    resourceAttributesWriteMethod: <String - Optional: individualFields|jsonTemplate|payloadPath. Default individualFields>,
    resourceAttributesFields: [ { keyTemplate, valueTemplate } ] - if resourceAttributesWriteMethod = individualFields,
      values render typed, so a value template that is a bare mustache resolving to a number or
      boolean exports as intValue/doubleValue/boolValue rather than stringValue,
    resourceAttributesJsonTemplate: <String - Optional: flat object of resource attributes>,
    resourceAttributesPayloadPath: <String - Optional: path to a flat object in the payload>,
    scopeNameTemplate: <String - Optional: default gea-otel-write>,
    scopeVersionTemplate: <String - Optional: default the Edge Agent version>,
    authType: <String - Optional: none|bearer|basic|clientCert. Default none>,
    bearerTokenTemplate: <String - Required if authType = bearer>,
    usernameTemplate: <String - Required if authType = basic>,
    passwordTemplate: <String - Optional if authType = basic>,
    clientCertTemplateType: <String - Optional: diskPath|stringTemplate. Default diskPath>,
    clientCertTemplate: <String - Required if authType = clientCert>,
    clientKeyTemplateType: <String - Optional: diskPath|stringTemplate. Default diskPath>,
    clientKeyTemplate: <String - Required if authType = clientCert>,
    caCertTemplateType: <String - Optional: diskPath|stringTemplate. Default diskPath>,
    caCertTemplate: <String - Optional: ignored when disableSSLVerification is true>,
    disableSSLVerification: <Boolean - Optional: default false, skips server cert verification>,
    metricsWriteMethod: <String - Optional: individualFields (default)|jsonTemplate|payloadPath>,
    customMetrics: [ if metricsWriteMethod = individualFields
      nameTemplate: <String - Required: metric name>
      descriptionTemplate: <String - Optional>
      unitTemplate: <String - Optional: UCUM unit e.g. Cel, By - default 1>
      metricType: <String - Optional: gauge (default) | sum>
      valueTemplate: <String - Required: must resolve to a number>
      timestampTemplate: <String - Optional: epoch ms, epoch seconds, or any parsable
        date, defaults to the time the node ran>
      startTimestampTemplate: <String - Optional: sum only, same formats, omitted if blank>
      aggregationTemporality: <String - Optional: sum only, cumulative (default) | delta>
      isMonotonic: <Boolean - Optional: sum only, default true>
      attributesWriteMethod: <String - Optional: individualFields|jsonTemplate|payloadPath. Default individualFields>
      attributesFields: [ { keyTemplate, valueTemplate } ] - values render typed, as above
      attributesJsonTemplate: <String - Optional: flat object of data point attributes>
      attributesPayloadPath: <String - Optional: path to a flat object in the payload>
    ],
    metricsJsonTemplate: <String - Optional: array of OTLP metric objects if metricsWriteMethod = jsonTemplate>,
    metricsPayloadPath: <String - Optional: path to an array of OTLP metric objects>,
    resultPath: <String - Optional: payload path for { success: true, metricCount } or
      { success: false, error: { type, message } }. If blank, the result is discarded>
      A collector that took the request but dropped part of it adds rejectedDataPoints
      and rejectedMessage to the success result.
  }
  Notes:
    Bad configuration (an unrenderable template, a missing required field, a malformed
    collector URL, an unreadable certificate) throws. Only a failed send is written to
    resultPath, with error.type OTEL_COLLECTOR_RESPONSE_ERROR (non-2xx response),
    OTEL_COLLECTOR_REQUEST_ERROR (collector unreachable), or the node timeout error type.
    If no metrics are configured, nothing is sent and the result is
    { success: true, metricCount: 0 }.
    Has a single output (outputIds).

    See OtelWriteNodeBase in ../lib/otel-write-node-base.js for the shared
    connection/send/error-handling contract this node implements.
  */

  constructor(id, outputIds, config) {
    super(id, outputIds, config);

    this.metricsWriteMethod = config.metricsWriteMethod || 'individualFields';
    this.customMetrics = config.customMetrics || [];
    this.metricsJsonTemplate = config.metricsJsonTemplate;
    this.metricsPayloadPath = config.metricsPayloadPath;

    // Title used in the timeout error message.
    this.nodeTitle = 'OpenTelemetry: Metrics Write';
    this.otlpPath = METRICS_PATH;
    this.resultCountField = 'metricCount';
    this.rejectedField = 'rejectedDataPoints';
  }

  // Returns the metrics[] to embed in the request, one per configured row. Rows
  // that share a name are left as separate Metric entries: OTLP allows repeating
  // a name across entries, and collapsing them would be this node deciding how
  // the user's metrics should be modeled.
  buildItems(payload) {
    if (this.metricsWriteMethod !== 'individualFields') {
      // These modes hand us already-OTLP-shaped metric objects, so they are
      // embedded as metrics[] verbatim rather than run through makeGauge/makeSum.
      const title = this.metricsWriteMethod === 'jsonTemplate' ? 'Metrics JSON' : 'Metrics Payload Path';
      const resolved = resolveValueByLookupType({
        lookupType: this.metricsWriteMethod,
        inputValue: this.metricsWriteMethod === 'jsonTemplate' ? this.metricsJsonTemplate : this.metricsPayloadPath,
        payload,
        title,
        blankJsonToUndefined: true
      });

      if (isNil(resolved)) {
        throw errors.MissingField({ title });
      }
      const metrics = Array.isArray(resolved) ? resolved : [resolved];
      metrics.forEach((metric) => {
        if (!isPlainObject(metric)) {
          throw errors.Validation({ message: `${title} must resolve to an OTLP metric object, or an array of them.` });
        }
      });
      return metrics;
    }

    // One clock read for the run, so every row without its own timestamp shares
    // the export's time rather than drifting by however long the build took.
    const runTimeUnixNano = nowNano();
    const metrics = [];
    this.customMetrics.forEach((metric) => {
      // Every configured row has to produce a data point.
      const name = payloadHelper.renderToString(metric.nameTemplate, payload).trim();
      if (!name) { throw errors.MissingField({ title: 'Metric Name' }); }

      const renderedValue = payloadHelper.renderToString(metric.valueTemplate, payload).trim();
      if (!renderedValue) { throw errors.MissingField({ title: 'Metric Value' }); }
      const value = Number(renderedValue);
      if (!Number.isFinite(value)) {
        throw errors.Validation({ message: `Invalid value for metric ${name}: ${renderedValue}. Expected a number.` });
      }

      const description = payloadHelper.renderToString(metric.descriptionTemplate, payload);
      const unit = payloadHelper.renderToString(metric.unitTemplate, payload);
      // Trimmed like the name and value above. enforceTime accepts no padding on
      // any format - not even an ISO string - so an invisible trailing space in
      // the editor would otherwise throw and take the whole export down with it.
      const renderedTimestamp = payloadHelper.renderToString(metric.timestampTemplate, payload).trim();
      const timeUnixNano = renderedTimestamp ? timeToNano(renderedTimestamp) : runTimeUnixNano;

      const attrObj = resolveAttributes({
        writeMethod: metric.attributesWriteMethod || 'individualFields',
        fields: metric.attributesFields,
        jsonTemplate: metric.attributesJsonTemplate,
        payloadPath: metric.attributesPayloadPath,
        payload,
        title: 'Attributes'
      });

      if (metric.metricType === 'sum') {
        // Trimmed for the same reason, and so a whitespace-only render counts as
        // blank and omits startTimeUnixNano rather than throwing.
        const renderedStart = payloadHelper.renderToString(metric.startTimestampTemplate, payload).trim();
        metrics.push(makeSum({
          name,
          description,
          unit,
          value,
          attrObj,
          timeUnixNano,
          startTimeUnixNano: renderedStart ? timeToNano(renderedStart) : undefined,
          aggregationTemporality: metric.aggregationTemporality,
          isMonotonic: metric.isMonotonic
        }));
      } else {
        metrics.push(makeGauge({
          name, description, unit, value, attrObj, timeUnixNano
        }));
      }
    });
    return metrics;
  }

  // Returns the JSON-stringified OTLP body. Headers and the https.Agent are
  // built by sendOtlpRequest from the connection object - deliberately not here,
  // so the client key and cert stay off anything a later change might log or
  // attach to a result.
  buildRequestBody(payload, connection, metrics) {
    const scopeName = payloadHelper.renderToString(this.scopeNameTemplate, payload) || DEFAULT_SCOPE_NAME;
    const scopeVersion = payloadHelper.renderToString(this.scopeVersionTemplate, payload) || AGENT_VERSION.version;

    return JSON.stringify({
      resourceMetrics: [{
        resource: { attributes: connection.resourceAttrs },
        scopeMetrics: [{ scope: { name: scopeName, version: scopeVersion }, metrics }]
      }]
    });
  }

}

export default OtelMetricsWriteNode;
