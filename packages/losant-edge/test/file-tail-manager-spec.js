import { stubLogger, sinon, restoreEnv } from './common.js';
import { createTmpDir } from 'losant-nodejs-utils/src/utils/fs-tmp-utils.js';
import fs from 'fs-extra';
import path from 'node:path';
import { sleep } from 'omnibelt';
import FileTailManager from '../src/file-tail-manager.js';
import FiredTrigger from '../src/types/fired-trigger.js';

describe('Edge File Tail Manager', function() {
  let fileTailManager;
  let tempDirPath;

  restoreEnv('MAX_FILE_WATCH_READY_TIME');

  beforeEach(async () => {
    tempDirPath = await createTmpDir();
  });

  afterEach(async () => {
    await fs.remove(tempDirPath);
  });

  afterEach(async () => {
    if (fileTailManager) {
      await fileTailManager.shutdown();
      fileTailManager = null;
    }
  });

  it('should trigger on file tail events', async () => {
    const tempFileName = 'tailTester.txt';
    const tempFilePath = path.resolve(tempDirPath, tempFileName);
    const tempFileName2 = 'tailTester22.txt';
    const tempFilePath2 = path.resolve(tempDirPath, tempFileName2);
    const triggers = [];
    fileTailManager = FileTailManager();

    fs.appendFileSync(tempFilePath, 'some initial text for file1 \n');
    fs.appendFileSync(tempFilePath2, 'some initial text for file2 \n');

    await fileTailManager.initialize([
      { tailId: 'anId1', path: tempFilePath },
      { tailId: 'anId4', path: tempFilePath2 }
    ], async (triggerFire) => {
      triggers.push(triggerFire);
      await sleep(0);
    });

    const testTextFile1 = 'some text for file1';
    const testTextFile2 = 'some text for file2';
    fs.appendFileSync(tempFilePath, `${testTextFile1}\n`);
    while (triggers.length < 1) { await sleep(0); } // eslint-disable-line no-await-in-loop
    fs.appendFileSync(tempFilePath2, `${testTextFile2}\n`);
    while (triggers.length < 2) { await sleep(0); } // eslint-disable-line no-await-in-loop

    triggers.should.deepEqual([
      FiredTrigger({
        triggerId: 'anId1',
        triggerType: 'fileTail',
        payload: {
          time: triggers[0].payload.time,
          data: {
            contents: testTextFile1,
            path: tempFilePath
          }
        }
      }),
      FiredTrigger({
        triggerId: 'anId4',
        triggerType: 'fileTail',
        payload: {
          time: triggers[1].payload.time,
          data: {
            contents: testTextFile2,
            path: tempFilePath2
          }
        }
      })
    ]);
  });

  it('should correctly deal with files that start empty', async () => {
    const triggers = [];
    const file1Path = path.resolve(tempDirPath, 'file1.txt');
    const file2Path = path.resolve(tempDirPath, 'file2.txt');

    await fs.ensureFile(file1Path);

    fileTailManager = FileTailManager();

    await fileTailManager.initialize([
      { tailId: 'anId1', path: file1Path },
      { tailId: 'anId2', path: file2Path }
    ], async (triggerFire) => {
      triggers.push(triggerFire);
      await sleep(0);
    });

    await sleep(150);
    await fs.appendFile(file1Path, 'new content \n');
    await fs.ensureFile(file2Path);

    await sleep(150);
    await fs.appendFile(file2Path, 'other new content \n');

    while (triggers.length < 2) { await sleep(0); } // eslint-disable-line no-await-in-loop

    triggers.should.deepEqual([
      FiredTrigger({
        payload: {
          time: triggers[0].payload.time,
          data: { contents: 'new content ', path: file1Path }
        },
        triggerId: 'anId1',
        triggerType: 'fileTail'
      }),
      FiredTrigger({
        payload: {
          time: triggers[1].payload.time,
          data: { contents: 'other new content ', path: file2Path }
        },
        triggerId: 'anId2',
        triggerType: 'fileTail'
      })
    ]);
  });

  it('should correctly deal with files that do not exist', async () => {
    const loggerCalls = stubLogger(['warn', 'error', 'info']);

    const tempFileName = 'tailTester.txt';
    const tempFilePath = path.resolve(tempDirPath, tempFileName);

    const triggers = [];
    fileTailManager = FileTailManager();
    // note: we aren't setting up a file at this path
    await fileTailManager.initialize([
      { tailId: 'anId1', path: tempFilePath }
    ], async (triggerFire) => {
      triggers.push(triggerFire);
      await sleep(0);
    });

    loggerCalls.should.deepEqual([
      ['info', `Now tailing file path ${tempFilePath}`]
    ]);
    loggerCalls.length = 0;

    await sleep(150);
    await fs.appendFile(tempFilePath, 'some initial text for file1 \n');
    await sleep(150);
    await fs.appendFile(tempFilePath, 'some additional text \n');
    while (triggers.length < 1) { await sleep(0); } // eslint-disable-line no-await-in-loop

    triggers.should.deepEqual([
      FiredTrigger({
        payload: {
          time: triggers[0].payload.time,
          data: { contents: 'some additional text ', path: tempFilePath }
        },
        triggerId: 'anId1',
        triggerType: 'fileTail'
      })
    ]);
    triggers.length = 0;

    await fs.unlink(tempFilePath);
    await sleep(150);
    await fs.appendFile(tempFilePath, 'new content \n');
    await sleep(150);
    await fs.appendFile(tempFilePath, 'more content \n');
    while (triggers.length < 1) { await sleep(0); } // eslint-disable-line no-await-in-loop

    triggers.should.deepEqual([
      FiredTrigger({
        payload: {
          time: triggers[0].payload.time,
          data: { contents: 'more content ', path: tempFilePath }
        },
        triggerId: 'anId1',
        triggerType: 'fileTail'
      })
    ]);
  });

  it('should correctly perform a sequence of delimiter reads', async () => {
    const tempFileName = 'tailTester.txt';
    const tempFilePath = path.resolve(tempDirPath, tempFileName);

    await fs.appendFile(tempFilePath, 'First D Second ');

    const triggers = [];
    fileTailManager = FileTailManager();
    await fileTailManager.initialize([
      { tailId: 'anId1', path: tempFilePath, delimiter: 'D' }
    ], async (triggerFire) => {
      triggers.push(triggerFire);
      await sleep(0);
    });

    await fs.appendFile(tempFilePath, 'Second2 D Third ');
    await sleep(50);
    await fs.appendFile(tempFilePath, 'Third2 D Fourth D Fifth D Sixth D ');
    await sleep(50);
    await fs.appendFile(tempFilePath, 'Seventh1 ');
    await sleep(50);
    await fs.appendFile(tempFilePath, 'Seventh2 ');
    await sleep(50);
    await fs.appendFile(tempFilePath, 'Seventh3 ');
    await sleep(50);
    await fs.appendFile(tempFilePath, 'Seventh4 ');
    await sleep(50);
    await fs.appendFile(tempFilePath, 'Seventh5 ');
    await sleep(50);
    await fs.appendFile(tempFilePath, 'DDDD DDD ');
    await sleep(50);
    await fs.appendFile(tempFilePath, 'Final D ');
    await sleep(50);
    await fs.appendFile(tempFilePath, 'Extra ');

    while (triggers.length < 8) { await sleep(0); } // eslint-disable-line no-await-in-loop

    triggers.map((t) => { return t.payload.data.contents; }).should.deepEqual([
      'Second2 ',
      ' Third Third2 ',
      ' Fourth ',
      ' Fifth ',
      ' Sixth ',
      ' Seventh1 Seventh2 Seventh3 Seventh4 Seventh5 ',
      ' ',
      ' Final '
    ]);
  });

  it('should correctly perform a sequence of byte length reads', async () => {
    const tempFileName = 'tailTester.txt';
    const tempFilePath = path.resolve(tempDirPath, tempFileName);

    await fs.appendFile(tempFilePath, '1111122');

    const triggers = [];
    fileTailManager = FileTailManager();
    await fileTailManager.initialize([
      { tailId: 'anId1', path: tempFilePath, byteLength: '5' }
    ], async (triggerFire) => {
      triggers.push(triggerFire);
      await sleep(0);
    });

    await fs.appendFile(tempFilePath, '2222233');
    await sleep(50);
    await fs.appendFile(tempFilePath, '333444445555566666');
    await sleep(50);
    await fs.appendFile(tempFilePath, '7');
    await sleep(50);
    await fs.appendFile(tempFilePath, '7');
    await sleep(50);
    await fs.appendFile(tempFilePath, '7');
    await sleep(50);
    await fs.appendFile(tempFilePath, '7');
    await sleep(50);
    await fs.appendFile(tempFilePath, '7');
    await sleep(50);
    await fs.appendFile(tempFilePath, '88888');
    await sleep(50);
    await fs.appendFile(tempFilePath, '99');

    while (triggers.length < 7) { await sleep(0); } // eslint-disable-line no-await-in-loop

    triggers.map((t) => { return t.payload.data.contents; }).should.deepEqual([
      '22222',
      '33333',
      '44444',
      '55555',
      '66666',
      '77777',
      '88888'
    ]);
  });

  it('should correctly work with changing configs', async () => {
    const triggers = [];
    const file1Path = path.resolve(tempDirPath, 'file1.txt');
    const file2Path = path.resolve(tempDirPath, 'file2.txt');
    const file3Path = path.resolve(tempDirPath, 'file3.txt');
    const file4Path = path.resolve(tempDirPath, 'file4.txt');

    fileTailManager = FileTailManager();

    fs.appendFileSync(file1Path, 'initial content file 1');
    fs.appendFileSync(file2Path, 'initial content file 2');
    fs.appendFileSync(file3Path, 'initial content file 3');
    fs.appendFileSync(file4Path, 'initial content file 4');

    await fileTailManager.initialize([
      { tailId: 'anId1', path: file1Path, delimiter: 'A' },
      { tailId: 'anId2', path: file2Path, delimiter: 'B' },
      { tailId: 'anId3', path: file3Path, encoding: 'hex' }
    ], async (triggerFire) => {
      triggers.push(triggerFire);
      await sleep(0);
    });

    fs.appendFileSync(file1Path, 'file 1 append A');
    while (triggers.length < 1) { await sleep(0); } // eslint-disable-line no-await-in-loop
    fs.appendFileSync(file2Path, 'file 2 append B');
    while (triggers.length < 2) { await sleep(0); } // eslint-disable-line no-await-in-loop
    fs.appendFileSync(file3Path, 'file 3 append \n');
    fs.appendFileSync(file4Path, 'file 4 append \n');
    while (triggers.length < 3) { await sleep(0); } // eslint-disable-line no-await-in-loop

    triggers.should.deepEqual([
      FiredTrigger({
        triggerId: 'anId1',
        triggerType: 'fileTail',
        payload: {
          time: triggers[0].payload.time,
          data: {
            contents: 'file 1 append ',
            path: path.resolve(tempDirPath, 'file1.txt')
          }
        }
      }),
      FiredTrigger({
        triggerId: 'anId2',
        triggerType: 'fileTail',
        payload: {
          time: triggers[1].payload.time,
          data: {
            contents: 'file 2 append ',
            path: path.resolve(tempDirPath, 'file2.txt')
          }
        }
      }),
      FiredTrigger({
        triggerId: 'anId3',
        triggerType: 'fileTail',
        payload: {
          time: triggers[2].payload.time,
          data: {
            contents: Buffer.from('file 3 append ').toString('hex'),
            path: path.resolve(tempDirPath, 'file3.txt')
          }
        }
      })
    ]);

    triggers.length = 0;
    await fileTailManager.update([
      { tailId: 'anId1', path: file1Path, delimiter: 'A' },
      { tailId: 'anId2', path: file2Path, delimiter: 'C' },
      { tailId: 'anId4', path: file4Path }
    ], async (triggerFire) => {
      triggers.push(triggerFire);
      await sleep(0);
    });

    fs.appendFileSync(file1Path, 'file 1 append 2 A');
    while (triggers.length < 1) { await sleep(0); } // eslint-disable-line no-await-in-loop
    fs.appendFileSync(file2Path, 'file 2 append 2 C');
    while (triggers.length < 2) { await sleep(0); } // eslint-disable-line no-await-in-loop
    fs.appendFileSync(file3Path, 'file 3 append 2\n');
    fs.appendFileSync(file4Path, 'file 4 append 2\n');
    while (triggers.length < 3) { await sleep(0); } // eslint-disable-line no-await-in-loop

    triggers.should.deepEqual([
      FiredTrigger({
        triggerId: 'anId1',
        triggerType: 'fileTail',
        payload: {
          time: triggers[0].payload.time,
          data: {
            contents: 'file 1 append 2 ',
            path: path.resolve(tempDirPath, 'file1.txt')
          }
        }
      }),
      FiredTrigger({
        triggerId: 'anId2',
        triggerType: 'fileTail',
        payload: {
          time: triggers[1].payload.time,
          data: {
            contents: 'file 2 append 2 ',
            path: path.resolve(tempDirPath, 'file2.txt')
          }
        }
      }),
      FiredTrigger({
        triggerId: 'anId4',
        triggerType: 'fileTail',
        payload: {
          time: triggers[2].payload.time,
          data: {
            contents: 'file 4 append 2',
            path: path.resolve(tempDirPath, 'file4.txt')
          }
        }
      })
    ]);
  });

  it('should honor MAX_FILE_WATCH_READY_TIME when waiting for a tail to be ready', async () => {
    process.env.MAX_FILE_WATCH_READY_TIME = '7777';
    const { default: FreshFileTailManager } = await import(`../src/file-tail-manager.js?readyTime=${Date.now()}`);
    const tempFilePath = path.resolve(tempDirPath, 'tailReady.txt');
    fs.appendFileSync(tempFilePath, 'some initial text\n');
    const setTimeoutSpy = sinon.spy(globalThis, 'setTimeout');
    fileTailManager = FreshFileTailManager();
    await fileTailManager.initialize([{ tailId: 'anId1', path: tempFilePath }], async () => { await sleep(0); });
    setTimeoutSpy.args.map((args) => args[1]).should.containEql(7777);
  });
});
