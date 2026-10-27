import { omit, map, pipe, snakeCase, toUpper, pickBy, test } from 'omnibelt';
import CliArgs from '../types/cli-args.js';

export default pipe(
  // Potential config env vars, really no reason to expose these, and some are
  // known to be sensitive or large (like ssl key)
  omit(map(pipe(snakeCase, toUpper), CliArgs.keys)),
  // Custom internal env vars, no reason to expose these either
  omit([
    'STATS_REPORT_TIME', 'DEBUG',
    'CONF_PATH_DEFAULT', 'LOGGER_OUT_DEFAULT', 'LOGGER_LEVEL_DEFAULT', 'NODE_ENV',
    'STORE_PATH_DEFAULT', 'WEBSERVER_PORT_DEFAULT',
    'ENABLE_EDGE_AGENT_FEATURES', 'ROLLBAR_KEY', 'NODE_ENV',
    'EXIT_ON_INVALID_CONFIG', 'NODE_NO_WARNINGS'
  ]),
  // remove the crazy number of npm env vars
  pickBy((val, key) => { return !test(/^npm_/, key); })
)(process.env);
