import { prop } from 'omnibelt';
import {
  LOGGER_OUT_DEFAULT,
  LOGGER_LEVEL_DEFAULT
} from '../constants.js';
import Struct from './lib/struct.js';
import LoggerOut from './logger-out.js';
import LoggerLevel from './logger-level.js';

const LoggerConf = Struct({
  out: LoggerOut,
  level: LoggerLevel
}, {
  name: 'LoggerConf',
  strict: true,
  defaultProps: {
    out: LOGGER_OUT_DEFAULT,
    level: LOGGER_LEVEL_DEFAULT
  }
});

// :: Args -> LoggerConf
LoggerConf.fromArgs = prop('logger');

export default LoggerConf;
