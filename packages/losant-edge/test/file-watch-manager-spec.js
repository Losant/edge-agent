import { sinon, restoreEnv } from './common.js';
import { createTmpDir } from 'losant-nodejs-utils/src/utils/fs-tmp-utils.js';
import fs from 'fs-extra';
import path from 'node:path';
import { sleep } from 'omnibelt';
import FileWatchManager from '../src/file-watch-manager.js';
import FiredTrigger from '../src/types/fired-trigger.js';

describe('Edge File Watch Manager', function() {
  let fileWatchManager, tempDirPath, triggers = [];

  restoreEnv('MAX_FILE_WATCH_READY_TIME');

  const onTrigger = async (triggerFire) => {
    triggers.push(triggerFire);
    await sleep(100);
  };

  const waitForTriggerCount = async (count) => {
    if (triggers.length >= count) { return; }
    await sleep(100);
    return waitForTriggerCount(count);
  };
  const validateTriggers = (expectedTriggers) => {
    triggers.length.should.deepEqual(expectedTriggers.length);
    for (let i = 0; i < triggers.length; i++) {
      triggers[i].should.deepEqual(expectedTriggers[i]);
    }
  };
  beforeEach(async () => {
    tempDirPath = await createTmpDir();
  });

  afterEach(async () => {
    triggers = [];
    if (fileWatchManager) {
      await fileWatchManager.shutdown();
      fileWatchManager = null;
    }
    await fs.remove(tempDirPath);
  });

  it('should trigger on file watch events', async () => {
    fileWatchManager = FileWatchManager();
    await fs.mkdirp(path.resolve(tempDirPath, 'c'));
    await fileWatchManager.initialize([
      { watchId: 'anId1', path: tempDirPath, fileAdded: true },
      { watchId: 'anId4', path: tempDirPath, directoryAdded: true }
    ], onTrigger);
    await sleep(100);
    await fs.mkdirp(path.resolve(tempDirPath, 'a'));
    await waitForTriggerCount(1);
    await fs.outputFile(path.resolve(tempDirPath, 'a', 'hi.txt'), 'what1');
    await waitForTriggerCount(2);

    await fileWatchManager.update([
      { watchId: 'anId2', path: tempDirPath, fileChanged: true },
      { watchId: 'anId3', path: tempDirPath, fileRemoved: true },
      { watchId: 'anId5', path: tempDirPath, directoryRemoved: true }
    ]);
    await sleep(100);
    await fs.outputFile(path.resolve(tempDirPath, 'a', 'hi.txt'), 'what2');
    await waitForTriggerCount(3);
    await fs.remove(path.resolve(tempDirPath, 'a'));
    await waitForTriggerCount(5);

    // on arm the file and directory removed triggers are reversed order
    triggers.should.be.oneOf([
      FiredTrigger({
        triggerId: 'anId4',
        triggerType: 'fileWatch',
        payload: {
          time: triggers[0].payload.time,
          data: {
            event: 'directoryAdded',
            fullPath: path.resolve(tempDirPath, 'a'),
            pathParts: {
              dir: tempDirPath,
              base: 'a',
              ext: '',
              name: 'a'
            },
            stats: {
              createdAt: triggers[0].payload.data.stats.createdAt,
              modifiedAt: triggers[0].payload.data.stats.modifiedAt,
              size: triggers[0].payload.data.stats.size
            }
          }
        }
      }),
      FiredTrigger({
        triggerId: 'anId1',
        triggerType: 'fileWatch',
        payload: {
          time: triggers[1].payload.time,
          data: {
            event: 'fileAdded',
            fullPath: path.resolve(tempDirPath, 'a', 'hi.txt'),
            pathParts: {
              dir: path.resolve(tempDirPath, 'a'),
              base: 'hi.txt',
              ext: '.txt',
              name: 'hi'
            },
            stats: {
              createdAt: triggers[1].payload.data.stats.createdAt,
              modifiedAt: triggers[1].payload.data.stats.modifiedAt,
              size: triggers[1].payload.data.stats.size
            }
          }
        }
      }),
      FiredTrigger({
        triggerId: 'anId2',
        triggerType: 'fileWatch',
        payload: {
          time: triggers[2].payload.time,
          data: {
            event: 'fileChanged',
            fullPath: path.resolve(tempDirPath, 'a', 'hi.txt'),
            pathParts: {
              dir: path.resolve(tempDirPath, 'a'),
              base: 'hi.txt',
              ext: '.txt',
              name: 'hi'
            },
            stats: {
              createdAt: triggers[2].payload.data.stats.createdAt,
              modifiedAt: triggers[2].payload.data.stats.modifiedAt,
              size: triggers[2].payload.data.stats.size
            }
          }
        }
      }),
      FiredTrigger({
        triggerId: 'anId3',
        triggerType: 'fileWatch',
        payload: {
          time: triggers[3].payload.time,
          data: {
            event: 'fileRemoved',
            fullPath: path.resolve(tempDirPath, 'a', 'hi.txt'),
            pathParts: {
              dir: path.resolve(tempDirPath, 'a'),
              base: 'hi.txt',
              ext: '.txt',
              name: 'hi'
            },
            stats: { }
          }
        }
      }),
      FiredTrigger({
        triggerId: 'anId5',
        triggerType: 'fileWatch',
        payload: {
          time: triggers[4].payload.time,
          data: {
            event: 'directoryRemoved',
            fullPath: path.resolve(tempDirPath, 'a'),
            pathParts: {
              dir: tempDirPath,
              base: 'a',
              ext: '',
              name: 'a'
            },
            stats: { }
          }
        }
      })
    ], [
      FiredTrigger({
        triggerId: 'anId4',
        triggerType: 'fileWatch',
        payload: {
          time: triggers[0].payload.time,
          data: {
            event: 'directoryAdded',
            fullPath: path.resolve(tempDirPath, 'a'),
            pathParts: {
              dir: tempDirPath,
              base: 'a',
              ext: '',
              name: 'a'
            },
            stats: {
              createdAt: triggers[0].payload.data.stats.createdAt,
              modifiedAt: triggers[0].payload.data.stats.modifiedAt,
              size: triggers[0].payload.data.stats.size
            }
          }
        }
      }),
      FiredTrigger({
        triggerId: 'anId1',
        triggerType: 'fileWatch',
        payload: {
          time: triggers[1].payload.time,
          data: {
            event: 'fileAdded',
            fullPath: path.resolve(tempDirPath, 'a', 'hi.txt'),
            pathParts: {
              dir: path.resolve(tempDirPath, 'a'),
              base: 'hi.txt',
              ext: '.txt',
              name: 'hi'
            },
            stats: {
              createdAt: triggers[1].payload.data.stats.createdAt,
              modifiedAt: triggers[1].payload.data.stats.modifiedAt,
              size: triggers[1].payload.data.stats.size
            }
          }
        }
      }),
      FiredTrigger({
        triggerId: 'anId2',
        triggerType: 'fileWatch',
        payload: {
          time: triggers[2].payload.time,
          data: {
            event: 'fileChanged',
            fullPath: path.resolve(tempDirPath, 'a', 'hi.txt'),
            pathParts: {
              dir: path.resolve(tempDirPath, 'a'),
              base: 'hi.txt',
              ext: '.txt',
              name: 'hi'
            },
            stats: {
              createdAt: triggers[2].payload.data.stats.createdAt,
              modifiedAt: triggers[2].payload.data.stats.modifiedAt,
              size: triggers[2].payload.data.stats.size
            }
          }
        }
      }),
      FiredTrigger({
        triggerId: 'anId5',
        triggerType: 'fileWatch',
        payload: {
          time: triggers[3].payload.time,
          data: {
            event: 'directoryRemoved',
            fullPath: path.resolve(tempDirPath, 'a'),
            pathParts: {
              dir: tempDirPath,
              base: 'a',
              ext: '',
              name: 'a'
            },
            stats: { }
          }
        }
      }),
      FiredTrigger({
        triggerId: 'anId3',
        triggerType: 'fileWatch',
        payload: {
          time: triggers[4].payload.time,
          data: {
            event: 'fileRemoved',
            fullPath: path.resolve(tempDirPath, 'a', 'hi.txt'),
            pathParts: {
              dir: path.resolve(tempDirPath, 'a'),
              base: 'hi.txt',
              ext: '.txt',
              name: 'hi'
            },
            stats: { }
          }
        }
      })
    ]);

  });

  it('should trigger on file watch events with globs', async () => {
    fileWatchManager = FileWatchManager();

    await fileWatchManager.initialize([
      { watchId: 'anId1', path: `${tempDirPath}/**/*`, fileAdded: true, directoryAdded: true }
    ], onTrigger);
    await sleep(100);
    await fs.mkdirp(path.resolve(tempDirPath, 'a'));
    await waitForTriggerCount(1);
    await fs.outputFile(path.resolve(tempDirPath, 'a', 'hello.txt'), 'what1');
    await waitForTriggerCount(2);
    await fileWatchManager.update([
      {
        watchId: 'anId1', path: `${tempDirPath}/**/*`, fileAdded: true, directoryAdded: true, fileChanged: true, directoryRemoved: true, fileRemoved: true
      }
    ]);
    await sleep(100);
    await fs.mkdirp(path.resolve(tempDirPath, 'b'));
    await fs.outputFile(path.resolve(tempDirPath, 'b', 'hi.txt'), 'what2');
    await waitForTriggerCount(4);
    await fs.remove(path.resolve(tempDirPath, 'a', 'hello.txt'));
    await fs.remove(path.resolve(tempDirPath, 'a'));
    await waitForTriggerCount(6);
    // on arm the file and directory removed triggers are reversed order
    const expectedTriggers = [
      FiredTrigger({
        triggerId: 'anId1',
        triggerType: 'fileWatch',
        payload: {
          time: triggers[0].payload.time,
          data: {
            event: 'directoryAdded',
            fullPath: path.resolve(tempDirPath, 'a'),
            pathParts: {
              dir: tempDirPath,
              base: 'a',
              ext: '',
              name: 'a'
            },
            stats: {
              createdAt: triggers[0].payload.data.stats.createdAt,
              modifiedAt: triggers[0].payload.data.stats.modifiedAt,
              size: triggers[0].payload.data.stats.size
            }
          }
        }
      }),
      FiredTrigger({
        triggerId: 'anId1',
        triggerType: 'fileWatch',
        payload: {
          time: triggers[1].payload.time,
          data: {
            event: 'fileAdded',
            fullPath: path.resolve(tempDirPath, 'a', 'hello.txt'),
            pathParts: {
              dir: path.resolve(tempDirPath, 'a'),
              base: 'hello.txt',
              ext: '.txt',
              name: 'hello'
            },
            stats: {
              createdAt: triggers[1].payload.data.stats.createdAt,
              modifiedAt: triggers[1].payload.data.stats.modifiedAt,
              size: triggers[1].payload.data.stats.size
            }
          }
        }
      }),
      FiredTrigger({
        triggerId: 'anId1',
        triggerType: 'fileWatch',
        payload: {
          time: triggers[2].payload.time,
          data: {
            event: 'directoryAdded',
            fullPath: path.resolve(tempDirPath, 'b'),
            pathParts: {
              dir: tempDirPath,
              base: 'b',
              ext: '',
              name: 'b'
            },
            stats: {
              createdAt: triggers[2].payload.data.stats.createdAt,
              modifiedAt: triggers[2].payload.data.stats.modifiedAt,
              size: triggers[2].payload.data.stats.size
            }
          }
        }
      }),
      FiredTrigger({
        triggerId: 'anId1',
        triggerType: 'fileWatch',
        payload: {
          time: triggers[3].payload.time,
          data: {
            event: 'fileAdded',
            fullPath: path.resolve(tempDirPath, 'b', 'hi.txt'),
            pathParts: {
              dir: path.resolve(tempDirPath, 'b'),
              base: 'hi.txt',
              ext: '.txt',
              name: 'hi'
            },
            stats: {
              createdAt: triggers[3].payload.data.stats.createdAt,
              modifiedAt: triggers[3].payload.data.stats.modifiedAt,
              size: triggers[3].payload.data.stats.size
            }
          }
        }
      }),
      FiredTrigger({
        triggerId: 'anId1',
        triggerType: 'fileWatch',
        payload: {
          time: triggers[4].payload.time,
          data: {
            event: 'directoryRemoved',
            fullPath: path.resolve(tempDirPath, 'a'),
            pathParts: {
              dir: tempDirPath,
              base: 'a',
              ext: '',
              name: 'a'
            },
            stats: {}
          }
        }
      }),
      FiredTrigger({
        triggerId: 'anId1',
        triggerType: 'fileWatch',
        payload: {
          time: triggers[5].payload.time,
          data: {
            event: 'fileRemoved',
            fullPath: path.resolve(tempDirPath, 'a', 'hello.txt'),
            pathParts: {
              dir: path.resolve(tempDirPath, 'a'),
              base: 'hello.txt',
              ext: '.txt',
              name: 'hello'
            },
            stats: {}
          }
        }
      })
    ];
    validateTriggers(expectedTriggers);

  });

  it('should trigger on file watch events with globs for *.js', async () => {
    fileWatchManager = FileWatchManager();

    await fileWatchManager.initialize([
      { watchId: 'anId1', path: `${tempDirPath}/**/*.js`, fileAdded: true, fileChanged: true, fileRemoved: true }
    ], onTrigger);
    await sleep(100);
    await fs.outputFile(path.resolve(tempDirPath, 'foo.txt'), 'what1');
    await fs.mkdirp(path.resolve(tempDirPath, 'a'));
    await fs.outputFile(path.resolve(tempDirPath, 'a', 'hello.js'), 'what1');
    await waitForTriggerCount(1);

    const expectedTriggers = [
      FiredTrigger({
        triggerId: 'anId1',
        triggerType: 'fileWatch',
        payload: {
          time: triggers[0].payload.time,
          data: {
            event: 'fileAdded',
            fullPath: path.resolve(tempDirPath, 'a', 'hello.js'),
            pathParts: {
              dir: path.resolve(tempDirPath, 'a'),
              base: 'hello.js',
              ext: '.js',
              name: 'hello'
            },
            stats: {
              createdAt: triggers[0].payload.data.stats.createdAt,
              modifiedAt: triggers[0].payload.data.stats.modifiedAt,
              size: triggers[0].payload.data.stats.size
            }
          }
        }
      })
    ];
    validateTriggers(expectedTriggers);
  });

  it('should trigger on matching directories with a suffix of foo', async () => {
    fileWatchManager = FileWatchManager();
    await fs.ensureDir(path.resolve(tempDirPath, 'd', 'e'));
    await fileWatchManager.initialize([
      { watchId: 'anId1', path: `${tempDirPath}/d/e/*foo`, directoryAdded: true, directoryRemoved: true }
    ], onTrigger);
    await sleep(100);
    await fs.ensureDir(path.resolve(`${tempDirPath}/d/e/`, 'oneBar'));
    await fs.ensureDir(path.resolve(`${tempDirPath}/d/e/`, 'onefoo'));
    await waitForTriggerCount(1);

    const expectedTriggers = [
      FiredTrigger({
        triggerId: 'anId1',
        triggerType: 'fileWatch',
        payload: {
          time: triggers[0].payload.time,
          data: {
            event: 'directoryAdded',
            fullPath: path.resolve(tempDirPath, 'd', 'e', 'onefoo'),
            pathParts: {
              dir: path.resolve(tempDirPath, 'd', 'e'),
              base: 'onefoo',
              ext: '',
              name: 'onefoo'
            },
            stats: {
              createdAt: triggers[0].payload.data.stats.createdAt,
              modifiedAt: triggers[0].payload.data.stats.modifiedAt,
              size: triggers[0].payload.data.stats.size
            }
          }
        }
      })
    ];
    validateTriggers(expectedTriggers);
  });

  it('should honor MAX_FILE_WATCH_READY_TIME when waiting for a watcher to be ready', async () => {
    process.env.MAX_FILE_WATCH_READY_TIME = '7777';
    const { default: FreshFileWatchManager } = await import(`../src/file-watch-manager.js?readyTime=${Date.now()}`);
    const setTimeoutSpy = sinon.spy(globalThis, 'setTimeout');
    fileWatchManager = FreshFileWatchManager();
    await fileWatchManager.initialize([{ watchId: 'anId1', path: tempDirPath, fileAdded: true }], onTrigger);
    setTimeoutSpy.args.map((args) => args[1]).should.containEql(7777);
  });
});
