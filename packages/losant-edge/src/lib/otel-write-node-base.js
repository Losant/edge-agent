import * as payloadHelper from 'losant-handlebars';
import errors from 'losant-nodejs-utils/src/errors.js';
import { isTimeoutError } from 'losant-nodes/src/lib/common.js';
import { readPartialSuccess, resolveOtlpConnection, sendOtlpRequest } from './otel-utils.js';

// A collector is free to answer with a body of any size; only enough of it to
// diagnose the failure belongs on the payload.
const MAX_ERROR_BODY_LENGTH = 1024;

// Shared shape for every "write to an OpenTelemetry collector" node
// (OtelMetricsWriteNode, OtelLogsWriteNode, and eventually traces). A
// subclass's constructor must call super(id, outputIds, config), set its own
// write-method fields, and set this.otlpPath/this.resultCountField/
// this.rejectedField/this.nodeTitle. It must implement:
//   buildItems(payload) -> the OTLP items[] to send, per its own write method
//   buildRequestBody(payload, connection, items) -> the JSON-stringified OTLP body
//
//   Notes: Bad configuration errors the workflow - an unrenderable template, a
//     required field that resolves to nothing, a malformed collector URL, a
//     certificate that cannot be read. Only a failed send is soft errored to
//     resultPath, so a collector outage cannot take down the workflow:
//     OTEL_COLLECTOR_RESPONSE_ERROR (non-2xx), OTEL_COLLECTOR_REQUEST_ERROR
//     (unreachable) or NodeTimeout.
class OtelWriteNodeBase {

  constructor(id, outputIds, config) {
    this.id = id;
    this.outputIds = outputIds;

    this.connectionSource = config.connectionSource || 'inline';
    this.collectorUrlTemplate = config.collectorUrlTemplate;
    this.resourceAttributesWriteMethod = config.resourceAttributesWriteMethod || 'individualFields';
    this.resourceAttributesFields = config.resourceAttributesFields || [];
    this.resourceAttributesJsonTemplate = config.resourceAttributesJsonTemplate;
    this.resourceAttributesPayloadPath = config.resourceAttributesPayloadPath;
    this.scopeNameTemplate = config.scopeNameTemplate;
    this.scopeVersionTemplate = config.scopeVersionTemplate;

    this.authType = config.authType || 'none';
    this.bearerTokenTemplate = config.bearerTokenTemplate;
    this.usernameTemplate = config.usernameTemplate;
    this.passwordTemplate = config.passwordTemplate;
    this.clientCertTemplateType = config.clientCertTemplateType || 'diskPath';
    this.clientCertTemplate = config.clientCertTemplate;
    this.clientKeyTemplateType = config.clientKeyTemplateType || 'diskPath';
    this.clientKeyTemplate = config.clientKeyTemplate;
    this.caCertTemplateType = config.caCertTemplateType || 'diskPath';
    this.caCertTemplate = config.caCertTemplate;
    this.disableSSLVerification = config.disableSSLVerification === true;

    this.resultPath = config.resultPath;
  }

  // Returns { url, resourceAttrs, authHeaders, agentOptions }. See
  // resolveOtlpConnection in otel-utils.js for the full contract.
  resolveConnection(payload, context) {
    return resolveOtlpConnection(this, payload, context);
  }

  setResult(payload, result) {
    return this.resultPath ? payloadHelper.set(this.resultPath, result, payload) : payload;
  }

  // Only the send is soft errored, so the failure types are named for the ways
  // a collector can let us down, the way file-read-node names its four.
  setError(payload, type, message) {
    return this.setResult(payload, { success: false, error: { type, message } });
  }

  async run(context, payload) {
    const items = this.buildItems(payload);
    if (!items.length) {
      return [this.outputIds, this.setResult(payload, { success: true, [this.resultCountField]: 0 })];
    }

    const connection = await this.resolveConnection(payload, context);
    const body = this.buildRequestBody(payload, connection, items);

    let res;
    try {
      // The shared wrapper routes the socket through the safe DNS lookup, so a
      // template cannot point the collector at a blocked host.
      res = await sendOtlpRequest(connection, this.otlpPath, body, context.externalTimeout);
    } catch (e) {
      if (e.statusCode) {
        return [this.outputIds, this.setError(payload, e.type, e.message)];
      }

      if (isTimeoutError(e)) {
        const timedOut = errors.NodeTimeout({ title: this.nodeTitle });
        return [this.outputIds, this.setError(payload, timedOut.type, timedOut.message)];
      }

      // Anything else axios raised is a request that never reached the collector
      if (!e.isAxiosError) { throw e; }
      return [this.outputIds, this.setError(payload, 'OTEL_COLLECTOR_REQUEST_ERROR', e.message)];
    }

    if (res.status < 200 || res.status > 299) {
      const responseBody = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
      return [this.outputIds, this.setError(
        payload,
        'OTEL_COLLECTOR_RESPONSE_ERROR',
        `HTTP ${res.status}: ${(responseBody || '').slice(0, MAX_ERROR_BODY_LENGTH)}`
      )];
    }

    const result = { success: true, [this.resultCountField]: items.length };
    // The collector took the request but dropped part of it. Not an error and not
    // retryable per the OTLP spec, so it rides along with the success.
    const partial = readPartialSuccess(res.data, this.rejectedField);
    if (partial) {
      result[this.rejectedField] = partial.rejected;
      result.rejectedMessage = partial.rejectedMessage;
    }

    return [this.outputIds, this.setResult(payload, result)];
  }

}

export default OtelWriteNodeBase;
