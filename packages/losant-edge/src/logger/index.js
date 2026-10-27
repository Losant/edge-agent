import {
  compose, format, evolve, isNil, concat, defer,
  ifElse, always, timeoutP
} from 'omnibelt';
import util from 'util';
import jsonStringify from 'json-stringify-pretty-compact';
import { createLogger, transports, format as winstonFormat } from 'winston';
import fs from 'fs-extra';
import { FIVE_MEGA_BYTES } from '../constants.js';
import rollbarP from '../rollbar-p.js';
import LoggerOutSymbol from '../types/logger-out-symbol.js';
import LoggerConf from '../types/logger-conf.js';
import { configErrorFromException } from '../lib/configuration-error.js';
import logBuffer from './log-buffer.js';

const { combine, timestamp, printf, colorize } = winstonFormat;

const stringifyPretty = (obj) => {
  try {
    return jsonStringify(obj, { maxLength: 100 });
  } catch {
    return util.inspect(obj);
  }
};

const logFormatter = combine(
  timestamp(),
  colorize(),
  printf(compose(
    format('{timestamp} {level} {message}{__ctx}'),
    evolve({
      level: format('[{}]'),
      __ctx: ifElse(
        isNil,
        always(''),
        compose(concat('\n'), stringifyPretty)
      )
    })
  ))
);

const buildFileTransport = (filename) => {
  try {
    fs.ensureFileSync(filename);
  } catch (e) {
    throw configErrorFromException(e, `open log file for writing. code: "${e.code}" - filename: "${filename}"`);
  }
  return new transports.File({
    filename,
    maxsize: FIVE_MEGA_BYTES
  });
};

const buildTransports = (loggerConf) => {
  const transportsArray = [logBuffer];
  if (LoggerOutSymbol.allowed.includes(loggerConf.out)) {
    transportsArray.push(new transports.Console({ stderrLevels: ['error'] }));
  } else {
    transportsArray.push(buildFileTransport(loggerConf.out));
  }
  return transportsArray;
};

const buildWinstonConfig = (loggerConf) => {
  return {
    level: loggerConf.level,
    format: logFormatter,
    transports: buildTransports(loggerConf),
    exitOnError: false
  };
};

const winstonLogger = createLogger(buildWinstonConfig(LoggerConf({})));

winstonLogger.on('error', (err) => {
  throw err;
});

const logMethod = (level) => {
  return (message, ctx) => Promise.resolve(winstonLogger.log(level, message, { __ctx: ctx }));
};
const logError = logMethod('error');

const logger = {
  reconfigure: (loggerConf) => {
    winstonLogger.configure(buildWinstonConfig(loggerConf));
  },
  exception: async (message, err, ctx) => {
    const loggerResult = logError(message, ctx);
    await rollbarP({ message, err, custom: ctx });
    return loggerResult;
  },
  error: async (message, ctx) => {
    const loggerResult = logError(message, ctx);
    await rollbarP({ message, custom: ctx });
    return loggerResult;
  },
  errorNoRollbar: logError,
  warn: logMethod('warn'),
  info: logMethod('info'),
  verbose: logMethod('verbose'),
  cleanClose: () => {
    const deferred = defer();
    winstonLogger.on('finish', deferred.resolve);
    winstonLogger.end();
    return timeoutP(1000, deferred.promise);
  }
};

export default logger;
