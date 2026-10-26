import { defer, pick, timeoutP, forEachSerialP, F, T } from 'omnibelt';
import { resolve as pathResolve, parse as pathParse } from 'node:path';
import t from 'tcomb';
import { watch as chokidarWatch } from 'chokidar';
import { resetTo, clampPositiveEnv } from './utils.js';
import logger from './logger/index.js';
import FileWatchConfigs from './types/file-watch-configs.js';
import FiredTrigger from './types/fired-trigger.js';
import isGlob from 'is-glob';
import globParent from 'glob-parent';
import anymatch from 'anymatch';

const maxFileWatchReadyTime = clampPositiveEnv('MAX_FILE_WATCH_READY_TIME', 60000);

const eventMapping = {
  add: 'fileAdded',
  addDir: 'directoryAdded',
  change: 'fileChanged',
  unlink: 'fileRemoved',
  unlinkDir: 'directoryRemoved'
};

const stateDefault = () => ({
  onWatchFire: null,
  watchersByPath: new Map() // Map<filePath, { watcher, matchingConfigs }>
});

const FileWatchManager = () => {
  const state = stateDefault();

  const closeWatcher = async (watcher, watchPath) => {
    try {
      watcher.close();
      watcher.removeAllListeners();
    } catch { }
    logger.info(`No longer watching for changes on path ${watchPath}`);
  };

  const buildFileWatcher = async (watchPath) => {
    let watcherReadyDeferred = defer();
    let watchDirectory = watchPath;
    let ignoredFunc = F;
    let hasMatch = T;
    if (isGlob(watchDirectory)) {
      watchDirectory = globParent(watchDirectory);
      hasMatch = anymatch([ watchDirectory, watchPath ], null, { dot: true });
      ignoredFunc = (path, stats) => {
        return !!stats?.isFile() && !hasMatch(path);
      };
    }
    const watcher = chokidarWatch(watchDirectory, {
      ignoreInitial: true,
      usePolling: true, // needed for docker mounts
      alwaysStat: true,
      ignorePermissionErrors: true,
      ignored: ignoredFunc
    });

    // It is unclear what triggers this error event, so handle the
    // various scenarios where it could fire on start or while watching
    watcher.on('error', (err) => {
      if (watcherReadyDeferred) {
        watcherReadyDeferred.resolve();
        logger.errorNoRollbar(`Error initializing file watcher for path ${watchPath} - ${err.name}: ${err.message}`);
      } else {
        logger.warn(`Error in file watcher while watching path ${watchPath} - ${err.name}: ${err.message}`);
      }
    });

    watcher.once('ready', () => {
      watcher.on('all', async (event, fullPath, stats) => {
        const watcherPair = state.watchersByPath.get(watchPath);
        if (!watcherPair) { return; }
        if (!stats?.isFile() && !hasMatch(fullPath)) { return; }

        const now = new Date();
        const mappedEvent = eventMapping[event];
        const pathParts = pick(['dir', 'base', 'ext', 'name'], pathParse(fullPath));
        stats = stats ? {
          createdAt: stats.birthtime,
          modifiedAt: stats.mtime,
          size: stats.size
        } : { };

        await Promise.all(watcherPair.matchingConfigs.map((watchConfig) => {
          if (!watchConfig[mappedEvent]) { return; }

          return state.onWatchFire(FiredTrigger({
            triggerId: watchConfig.watchId,
            triggerType: 'fileWatch',
            payload: {
              time: now,
              data: {
                event: mappedEvent,
                fullPath,
                pathParts,
                stats
              }
            }
          }));
        }));
      });

      if (watcherReadyDeferred) {
        watcherReadyDeferred.resolve();
        logger.info(`Now watching for changes on path ${watchPath}`);
      }
    });

    await timeoutP(maxFileWatchReadyTime, watcherReadyDeferred.promise).catch(() => {
      logger.errorNoRollbar(`Timeout initializing file watcher for path ${watchPath}`);
    });
    watcherReadyDeferred = null;

    return watcher;
  };

  const toWatchersByPath = async (watchConfigs, oldByPath) => {
    const newByPath = new Map();
    await forEachSerialP(async (config) => {
      const fullPath = pathResolve(config.path);
      let watcherPair = newByPath.get(fullPath);
      if (!watcherPair) {
        const oldWatcherPair = oldByPath && oldByPath.get(fullPath);
        watcherPair = {
          watcher: oldWatcherPair ? oldWatcherPair.watcher : await buildFileWatcher(fullPath),
          matchingConfigs: []
        };
        newByPath.set(fullPath, watcherPair);
      }
      watcherPair.matchingConfigs.push(config);

    }, watchConfigs);
    return newByPath;
  };

  const initialize = async (fileWatchConfigs, onWatchFire) => {
    if (state.onWatchFire) { throw new Error('Initialize has already been called'); }
    fileWatchConfigs = FileWatchConfigs(fileWatchConfigs);
    t.Function(onWatchFire);

    state.onWatchFire = onWatchFire;
    state.watchersByPath = await toWatchersByPath(fileWatchConfigs);
  };

  const update = async (fileWatchConfigs) => {
    if (!state.onWatchFire) { throw new Error('File watch manager must be initialized first'); }
    fileWatchConfigs = FileWatchConfigs(fileWatchConfigs);

    const oldByPath = state.watchersByPath;
    state.watchersByPath = await toWatchersByPath(fileWatchConfigs, oldByPath);

    // close now unused watchers
    const closing = [];
    oldByPath.forEach(({ watcher }, fullPath) => {
      if (state.watchersByPath.has(fullPath)) { return; }
      closing.push(closeWatcher(watcher, fullPath));
    });
    return Promise.all(closing);
  };

  const shutdown = () => {
    const closing = [];
    state.watchersByPath.forEach(({ watcher }, fullPath) => {
      closing.push(closeWatcher(watcher, fullPath));
    });
    resetTo(stateDefault, state);
    return Promise.all(closing);
  };

  return {
    // :: (FileWatchConfigs, (FiredTrigger -> *)) -> Promise<Nil>
    initialize,

    // :: FileWatchConfigs -> Promise<Nil>
    update,

    // SE: State is reset to default, manager will need to be reinitialized
    // :: -> Nil
    shutdown
  };

};

// :: () -> FileWatchManager
export default FileWatchManager;
