import { curry } from 'omnibelt';
import fs from 'fs-extra';
import logger from '../logger/index.js';
import { ClassicLevel } from 'classic-level';
import t from 'tcomb';
import { configErrorFromException } from '../lib/configuration-error.js';
import {
  PromiseType,
  LevelManagerConf,
  LevelDb,
  LevelDbPath,
  MqttStoreType,
  GlobalStoreType,
  KeyValueStoreType
} from '../types/index.js';
import KeyValueStore from './key-value-store.js';
import GlobalStore from './global-store.js';
import MqttStore from './mqtt-store.js';

const LevelManagerType = t.struct({
  isOpen: t.func([], t.Boolean),
  isClosed: t.func([], t.Boolean),
  initialize: t.func([], PromiseType), // Nil
  shutdown: t.func([], PromiseType), // Nil
  reset: t.func([], t.Object),
  mqttIncomingStore: MqttStoreType,
  mqttOutgoingStore: MqttStoreType,
  globalStore: GlobalStoreType,
  keyValueStore: KeyValueStoreType,
  db: LevelDb,
  dbPath: LevelDbPath
}, {
  name: 'LevelManagerType',
  strict: true
});

// :: LevelManagerConf -> Error -> LosantAgentConfigurationError
const levelConfigError = curry(({ basePath }, exception) =>
  configErrorFromException(exception, `initialize persistent store at path ${basePath}`)
);

const LevelManagerFunc = t.func([LevelManagerConf], LevelManagerType);
const LevelManager = LevelManagerFunc.of((conf) => {

  try {
    fs.mkdirpSync(conf.path);
  } catch (e) {
    throw levelConfigError(conf, e);
  }

  const levelDb = new ClassicLevel(conf.path);

  const createStore = (name, storeConstructor) => {
    const scopedDb = levelDb.sublevel(name);
    return storeConstructor(scopedDb);
  };

  const stores = {
    mqttIncomingStore: createStore('incoming', MqttStore),
    mqttOutgoingStore: createStore('outgoing', MqttStore),
    globalStore: createStore('global', GlobalStore),
    keyValueStore: createStore('keyValue', KeyValueStore)
  };

  const isOpen = () => { return levelDb.status === 'open'; };
  const isClosed = () => { return levelDb.status === 'closed'; };

  const initializeStores = async () => {
    await stores.keyValueStore.initialize();
    await stores.globalStore.initialize();
    await stores.mqttIncomingStore.initialize();
    await stores.mqttOutgoingStore.initialize();
  };

  const initialize = async () => {
    if (isOpen()) { return; }
    try {
      await levelDb.open();
    } catch (err) {
      if (err.code === 'LEVEL_DATABASE_NOT_OPEN') {
        logger.warn(`Persistent Storage Open Error: ${err.message}`);
        if (err.cause?.code === 'LEVEL_CORRUPTION') {
          const failedPath = `${conf.path}_corrupted_${Date.now()}`;
          logger.error(`Moving bad level db files to ${failedPath}`);
          try {
            await fs.move(conf.path, failedPath);
            await fs.ensureDir(conf.path);
            await levelDb.open();
            await initializeStores();
            return;
          } catch (e) {
            throw levelConfigError(conf, e);
          }
        }
      }
      throw levelConfigError(conf, err);
    }
    await levelDb.open();
    await initializeStores();
  };

  const shutdown = async () => {
    if (isClosed()) { return; }
    await stores.keyValueStore.shutdown();
    await levelDb.close();
  };

  const reset = async () => {
    const wasOpen = isOpen();
    if (wasOpen) { await shutdown(); }
    await fs.remove(conf.path);
    if (wasOpen) { await initialize(); }
  };

  return {
    isOpen,
    isClosed,
    initialize,
    shutdown,
    reset,
    get mqttIncomingStore() { return stores.mqttIncomingStore; },
    get mqttOutgoingStore() { return stores.mqttOutgoingStore; },
    get globalStore() { return stores.globalStore; },
    get keyValueStore() { return stores.keyValueStore; },
    get db() { return levelDb; },
    get dbPath() { return conf.path; }
  };
});

export default LevelManager;
