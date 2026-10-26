import t from 'tcomb';
import { watch as chokidarWatch } from 'chokidar';
import logger from './logger/index.js';
import fs from 'fs-extra';
import { DelimiterParser, ByteLengthParser } from 'serialport';
import unescapeStr from 'losant-nodejs-utils/src/utils/unescape-str.js';
import { resolve as pathResolve } from 'node:path';
import { resetTo, clampPositiveEnv } from './utils.js';
import FileTailConfigs from './types/file-tail-configs.js';
import FiredTrigger from './types/fired-trigger.js';
import { forEachSerialP, defer, timeoutP, equals } from 'omnibelt';

const maxFileWatchReadyTime = clampPositiveEnv('MAX_FILE_WATCH_READY_TIME', 60000);

const stateDefault = () => ({
  onTailFire: null,
  fileTailById: new Map() // Map<tailId, { config, watcher, transform, tailPath }>
});

const FileTailManager = () => {
  const state = stateDefault();

  const closeTail = async (tailTuple) => {
    try {
      tailTuple.watcher.close();
      tailTuple.watcher.removeAllListeners();
      tailTuple.transform.removeAllListeners();
    } catch { }
    logger.info(`No longer tailing on path ${tailTuple.tailPath}`);
  };

  const buildFileTailWatcher = async (config) => {
    const tailPath = pathResolve(config.path);

    const transform = config.byteLength ?
      new ByteLengthParser({ length: Number(config.byteLength) }) :
      new DelimiterParser({ delimiter: config.delimiter ? unescapeStr(config.delimiter) : '\n' });

    transform.on('data', (buffer) => {
      const now = new Date();

      state.onTailFire(FiredTrigger({
        triggerId: config.tailId,
        triggerType: 'fileTail',
        payload: {
          time: now,
          data: {
            contents: buffer.toString(config.encoding),
            path: tailPath
          }
        }
      }));
    });

    let nextReadStart = null;
    let currentFileSize = 0;
    try {
      currentFileSize = (await fs.stat(tailPath)).size || 0;
    } catch {}

    const processNextRead = () => {
      const start = nextReadStart;
      const end = currentFileSize - 1;
      nextReadStart = null;
      if (start > end) { return; }

      const stream = fs.createReadStream(tailPath, {
        start,
        end
      });
      stream.on('error', (err) => {
        logger.warn(`Error during file tail for path ${tailPath} - ${err.name}: ${err.message}`);
      });
      stream.pipe(transform, { end: false });
      stream.on('end', () => {
        stream.unpipe(transform);
        stream.removeAllListeners();
        if (nextReadStart) {
          setImmediate(processNextRead);
        }
      });
    };

    let watcherReadyDeferred = defer();

    const watcher = chokidarWatch(tailPath, {
      ignoreInitial: false,
      usePolling: true, // needed for docker mounts
      alwaysStat: true,
      ignorePermissionErrors: true
    });

    watcher.on('error', (err) => {
      if (watcherReadyDeferred) {
        watcherReadyDeferred.resolve();
        logger.errorNoRollbar(`Error initializing file tail for path ${tailPath} - ${err.name}: ${err.message}`);
      } else {
        logger.warn(`Error during file tail for path ${tailPath} - ${err.name}: ${err.message}`);
      }
    });

    watcher.once('ready', async () => {
      if (watcherReadyDeferred) {
        watcherReadyDeferred.resolve();
        logger.info(`Now tailing file path ${tailPath}`);
      }
    });

    watcher.on('add', async (fullPath, stats) => {
      // kill any pending read and reset size, we just got a new file
      nextReadStart = null;
      currentFileSize = stats.size;
    });

    watcher.on('unlink', async () => {
      // kill any pending read, file was deleted
      nextReadStart = null;
    });

    watcher.on('change', async (fullPath, stats) => {
      const previousFileSize = currentFileSize;
      currentFileSize = stats.size;
      if (!nextReadStart && currentFileSize > previousFileSize) {
        nextReadStart = previousFileSize;
        processNextRead();
      }
    });

    await timeoutP(maxFileWatchReadyTime, watcherReadyDeferred.promise).catch(() => {
      logger.errorNoRollbar(`Timeout initializing file tail for path ${tailPath}`);
    });
    watcherReadyDeferred = null;

    return { config, watcher, transform, tailPath };
  };

  const toFileTailByIds = async (tailConfigs, oldById) => {
    const newById = new Map();
    await forEachSerialP(async (config) => {
      if (config.delimiter && config.byteLength) {
        logger.errorNoRollbar(`Error initializing file tail for path ${config.path}: cannot parse by both byteLength and delimiter`);
        return;
      }

      let tailTuple = oldById && oldById.get(config.tailId);
      if (tailTuple && !equals(tailTuple.config, config)) {
        await closeTail(tailTuple);
        tailTuple = null;
      }
      if (!tailTuple) {
        tailTuple = await buildFileTailWatcher(config);
      }
      newById.set(config.tailId, tailTuple);
    }, tailConfigs);
    return newById;
  };

  const initialize = async (fileTailConfigs, onTailFire) => {
    if (state.onTailFire) { throw new Error('Initialize has already been called'); }
    fileTailConfigs = FileTailConfigs(fileTailConfigs);
    t.Function(onTailFire);

    state.onTailFire = onTailFire;
    state.fileTailById = await toFileTailByIds(fileTailConfigs);
  };

  const update = async (fileTailConfigs) => {
    if (!state.onTailFire) { throw new Error('File tail manager must be initialized first'); }
    fileTailConfigs = FileTailConfigs(fileTailConfigs);

    const oldById = state.fileTailById;
    state.fileTailById = await toFileTailByIds(fileTailConfigs, oldById);

    const closing = [];
    oldById.forEach((tailTuple, tailId) => {
      if (state.fileTailById.has(tailId)) { return; }
      closing.push(closeTail(tailTuple));
    });
    return Promise.all(closing);
  };

  const shutdown = () => {
    const closing = [];
    state.fileTailById.forEach((tailTuple) => {
      closing.push(closeTail(tailTuple));
    });
    resetTo(stateDefault, state);
    return Promise.all(closing);
  };

  return {
    // :: (FileTailConfigs, (FiredTrigger -> *)) -> Promise<Nil>
    initialize,

    // :: FileTailConfigs -> Promise<Nil>
    update,

    // SE: State is reset to default, manager will need to be reinitialized
    // :: -> Nil
    shutdown
  };

};

// :: () -> FileTailManager
export default FileTailManager;
