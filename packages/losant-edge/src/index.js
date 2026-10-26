#!/usr/bin/env node
// NOTE: Must be done before other requires.
import './env.js';

import { stringToBoolean, toNumber, timeoutP, noop } from 'omnibelt';
import {
  AGENT_VERSION,
  CONF_PATH_DEFAULT,
  LOGGER_OUT_DEFAULT,
  LOGGER_LEVEL_DEFAULT,
  STORE_PATH_DEFAULT,
  UDP_ADDRESS_DEFAULT,
  WEBSERVER_PORT_DEFAULT,
  WEBSERVER_ADDRESS_DEFAULT,
  WEBSERVER_ENABLED_DEFAULT,
  NOT_ENV_PROD,
  QUEUE_OFFLINE_MESSAGES_DEFAULT,
  SUBSCRIBE_TO_PERIPHERAL_UPDATES_DEFAULT,
  OFFLINE_MESSAGE_REPLAY_ORDER_DEFAULT,
  LOCAL_BROKER_PORT_DEFAULT,
  LOCAL_BROKER_ADDRESS_DEFAULT,
  LOCAL_BROKER_ENABLED_DEFAULT,
  WORKFLOW_DIRECTORY_DEFAULT
} from './constants.js';
import rollbar from './rollbar.js';
import logger from './logger/index.js';
import { TEN_S_MS } from 'losant-nodejs-utils/src/constants/time.js';

const EXIT_ON_INVALID_CONFIG = stringToBoolean(process.env.EXIT_ON_INVALID_CONFIG);

const closeLoggerAndExit = async (exitCode) => {
  await logger.cleanClose();
  process.exit(exitCode);
};

// because rollbar doesn't have a 'exitOnUnhandledRejection'
// option so we make our own that is better and handle both
// unhandled exceptions and rejections on our own
// see https://github.com/rollbar/rollbar.js/blob/master/src/server/rollbar.js#L407
// for original source
const handleUncaught = (type) => {
  return (error) => {
    logger.errorNoRollbar(`Exiting on unhandled ${type}: ${error.name}`);
    if (NOT_ENV_PROD) {
      logger.error('Error Object', {
        name: error.name,
        message: error.message
      });
    }
    rollbar._uncaughtError(error, noop);
    setImmediate(() => {
      rollbar.wait(() => {
        closeLoggerAndExit(1);
      });
    });
  };
};

if (process.env.NODE_ENV !== 'test') {
  process.on('uncaughtException', handleUncaught('exception'));
  process.on('unhandledRejection', handleUncaught('rejection'));
}

let mainPromise, mainShutdown;
const processShutdown = async () => {
  logger.info('Agent shutdown requested');
  try {
    if (mainPromise) {
      // we got asked to shutdown before we finished starting up,
      // lets give ourselves a chance to start and stop properly
      await timeoutP(TEN_S_MS, mainPromise);
    }

    if (mainShutdown) {
      await timeoutP(TEN_S_MS, mainShutdown());
    }

    await logger.info('Clean shutdown, exiting');
    closeLoggerAndExit(0);
  } catch {
    await logger.warn('Unclean shutdown, exiting');
    closeLoggerAndExit(124); // timeout error code
  }
};

process.on('SIGINT', processShutdown);
process.on('SIGTERM', processShutdown);

// :: String -> String|Number
const optionToNumber = (str) => {
  const num = toNumber(str);
  return isFinite(num) ? num : str;
};

import { program } from 'commander';
import main from './main.js';
import { pathRelativeToCwd } from './utils.js';
import LoggerLevel from './types/logger-level.js';
import LoggerOutSymbol from './types/logger-out-symbol.js';
import PeripheralUpdatesOptions from './types/peripheral-updates-options.js';
import ReplayOrderOptions from './types/replay-order-options.js';

