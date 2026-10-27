import https from 'node:https';
import { isNil, isNilOrEmpty, isPlainObject, trim } from 'omnibelt';
import * as payloadHelper from 'losant-handlebars';
import axios from 'losant-nodejs-utils/src/axios.js';
import errors from 'losant-nodejs-utils/src/errors.js';
import enforceTime from 'losant-nodejs-utils/src/utils/enforce-time.js';
import ensureValidHttpUri from 'losant-nodejs-utils/src/utils/ensure-valid-uri.js';
import { getBasicAuthValue, getDataByTemplateType } from 'losant-nodes/src/lib/common.js';
import resolveValueByLookupType from 'losant-nodes/src/lib/resolve-value-by-lookup-type.js';
import { ONE_MEGABYTE } from 'losant-nodejs-utils/src/constants/size.js';
import { NANOS_PER_MS, TEMPORALITY_DELTA, TEMPORALITY_CUMULATIVE, METRICS_PATH, LOGS_PATH, TRACES_PATH } from './otel-constants.js';

// OTel Logs SeverityNumber enum. Each named level anchors the first of four
// sub-levels (https://opentelemetry.io/docs/specs/otel/logs/data-model/#field-severitynumber) -
// only the anchors are exposed as names here, matching what the node's UI offers.
const SEVERITY_NAME_TO_NUMBER = {
  TRACE: 1, DEBUG: 5, INFO: 9, WARN: 13, WARNING: 13, ERROR: 17, FATAL: 21
};
// Derived rather than hand-duplicated, so the two maps cannot drift out of
// sync. WARNING is excluded so it does not clobber WARN's entry for 13 -
// both names resolve to severityNumber 13, but severityText prefers WARN.
const SEVERITY_NUMBER_TO_TEXT = Object.fromEntries(
  Object.entries(SEVERITY_NAME_TO_NUMBER)
    .filter(([name]) => name !== 'WARNING')
    .map(([name, number]) => [number, name])
);

// Shared OTLP/HTTP helpers. Everything here emits the protobuf JSON mapping
// that the OTLP/HTTP JSON encoding expects. 64-bit fields (intValue,
// timeUnixNano) are serialized as strings, not numbers.

export const nowNano = () => (BigInt(Date.now()) * NANOS_PER_MS).toString();

// Converts a millisecond epoch timestamp to the nanosecond string OTLP expects.
export const msToNano = (ms) => {
  const asNumber = Number(ms);
  if (!Number.isFinite(asNumber) || asNumber < 0) {
    throw errors.Validation({ message: `Invalid timestamp: ${ms}. Expected a non-negative number of milliseconds since epoch.` });
  }
  return (BigInt(Math.round(asNumber)) * NANOS_PER_MS).toString();
};

// Resolves a rendered timestamp template to the nanosecond string OTLP expects.
// enforceTime is what the rest of the platform accepts for a user-supplied time
// (base-device-change-state-node.js:69): ms or seconds since epoch, an ISO
// string, or a negative offset from now. Unlike that node we do not fall back to
// the current time on garbage - a metric silently stamped "now" is worse than a
// loud failure - so unparsable input throws.
export const timeToNano = (time) => {
  const resolved = enforceTime(time, enforceTime.noTimeFallback);
  if (!resolved) {
    throw errors.Validation({ message: `Invalid timestamp: ${time}. Expected epoch milliseconds, epoch seconds, or a parsable date.` });
  }
  return msToNano(resolved.getTime());
};

const toAttrValue = (val) => {
  if (typeof val === 'boolean') { return { boolValue: val }; }
  if (typeof val === 'number') {
    if (!Number.isFinite(val)) { return { stringValue: String(val) }; }
    return Number.isSafeInteger(val) ? { intValue: String(val) } : { doubleValue: val };
  }
  if (typeof val?.toISOString === 'function') {
    return { stringValue: isNaN(val) ? 'Invalid Date' : val.toISOString() };
  }
  return { stringValue: typeof val === 'object' && val !== null ? JSON.stringify(val) : String(val ?? '') };
};

