import { nock, contextify, protectedDiskUtils } from './common.js';
import AzureBlobStoragePutNode from '../src/azure-blob-storage-put-node.js';
import errors from 'losant-nodejs-utils/src/errors.js';
import fs from 'fs-extra';

describe('AzureBlobStoragePutNode', () => {
  describe('reading from a local path', async () => {
    const readOnlyDir = './read-only-test-dir';
    const diskPath = './foo.txt';
    let node;
    beforeEach(() => {
      node = new AzureBlobStoragePutNode('id', [[4]], {
        destination: 'out',
        accountTemplate: 'test',
        accountKeyTemplate: 'test',
        containerNameTemplate: 'bingo',
        blobNameTemplate: 'test.txt',
        contentTypeTemplate: 'text/plain',
        fileNameTemplate: 'test.txt',
        diskPathTemplate: diskPath
      });
    });
    afterEach(() => {
      fs.rmSync(diskPath, { force: true });
      fs.rmSync(readOnlyDir, { recursive: true, force: true });
    });
    it('should upload a file from a disk path', async () => {
      await fs.writeFile(diskPath, 'ABC');
      nock('https://test.blob.core.windows.net:443', { encodedQueryParams: true })
        .filteringPath(/blockid=.*/g, 'blockid=id')
        .put('/bingo/test.txt', 'ABC')
        .query({ comp: 'block', blockid: 'id' })
        .reply(201, '');

      //request indicating the uploadStream has finished
      nock('https://test.blob.core.windows.net:443', { encodedQueryParams: true })
        .filteringRequestBody(/<Latest>.*/g, 'blockid')
        .put('/bingo/test.txt', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><BlockList>blockid')
        .query({ comp: 'blocklist' })
        .reply(201, '');
      const result = await node.run(contextify(), {});
      result[1].out.should.deepEqual({ success: true });
    });

    it('Should fail when diskPathTemplate resolves to a directory', async () => {
      fs.mkdirSync(readOnlyDir, { recursive: true });
      node.encodingTemplate = 'hex';
      node.diskPathTemplate = readOnlyDir;
      const result = await node.run(contextify(), { });
      result[1].out.error.should.equal('The provided disk path is a directory.');
    });
    it('Should fail when diskPathTemplate resolves to nothing', async () => {
      fs.mkdirSync(readOnlyDir, { recursive: true });
      node.encodingTemplate = 'hex';
      node.diskPathTemplate = '{{nothing}}';
      const result = await node.run(contextify(), { });
      result[1].out.error.should.equal('No file exists at ""');
    });
    it('Should fail when file is a losant path', async () => {
      fs.mkdirSync(readOnlyDir, { recursive: true });
      await node.run(contextify({
        diskUtils: protectedDiskUtils
      }), { })
        .should.be.rejectedWith({ message: 'Cannot access within the protected Losant Edge Agent directory.' });
    });

    it('Should fail when diskPathTemplate is a dangling symlink', async () => {
      const danglingLink = './azure-put-dangling-link.txt';
      await fs.symlink('./nonexistent-target.txt', danglingLink);
      try {
        node.diskPathTemplate = danglingLink;
        const result = await node.run(contextify(), { });
        result[1].out.error.should.equal(`No file exists at "${danglingLink}"`);
      } finally {
        await fs.remove(danglingLink);
      }
    });
  });
  it('should upload a file from a stream', async () => {
    nock('https://test.blob.core.windows.net:443', { encodedQueryParams: true })
      .filteringPath(/blockid=.*/g, 'blockid=id')
      .put('/bingo/test.txt', 'ABC')
      .query({ comp: 'block', blockid: 'id' })
      .reply(201, '');

    //request indicating the uploadStream has finished
    nock('https://test.blob.core.windows.net:443', { encodedQueryParams: true })
      .filteringRequestBody(/<Latest>.*/g, 'blockid')
      .put('/bingo/test.txt', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><BlockList>blockid')
      .query({ comp: 'blocklist' })
      .reply(201, '');

    const result = await new AzureBlobStoragePutNode('id', [[4]], {
      destination: 'out',
      accountTemplate: 'test',
      accountKeyTemplate: 'test',
      containerNameTemplate: 'bingo',
      blobNameTemplate: 'test.txt',
      contentTypeTemplate: 'text/plain',

      blobContentTemplate: '414243',
      encodingTemplate: 'hex'
    }).run({}, {});
    result[1].out.should.deepEqual({ success: true });
  });

  it('should upload a file from a url', async () => {
    nock('https://example.com:443', { encodedQueryParams: true })
      .get('/')
      .reply(200, 'a bunch of content that was on a website somewhere');

    nock('https://test.blob.core.windows.net:443', { encodedQueryParams: true })
      .filteringPath(/blockid=.*/g, 'blockid=id')
      .put('/bingo/test.txt', 'a bunch of content that was on a website somewhere')
      .query({ comp: 'block', blockid: 'id' })
      .reply(201, '');

    //request indicating the uploadStream has finished
    nock('https://test.blob.core.windows.net:443', { encodedQueryParams: true })
      .filteringRequestBody(/<Latest>.*/g, 'blockid')
      .put('/bingo/test.txt', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><BlockList>blockid')
      .query({ comp: 'blocklist' })
      .reply(201, '');

    const result = await new AzureBlobStoragePutNode('id', [[4]], {
      destination: 'out',
      accountTemplate: 'test',
      accountKeyTemplate: 'test',
      containerNameTemplate: 'bingo',
      blobNameTemplate: 'test.txt',
      contentTypeTemplate: 'text/plain',

      blobUrlTemplate: 'https://example.com/',
      fileNameTemplate: 'test.txt'
    }).run({}, {});
    result[1].out.should.deepEqual({ success: true });
  });


  it('should correctly error when trying to upload a non-hex file as hex', async () => {
    await new AzureBlobStoragePutNode('id', [[4]], {
      destination: 'out',
      accountTemplate: 'test',
      accountKeyTemplate: 'test',
      containerNameTemplate: 'bingo',
      blobNameTemplate: 'test.txt',
      contentTypeTemplate: 'text/plain',

      blobContentTemplate: 'Not hex',
      encodingTemplate: 'hex'
    }).run({}, {}).should.be.rejectedWith({ message: 'Invalid hexadecimal string.' });
  });

  it('should correctly error when trying to upload a non-base64 file as base64', async () => {
    await new AzureBlobStoragePutNode('id', [[4]], {
      destination: 'out',
      accountTemplate: 'test',
      accountKeyTemplate: 'test',
      containerNameTemplate: 'bingo',
      blobNameTemplate: 'test.txt',
      contentTypeTemplate: 'text/plain',

      blobContentTemplate: 'Not base64',
      encodingTemplate: 'base64'
    }).run({}, {}).should.be.rejectedWith({ message: 'Invalid base64 string.' });
  });

  it('should correctly error when using a bad url', async () => {
    nock('https://files.example.com:443', { encodedQueryParams: true })
      .get('/000000000000000000000000/Example/000000000000000000000000-deviceExport-1571785189245.csv')
      .reply(404, '<!doctype html>\n<html lang="en">\n<head>\n    <meta charset="utf-8">\n    <title>Page Not Found</title>\n    <meta name="viewport" content="width=device-width, initial-scale=1">\n    <style>\n\n        * {\n            line-height: 1.2;\n            margin: 0;\n        }\n\n        html {\n            color: #888;\n            display: table;\n            font-family: sans-serif;\n            height: 100%;\n            text-align: center;\n            width: 100%;\n        }\n\n        body {\n            display: table-cell;\n            vertical-align: middle;\n            margin: 2em auto;\n        }\n\n        h1 {\n            color: #555;\n            font-size: 2em;\n            font-weight: 400;\n        }\n\n        p {\n            margin: 0 auto;\n            width: 280px;\n        }\n\n        @media only screen and (max-width: 280px) {\n\n            body, p {\n                width: 95%;\n            }\n\n            h1 {\n                font-size: 1.5em;\n                margin: 0 0 0.3em;\n            }\n\n        }\n\n    </style>\n</head>\n<body>\n    <h1>Page Not Found</h1>\n    <p>Sorry, but the page you were trying to view does not exist.</p>\n</body>\n</html>\n<!-- IE needs 512+ bytes: https://blogs.msdn.microsoft.com/ieinternals/2010/08/18/friendly-http-error-pages/ -->');

    const result = await new AzureBlobStoragePutNode('id', [[4]], {
      destination: 'out',
      accountTemplate: 'test',
      accountKeyTemplate: 'test',
      containerNameTemplate: 'bingo',
      blobNameTemplate: 'test.txt',
      contentTypeTemplate: 'text/plain',
      blobUrlTemplate: 'https://files.example.com/000000000000000000000000/Example/000000000000000000000000-deviceExport-1571785189245.csv'
    }).run({}, {});
    result[1].out.should.deepEqual({ error: 'Request failed with status code 404', success: false });
  });

  it('should correctly error when a timeout occurs on download', async () => {
    nock('https://files.example.com:443', { encodedQueryParams: true })
      .get('/000000000000000000000000/Example/000000000000000000000000-deviceExport-1571785189245.csv')
      .delay(500)
      .reply(404, '<!doctype html>\n<html lang="en">\n<head>\n    <meta charset="utf-8">\n    <title>Page Not Found</title>\n    <meta name="viewport" content="width=device-width, initial-scale=1">\n    <style>\n\n        * {\n            line-height: 1.2;\n            margin: 0;\n        }\n\n        html {\n            color: #888;\n            display: table;\n            font-family: sans-serif;\n            height: 100%;\n            text-align: center;\n            width: 100%;\n        }\n\n        body {\n            display: table-cell;\n            vertical-align: middle;\n            margin: 2em auto;\n        }\n\n        h1 {\n            color: #555;\n            font-size: 2em;\n            font-weight: 400;\n        }\n\n        p {\n            margin: 0 auto;\n            width: 280px;\n        }\n\n        @media only screen and (max-width: 280px) {\n\n            body, p {\n                width: 95%;\n            }\n\n            h1 {\n                font-size: 1.5em;\n                margin: 0 0 0.3em;\n            }\n\n        }\n\n    </style>\n</head>\n<body>\n    <h1>Page Not Found</h1>\n    <p>Sorry, but the page you were trying to view does not exist.</p>\n</body>\n</html>\n<!-- IE needs 512+ bytes: https://blogs.msdn.microsoft.com/ieinternals/2010/08/18/friendly-http-error-pages/ -->');

    const result = await new AzureBlobStoragePutNode('id', [[4]], {
      destination: 'out',
      accountTemplate: 'test',
      accountKeyTemplate: 'test',
      containerNameTemplate: 'bingo',
      blobNameTemplate: 'test.txt',
      contentTypeTemplate: 'text/plain',

      blobUrlTemplate: 'https://files.example.com/000000000000000000000000/Example/000000000000000000000000-deviceExport-1571785189245.csv'
    }).run({ externalTimeout: 250 }, {});
    result[1].out.should.deepEqual({ error: { type: 'NodeTimeout', message: 'Timeout running Azure Blob Storage: Put node' }, success: false });
  });

  it('should check config properly', async () => {
    await new AzureBlobStoragePutNode('id', [[4]], {}).run({}, {})
      .should.be.rejectedWith(errors.Validation({ message: 'Blobs must provide a content type' }));

    await new AzureBlobStoragePutNode('id', [[4]], { contentTypeTemplate: 'text/plain' }).run({}, {})
      .should.be.rejectedWith(errors.Validation({ message: 'Account is required and must be a string.' }));

    await new AzureBlobStoragePutNode('id', [[4]], { accountTemplate: 'test', contentTypeTemplate: 'text/plain' }).run({}, {})
      .should.be.rejectedWith(errors.Validation({ message: 'Account Key is required and must be a string.' }));
  });
});
