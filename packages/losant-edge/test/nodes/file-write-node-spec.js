import '../common.js';
import fs from 'fs-extra';
import path from 'node:path';
import { guardPath, guardFileReadPath, loadGuardedFile } from '../../src/lib/protected-path-utils.js';
import FileWriteNode from '../../src/nodes/file-write-node.js';
const FILE_NAME = '/tmp/test.txt';
const context = { diskUtils: { guardPath, guardFileReadPath, loadGuardedFile } };

describe('FileWriteNode', () => {
  beforeEach(async () => {
    return fs.copy(path.resolve(import.meta.dirname, '..', '__fixtures__', 'test-read-write.txt'), FILE_NAME);
  });
  afterEach(async () => {
    return fs.remove(FILE_NAME);
  });
  it('should error if the file is inside of losant', async () => {
    const node = new FileWriteNode('id', [[1]], {
      pathTemplate: '{{ filename }}',
      fileContentsTemplate: 'newLine\n',
      shouldAppend: true,
      resultPath: 'data.output'
    });
    let error;
    try {
      await node.run(context, { filename: './packages/nodes/test/get-file.json' });
    } catch (e) {
      error = e;
    }

    error.message.should.equal('Cannot access within the protected Losant Edge Agent directory.');
  });
  it('should error if the path is empty', async () => {
    const node = new FileWriteNode('id', [[1]], {
      pathTemplate: '{{ filename }}',
      fileContentsTemplate: 'newLine\n',
      resultPath: 'data.output'
    });
    await node.run(context, { filename: '' })
      .should.be.rejectedWith({ type: 'Validation', message: 'The provided disk path cannot be empty.' });
  });
  it('should overwrite a file', async () => {
    const node = new FileWriteNode('id', [[1]], {
      pathTemplate: '{{ filename }}',
      fileContentsTemplate: 'newLine',
      errorIfFileExists: false,
      resultPath: 'data.output'
    });

    const output = await node.run(context, { filename: FILE_NAME });
    output[1].should.deepEqual({
      filename: FILE_NAME,
      data: {
        output: { value: true }
      }
    });
    const fileContents = await fs.readFile(FILE_NAME, 'utf8');
    fileContents.should.equal('newLine');
  });
  it('should append a file', async () => {
    const node = new FileWriteNode('id', [[1]], {
      pathTemplate: '{{ filename }}',
      fileContentsTemplate: 'newLine\n',
      shouldAppend: true,
      resultPath: 'data.output'
    });

    const output = await node.run(context, { filename: FILE_NAME });
    output[1].should.deepEqual({
      filename: FILE_NAME,
      data: {
        output: { value: true }
      }
    });
    const fileContents = await fs.readFile(FILE_NAME, 'utf8');
    fileContents.should.equal('abcdefghijklmnopqrstuvwxyz\nnewLine\n');
  });
  it('should error if it tries to overwrite an existing file when errorIfFileExists is off', async () => {
    const node = new FileWriteNode('id', [[1]], {
      pathTemplate: '{{ filename }}',
      fileContentsTemplate: 'newLine\n',
      errorIfFileExists: true,
      resultPath: 'data.output'
    });
    const output = await node.run(context, { filename: FILE_NAME });
    output[1].should.deepEqual({
      filename: FILE_NAME,
      data: {
        output: {
          error: {
            type: 'WRITE_FILE_ERROR',
            message: `EEXIST: file already exists, open '${FILE_NAME}'`
          },
          value: false
        }
      }
    });

  });
});