// Converts a flat JS object to an OTLP attribute array.
export const objToOtlpAttrs = (obj) => {
  if (!obj || typeof obj !== 'object') { return []; }
  return Object.entries(obj).map(([key, val]) => ({ key, value: toAttrValue(val) }));
};

// Merges OTLP attribute arrays by key; later arrays win on a duplicate key.
export const mergeOtlpAttrs = (...attrArrays) => {
  const merged = new Map();
  attrArrays.forEach((attrs) => (attrs || []).forEach((attr) => merged.set(attr.key, attr)));
  return [...merged.values()];
};

// The three-mode attribute resolver shared by the resource attributes and the
// per-metric attribute inputs on the write node. Always returns a plain object.
// A source that resolves to something else is a misconfigured node, not an
// absence of attributes
export const resolveAttributes = ({
  writeMethod,
  fields,
  jsonTemplate,
  payloadPath,
  payload,
  title
}) => {
  if (writeMethod === 'individualFields') {
    // getDataByTemplateType reads `key`; keyValueTemplateArrayField gives us `keyTemplate`.
    return getDataByTemplateType(
      (fields || []).map(({ keyTemplate, valueTemplate }) => ({ key: keyTemplate, valueTemplate })),
      'individualFields',
      payload
    );
  }

  const resolved = resolveValueByLookupType({
    lookupType: writeMethod,
    inputValue: writeMethod === 'jsonTemplate' ? jsonTemplate : payloadPath,
    payload,
    title,
    blankJsonToUndefined: true
  });

  // A blank source is a node with no attributes configured, which is allowed.
  if (isNil(resolved)) { return {}; }
  if (!isPlainObject(resolved)) {
    throw errors.Validation({ message: `${title} must resolve to an object.` });
  }
  return resolved;
};

export const makeGauge = ({
  name,
  description,
  unit,
  value,
  attrObj,
  timeUnixNano
}) => {
  const metric = { name, unit: unit || '1' };
  if (description) { metric.description = description; }
  metric.gauge = {
    dataPoints: [{ asDouble: value, timeUnixNano, attributes: objToOtlpAttrs(attrObj) }]
  };
  return metric;
};

export const makeSum = ({
  name,
  description,
  unit,
  value,
  attrObj,
  timeUnixNano,
  startTimeUnixNano,
  aggregationTemporality,
  isMonotonic
}) => {
  const dataPoint = { asDouble: value, timeUnixNano, attributes: objToOtlpAttrs(attrObj) };
  if (startTimeUnixNano) { dataPoint.startTimeUnixNano = startTimeUnixNano; }

  const metric = { name, unit: unit || '1' };
  if (description) { metric.description = description; }
  metric.sum = {
    dataPoints: [dataPoint],
    aggregationTemporality: aggregationTemporality === 'delta' ? TEMPORALITY_DELTA : TEMPORALITY_CUMULATIVE,
    isMonotonic: isMonotonic !== false
  };
  return metric;
};

// Resolves a rendered severity template to the OTLP SeverityNumber (0-24) and
// its SeverityText, accepting either a bare number or one of the named anchors
// (case-insensitive). 0 is spec-defined as "unspecified" and has no name -
// https://opentelemetry.io/docs/specs/otel/logs/data-model/#field-severitynumber.
// Unrecognized input is a misconfigured node, not a judgment call this helper
// should paper over - so it throws rather than falling back to a default severity.
export const resolveSeverityNumber = (rendered) => {
  const trimmed = trim(rendered);
  if (isNilOrEmpty(trimmed)) { throw errors.MissingField({ title: 'Severity' }); }

  const named = SEVERITY_NAME_TO_NUMBER[trimmed.toUpperCase()];
  if (named) { return { severityNumber: named, severityText: SEVERITY_NUMBER_TO_TEXT[named] }; }

  // Plain decimal only - a bare Number() would also accept hex ('0x11') and
  // exponential ('1e1') notation as a number 0-24, which is not what a user
  // typing a severity template means by "a number".
  if ((/^-?\d+(\.\d+)?$/).test(trimmed)) {
    const asNumber = Number(trimmed);
    if (Number.isInteger(asNumber) && asNumber >= 0 && asNumber <= 24) {
      return { severityNumber: asNumber, severityText: SEVERITY_NUMBER_TO_TEXT[asNumber] };
    }
  }

  throw errors.Validation({
    message: `Invalid severity: ${rendered}. Expected a number 0-24 or one of TRACE, DEBUG, INFO, WARN, WARNING, ERROR, FATAL.`
  });
};

