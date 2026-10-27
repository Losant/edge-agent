import { nock, contextify, protectedDiskUtils } from './common.js';
import GoogleCloudStoragePutNode from '../src/google-storage-put-node.js';
import errors from 'losant-nodejs-utils/src/errors.js';
import { fakeGoogleCredentials as GCP_JWT_INFO } from 'losant-nodejs-utils/test/utils/testing-constants.js';
import fs from 'fs-extra';

const baseConfig = {
  bucketNameTemplate: 'test-bucket',
  fileNameTemplate: 'test.txt',
  contentTypeTemplate: 'text/plain',
  destination: 'out',
  jwtData: JSON.stringify(GCP_JWT_INFO)
};

describe('GoogleCloudStoragePutNode', () => {
  describe('reading from a local path', async () => {
    const readOnlyDir = './read-only-test-dir';
    const diskPath = './foo.txt';
    afterEach(() => {
      fs.rmSync(diskPath, { force: true });
      fs.rmSync(readOnlyDir, { recursive: true, force: true });
    });
    it('should upload a file from a disk path', async () => {
      await fs.writeFile(diskPath, 'ABC');
      nock('https://www.googleapis.com:443', { encodedQueryParams: true })
        .post('/oauth2/v4/token')
        .reply(200, ['1f8b0800000000000013ab564a4c4e4e2d2e8e2fc9cf4ecd53b252aa4c34b2d44b4bcc4ed58588e828a556146416a516c76702a58d4d2d2d7594c032f1259505a9400d4ea98945a9454ab50031448f984a000000'], [
          'Content-Type',
          'application/json; charset=UTF-8',
          'Content-Encoding',
          'gzip'
        ]);

      nock('https://storage.googleapis.com:443', { encodedQueryParams: true })
        .post('/upload/storage/v1/b/test-bucket/o')
        .query({ uploadType: 'multipart', name: 'test.txt' })
        .reply(200, {
          kind: 'storage#object', id: 'test-bucket/test.txt/1660864410881344', selfLink: 'https://www.googleapis.com/storage/v1/b/test-bucket/o/test.txt', mediaLink: 'https://storage.googleapis.com/download/storage/v1/b/test-bucket/o/test.txt?generation=1660864410881344&alt=media', name: 'test.txt', bucket: 'test-bucket', generation: '1660864410881344', metageneration: '1', contentType: 'text/plain', storageClass: 'STANDARD', size: '3', md5Hash: 'kC+90rHfDE9wtKXSNSXpMg==', crc32c: 'iDmpfw==', etag: 'CMCa7InC0fkCEAE=', timeCreated: '2022-08-18T23:13:30.916Z', updated: '2022-08-18T23:13:30.916Z', timeStorageClassUpdated: '2022-08-18T23:13:30.916Z'
        });
      const result = await new GoogleCloudStoragePutNode('id', [[4]], {
        ...baseConfig,
        diskPathTemplate: diskPath
      }).run(contextify(), {});
      result[1].out.should.deepEqual({ success: true });
    });

    it('Should fail when diskPathTemplate resolves to a directory', async () => {
      fs.mkdirSync(readOnlyDir, { recursive: true });
      const result = await new GoogleCloudStoragePutNode('id', [[4]], {
        ...baseConfig,
        encodingTemplate: 'hex',
        diskPathTemplate: readOnlyDir
      }).run(contextify(), { });
      result[1].out.error.should.equal('The provided disk path is a directory.');
    });
    it('Should fail when diskPathTemplate resolves to nothing', async () => {
      const result = await new GoogleCloudStoragePutNode('id', [[4]], {
        ...baseConfig,
        encodingTemplate: 'hex',
        diskPathTemplate: '{{nothing}}'
      }).run(contextify(), { });
      result[1].out.error.should.equal('No file exists at ""');
    });
    it('Should fail when file is a losant path', async () => {
      await new GoogleCloudStoragePutNode('id', [[4]], {
        ...baseConfig,
        encodingTemplate: 'hex',
        diskPathTemplate: './foo.txt'
      }).run(contextify({
        diskUtils: protectedDiskUtils
      }), { })
        .should.be.rejectedWith({ message: 'Cannot access within the protected Losant Edge Agent directory.' });
    });

    it('Should fail when diskPathTemplate is a dangling symlink', async () => {
      const danglingLink = './gcs-put-dangling-link.txt';
      await fs.symlink('./nonexistent-target.txt', danglingLink);
      try {
        const result = await new GoogleCloudStoragePutNode('id', [[4]], {
          ...baseConfig,
          encodingTemplate: 'hex',
          diskPathTemplate: danglingLink
        }).run(contextify(), { });
        result[1].out.error.should.equal(`No file exists at "${danglingLink}"`);
      } finally {
        await fs.remove(danglingLink);
      }
    });
  });
  it('should upload a file from a stream', async () => {
    nock('https://www.googleapis.com:443', { encodedQueryParams: true })
      .post('/oauth2/v4/token')
      .reply(200, ['1f8b0800000000000013ab564a4c4e4e2d2e8e2fc9cf4ecd53b252aa4c34b2d44b4bcc4ed58588e828a556146416a516c76702a58d4d2d2d7594c032f1259505a9400d4ea98945a9454ab50031448f984a000000'], [
        'Content-Type',
        'application/json; charset=UTF-8',
        'Content-Encoding',
        'gzip'
      ]);

    nock('https://storage.googleapis.com:443', { encodedQueryParams: true })
      .post('/upload/storage/v1/b/test-bucket/o')
      .query({ uploadType: 'multipart', name: 'test.txt' })
      .reply(200, {
        kind: 'storage#object', id: 'test-bucket/test.txt/1660864410881344', selfLink: 'https://www.googleapis.com/storage/v1/b/test-bucket/o/test.txt', mediaLink: 'https://storage.googleapis.com/download/storage/v1/b/test-bucket/o/test.txt?generation=1660864410881344&alt=media', name: 'test.txt', bucket: 'test-bucket', generation: '1660864410881344', metageneration: '1', contentType: 'text/plain', storageClass: 'STANDARD', size: '3', md5Hash: 'kC+90rHfDE9wtKXSNSXpMg==', crc32c: 'iDmpfw==', etag: 'CMCa7InC0fkCEAE=', timeCreated: '2022-08-18T23:13:30.916Z', updated: '2022-08-18T23:13:30.916Z', timeStorageClassUpdated: '2022-08-18T23:13:30.916Z'
      });
    const result = await new GoogleCloudStoragePutNode('id', [[4]], {
      ...baseConfig,
      fileContentTemplate: '414243',
      encodingTemplate: 'hex'
    }).run({}, {});
    result[1].out.should.deepEqual({ success: true });
  });

  it('should upload a file from a url', async () => {
    nock('https://www.googleapis.com:443', { encodedQueryParams: true })
      .post('/oauth2/v4/token')
      .reply(200, ['1f8b0800000000000013ab564a4c4e4e2d2e8e2fc9cf4ecd53b252aa4c34b2d44b4bcc4ed58588e828a556146416a516c76702a58d4d2d2d7594c032f1259505a9400d4ea98945a9454ab50031448f984a000000'], [
        'Content-Type',
        'application/json; charset=UTF-8',
        'Content-Encoding',
        'gzip'
      ]);

    nock('https://example.com:443', { encodedQueryParams: true })
      .get('/')
      .reply(200, '<!doctype html>\n<html>\n<head>\n    <title>Example Domain</title>\n\n    <meta charset="utf-8" />\n    <meta http-equiv="Content-type" content="text/html; charset=utf-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1" />\n    <style type="text/css">\n    body {\n        background-color: #f0f0f2;\n        margin: 0;\n        padding: 0;\n        font-family: -apple-system, system-ui, BlinkMacSystemFont, "Segoe UI", "Open Sans", "Helvetica Neue", Helvetica, Arial, sans-serif;\n        \n    }\n    div {\n        width: 600px;\n        margin: 5em auto;\n        padding: 2em;\n        background-color: #fdfdff;\n        border-radius: 0.5em;\n        box-shadow: 2px 3px 7px 2px rgba(0,0,0,0.02);\n    }\n    a:link, a:visited {\n        color: #38488f;\n        text-decoration: none;\n    }\n    @media (max-width: 700px) {\n        div {\n            margin: 0 auto;\n            width: auto;\n        }\n    }\n    </style>    \n</head>\n\n<body>\n<div>\n    <h1>Example Domain</h1>\n    <p>This domain is for use in illustrative examples in documents. You may use this\n    domain in literature without prior coordination or asking for permission.</p>\n    <p><a href="https://www.iana.org/domains/example">More information...</a></p>\n</div>\n</body>\n</html>\n');

    nock('https://storage.googleapis.com:443', { encodedQueryParams: true })
      .post('/upload/storage/v1/b/test-bucket/o')
      .query({ uploadType: 'multipart', name: 'test.txt' })
      .reply(200, {
        kind: 'storage#object', id: 'test-bucket/test.txt/1660871257332815', selfLink: 'https://www.googleapis.com/storage/v1/b/test-bucket/o/test.txt', mediaLink: 'https://storage.googleapis.com/download/storage/v1/b/test-bucket/o/test.txt?generation=1660871257332815&alt=media', name: 'test.txt', bucket: 'test-bucket', generation: '1660871257332815', metageneration: '1', contentType: 'text/plain', storageClass: 'STANDARD', size: '1256', md5Hash: 'hCON/ICS5dnA2sjvkzcaBw==', crc32c: 'lR2VeA==', etag: 'CM+4vsrb0fkCEAE=', timeCreated: '2022-08-19T01:07:37.451Z', updated: '2022-08-19T01:07:37.451Z', timeStorageClassUpdated: '2022-08-19T01:07:37.451Z'
      });

    const result = await new GoogleCloudStoragePutNode('id', [[4]], {
      ...baseConfig,
      fileUrlTemplate: 'https://example.com/'
    }).run({}, {});
    result[1].out.should.deepEqual({ success: true });
  });

  it('should upload a file from a url with a project id passed in', async () => {
    nock('https://www.googleapis.com:443', { encodedQueryParams: true })
      .post('/oauth2/v4/token')
      .reply(200, ['1f8b0800000000000013ab564a4c4e4e2d2e8e2fc9cf4ecd53b252aa4c34b2d44b4bcc4ed58588e828a556146416a516c76702a58d4d2d2d7594c032f1259505a9400d4ea98945a9454ab50031448f984a000000'], [
        'Content-Type',
        'application/json; charset=UTF-8',
        'Content-Encoding',
        'gzip'
      ]);

    nock('https://example.com:443', { encodedQueryParams: true })
      .get('/')
      .reply(200, '<!doctype html>\n<html>\n<head>\n    <title>Example Domain</title>\n\n    <meta charset="utf-8" />\n    <meta http-equiv="Content-type" content="text/html; charset=utf-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1" />\n    <style type="text/css">\n    body {\n        background-color: #f0f0f2;\n        margin: 0;\n        padding: 0;\n        font-family: -apple-system, system-ui, BlinkMacSystemFont, "Segoe UI", "Open Sans", "Helvetica Neue", Helvetica, Arial, sans-serif;\n        \n    }\n    div {\n        width: 600px;\n        margin: 5em auto;\n        padding: 2em;\n        background-color: #fdfdff;\n        border-radius: 0.5em;\n        box-shadow: 2px 3px 7px 2px rgba(0,0,0,0.02);\n    }\n    a:link, a:visited {\n        color: #38488f;\n        text-decoration: none;\n    }\n    @media (max-width: 700px) {\n        div {\n            margin: 0 auto;\n            width: auto;\n        }\n    }\n    </style>    \n</head>\n\n<body>\n<div>\n    <h1>Example Domain</h1>\n    <p>This domain is for use in illustrative examples in documents. You may use this\n    domain in literature without prior coordination or asking for permission.</p>\n    <p><a href="https://www.iana.org/domains/example">More information...</a></p>\n</div>\n</body>\n</html>\n');

    nock('https://storage.googleapis.com:443', { encodedQueryParams: true })
      .post('/upload/storage/v1/b/test-bucket/o')
      .query({ uploadType: 'multipart', name: 'test.txt' })
      .reply(200, {
        kind: 'storage#object', id: 'test-bucket/test.txt/1660871257332815', selfLink: 'https://www.googleapis.com/storage/v1/b/test-bucket/o/test.txt', mediaLink: 'https://storage.googleapis.com/download/storage/v1/b/test-bucket/o/test.txt?generation=1660871257332815&alt=media', name: 'test.txt', bucket: 'test-bucket', generation: '1660871257332815', metageneration: '1', contentType: 'text/plain', storageClass: 'STANDARD', size: '1256', md5Hash: 'hCON/ICS5dnA2sjvkzcaBw==', crc32c: 'lR2VeA==', etag: 'CM+4vsrb0fkCEAE=', timeCreated: '2022-08-19T01:07:37.451Z', updated: '2022-08-19T01:07:37.451Z', timeStorageClassUpdated: '2022-08-19T01:07:37.451Z'
      });

    const jwtData = { ...GCP_JWT_INFO };
    delete jwtData.project_id;
    const result = await new GoogleCloudStoragePutNode('id', [[4]], {
      ...baseConfig,
      jwtData: JSON.stringify(jwtData),
      projectIdTemplate: '{{ id }}',
      fileUrlTemplate: 'https://example.com/'
    }).run({}, { id: 'test-playground' });
    result[1].out.should.deepEqual({ success: true });
  });


  it('should correctly error when trying to upload a non-hex file as hex', async () => {
    await new GoogleCloudStoragePutNode('id', [[4]], {
      ...baseConfig,
      fileContentTemplate: 'Not hex',
      encodingTemplate: 'hex'
    }).run({}, {}).should.be.rejectedWith({ message: 'Invalid hexadecimal string.' });
  });

  it('should correctly error when trying to upload a non-base64 file as base64', async () => {
    await new GoogleCloudStoragePutNode('id', [[4]], {
      ...baseConfig,
      fileContentTemplate: 'Not base64',
      encodingTemplate: 'base64'
    }).run({}, {}).should.be.rejectedWith({ message: 'Invalid base64 string.' });
  });

  it('should correctly error when using a bad url', async () => {
    nock('https://files.example.com:443', { encodedQueryParams: true })
      .get('/000000000000000000000000/Example/000000000000000000000000-deviceExport-1571785189245.csv')
      .reply(404, '<!doctype html>\n<html lang="en">\n<head>\n    <meta charset="utf-8">\n    <title>Page Not Found</title>\n    <meta name="viewport" content="width=device-width, initial-scale=1">\n    <style>\n\n        * {\n            line-height: 1.2;\n            margin: 0;\n        }\n\n        html {\n            color: #888;\n            display: table;\n            font-family: sans-serif;\n            height: 100%;\n            text-align: center;\n            width: 100%;\n        }\n\n        body {\n            display: table-cell;\n            vertical-align: middle;\n            margin: 2em auto;\n        }\n\n        h1 {\n            color: #555;\n            font-size: 2em;\n            font-weight: 400;\n        }\n\n        p {\n            margin: 0 auto;\n            width: 280px;\n        }\n\n        @media only screen and (max-width: 280px) {\n\n            body, p {\n                width: 95%;\n            }\n\n            h1 {\n                font-size: 1.5em;\n                margin: 0 0 0.3em;\n            }\n\n        }\n\n    </style>\n</head>\n<body>\n    <h1>Page Not Found</h1>\n    <p>Sorry, but the page you were trying to view does not exist.</p>\n</body>\n</html>\n<!-- IE needs 512+ bytes: https://blogs.msdn.microsoft.com/ieinternals/2010/08/18/friendly-http-error-pages/ -->');

    const result = await new GoogleCloudStoragePutNode('id', [[4]], {
      ...baseConfig,
      fileUrlTemplate: 'https://files.example.com/000000000000000000000000/Example/000000000000000000000000-deviceExport-1571785189245.csv'
    }).run({}, {});
    result[1].out.should.deepEqual({ error: 'Request failed with status code 404', success: false });
  });

  it('should correctly error when a timeout occurs on download', async () => {
    nock('https://files.example.com:443', { encodedQueryParams: true })
      .get('/000000000000000000000000/Example/000000000000000000000000-deviceExport-1571785189245.csv')
      .delay(500)
      .reply(404, '<!doctype html>\n<html lang="en">\n<head>\n    <meta charset="utf-8">\n    <title>Page Not Found</title>\n    <meta name="viewport" content="width=device-width, initial-scale=1">\n    <style>\n\n        * {\n            line-height: 1.2;\n            margin: 0;\n        }\n\n        html {\n            color: #888;\n            display: table;\n            font-family: sans-serif;\n            height: 100%;\n            text-align: center;\n            width: 100%;\n        }\n\n        body {\n            display: table-cell;\n            vertical-align: middle;\n            margin: 2em auto;\n        }\n\n        h1 {\n            color: #555;\n            font-size: 2em;\n            font-weight: 400;\n        }\n\n        p {\n            margin: 0 auto;\n            width: 280px;\n        }\n\n        @media only screen and (max-width: 280px) {\n\n            body, p {\n                width: 95%;\n            }\n\n            h1 {\n                font-size: 1.5em;\n                margin: 0 0 0.3em;\n            }\n\n        }\n\n    </style>\n</head>\n<body>\n    <h1>Page Not Found</h1>\n    <p>Sorry, but the page you were trying to view does not exist.</p>\n</body>\n</html>\n<!-- IE needs 512+ bytes: https://blogs.msdn.microsoft.com/ieinternals/2010/08/18/friendly-http-error-pages/ -->');

    const result = await new GoogleCloudStoragePutNode('id', [[4]], {
      ...baseConfig,
      fileUrlTemplate: 'https://files.example.com/000000000000000000000000/Example/000000000000000000000000-deviceExport-1571785189245.csv'
    }).run({ externalTimeout: 250 }, {});
    result[1].out.should.deepEqual({ error: { type: 'NodeTimeout', message: 'Timeout running Google Cloud Storage: Upload node' }, success: false });
  });

  it('should check config properly', async () => {
    await new GoogleCloudStoragePutNode('id', [[4]], {}).run({}, {})
      .should.be.rejectedWith(errors.Validation({ message: 'Files must provide a content type' }));

    await new GoogleCloudStoragePutNode('id', [[4]], { contentTypeTemplate: 'text/plain', jwtData: { } }).run({}, {})
      .should.be.rejectedWith(errors.Validation({ message: 'Project ID is required' }));
  });
});
