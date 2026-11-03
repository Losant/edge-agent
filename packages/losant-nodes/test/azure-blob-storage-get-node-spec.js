import { nock, tk, contextify, protectedDiskUtils } from './common.js';
import AzureBlobStorageGetNode from '../src/azure-blob-storage-get-node.js';
import errors from 'losant-nodejs-utils/src/errors.js';
import fs from 'node:fs';
import path from 'node:path';

describe('AzureBlobStorageGetNode', () => {
  let node;

  beforeEach( () => {
    node = new AzureBlobStorageGetNode('id', [[4]], {
      destination: 'out',
      accountTemplate: 'test',
      accountKeyTemplate: 'test',
      containerNameTemplate: 'bingo',
      blobNameTemplate: 'test.txt'
    });
  });

  it('Should properly receive a 404', async () => {
    nock('https://test.blob.core.windows.net:443', { encodedQueryParams: true })
      .head('/bingo/test.txt')
      .reply(404, '', [ 'x-ms-error-code', 'ContainerNotFound' ]);

    const result = await node.run({}, {});
    result[1].out.should.deepEqual({ error: 'The file test.txt was not found.' });
  });

  it('Should read a file', async () => {
    nock('https://test.blob.core.windows.net:443', { encodedQueryParams: true })
      .head('/bingo/test.txt')
      .reply(200, '', [ 'Content-Length', '13', 'Content-Type', 'text/plain', 'ETag', '"0x8DA3F36973DFD7C"' ]);

    nock('https://test.blob.core.windows.net:443', { encodedQueryParams: true })
      .get('/bingo/test.txt')
      .reply(200, 'I\'m a result!', [ 'Content-Length', '13', 'Content-Type', 'text/plain', 'ETag', '"0x8DA3F36973DFD7C"' ]);
    const result = await node.run({}, {});
    result[1].out.value.should.deepEqual("I'm a result!");
  });

  it('Should get a download link to a file', async () => {
    tk.freeze(0);
    nock('https://test.blob.core.windows.net:443', { encodedQueryParams: true })
      .head('/bingo/test.txt')
      .reply(200, '', [ 'Content-Length', '11', 'Content-Type', 'text/plain', 'ETag', '"0x8DA3F36973DFD7C"' ]);

    node.isDownloadURL = true;
    const result = await node.run({}, {});
    result[1].out.value.should.deepEqual('https://test.blob.core.windows.net/bingo/test.txt?sv=2025-05-05&spr=https&st=1970-01-01T00%3A00%3A00Z&se=1970-01-08T00%3A00%3A00Z&sr=b&sp=r&sig=zCQJuZYF2F8HIgKtvsLH5KVYyqdRbpP2K7njWcmIV%2Bw%3D');
  });

  it('Should ignore encoding when getting link', async () => {
    tk.freeze(0);
    nock('https://test.blob.core.windows.net:443', { encodedQueryParams: true })
      .head('/bingo/test.txt')
      .reply(200, '', [ 'Content-Length', '11', 'Content-Type', 'text/plain', 'ETag', '"0x8DA3F36973DFD7C"' ]);

    node.isDownloadURL = true;
    node.encodingTemplate = 'foo';
    const result = await node.run({}, {});
    result[1].out.should.deepEqual({
      metadata: {
        contentType: 'text/plain',
        etag: '"0x8DA3F36973DFD7C"',
        fileSize: 11
      },
      value: 'https://test.blob.core.windows.net/bingo/test.txt?sv=2025-05-05&spr=https&st=1970-01-01T00%3A00%3A00Z&se=1970-01-08T00%3A00%3A00Z&sr=b&sp=r&sig=zCQJuZYF2F8HIgKtvsLH5KVYyqdRbpP2K7njWcmIV%2Bw%3D'
    });
  });

  it('should check config properly', async () => {
    await new AzureBlobStorageGetNode('id', [[4]], {
      destination: 'out',
      accountTemplate: '',
      accountKeyTemplate: '',
      containerNameTemplate: 'bingo',
      blobNameTemplate: 'test.txt'
    }).run({}, {}).should.be.rejectedWith(errors.Validation({ message: 'Account is required and must be a string.' }));
  });

  it('Should download a file with custom encoding', async () => {
    nock('https://test.blob.core.windows.net:443', { encodedQueryParams: true })
      .head('/bingo/test.txt')
      .reply(200, '', [ 'Content-Length', '11', 'Content-Type', 'text/plain', 'ETag', '"0x8DA3F36973DFD7C"' ]);

    nock('https://test.blob.core.windows.net:443', { encodedQueryParams: true })
      .get('/bingo/test.txt')
      .reply(200, 'im a stirng', [ 'Content-Length', '11', 'Content-Type', 'text/plain', 'ETag', '"0x8DA3F36973DFD7C"' ]);

    node.encodingTemplate = 'hex';

    const result = await node.run({}, {});
    result[1].out.should.deepEqual({
      metadata: {
        contentType: 'text/plain',
        etag: '"0x8DA3F36973DFD7C"',
        fileSize: 11
      },
      value: '696d206120737469726e67'
    });
  });

  it('Should error when trying to read a too big file', async () => {
    nock('https://test.blob.core.windows.net:443', { encodedQueryParams: true })
      .head('/bingo/test.txt')
      .reply(200, '', [ 'Content-Length', '9999999999999', 'Content-Type', 'text/plain', 'ETag', '"0x8DA3F36973DFD7C"' ]);

    const result = await node.run({}, {});
    result[1].out.error.should.deepEqual('File size cannot exceed 5MB');
  });
  describe('writing to local path', async () => {
    const readOnlyDir = './read-only-test-dir';
    afterEach(() => {
      node.diskPathTemplate = '';
      fs.rmSync('./foo.txt', { force: true });
      if (fs.existsSync(readOnlyDir)) {
        fs.chmodSync(readOnlyDir, 0o755);
        fs.rmSync(readOnlyDir, { recursive: true, force: true });
      }
    });
    it('Should write file to disk', async () => {
      node.diskPathTemplate = './foo.txt';
      nock('https://test.blob.core.windows.net:443', { encodedQueryParams: true })
        .head('/bingo/test.txt')
        .reply(200, '', [ 'Content-Length', '13', 'Content-Type', 'text/plain', 'ETag', '"0x8DA3F36973DFD7C"' ]);

      nock('https://test.blob.core.windows.net:443', { encodedQueryParams: true })
        .get('/bingo/test.txt')
        .reply(200, 'I\'m a result!', [ 'Content-Length', '13', 'Content-Type', 'text/plain', 'ETag', '"0x8DA3F36973DFD7C"' ]);
      const result = await node.run(contextify(), {});
      result[1].out.value.should.deepEqual(path.resolve('./foo.txt'));
      (fs.readFileSync(node.diskPathTemplate, { encoding: 'utf8' })).should.deepEqual('I\'m a result!');
    });

    it('Should fail when diskPathTemplate resolves to a directory', async () => {
      fs.mkdirSync(readOnlyDir, { recursive: true });
      node.encodingTemplate = 'hex';
      node.diskPathTemplate = readOnlyDir;
      nock('https://test.blob.core.windows.net:443', { encodedQueryParams: true })
        .head('/bingo/test.txt')
        .reply(200, '', [ 'Content-Length', '13', 'Content-Type', 'text/plain', 'ETag', '"0x8DA3F36973DFD7C"' ]);
      nock('https://test.blob.core.windows.net:443', { encodedQueryParams: true })
        .get('/bingo/test.txt')
        .reply(200, 'I\'m a result!', [ 'Content-Length', '13', 'Content-Type', 'text/plain', 'ETag', '"0x8DA3F36973DFD7C"' ]);
      const result = await node.run(contextify(), {});
      result[1].out.error.should.equal(`EISDIR: illegal operation on a directory, open '${path.resolve(readOnlyDir)}'`);
    });
    it('Should fail when diskPathTemplate resolves to nothing', async () => {
      fs.mkdirSync(readOnlyDir, { recursive: true });
      node.encodingTemplate = 'hex';
      node.diskPathTemplate = '{{nothing}}';
      await node.run(contextify(), {})
        .should.be.rejectedWith({ message: 'The provided disk path cannot be empty.' });
    });
    it('Should fail when file is a losant path', async () => {
      fs.mkdirSync(readOnlyDir, { recursive: true });
      node.encodingTemplate = 'hex';
      node.diskPathTemplate = './foo.txt';
      await node.run(contextify({
        diskUtils: protectedDiskUtils
      }), {})
        .should.be.rejectedWith({ message: 'Cannot access within the protected Losant Edge Agent directory.' });
    });

    it('Should fail when diskPathTemplate is a dangling symlink', async () => {
      const danglingLink = './azure-get-dangling-link.txt';
      await fs.promises.symlink('./nonexistent-target.txt', danglingLink);
      try {
        node.encodingTemplate = 'hex';
        node.diskPathTemplate = danglingLink;
        await node.run(contextify(), {})
          .should.be.rejectedWith({ message: 'The provided disk path is a symlink with no valid target.' });
      } finally {
        await fs.promises.rm(danglingLink, { force: true });
      }
    });

  });
});
