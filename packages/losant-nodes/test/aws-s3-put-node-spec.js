import { nock, contextify, protectedDiskUtils } from './common.js';
import AwsS3PutNode from '../src/aws-s3-put-node.js';
import should from 'should';
import errors from 'losant-nodejs-utils/src/errors.js';
import { mockClient } from 'aws-sdk-client-mock';
import { S3 } from 'losant-nodejs-utils/src/utils/s3.js';
import fs from 'fs-extra';

describe('AwsS3PutNode', () => {
  let node, s3Mock;

  beforeEach(() => {
    s3Mock = mockClient(S3);
    node = new AwsS3PutNode('id', [[4]], {
      destination: 'data.out',
      accessKeyIdTemplate: '{{accessKey}}',
      secretAccessKeyTemplate: '{{secret}}',
      regionTemplate: 'us-east-1',
      bucketNameTemplate: 'bucket',
      fileNameTemplate: 'test.txt',
      contentTypeTemplate: 'text'
    });
  });

  afterEach(() => {
    s3Mock.restore();
  });

  it('should validate that region exists', async () => {
    node.regionTemplate = '{{ region }}';
    const errorResult = await node.run({}, { accessKey: 'JIUW024UOI', secret: 'IWUEN248U29UNE9F8N' }).catch((err) => { return err; });
    errorResult.message.should.equal('Missing AWS Region');
  });

  it('should upload a file from a stream', async () => {
    node.fileContentTemplate = 'hello world....';
    const result = await node.run({}, { accessKey: 'required', secret: 'required' });
    result[1].data.out.should.deepEqual({ success: true });
  });
  describe('reading from a local path', async () => {
    const readOnlyDir = './read-only-test-dir';
    afterEach(() => {
      node.diskPathTemplate = '';
      fs.rmSync('./foo.txt', { force: true });
      fs.rmSync(readOnlyDir, { recursive: true, force: true });
    });
    it('should upload a file from a disk path', async () => {
      node.diskPathTemplate = './foo.txt';
      await fs.writeFile(node.diskPathTemplate, 'ABC');
      const result = await node.run(contextify(), { accessKey: 'required', secret: 'required' });
      result[1].data.out.should.deepEqual({ success: true });
    });

    it('should upload a file from a disk path', async () => {
      s3Mock.restore();
      nock('https://bucket.s3.us-east-1.amazonaws.com:443', { encodedQueryParams: true })
        .put('/test.txt', 'some small text')
        .query({ 'x-id': 'PutObject' })
        .reply(301, 'Redirect', [
          'x-amz-bucket-region',
          'us-east-2'
        ]);
      nock('https://bucket.s3.us-east-2.amazonaws.com:443', { encodedQueryParams: true })
        .put('/test.txt', 'some small text')
        .query({ 'x-id': 'PutObject' })
        .reply(200, '');

      node.diskPathTemplate = './foo.txt';
      await fs.writeFile(node.diskPathTemplate, 'some small text');
      const result = await node.run(contextify(), { accessKey: 'required', secret: 'required' });
      result[1].data.out.should.deepEqual({ success: true });
    });
    it('Should fail when diskPathTemplate resolves to a directory', async () => {
      fs.mkdirSync(readOnlyDir, { recursive: true });
      node.encodingTemplate = 'hex';
      node.diskPathTemplate = readOnlyDir;
      const result = await node.run(contextify(), { accessKey: 'required', secret: 'required' });
      result[1].data.out.error.should.equal('The provided disk path is a directory.');
    });
    it('Should fail when diskPathTemplate resolves to nothing', async () => {
      fs.mkdirSync(readOnlyDir, { recursive: true });
      node.encodingTemplate = 'hex';
      node.diskPathTemplate = '{{nothing}}';
      const result = await node.run(contextify(), { accessKey: 'required', secret: 'required' });
      result[1].data.out.error.should.equal('No file exists at ""');
    });
    it('Should fail when file is a losant path', async () => {
      fs.mkdirSync(readOnlyDir, { recursive: true });
      node.encodingTemplate = 'hex';
      node.diskPathTemplate = './foo.txt';
      await node.run(contextify({
        diskUtils: protectedDiskUtils
      }), { accessKey: 'required', secret: 'required' })
        .should.be.rejectedWith({ message: 'Cannot access within the protected Losant Edge Agent directory.' });
    });

    it('Should fail when diskPathTemplate is a dangling symlink', async () => {
      const danglingLink = './s3-put-dangling-link.txt';
      await fs.symlink('./nonexistent-target.txt', danglingLink);
      try {
        node.encodingTemplate = 'hex';
        node.diskPathTemplate = danglingLink;
        const result = await node.run(contextify(), { accessKey: 'required', secret: 'required' });
        result[1].data.out.error.should.equal(`No file exists at "${danglingLink}"`);
      } finally {
        await fs.remove(danglingLink);
      }
    });
  });

  it('should upload a file from a stream', async () => {
    s3Mock.restore();
    nock('https://bucket.s3.us-east-1.amazonaws.com:443', { encodedQueryParams: true })
      .put('/test.txt', 'some small text')
      .query({ 'x-id': 'PutObject' })
      .reply(301, 'Redirect', [
        'x-amz-bucket-region',
        'us-east-2'
      ]);
    nock('https://bucket.s3.us-east-2.amazonaws.com:443', { encodedQueryParams: true })
      .put('/test.txt', 'some small text')
      .query({ 'x-id': 'PutObject' })
      .reply(200, '');
    node.fileContentTemplate = 'some small text';
    const result = await node.run({}, { accessKey: 'required', secret: 'required' });
    result[1].data.out.should.deepEqual({ success: true });
  });

  it('should upload a file from a stream', async () => {
    s3Mock.restore();
    const resp = '<!doctype html>\n<html>\n<head>\n    <title>Example Domain</title>\n\n    <meta charset="utf-8" />\n    <meta http-equiv="Content-type" content="text/html; charset=utf-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1" />\n    <style type="text/css">\n    body {\n        background-color: #f0f0f2;\n        margin: 0;\n        padding: 0;\n        font-family: -apple-system, system-ui, BlinkMacSystemFont, "Segoe UI", "Open Sans", "Helvetica Neue", Helvetica, Arial, sans-serif;\n        \n    }\n    div {\n        width: 600px;\n        margin: 5em auto;\n        padding: 2em;\n        background-color: #fdfdff;\n        border-radius: 0.5em;\n        box-shadow: 2px 3px 7px 2px rgba(0,0,0,0.02);\n    }\n    a:link, a:visited {\n        color: #38488f;\n        text-decoration: none;\n    }\n    @media (max-width: 700px) {\n        div {\n            margin: 0 auto;\n            width: auto;\n        }\n    }\n    </style>    \n</head>\n\n<body>\n<div>\n    <h1>Example Domain</h1>\n    <p>This domain is for use in illustrative examples in documents. You may use this\n    domain in literature without prior coordination or asking for permission.</p>\n    <p><a href="https://www.iana.org/domains/example">More information...</a></p>\n</div>\n</body>\n</html>\n';
    nock('https://bucket.s3.us-east-1.amazonaws.com:443', { encodedQueryParams: true })
      .put('/test.txt', resp)
      .query({ 'x-id': 'PutObject' })
      .reply(301, 'Redirect', [
        'x-amz-bucket-region',
        'us-east-2'
      ]);
    nock('https://bucket.s3.us-east-2.amazonaws.com:443', { encodedQueryParams: true })
      .put('/test.txt', resp)
      .query({ 'x-id': 'PutObject' })
      .reply(200, '');

    nock('https://example.com:443', { encodedQueryParams: true })
      .get('/')
      .twice()
      .reply(200, resp);

    node.fileContentTemplate = '';
    node.fileUrlTemplate = 'https://example.com/';
    node.fileNameTemplate = 'test.txt';
    const result = await node.run({}, { accessKey: 'required', secret: 'required' });
    result[1].data.out.should.deepEqual({ success: true });
  });

  it('should upload a file from a url', async () => {
    node.fileContentTemplate = '';
    node.fileUrlTemplate = 'https://example.com/';
    node.fileNameTemplate = 'test.txt';

    nock('https://example.com:443', { encodedQueryParams: true })
      .get('/')
      .reply(200, '<!doctype html>\n<html>\n<head>\n    <title>Example Domain</title>\n\n    <meta charset="utf-8" />\n    <meta http-equiv="Content-type" content="text/html; charset=utf-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1" />\n    <style type="text/css">\n    body {\n        background-color: #f0f0f2;\n        margin: 0;\n        padding: 0;\n        font-family: -apple-system, system-ui, BlinkMacSystemFont, "Segoe UI", "Open Sans", "Helvetica Neue", Helvetica, Arial, sans-serif;\n        \n    }\n    div {\n        width: 600px;\n        margin: 5em auto;\n        padding: 2em;\n        background-color: #fdfdff;\n        border-radius: 0.5em;\n        box-shadow: 2px 3px 7px 2px rgba(0,0,0,0.02);\n    }\n    a:link, a:visited {\n        color: #38488f;\n        text-decoration: none;\n    }\n    @media (max-width: 700px) {\n        div {\n            margin: 0 auto;\n            width: auto;\n        }\n    }\n    </style>    \n</head>\n\n<body>\n<div>\n    <h1>Example Domain</h1>\n    <p>This domain is for use in illustrative examples in documents. You may use this\n    domain in literature without prior coordination or asking for permission.</p>\n    <p><a href="https://www.iana.org/domains/example">More information...</a></p>\n</div>\n</body>\n</html>\n');

    const result = await node.run({}, { accessKey: 'UNGRGWIN2324TON3OWE', secret: 'JGNWR24OTN24OG2IG2OL4' });
    result[1].data.out.should.deepEqual({ success: true });
  });

  it('should upload a file with custom encoding', async () => {
    node.fileContentTemplate = '414243';
    node.encodingTemplate = 'hex';
    const result = await node.run({}, { accessKey: 'UNGRGWIN2324TON3OWE', secret: 'JGNWR24OTN24OG2IG2OL4' });
    result[1].data.out.should.deepEqual({ success: true });
    const params = s3Mock.calls()[0].firstArg.input;
    params.Bucket.should.deepEqual('bucket');
    params.Key.should.deepEqual('test.txt');
    params.ContentType.should.deepEqual('text');
  });

  it('should propagate errors from AWS', async () => {
    s3Mock.onAnyCommand().rejects('Some error');
    const result = await node.run({}, { accessKey: 'UNGRGWIN2324TON3OWE', secret: 'JGNWR24OTN24OG2IG2OL4' });
    result[1].data.out.should.deepEqual({ error: 'Some error', success: false });
  });

  it('should correctly error when trying to upload a non-hex file as hex', async () => {
    node.fileContentTemplate = 'Not hexadecimal';
    node.encodingTemplate = 'hex';

    await node.run({},
      {
        accessKey: 'UNGRGWIN2324TON3OWE',
        secret: 'JGNWR24OTN24OG2IG2OL4'
      }).should.be.rejectedWith({ message: 'Invalid hexadecimal string.' });
  });

  it('should correctly error when trying to upload a non-base64 file as base64', async () => {
    node.fileContentTemplate = 'Not base64';
    node.encodingTemplate = 'base64';

    await node.run({},
      {
        accessKey: 'UNGRGWIN2324TON3OWE',
        secret: 'JGNWR24OTN24OG2IG2OL4'
      }).should.be.rejectedWith({ message: 'Invalid base64 string.' });
  });

  it('should correctly error when using a bad url', async () => {
    node.fileContentTemplate = '';
    node.fileUrlTemplate = 'https://files.example.com/000000000000000000000000/Example/000000000000000000000000-deviceExport-1571785189245.csv';
    node.fileNameTemplate = 'test.txt';

    nock('https://files.example.com:443', { encodedQueryParams: true })
      .get('/000000000000000000000000/Example/000000000000000000000000-deviceExport-1571785189245.csv')
      .reply(404, '<!doctype html>\n<html lang="en">\n<head>\n    <meta charset="utf-8">\n    <title>Page Not Found</title>\n    <meta name="viewport" content="width=device-width, initial-scale=1">\n    <style>\n\n        * {\n            line-height: 1.2;\n            margin: 0;\n        }\n\n        html {\n            color: #888;\n            display: table;\n            font-family: sans-serif;\n            height: 100%;\n            text-align: center;\n            width: 100%;\n        }\n\n        body {\n            display: table-cell;\n            vertical-align: middle;\n            margin: 2em auto;\n        }\n\n        h1 {\n            color: #555;\n            font-size: 2em;\n            font-weight: 400;\n        }\n\n        p {\n            margin: 0 auto;\n            width: 280px;\n        }\n\n        @media only screen and (max-width: 280px) {\n\n            body, p {\n                width: 95%;\n            }\n\n            h1 {\n                font-size: 1.5em;\n                margin: 0 0 0.3em;\n            }\n\n        }\n\n    </style>\n</head>\n<body>\n    <h1>Page Not Found</h1>\n    <p>Sorry, but the page you were trying to view does not exist.</p>\n</body>\n</html>\n<!-- IE needs 512+ bytes: https://blogs.msdn.microsoft.com/ieinternals/2010/08/18/friendly-http-error-pages/ -->');

    const result = await node.run({}, { accessKey: 'UNGRGWIN2324TON3OWE', secret: 'JGNWR24OTN24OG2IG2OL4' });
    result[1].data.out.should.deepEqual({ error: 'Request failed with status code 404', success: false });
  });

  it('should correctly error when a timeout occurs on download', async () => {
    node.fileContentTemplate = '';
    node.fileUrlTemplate = 'https://files.example.com/000000000000000000000000/Example/000000000000000000000000-deviceExport-1571785189245.csv';
    node.fileNameTemplate = 'test.txt';

    nock('https://files.example.com:443', { encodedQueryParams: true })
      .get('/000000000000000000000000/Example/000000000000000000000000-deviceExport-1571785189245.csv')
      .delay(500)
      .reply(404, '<!doctype html>\n<html lang="en">\n<head>\n    <meta charset="utf-8">\n    <title>Page Not Found</title>\n    <meta name="viewport" content="width=device-width, initial-scale=1">\n    <style>\n\n        * {\n            line-height: 1.2;\n            margin: 0;\n        }\n\n        html {\n            color: #888;\n            display: table;\n            font-family: sans-serif;\n            height: 100%;\n            text-align: center;\n            width: 100%;\n        }\n\n        body {\n            display: table-cell;\n            vertical-align: middle;\n            margin: 2em auto;\n        }\n\n        h1 {\n            color: #555;\n            font-size: 2em;\n            font-weight: 400;\n        }\n\n        p {\n            margin: 0 auto;\n            width: 280px;\n        }\n\n        @media only screen and (max-width: 280px) {\n\n            body, p {\n                width: 95%;\n            }\n\n            h1 {\n                font-size: 1.5em;\n                margin: 0 0 0.3em;\n            }\n\n        }\n\n    </style>\n</head>\n<body>\n    <h1>Page Not Found</h1>\n    <p>Sorry, but the page you were trying to view does not exist.</p>\n</body>\n</html>\n<!-- IE needs 512+ bytes: https://blogs.msdn.microsoft.com/ieinternals/2010/08/18/friendly-http-error-pages/ -->');

    const result = await node.run({ externalTimeout: 250 }, { accessKey: 'UNGRGWIN2324TON3OWE', secret: 'JGNWR24OTN24OG2IG2OL4' });
    result[1].data.out.should.deepEqual({ error: { type: 'NodeTimeout', message: 'Timeout running AWS S3: Put node' }, success: false });
  });

  it('should correctly error when a timeout occurs on upload', async () => {
    s3Mock.restore();
    node.fileContentTemplate = '';
    node.fileUrlTemplate = 'https://example.com/';
    node.fileNameTemplate = 'test.txt';

    nock('https://example.com:443', { encodedQueryParams: true })
      .get('/')
      .reply(200, '<!doctype html>\n<html>\n<head>\n    <title>Example Domain</title>\n\n    <meta charset="utf-8" />\n    <meta http-equiv="Content-type" content="text/html; charset=utf-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1" />\n    <style type="text/css">\n    body {\n        background-color: #f0f0f2;\n        margin: 0;\n        padding: 0;\n        font-family: -apple-system, system-ui, BlinkMacSystemFont, "Segoe UI", "Open Sans", "Helvetica Neue", Helvetica, Arial, sans-serif;\n        \n    }\n    div {\n        width: 600px;\n        margin: 5em auto;\n        padding: 2em;\n        background-color: #fdfdff;\n        border-radius: 0.5em;\n        box-shadow: 2px 3px 7px 2px rgba(0,0,0,0.02);\n    }\n    a:link, a:visited {\n        color: #38488f;\n        text-decoration: none;\n    }\n    @media (max-width: 700px) {\n        div {\n            margin: 0 auto;\n            width: auto;\n        }\n    }\n    </style>    \n</head>\n\n<body>\n<div>\n    <h1>Example Domain</h1>\n    <p>This domain is for use in illustrative examples in documents. You may use this\n    domain in literature without prior coordination or asking for permission.</p>\n    <p><a href="https://www.iana.org/domains/example">More information...</a></p>\n</div>\n</body>\n</html>\n');


    nock('https://bucket.s3.us-east-1.amazonaws.com:443', { encodedQueryParams: true })
      .put('/test.txt?x-id=PutObject')
      .optionally()
      .delay(250)
      .reply(200, '');

    const result = await node.run({ externalTimeout: 200 }, { accessKey: 'UNGRGWIN2324TON3OWE', secret: 'JGNWR24OTN24OG2IG2OL4' });
    result[1].data.out.should.deepEqual({ error: { type: 'NodeTimeout', message: 'Timeout running AWS S3: Put node' }, success: false });
  });

  it('should check config properly', async () => {
    node.fileContentTemplate = '414243';
    node.encodingTemplate = 'utf8';
    await node.run({}, {}).should.be.rejectedWith(errors.MissingField({ title: 'AWS Access Key ID' }));
  });

  describe('Server Encryption', () => {
    const runWithServerSideEncryption = async ({ value }) => {
      node.serverSideEncryption = value;

      const result = await node.run({}, { accessKey: 'UNGRGWIN2324TON3OWE', secret: 'JGNWR24OTN24OG2IG2OL4' });
      return { params: s3Mock.calls()[0].firstArg.input, result };
    };

    it('should correctly set the server side encryption value when a valid value is provided in config', async () => {
      const { params, result } = await runWithServerSideEncryption({ value: 'AES256' });
      params.ServerSideEncryption.should.equal('AES256');
      result[1].data.out.should.deepEqual({ success: true });
    });

    it('should correctly set the server side encryption value when not provided/defined in config', async () => {
      const { params, result } = await runWithServerSideEncryption({ value: undefined });
      should.not.exist(params.ServerSideEncryption);
      result[1].data.out.should.deepEqual({ success: true });
    });

    it('should throw a validation error when invalid value is provided', async () => {
      await runWithServerSideEncryption({ value: '42foo43' }).should.be.rejectedWith({ message: 'serverSideEncryption invalid. Must be one of the following: AES256' });
    });
  });
});
