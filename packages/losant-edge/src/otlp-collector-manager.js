import errors from 'losant-nodejs-utils/src/errors.js';
import { getBasicAuthValue } from 'losant-nodes/src/lib/common.js';
import logger from './logger/index.js';
import { AGENT_VERSION } from './constants.js';
import {
  AUTO_REPORT_METRICS_SCOPE_NAME,
  METRICS_PATH,
  NANOS_PER_MS
} from './lib/otel-constants.js';
import { nowNano, objToOtlpAttrs, makeGauge, makeSum, sendOtlpRequest } from './lib/otel-utils.js';

const REPORT_TIMEOUT_MS = 10000;
const PROCESS_START_NANO = (BigInt(Date.now() - Math.round(process.uptime() * 1000)) * NANOS_PER_MS).toString();

const collectSystemMetrics = (processStartNano = PROCESS_START_NANO) => {
  const timeUnixNano = nowNano();
  const mem = process.memoryUsage();
  const cpu = process.cpuUsage();

  return [
    makeGauge({
      name: 'process.memory.usage',
      description: 'Resident set size of the process',
      unit: 'By',
      value: mem.rss,
      timeUnixNano
    }),
    makeGauge({
      name: 'v8js.memory.heap.total',
      description: 'Total size of the allocated heap',
      unit: 'By',
      value: mem.heapTotal,
      timeUnixNano
    }),
    makeGauge({
      name: 'v8js.memory.heap.used',
      description: 'Memory used by the heap',
      unit: 'By',
      value: mem.heapUsed,
      timeUnixNano
    }),
    makeGauge({
      name: 'v8js.memory.external',
      description: 'Memory used by C++ objects bound to JavaScript objects',
      unit: 'By',
      value: mem.external,
      timeUnixNano
    }),
    makeSum({
      name: 'process.cpu.time',
      description: 'Total CPU time spent by the process in user mode',
      unit: 's',
      value: cpu.user / 1e6,
      attrObj: { 'cpu.mode': 'user' },
      timeUnixNano,
      startTimeUnixNano: processStartNano,
      aggregationTemporality: 'cumulative',
      isMonotonic: true
    }),
    makeSum({
      name: 'process.cpu.time',
      description: 'Total CPU time spent by the process in system mode',
      unit: 's',
      value: cpu.system / 1e6,
      attrObj: { 'cpu.mode': 'system' },
      timeUnixNano,
      startTimeUnixNano: processStartNano,
      aggregationTemporality: 'cumulative',
      isMonotonic: true
    }),
    makeGauge({
      name: 'process.uptime',
      description: 'Process uptime in seconds',
      unit: 's',
      value: process.uptime(),
      timeUnixNano
    })
  ];
};

// Resolves the agent-level [otlpCollector] config into the connection shape
// sendOtlpRequest expects, and (when [otelReporting] is enabled) automatically
// reports container metrics to it on an interval - both are driven off the
// same resolved collector config, so they live in one manager.
const OtlpCollectorManager = (otlpCollectorConf, otelReportingConf) => {
  let resolved;

  if (otlpCollectorConf) {
    const authHeaders = {};
    if (otlpCollectorConf.authType === 'bearer') {
      if (otlpCollectorConf.bearerToken) {
        authHeaders.Authorization = `Bearer ${otlpCollectorConf.bearerToken}`;
      }
    } else if (otlpCollectorConf.authType === 'basic') {
      if (otlpCollectorConf.username) {
        authHeaders.Authorization = getBasicAuthValue(otlpCollectorConf.username, otlpCollectorConf.password || '');
      }
    }

    const agentOptions = {};
    if (otlpCollectorConf.disableSSLVerification) {
      agentOptions.rejectUnauthorized = false;
    } else if (otlpCollectorConf.caCert) {
      agentOptions.ca = otlpCollectorConf.caCert;
    }

    if (otlpCollectorConf.authType === 'clientCert') {
      agentOptions.cert = otlpCollectorConf.clientCert;
      agentOptions.key = otlpCollectorConf.clientKey;
    }

    resolved = {
      url: otlpCollectorConf.url,
      resourceAttrs: objToOtlpAttrs(otlpCollectorConf.resourceAttributes || {}),
      authHeaders,
      agentOptions
    };
  }

  const get = () => {
    if (!resolved) {
      throw errors.Validation({ message: 'No OpenTelemetry Collector configuration found in the Edge Agent config.' });
    }
    return resolved;
  };
  const hasConfig = () => Boolean(resolved);

  const { enabled = false, intervalSeconds = 30 } = otelReportingConf ?? {};
  let timerId = null;
  let isReporting = false;
  let activeReportPromise = null;
  let isShutdown = false;

  const report = async () => {
    if (isReporting || isShutdown || !hasConfig()) { return; }
    isReporting = true;
    const runReport = async () => {
      try {
        let connection;
        try {
          connection = get();
        } catch {
          return;
        }

        const metrics = collectSystemMetrics();
        const metricsPayload = {
          resourceMetrics: [
            {
              resource: { attributes: connection.resourceAttrs },
              scopeMetrics: [
                {
                  scope: {
                    name: AUTO_REPORT_METRICS_SCOPE_NAME,
                    version: AGENT_VERSION.version
                  },
                  metrics
                }
              ]
            }
          ]
        };

        try {
          const res = await sendOtlpRequest(connection, METRICS_PATH, JSON.stringify(metricsPayload), REPORT_TIMEOUT_MS);
          if (res.status < 200 || res.status > 299) {
            const detail = res.data ? `: ${typeof res.data === 'string' ? res.data : JSON.stringify(res.data)}` : '';
            logger.warn(`[otlp-collector-manager] Failed to export metrics: HTTP ${res.status}${detail.slice(0, 200)}`);
          }
        } catch (err) {
          if (!isShutdown) {
            logger.warn(`[otlp-collector-manager] Failed to export metrics: ${err.message}`);
          }
        }
      } catch (unexpectedErr) {
        if (!isShutdown) {
          logger.warn(`[otlp-collector-manager] Unexpected error during telemetry report: ${unexpectedErr.message}`);
        }
      } finally {
        isReporting = false;
        activeReportPromise = null;
      }
    };
    activeReportPromise = runReport();
    await activeReportPromise;
  };

  const initialize = async () => {
    isShutdown = false;
    if (!enabled || timerId) { return; }
    const intervalMs = Math.max(1, intervalSeconds) * 1000;
    timerId = setInterval(report, intervalMs);
  };

  const shutdown = async () => {
    isShutdown = true;
    if (timerId) {
      clearInterval(timerId);
      timerId = null;
    }
    if (activeReportPromise) {
      await activeReportPromise.catch(() => {});
    }
  };

  return {
    initialize,
    shutdown,
    get,
    hasConfig,
    report
  };
};

export default OtlpCollectorManager;