export const makeLogRecord = ({
  body,
  severityNumber,
  severityText,
  eventName,
  timeUnixNano,
  observedTimeUnixNano,
  attrObj
}) => {
  const record = {
    observedTimeUnixNano,
    severityNumber,
    body: { stringValue: body },
    attributes: objToOtlpAttrs(attrObj)
  };
  if (timeUnixNano) { record.timeUnixNano = timeUnixNano; }
  if (severityText) { record.severityText = severityText; }
  if (eventName) { record.eventName = eventName; }
  return record;
};

// A collector can answer 200 and still drop part of the batch. The OTLP spec
// treats that as a success the client must not retry, so callers report it
// alongside success rather than as an error.
// https://opentelemetry.io/docs/specs/otlp/#partial-success
export const readPartialSuccess = (data, rejectedField) => {
  let body = data;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { return undefined; }
  }
  const partial = body?.partialSuccess;
  if (!partial) { return undefined; }
  const rejected = Number(partial[rejectedField]) || 0;
  const rejectedMessage = partial.errorMessage || '';
  // An all-zero partialSuccess is how a fully successful export is encoded.
  if (!rejected && !rejectedMessage) { return undefined; }
  return { rejected, rejectedMessage };
};

export const buildAuthHeader = (authType, templates = {}, payload) => {
  const render = (template) => payloadHelper.renderToString(template, payload);
  if (authType === 'bearer') {
    const bearerToken = trim(render(templates.bearerToken));
    if (isNilOrEmpty(bearerToken)) { throw errors.MissingField({ title: 'Bearer Token' }); }
    return { Authorization: `Bearer ${bearerToken}` };
  }
  if (authType === 'basic') {
    const username = trim(render(templates.username));
    if (isNilOrEmpty(username)) { throw errors.MissingField({ title: 'Username' }); }
    return { Authorization: getBasicAuthValue(username, render(templates.password)) };
  }
  return {};
};

// Posts an already-serialized OTLP JSON body to `${connection.url}${otlpPath}`.
// Shared by OtelMetricsWriteNode and the GEA auto-reporter so both send the same
// way - same headers, same https.Agent construction (built even for a plain-http
// collector, matching http-node.js:445), same axios options.
export const sendOtlpRequest = (connection, otlpPath, body, timeoutMs) => axios({
  method: 'POST',
  url: `${connection.url}${otlpPath}`,
  headers: { 'Content-Type': 'application/json', ...connection.authHeaders },
  data: body,
  timeout: timeoutMs,
  httpsAgent: new https.Agent(connection.agentOptions)
}, { blankDefaultHeaders: true, allStatusCodesAreValid: true });

// Resolves one cert field. 'diskPath' reads the rendered path off the GEA
// filesystem; 'stringTemplate' treats the rendered string as the PEM itself.
export const resolveCert = async (templateType, template, payload, context) => {
  const rendered = payloadHelper.renderToString(template, payload);
  if (isNilOrEmpty(trim(rendered))) { return undefined; }
  if (templateType !== 'diskPath') { return rendered; }
  const contents = await context.diskUtils.loadGuardedFile(trim(rendered), {
    maxSize: ONE_MEGABYTE,
    encoding: 'utf8'
  });
  return isNilOrEmpty(trim(contents)) ? undefined : contents;
};

