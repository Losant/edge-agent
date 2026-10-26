import { sinon } from '../common.js';
import fs from 'fs-extra';
import path from 'node:path';
import { guardPath, guardFileReadPath, loadGuardedFile } from '../../src/lib/protected-path-utils.js';
import FileReadNode from '../../src/nodes/file-read-node.js';
const FILE_NAME = '/tmp/test.txt';
const context = { diskUtils: { guardPath, guardFileReadPath, loadGuardedFile } };

describe('FileReadNode', () => {
  beforeEach(async () => {
    return fs.copy(path.resolve(import.meta.dirname, '..', '__fixtures__', 'test-read-write.txt'), FILE_NAME);
  });
  afterEach(async () => {
    return fs.remove(FILE_NAME);
  });
  [ 'startTemplate', 'lengthTemplate' ].forEach((propName) => {
    it(`should throw an error if ${propName} is not a number`, async () => {
      const config = {
        pathTemplate: FILE_NAME,
        startTemplate: 'abc',
        lengthTemplate: 200,
        resultPath: 'data.output'
      };
      config[propName] = 'abc';
      if (propName === 'lengthTemplate') {
        config.startTemplate = '34';
      }
      const node = new FileReadNode('id', [[1]], config);
      let error = {};
      try {
        await node.run(context, {});
      } catch (e) {
        error = e;
      }
      error.message.should.equal(`${propName} must be a number.`);
    });
  });
  it('should throw an error if the file does not exist', async () => {
    const filename = '/tmp/THIS IS NOT A FILE THAT EXISTS...';
    const node = new FileReadNode('id', [[1]], {
      pathTemplate: '{{ filename }}',
      resultPath: 'data.output'
    });

    const output = await node.run(context, { filename, otherData: 1234 });
    output[1].should.deepEqual({
      filename,
      otherData: 1234,
      data: {
        output: {
          error: {
            type: 'NOT_FOUND',
            message: `No file exists at "${filename}"`
          }
        }
      }
    });
  });
  it('should set NOT_FOUND error on payload for a dangling symlink', async () => {
    const symlinkPath = '/tmp/file-read-node-spec-dangling.txt';
    await fs.symlink('/tmp/file-read-node-blahblah.txt', symlinkPath);
    try {
      const node = new FileReadNode('id', [[1]], {
        pathTemplate: '{{ filename }}',
        resultPath: 'data.output'
      });

      const output = await node.run(context, { filename: symlinkPath, otherData: 1234 });
      output[1].should.deepEqual({
        filename: symlinkPath,
        otherData: 1234,
        data: {
          output: {
            error: {
              type: 'NOT_FOUND',
              message: `No file exists at "${symlinkPath}"`
            }
          }
        }
      });
    } finally {
      await fs.remove(symlinkPath);
    }
  });
  it('should throw an error if the file is a directory', async () => {
    const filename = '/tmp/THIS IS A DIRECTORY...';
    await fs.ensureDir(filename);
    try {
      const node = new FileReadNode('id', [[1]], {
        pathTemplate: '{{ filename }}',
        resultPath: 'data.output'
      });

      const output = await node.run(context, { filename, otherData: 1234 });
      output[1].should.deepEqual({
        filename,
        otherData: 1234,
        data: {
          output: {
            error: {
              type: 'NOT_FOUND',
              message: 'The provided disk path is a directory.'
            }
          }
        }
      });
    } finally {
      await fs.remove(filename);
    }
  });
  it('should throw an error if the file is not a regular file', async () => {
    const stub = sinon.stub(fs, 'stat').resolves({
      isFile: () => false,
      isDirectory: () => false
    });
    const node = new FileReadNode('id', [[1]], {
      pathTemplate: '{{ filename }}',
      resultPath: 'data.output'
    });

    const output = await node.run(context, { filename: FILE_NAME, otherData: 1234 });
    output[1].should.deepEqual({
      filename: FILE_NAME,
      otherData: 1234,
      data: {
        output: {
          error: {
            type: 'NOT_FOUND',
            message: 'The provided disk path is not a regular file.'
          }
        }
      }
    });
    stub.restore();
  });
  it('should set NOT_FOUND error on payload if the file stat function throws an error', async () => {
    const errorMessage = 'Ahh something bad happened.';
    const stub = sinon.stub(fs, 'stat').callsFake(() => {
      throw new Error(errorMessage);
    });
    const node = new FileReadNode('id', [[1]], {
      pathTemplate: '{{ filename }}',
      resultPath: 'data.output'
    });

    const output = await node.run(context, { filename: FILE_NAME, otherData: 1234 });
    output[1].should.deepEqual({
      filename: FILE_NAME,
      otherData: 1234,
      data: {
        output: {
          error: {
            type: 'NOT_FOUND',
            message: `No file exists at "${FILE_NAME}"`
          }
        }
      }
    });
    stub.restore();
  });
  it('should read a file', async () => {
    const spy = sinon.spy(fs, 'close');
    const node = new FileReadNode('id', [[1]], {
      pathTemplate: '{{ filename }}',
      resultPath: 'data.output'
    });
    try {
      const output = await node.run(context, { filename: FILE_NAME });
      output[1].should.deepEqual({
        filename: FILE_NAME,
        data: {
          output: {
            value: 'abcdefghijklmnopqrstuvwxyz\n',
            bytesRead: 27
          }
        }
      });
      spy.called.should.be.true();
    } finally {
      spy.restore();
    }
  });
  it('should return an error if start is greater than the max', async () => {
    const node = new FileReadNode('id', [[1]], {
      pathTemplate: '{{ filename }}',
      resultPath: 'data.output',
      startTemplate: 100,
      lengthTemplate: 100
    });

    const output = await node.run(context, { filename: FILE_NAME });
    output[1].should.deepEqual({
      filename: FILE_NAME,
      data: { output: { error: { type: 'READ_FILE_ERROR', message: 'Start cannot be greater than the file size 27' } } }
    });
  });
  it('should return an error if start is greater than the file size', async () => {
    const node = new FileReadNode('id', [[1]], {
      pathTemplate: '{{ filename }}',
      resultPath: 'data.output',
      startTemplate: 300
    });

    const output = await node.run(context, { filename: FILE_NAME });
    output[1].should.deepEqual({
      filename: FILE_NAME,
      data: { output: { error: { type: 'READ_FILE_ERROR', message: 'Start cannot be greater than the file size 27' } } }
    });
  });
  [
    { start: undefined, length: 5, result: { value: 'abcde', bytesRead: 5 } },
    { start: 5, length: undefined, result: { value: 'fghijklmnopqrstuvwxyz\n', bytesRead: 22 } },
    { start: 5, length: 5, result: { value: 'fghij', bytesRead: 5 } },
    { start: 20, length: 7, result: { value: 'uvwxyz\n', bytesRead: 7 } },
    { start: -10, length: undefined, result: { value: 'rstuvwxyz\n', bytesRead: 10 } },
    { start: 2, length: 5, result: { value: 'cdefg', bytesRead: 5 } },
    { start: -100, length: 27, result: { value: 'abcdefghijklmnopqrstuvwxyz\n', bytesRead: 27 } }
  ].forEach(({ start, length, result }) => {
    it('should read a part of a file', async () => {
      const node = new FileReadNode('id', [[1]], {
        pathTemplate: '{{ filename }}',
        resultPath: 'data.output',
        startTemplate: start,
        lengthTemplate: length
      });

      const output = await node.run(context, { filename: FILE_NAME });
      output[1].should.deepEqual({
        filename: FILE_NAME,
        data: { output: result }
      });
    });
  });

  it('should read a file through a symlink using realPath', async () => {
    const symlinkPath = '/tmp/test-symlink.txt';
    await fs.ensureSymlink(FILE_NAME, symlinkPath);
    try {
      const node = new FileReadNode('id', [[1]], {
        pathTemplate: '{{ filename }}',
        resultPath: 'data.output'
      });

      const output = await node.run(context, { filename: symlinkPath });
      output[1].data.output.value.should.equal('abcdefghijklmnopqrstuvwxyz\n');
    } finally {
      await fs.remove(symlinkPath);
    }
  });

});
