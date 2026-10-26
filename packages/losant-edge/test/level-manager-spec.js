import { tk } from './common.js';
import { ClassicLevel } from 'classic-level';
import LevelManager from '../src/level/manager.js';
import path from 'node:path';
import fs from 'fs-extra';

const BASE_PATH = './store-db';
const LEVEL_PATH = path.resolve('store-db', '123412341234123412341234');

describe('Edge Level Db Manager', function() {

  beforeEach(async () => {
    await fs.ensureDir(LEVEL_PATH);
    await fs.emptyDir(LEVEL_PATH);
  });

  afterEach(async () => {
    await fs.remove(BASE_PATH);
  });

  it('should move files to a new folder when level db is corrupted', async () => {
    const now = Date.now();
    tk.freeze(now);
    const levelDb = new ClassicLevel(LEVEL_PATH);
    await levelDb.open();
    await levelDb.put('!global!key', 'foo');
    await levelDb.close();
    await fs.outputFile(path.join(LEVEL_PATH, '000005.ldb'), 'alkdjafoekjaeoifajwoefajoe;oirajwei;faoejoiafwszf');
    await fs.outputFile(path.join(LEVEL_PATH, 'LOCK'), 'hello!');
    await fs.outputFile(path.join(LEVEL_PATH, 'CURRENT'), 'hello!');
    const levelManager = LevelManager({
      basePath: BASE_PATH,
      path: LEVEL_PATH
    });

    await levelManager.initialize();
    await levelManager.shutdown();
    (await fs.pathExists(`${LEVEL_PATH}_corrupted_${now}`)).should.equal(true);
  });

  it('should persist key value store data across restarts', async () => {
    const first = LevelManager({ basePath: BASE_PATH, path: LEVEL_PATH });
    await first.initialize();
    await first.keyValueStore.set('app', 'flow', 'key', 'value');
    await first.shutdown();

    const second = LevelManager({ basePath: BASE_PATH, path: LEVEL_PATH });
    await second.initialize();
    (await second.keyValueStore.get('app', 'flow', 'key')).should.equal('value');
    await second.shutdown();
  });

  it('should initialize stores after recovering from a corrupted level db', async () => {
    const levelDb = new ClassicLevel(LEVEL_PATH);
    await levelDb.open();
    await levelDb.put('!global!key', 'foo');
    await levelDb.close();
    await fs.outputFile(path.join(LEVEL_PATH, '000005.ldb'), 'alkdjafoekjaeoifajwoefajoe;oirajwei;faoejoiafwszf');
    await fs.outputFile(path.join(LEVEL_PATH, 'LOCK'), 'hello!');
    await fs.outputFile(path.join(LEVEL_PATH, 'CURRENT'), 'hello!');

    const recovered = LevelManager({ basePath: BASE_PATH, path: LEVEL_PATH });
    await recovered.initialize();
    await recovered.keyValueStore.set('app', 'flow', 'key', 'value');
    await recovered.shutdown();

    const restarted = LevelManager({ basePath: BASE_PATH, path: LEVEL_PATH });
    await restarted.initialize();
    (await restarted.keyValueStore.get('app', 'flow', 'key')).should.equal('value');
    await restarted.shutdown();
  });
});