// Resolves the OTLP collector connection shared by every otel write node -
// agentConfig delegates to the Edge Agent's own [otlpCollector] config (with
// this node's resource attributes merged on top), inline renders and
// validates the node's own connection fields. Returns
// { url, resourceAttrs, authHeaders, agentOptions }. url is the collector base
// URL - callers append their own OTLP path (METRICS_PATH/LOGS_PATH/TRACES_PATH).
// agentOptions is handed straight to https.Agent, so it is always an object -
// empty for a plain-http collector with no TLS configuration.
export const resolveOtlpConnection = async (node, payload, context) => {
  if (node.connectionSource === 'agentConfig') {
    const agentCollector = context.getOtlpCollectorConfig?.();
    if (!agentCollector?.url) {
      throw errors.Validation({ message: 'No OpenTelemetry Collector configuration found in the Edge Agent config.' });
    }
    const nodeResourceAttrs = objToOtlpAttrs(resolveAttributes({
      writeMethod: node.resourceAttributesWriteMethod,
      fields: node.resourceAttributesFields,
      jsonTemplate: node.resourceAttributesJsonTemplate,
      payloadPath: node.resourceAttributesPayloadPath,
      payload,
      title: 'Resource Attributes'
    }));
    return {
      url: agentCollector.url,
      resourceAttrs: mergeOtlpAttrs(agentCollector.resourceAttrs, nodeResourceAttrs),
      authHeaders: agentCollector.authHeaders,
      agentOptions: agentCollector.agentOptions
    };
  }

  const baseUrl = payloadHelper.renderToString(node.collectorUrlTemplate, payload).trim();
  if (!baseUrl) { throw errors.MissingField({ title: 'Collector URL' }); }

  const parsed = ensureValidHttpUri(baseUrl);
  if (parsed.search) {
    throw errors.Validation({ message: 'Collector URL must not contain a query string.' });
  }
  if (parsed.hash) {
    throw errors.Validation({ message: 'Collector URL must not contain a fragment.' });
  }
  if (parsed.username || parsed.password) {
    throw errors.Validation({
      message: 'Collector URL must not contain embedded credentials. Use the authentication fields instead.'
    });
  }

  const pathPrefix = parsed.pathname.replace(/\/+$/, '');
  if (pathPrefix.endsWith(METRICS_PATH)) {
    const base = `${parsed.origin}${pathPrefix.slice(0, -METRICS_PATH.length)}`;
    throw errors.Validation({
      message: `Collector URL must not include ${METRICS_PATH}: use ${base}`
    });
  }
  if (pathPrefix.endsWith(LOGS_PATH)) {
    const base = `${parsed.origin}${pathPrefix.slice(0, -LOGS_PATH.length)}`;
    throw errors.Validation({
      message: `Collector URL must not include ${LOGS_PATH}: use ${base}`
    });
  }
  if (pathPrefix.endsWith(TRACES_PATH)) {
    const base = `${parsed.origin}${pathPrefix.slice(0, -TRACES_PATH.length)}`;
    throw errors.Validation({
      message: `Collector URL must not include ${TRACES_PATH}: use ${base}`
    });
  }
  const url = `${parsed.origin}${pathPrefix}`;
  const resourceAttrs = objToOtlpAttrs(resolveAttributes({
    writeMethod: node.resourceAttributesWriteMethod,
    fields: node.resourceAttributesFields,
    jsonTemplate: node.resourceAttributesJsonTemplate,
    payloadPath: node.resourceAttributesPayloadPath,
    payload,
    title: 'Resource Attributes'
  }));

  const authHeaders = buildAuthHeader(node.authType, {
    bearerToken: node.bearerTokenTemplate,
    username: node.usernameTemplate,
    password: node.passwordTemplate
  }, payload);

  const agentOptions = {};
  if (node.disableSSLVerification) {
    agentOptions.rejectUnauthorized = false;
  } else {
    // undefined = use the system CA store.
    agentOptions.ca = await resolveCert(node.caCertTemplateType, node.caCertTemplate, payload, context);
  }
  if (node.authType === 'clientCert') {
    agentOptions.cert = await resolveCert(node.clientCertTemplateType, node.clientCertTemplate, payload, context);
    if (!agentOptions.cert) { throw errors.MissingField({ title: 'Client Certificate' }); }
    agentOptions.key = await resolveCert(node.clientKeyTemplateType, node.clientKeyTemplate, payload, context);
    if (!agentOptions.key) { throw errors.MissingField({ title: 'Client Key' }); }
  }

  return { url, resourceAttrs, authHeaders, agentOptions };
};