/* eslint-disable no-console */
program
  .version(AGENT_VERSION.version)
  .usage('[options]')
  .on('--help', () => console.log(`
    NOTE: Conf file configuration can be overridden by Environment Variables or CLI flags.
  `))
  .option(`-f, --conf-path <${pathRelativeToCwd(CONF_PATH_DEFAULT)}>`, 'Path to configuration file.')
  .option(`--logger-out <${LOGGER_OUT_DEFAULT}>`, `Desired destination for logging. One of "${LoggerOutSymbol.allowed}" or a file path.`)
  .option(`--logger-level <${LOGGER_LEVEL_DEFAULT}>`, `Desired log level. One of "${LoggerLevel.allowed}".`)
  .option(`--store-path <${pathRelativeToCwd(STORE_PATH_DEFAULT)}>`, 'Path to persistent store.')
  .option('--device-id <your-device-id>', 'Device ID of Agent.')
  .option('--access-key <your-access-key>', 'Access key of Agent.')
  .option('--access-secret <your-access-secret>', 'Access key of Agent.')
  .option(`--queue-offline-messages <${QUEUE_OFFLINE_MESSAGES_DEFAULT}>`, 'If the agent should queue messages while offline to send later.', stringToBoolean)
  .option(`--offline-message-replay-order <${OFFLINE_MESSAGE_REPLAY_ORDER_DEFAULT}>`, `In what order the agent should send queued offline messages once reconnected. One of ${ReplayOrderOptions.allowed}`)
  .option(`--subscribe-to-peripheral-updates <${SUBSCRIBE_TO_PERIPHERAL_UPDATES_DEFAULT}>`, `If the agent should subscribe to peripheral updates. One of "${PeripheralUpdatesOptions.allowed}".`, PeripheralUpdatesOptions.coerce)
  .option(`--udp-address <${UDP_ADDRESS_DEFAULT}>`, 'Address to bind UDP triggers to.')
  .option(`--webserver-port <${WEBSERVER_PORT_DEFAULT}>`, 'Port to run webserver on.', optionToNumber)
  .option(`--webserver-address <${WEBSERVER_ADDRESS_DEFAULT}>`, 'Address to run webserver on.')
  .option('--webserver-username <username>', 'Username for webserver basic auth.')
  .option('--webserver-password <password>', 'Password for webserver basic auth.')
  .option('--webserver-ssl-key-path <path>', 'Path to SSL key for webserver.')
  .option('--webserver-ssl-cert-path <path>', 'Path to SSL cert for webserver.')
  .option('--webserver-ssl-bundle-path <path>', 'Path to SSL bundle for webserver.')
  .option(`--webserver-enabled <${WEBSERVER_ENABLED_DEFAULT}>`, 'If webserver should be enabled.', stringToBoolean)
  .option(`--workflow-directory <${pathRelativeToCwd(WORKFLOW_DIRECTORY_DEFAULT)}>`, 'Directory containing on-disk workflows.')
  .option(`--local-broker-port <${LOCAL_BROKER_PORT_DEFAULT}>`, 'Port to run local broker on.', optionToNumber)
  .option(`--local-broker-address <${LOCAL_BROKER_ADDRESS_DEFAULT}>`, 'Address to run local broker on.')
  .option('--local-broker-username <username>', 'Username for local broker.')
  .option('--local-broker-password <password>', 'Password for local broker.')
  .option('--local-broker-ssl-key-path <path>', 'Path to SSL key for local broker.')
  .option('--local-broker-ssl-cert-path <path>', 'Path to SSL cert for local broker.')
  .option('--local-broker-ssl-bundle-path <path>', 'Path to SSL bundle for local broker.')
  .option(`--local-broker-enabled <${LOCAL_BROKER_ENABLED_DEFAULT}>`, 'If local broker should be enabled.', stringToBoolean)
  .option('--otel-reporting-enabled <true,false>', 'If automated container metric reporting to the OpenTelemetry collector should be enabled. Defaults to false.', stringToBoolean)
  .parse(process.argv);

mainPromise = main(program.opts())
  .then(({ shutdown }) => {
    mainPromise = null;
    mainShutdown = shutdown;
  })
  .catch(async (err) => {
    mainPromise = null;
    if (err.type === 'LosantAgentConfigurationError') {
      if (EXIT_ON_INVALID_CONFIG) {
        await logger.errorNoRollbar(err.message);
        // standard exit code for misconfiguration
        // although exit codes 78 or 64 could also be considered standard
        await logger.errorNoRollbar('The Losant Edge Agent was unable to start due to configuration errors. Please fix the above configuration errors by editing the config.toml file or by providing configuration environment variables, and attempt to start the Edge Agent again.');
        closeLoggerAndExit(2);
      } else {
        await logger.info('The Losant Edge Agent is awaiting device specific configuration. Please edit the config.toml file or provide configuration environment variables. The Edge Agent container must be restarted for any configuration changes to take affect.');
      }
    } else {
      await logger.exception(`Exiting due to error: ${err.name} - ${err.message}`, err);
      closeLoggerAndExit(1);
    }
  });
