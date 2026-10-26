import {
  stringToBoolean, toNumber, mapRejectNil, fromPairs, pipe, has,
  snakeCase, toUpper
} from 'omnibelt';
import CliArgs from '../types/cli-args.js';
import PeripheralUpdatesOptions from '../types/peripheral-updates-options.js';
import { configError } from './configuration-error.js';

const toValidNum = (str) => {
  const num = toNumber(str);
  return isFinite(num) ? num : str;
};

const toResourceAttributes = (str) => {
  try {
    return JSON.parse(str);
  } catch (e) {
    throw configError(`OTLP_COLLECTOR_RESOURCE_ATTRIBUTES must be valid JSON: ${e.message}`);
  }
};

const CONVERSIONS = {
  webserverEnabled: stringToBoolean,
  localBrokerEnabled: stringToBoolean,
  queueOfflineMessages: stringToBoolean,
  subscribeToPeripheralUpdates: PeripheralUpdatesOptions.coerce,
  webserverPort: toValidNum,
  localBrokerPort: toValidNum,
  healthCheckEnabled: stringToBoolean,
  healthCheckPort: toValidNum,
  healthCheckOfflineIsUnhealthy: stringToBoolean,
  otlpCollectorDisableSSLVerification: stringToBoolean,
  otlpCollectorResourceAttributes: toResourceAttributes,
  otelReportingEnabled: stringToBoolean,
  otelReportingIntervalSeconds: toValidNum
};

const toEnvVarName = pipe(snakeCase, toUpper);

export default () => {
  return pipe(
    mapRejectNil((key) => {
      const envVar = toEnvVarName(key);
      if (!has(envVar, process.env)) { return; }
      let value = process.env[envVar];
      if (CONVERSIONS[key]) { value = CONVERSIONS[key](value); }
      return [key, value];
    }),
    fromPairs,
    CliArgs.unary
  )(CliArgs.keys);
};
