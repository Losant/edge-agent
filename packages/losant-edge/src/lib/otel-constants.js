export const NANOS_PER_MS = BigInt(1000000);

// AggregationTemporality enum values from the OTLP metrics proto.
export const TEMPORALITY_DELTA = 1;
export const TEMPORALITY_CUMULATIVE = 2;

export const DEFAULT_SCOPE_NAME = 'gea-otel-write';
export const METRICS_PATH = '/v1/metrics';
export const LOGS_PATH = '/v1/logs';
export const TRACES_PATH = '/v1/traces';
export const AUTO_REPORT_METRICS_SCOPE_NAME = 'gea-auto-report';
