import { contextify, protectedDiskUtils } from './common.js';
import errors from 'losant-nodejs-utils/src/errors.js';
import fs from 'fs-extra';
import path from 'node:path';
import os from 'node:os';
import {
  getFlagOption,
  renderAndValidateReadFromDiskPath,
  renderAndValidateWriteToDiskPath,
  renderAndValidateCommonPutFields,
  renderAndValidateCommonGetFields
} from '../src/lib/node-storage-helpers.js';

describe('node-storage-helpers', () => {
  let tmpDir;

  beforeEach(async () => {
    tmpDir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'storage-helpers-spec-')));
  });

  afterEach(async () => {
    if (tmpDir && await fs.pathExists(tmpDir)) {
      await fs.remove(tmpDir);
    }
  });

  describe('getFlagOption', () => {
    it('should return "w" by default', () => {
      getFlagOption({}).should.equal('w');
    });

    it('should return "a" when shouldAppend is true', () => {
      getFlagOption({ shouldAppend: true }).should.equal('a');
    });

    it('should return "wx" when errorIfFileExists is true', () => {
      getFlagOption({ errorIfFileExists: true }).should.equal('wx');
    });

    it('should return "ax" when shouldAppend and errorIfFileExists are true', () => {
      getFlagOption({ shouldAppend: true, errorIfFileExists: true }).should.equal('ax');
    });
  });

  describe('renderAndValidateReadFromDiskPath', () => {
    it('should successfully return rendered disk path when valid file exists', async () => {
      const testFile = path.join(tmpDir, 'read-test.txt');
      await fs.writeFile(testFile, 'hello world');

      const node = { diskPathTemplate: testFile };
      const result = await renderAndValidateReadFromDiskPath(node, contextify(), {});
      result.should.equal(testFile);
    });

    it('should support templating in disk path', async () => {
      const testFile = path.join(tmpDir, 'templated-read.txt');
      await fs.writeFile(testFile, 'templated content');

      const node = { diskPathTemplate: path.join(tmpDir, '{{filename}}') };
      const result = await renderAndValidateReadFromDiskPath(node, contextify(), { filename: 'templated-read.txt' });
      result.should.equal(testFile);
    });

    it('should support custom fieldName option', async () => {
      const testFile = path.join(tmpDir, 'custom-field.txt');
      await fs.writeFile(testFile, 'custom field data');

      const node = { bodyTemplate: testFile };
      const result = await renderAndValidateReadFromDiskPath(node, contextify(), {}, { fieldName: 'bodyTemplate' });
      result.should.equal(testFile);
    });

    it('should throw NotFound error when file does not exist', async () => {
      const nonExistent = path.join(tmpDir, 'non-existent.txt');
      const node = { diskPathTemplate: nonExistent };
      await renderAndValidateReadFromDiskPath(node, contextify(), {})
        .should.be.rejectedWith(errors.NotFound({ message: `No file exists at "${nonExistent}"` }));
    });

    it('should throw NotFound error when template resolves to empty string', async () => {
      const node = { diskPathTemplate: '{{nothing}}' };
      await renderAndValidateReadFromDiskPath(node, contextify(), {})
        .should.be.rejectedWith(errors.NotFound({ message: 'No file exists at ""' }));
    });

    it('should throw NotFound error when path is a dangling symlink', async () => {
      const symlinkPath = path.join(tmpDir, 'dangling-symlink.txt');
      await fs.symlink(path.join(tmpDir, 'no-such-file.txt'), symlinkPath);

      const node = { diskPathTemplate: symlinkPath };
      await renderAndValidateReadFromDiskPath(node, contextify(), {})
        .should.be.rejectedWith(errors.NotFound({ message: `No file exists at "${symlinkPath}"` }));
    });

    it('should throw NotFound error when path is a directory', async () => {
      const subDir = path.join(tmpDir, 'a-sub-directory');
      await fs.mkdir(subDir);

      const node = { diskPathTemplate: subDir };
      await renderAndValidateReadFromDiskPath(node, contextify(), {})
        .should.be.rejectedWith(errors.NotFound({ message: 'The provided disk path is a directory.' }));
    });

    it('should throw NotFound error when path is not a regular file', async () => {
      const node = { diskPathTemplate: '/dev/null' };
      await renderAndValidateReadFromDiskPath(node, contextify(), {})
        .should.be.rejectedWith(errors.NotFound({ message: 'The provided disk path is not a regular file.' }));
    });

    it('should re-throw when guardPath throws Validation error for protected directory', async () => {
      const node = { diskPathTemplate: '/etc/losant/file.txt' };
      const context = contextify({
        diskUtils: protectedDiskUtils
      });
      await renderAndValidateReadFromDiskPath(node, context, {})
        .should.be.rejectedWith({ message: 'Cannot access within the protected Losant Edge Agent directory.' });
    });
  });

  describe('renderAndValidateWriteToDiskPath', () => {
    it('should throw Validation error when diskPathTemplate resolves to empty value', async () => {
      const node = { diskPathTemplate: '{{nothing}}' };
      await renderAndValidateWriteToDiskPath(node, contextify(), {})
        .should.be.rejectedWith(errors.Validation({ message: 'The provided disk path cannot be empty.' }));
    });

    it('should throw Validation error when diskPathTemplate is not provided', async () => {
      const node = {};
      await renderAndValidateWriteToDiskPath(node, contextify(), {})
        .should.be.rejectedWith(errors.Validation({ message: 'The provided disk path cannot be empty.' }));
    });

    it('should not treat a whitespace-only diskPathTemplate as empty', async () => {
      const node = { diskPathTemplate: '   \t\n' };
      const result = await renderAndValidateWriteToDiskPath(node, contextify(), {});
      result.should.equal(path.resolve('   \t\n'));
    });

    it('should successfully return rendered disk path for valid write target', async () => {
      const writeTarget = path.join(tmpDir, 'write-output.txt');
      const node = { diskPathTemplate: writeTarget };
      const result = await renderAndValidateWriteToDiskPath(node, contextify(), {});
      result.should.equal(writeTarget);
    });

    it('should support templating in disk path', async () => {
      const writeTarget = path.join(tmpDir, 'templated-out.txt');
      const node = { diskPathTemplate: path.join(tmpDir, '{{filename}}') };
      const result = await renderAndValidateWriteToDiskPath(node, contextify(), { filename: 'templated-out.txt' });
      result.should.equal(writeTarget);
    });

    it('should throw Validation error when write path is a dangling symlink', async () => {
      const symlinkPath = path.join(tmpDir, 'dangling-write-link.txt');
      await fs.symlink(path.join(tmpDir, 'target-does-not-exist.txt'), symlinkPath);

      const node = { diskPathTemplate: symlinkPath };
      await renderAndValidateWriteToDiskPath(node, contextify(), {})
        .should.be.rejectedWith({ message: 'The provided disk path is a symlink with no valid target.' });
    });

    it('should re-throw when guardPath throws Validation error for protected directory', async () => {
      const node = { diskPathTemplate: '/etc/losant/out.txt' };
      const context = contextify({
        diskUtils: protectedDiskUtils
      });
      await renderAndValidateWriteToDiskPath(node, context, {})
        .should.be.rejectedWith({ message: 'Cannot access within the protected Losant Edge Agent directory.' });
    });
  });


  describe('renderAndValidateCommonPutFields', () => {
    const defaultPutNode = {
      contentTypeTemplate: 'text/plain',
      fileNameTemplate: 'test.txt',
      bucketNameTemplate: 'my-bucket'
    };

    it('should resolve file content and encoding', async () => {
      const node = {
        ...defaultPutNode,
        fileContentTemplate: 'hello world',
        encodingTemplate: 'utf8'
      };
      const fields = await renderAndValidateCommonPutFields(node, contextify(), {});
      fields.fileContent.should.equal('hello world');
      fields.encoding.should.equal('utf8');
      fields.fileName.should.equal('test.txt');
      fields.bucket.should.equal('my-bucket');
      fields.contentType.should.equal('text/plain');
    });

    it('should resolve fileUrl when fileUrlTemplate is provided', async () => {
      const node = {
        ...defaultPutNode,
        fileUrlTemplate: 'http://example.com/file.txt'
      };
      const fields = await renderAndValidateCommonPutFields(node, contextify(), {});
      fields.fileUrl.should.equal('http://example.com/file.txt');
    });

    it('should resolve diskPath when diskPathTemplate is set', async () => {
      const testFile = path.join(tmpDir, 'put-source.txt');
      await fs.writeFile(testFile, 'put content');

      const node = {
        ...defaultPutNode,
        diskPathTemplate: testFile,
        encodingTemplate: 'utf8'
      };
      const fields = await renderAndValidateCommonPutFields(node, contextify(), {});
      fields.diskPath.should.equal(testFile);
      fields.encoding.should.equal('utf8');
    });

    it('should return { error: e } when disk file does not exist (NotFound)', async () => {
      const nonExistent = path.join(tmpDir, 'missing.txt');
      const node = {
        ...defaultPutNode,
        diskPathTemplate: nonExistent,
        encodingTemplate: 'utf8'
      };
      const result = await renderAndValidateCommonPutFields(node, contextify(), {});
      result.error.should.be.an.instanceOf(Error);
      result.error.type.should.equal('NotFound');
      result.error.message.should.equal(`No file exists at "${nonExistent}"`);
    });

    it('should return { error: e } when disk file is a dangling symlink', async () => {
      const symlinkPath = path.join(tmpDir, 'dangling-put-symlink.txt');
      await fs.symlink(path.join(tmpDir, 'nonexistent.txt'), symlinkPath);

      const node = {
        ...defaultPutNode,
        diskPathTemplate: symlinkPath,
        encodingTemplate: 'utf8'
      };
      const result = await renderAndValidateCommonPutFields(node, contextify(), {});
      result.error.should.be.an.instanceOf(Error);
      result.error.type.should.equal('NotFound');
      result.error.message.should.equal(`No file exists at "${symlinkPath}"`);
    });

    it('should throw Validation error when disk file is in protected directory', async () => {
      const node = {
        ...defaultPutNode,
        diskPathTemplate: '/etc/losant/secret.txt',
        encodingTemplate: 'utf8'
      };
      const context = contextify({
        diskUtils: protectedDiskUtils
      });
      await renderAndValidateCommonPutFields(node, context, {})
        .should.be.rejectedWith({ message: 'Cannot access within the protected Losant Edge Agent directory.' });
    });

    it('should throw Validation error when contentTypeTemplate is missing', async () => {
      const node = {
        encodingTemplate: 'utf8',
        fileContentTemplate: 'content',
        fileNameTemplate: 'test.txt',
        bucketNameTemplate: 'bucket'
      };
      await renderAndValidateCommonPutFields(node, contextify(), {})
        .should.be.rejectedWith({ message: 'Files must provide a content type' });
    });

    it('should throw Validation error when fileName exceeds MAX_FILENAME_LENGTH', async () => {
      const node = {
        ...defaultPutNode,
        encodingTemplate: 'utf8',
        fileContentTemplate: 'content',
        fileNameTemplate: 'a'.repeat(1025)
      };
      await renderAndValidateCommonPutFields(node, contextify(), {})
        .should.be.rejectedWith({ message: 'File name cannot exceed 1024 characters' });
    });
  });

  describe('renderAndValidateCommonGetFields', () => {
    const defaultGetNode = {
      fileNameTemplate: 'test.txt',
      bucketNameTemplate: 'my-bucket',
      encodingTemplate: 'utf8'
    };

    it('should resolve standard get fields', async () => {
      const node = { ...defaultGetNode };
      const fields = await renderAndValidateCommonGetFields(node, contextify(), {});
      fields.encoding.should.equal('utf8');
      fields.filename.should.equal('test.txt');
      fields.bucket.should.equal('my-bucket');
      (fields.diskPath === undefined).should.be.true();
    });

    it('should skip encoding and disk validation when isDownloadURL is true', async () => {
      const node = {
        ...defaultGetNode,
        isDownloadURL: true,
        diskPathTemplate: '/invalid/path'
      };
      const fields = await renderAndValidateCommonGetFields(node, contextify(), {});
      (fields.encoding === undefined).should.be.true();
      (fields.diskPath === undefined).should.be.true();
      fields.filename.should.equal('test.txt');
    });

    it('should resolve diskPath when diskPathTemplate is set', async () => {
      const writeTarget = path.join(tmpDir, 'get-dest.txt');
      const node = {
        ...defaultGetNode,
        diskPathTemplate: writeTarget
      };
      const fields = await renderAndValidateCommonGetFields(node, contextify(), {});
      fields.diskPath.should.equal(writeTarget);
      fields.encoding.should.equal('utf8');
    });

    it('should throw Validation error when diskPathTemplate is in protected directory', async () => {
      const node = {
        ...defaultGetNode,
        diskPathTemplate: '/etc/losant/dest.txt'
      };
      const context = contextify({
        diskUtils: protectedDiskUtils
      });
      await renderAndValidateCommonGetFields(node, context, {})
        .should.be.rejectedWith({ message: 'Cannot access within the protected Losant Edge Agent directory.' });
    });

    it('should throw Validation error when diskPathTemplate is a dangling symlink', async () => {
      const symlinkPath = path.join(tmpDir, 'dangling-get-symlink.txt');
      await fs.symlink(path.join(tmpDir, 'target-missing.txt'), symlinkPath);

      const node = {
        ...defaultGetNode,
        diskPathTemplate: symlinkPath
      };
      await renderAndValidateCommonGetFields(node, contextify(), {})
        .should.be.rejectedWith({ message: 'The provided disk path is a symlink with no valid target.' });
    });

    it('should throw NotFound error when fileName exceeds MAX_FILENAME_LENGTH', async () => {
      const node = {
        ...defaultGetNode,
        fileNameTemplate: 'a'.repeat(1025)
      };
      await renderAndValidateCommonGetFields(node, contextify(), {})
        .should.be.rejectedWith(errors.NotFound({ message: 'File name cannot exceed 1024 characters' }));
    });
  });
});
