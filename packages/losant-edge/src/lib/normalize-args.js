import { prop, compose, pick, mapP } from 'omnibelt';
import tV from 'tcomb-validation';
import { mergeDeepNil } from '../utils.js';
import { MqttClientTriggerTomlConfig, SslConf, Args, CliArgs, OtlpCollectorConf } from '../types/index.js';
import getConfArgs from './get-conf-args.js';
import getEnvArgs from './get-env-args.js';
import { configErrorFromTcomb, configError } from './configuration-error.js';

// :: Command -> Args
const normalizeArgs = async (command, confArgs) => {
  const cliArgs = pick(CliArgs.keys, command);
  const envArgs = getEnvArgs();

  const cliPlusEnv = CliArgs(mergeDeepNil(envArgs, cliArgs));
  confArgs = confArgs || await compose(getConfArgs, prop('confPath'))(cliPlusEnv);

  const finalArgs = compose(
    mergeDeepNil(confArgs),
    Args.fromCliArgs
  )(cliPlusEnv);

  // resolve any ssl related paths to actual certs and keys
  // and then make sure that they are actually valid
  if (finalArgs.webserver?.ssl) {
    finalArgs.webserver.ssl = await SslConf.resolveAndValidate(finalArgs.webserver.ssl);
  }

  if (finalArgs.gateway?.clientSsl) {
    finalArgs.gateway.clientSsl = await SslConf.resolveAndValidate(finalArgs.gateway.clientSsl);
  }

  if (finalArgs.localBroker?.ssl) {
    finalArgs.localBroker.ssl = await SslConf.resolveAndValidate(finalArgs.localBroker.ssl);
  }

  if (finalArgs.triggers?.length) {
    const triggerNames = new Set();
    finalArgs.triggers = await mapP(async (triggerConf) => {
      const typeName = `${triggerConf.type}${triggerConf.name}`;
      if (triggerNames.has(typeName)) {
        throw configError(`Duplicate ${triggerConf.type} triggers named ${triggerConf.name}.`);
      }
      triggerNames.add(typeName);

      if (triggerConf.type === 'mqttClient') {
        triggerConf = await MqttClientTriggerTomlConfig.resolveAndValidate(triggerConf);
      }

      return triggerConf;
    }, finalArgs.triggers);
  }

  if (finalArgs.otlpCollector) {
    finalArgs.otlpCollector = await OtlpCollectorConf.resolveAndValidate(finalArgs.otlpCollector);
  }

  if (finalArgs.otelReporting?.enabled && !finalArgs.otlpCollector) {
    throw configError('An [otlpCollector] configuration block must be provided when [otelReporting] is enabled.');
  }

  // finalArgs is intentionally not cast to the Args type before validation
  const result = tV.validate(finalArgs, Args, { strict: true });
  if (!result.isValid()) {
    throw configErrorFromTcomb(result);
  }
  return Args(finalArgs);
};

export default normalizeArgs;
