import { tk, contextify, protectedDiskUtils } from './common.js';
import AwsS3GetNode from '../src/aws-s3-get-node.js';
import stream from 'node:stream';
import errors from 'losant-nodejs-utils/src/errors.js';
import AwsS3PutNode from '../src/aws-s3-put-node.js';
import fs from 'fs';
import path from 'node:path';
import { S3, GetObjectCommand, HeadObjectCommand } from 'losant-nodejs-utils/src/utils/s3.js';
import { mockClient } from 'aws-sdk-client-mock';
import { awsConfig } from 'losant-nodejs-utils/test/utils/testing-constants.js';

const ACCESS_KEY_ID = awsConfig.accessKeyId;
const ACCESS_SECRET_KEY = awsConfig.secretAccessKey;

describe('AwsS3GetNode', () => {
  let node, s3Mock;

  beforeEach(() => {
    s3Mock = mockClient(S3);
    node = new AwsS3GetNode('id', [[4]], {
      destination: 'data.out',
      accessKeyIdTemplate: '{{accessKey}}',
      secretAccessKeyTemplate: '{{secret}}',
      regionTemplate: 'us-east-1',
      bucketNameTemplate: 'bucket',
      fileNameTemplate: 'test.txt'
    });
  });

  afterEach( () => {
    s3Mock.restore();
  });

  it('should validate that region exists', async () => {
    node.regionTemplate = '{{ region }}';
    const errorResult = await node.run({}, { accessKey: ACCESS_KEY_ID, secret: ACCESS_SECRET_KEY }).catch((err) => { return err; });
    errorResult.message.should.equal('Missing AWS Region');
  });

  it('Should get a file even when the region is incorrect', async () => {
    s3Mock.on(HeadObjectCommand).resolvesOnce({
      response: {
        statusCode: 301,
        headers: {
          'x-amz-bucket-region': 'us-west-2'
        }
      }
    });
    s3Mock.on(HeadObjectCommand).resolves({
      ETag: '"49f68a5c8493ec2c0bf489821c21fc3b"',
      ContentType: 'text/plain'
    });
    const readStream = new stream.Readable();
    readStream.push("I'm a result!");
    readStream.push(null);
    s3Mock.on(GetObjectCommand).resolves({ Body: readStream });

    const result = await node.run({}, { accessKey: ACCESS_KEY_ID, secret: ACCESS_SECRET_KEY });
    result[1].data.out.should.deepEqual({
      metadata: {
        ETag: '"49f68a5c8493ec2c0bf489821c21fc3b"',
        ContentType: 'text/plain'
      },
      value: "I'm a result!"
    });
  });

  it('Should read a file from a stream', async () => {
    s3Mock.on(HeadObjectCommand).rejects({ code: 404 });
    const result = await node.run({}, { accessKey: ACCESS_KEY_ID, secret: ACCESS_SECRET_KEY });
    result[1].data.out.should.deepEqual({ error: 'The file test.txt was not found.' });
  });

  it('Should read a file from a stream', async () => {
    s3Mock.on(HeadObjectCommand).resolves({ meta: true });
    const readStream = new stream.Readable();
    readStream.push("I'm a result!");
    readStream.push(null);
    s3Mock.on(GetObjectCommand).resolves({ Body: readStream });

    const result = await node.run({}, { accessKey: ACCESS_KEY_ID, secret: ACCESS_SECRET_KEY });
    result[1].data.out.value.should.deepEqual("I'm a result!");
  });

  it('Should get a download link to a file', async () => {
    tk.freeze(0);
    s3Mock.on(HeadObjectCommand).resolves({ meta: true });
    node.isDownloadURL = true;
    s3Mock.on(GetObjectCommand).resolves();

    const result = await node.run({}, { accessKey: ACCESS_KEY_ID, secret: ACCESS_SECRET_KEY });

    result[1].data.out.value.should.deepEqual(`https://bucket.s3.us-east-1.amazonaws.com/test.txt?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=${ACCESS_KEY_ID}%2F19700101%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Date=19700101T000000Z&X-Amz-Expires=604800&X-Amz-Signature=6b5941c7449333f25169f4f93f7c689c27e3728080726a57e5da5c2f4090f92a&X-Amz-SignedHeaders=host&x-amz-checksum-mode=ENABLED&x-id=GetObject`);
  });

  it('Should ignore encoding when getting a download link', async () => {
    tk.freeze(0);
    s3Mock.on(HeadObjectCommand).resolves({ meta: true });
    node.isDownloadURL = true;
    node.encodingTemplate = 'foo';
    s3Mock.on(GetObjectCommand).resolves();

    const result = await node.run({}, { accessKey: ACCESS_KEY_ID, secret: ACCESS_SECRET_KEY });

    result[1].data.out.value.should.deepEqual(`https://bucket.s3.us-east-1.amazonaws.com/test.txt?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=${ACCESS_KEY_ID}%2F19700101%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Date=19700101T000000Z&X-Amz-Expires=604800&X-Amz-Signature=6b5941c7449333f25169f4f93f7c689c27e3728080726a57e5da5c2f4090f92a&X-Amz-SignedHeaders=host&x-amz-checksum-mode=ENABLED&x-id=GetObject`);
  });

  it('should check config properly', async () => {
    await node.run({}, {}).should.be.rejectedWith(errors.MissingField({ title: 'AWS Access Key ID' }));
  });

  it('Should download a file with custom encoding', async () => {
    s3Mock.on(HeadObjectCommand).resolves({ meta: true });
    node.encodingTemplate = 'hex';
    const readStream = new stream.Readable();
    readStream.push('ABC');
    readStream.push(null);
    s3Mock.on(GetObjectCommand).resolves({ Body: readStream });

    const result = await node.run({}, { accessKey: ACCESS_KEY_ID, secret: ACCESS_SECRET_KEY });
    result[1].data.out.value.should.deepEqual('414243');
  });

  it('Should get metadata', async () => {
    tk.freeze(0);
    s3Mock.on(HeadObjectCommand).resolves('meta');
    node.isDownloadURL = true;
    s3Mock.on(GetObjectCommand).resolves();

    const result = await node.run({}, { accessKey: ACCESS_KEY_ID, secret: ACCESS_SECRET_KEY });

    result[1].data.out.should.deepEqual({
      value: `https://bucket.s3.us-east-1.amazonaws.com/test.txt?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=${ACCESS_KEY_ID}%2F19700101%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Date=19700101T000000Z&X-Amz-Expires=604800&X-Amz-Signature=6b5941c7449333f25169f4f93f7c689c27e3728080726a57e5da5c2f4090f92a&X-Amz-SignedHeaders=host&x-amz-checksum-mode=ENABLED&x-id=GetObject`,
      metadata: 'meta'
    });
  });

  it('Should propagate errors from AWS', async () => {
    s3Mock.on(HeadObjectCommand).resolves({ meta: true });
    node.isDownloadURL = true;
    s3Mock.onAnyCommand().rejects('Some error');
    const result = await node.run({}, { accessKey: ACCESS_KEY_ID, secret: ACCESS_SECRET_KEY });
    result[1].data.out.error.should.deepEqual('Some error');
  });

  it('Should error when trying to read a too big file', async () => {
    s3Mock.on(HeadObjectCommand).resolves({ meta: true });
    const readStream = new stream.Readable();
    for (let i = 0; i < 120000; i++) {
      readStream.push('The quick brown fox jumped over the lazy dog.');
    }
    readStream.push(null);
    s3Mock.on(GetObjectCommand).resolves({ Body: readStream });

    const result = await node.run({}, { accessKey: ACCESS_KEY_ID, secret: ACCESS_SECRET_KEY });
    result[1].data.out.error.should.deepEqual('File size cannot exceed 5MB');
  });

  it('should error when trying to download a file that does not exist', async () => {
    s3Mock.on(HeadObjectCommand).rejects({ code: 'NoSuchKey' });
    const result = await node.run({}, { accessKey: ACCESS_KEY_ID, secret: ACCESS_SECRET_KEY });
    result[1].data.out.error.should.deepEqual('The file test.txt was not found.');
  });

  it('should get the same error from put and get when access key and secret are invalid', async () => {
    s3Mock.rejects({
      error: 'The AWS Access Key Id you provided does not exist in our records.'
    });

    let data = await fs.readFileSync(new URL('./__fixtures__/fake-icon.png', import.meta.url));
    data = data.toString('binary');

    const putNode = new AwsS3PutNode('id', [[4]], {
      destination: 'data.out',
      accessKeyIdTemplate: ACCESS_KEY_ID,
      secretAccessKeyTemplate: ACCESS_SECRET_KEY,
      regionTemplate: 'us-west-2',
      bucketNameTemplate: 'losant-test',
      fileNameTemplate: 'data/test.png',
      contentTypeTemplate: 'image/png',
      fileContentTemplate: data,
      encodingTemplate: 'binary'
    });
    const putResult = await putNode.run({}, {});
    const getNode = new AwsS3GetNode('id', [[4]], {
      destination: 'data.out',
      accessKeyIdTemplate: ACCESS_KEY_ID,
      secretAccessKeyTemplate: ACCESS_SECRET_KEY,
      regionTemplate: 'us-west-2',
      bucketNameTemplate: 'losant-test',
      fileNameTemplate: 'data/test.png',
      encodingTemplate: 'binary',
      isDownloadURL: true
    });
    const getResult = await getNode.run({}, {});
    putResult[1].data.out.error.should.equal(getResult[1].data.out.error);
  });

  describe('writing to local path', async () => {
    const readOnlyDir = './read-only-test-dir';
    beforeEach(() => {
      s3Mock.on(HeadObjectCommand).resolves({ meta: true });
      node.diskPathTemplate = './foo.txt';
      node.errorIfFileExists = false;
      node.shouldAppend = false;
      const readStream = new stream.Readable();
      readStream.push('ABC');
      readStream.push(null);
      s3Mock.on(GetObjectCommand).resolves({ Body: readStream });
    });
    afterEach(() => {
      node.diskPathTemplate = '';
      fs.rmSync('./foo.txt', { force: true });
      if (fs.existsSync(readOnlyDir)) {
        fs.chmodSync(readOnlyDir, 0o755);
        fs.rmSync(readOnlyDir, { recursive: true, force: true });
      }
    });
    it('Should download a file to the disk', async () => {
      const result = await node.run(contextify(), { accessKey: ACCESS_KEY_ID, secret: ACCESS_SECRET_KEY });
      result[1].data.out.value.should.deepEqual(path.resolve('./foo.txt'));
      (fs.readFileSync(node.diskPathTemplate, { encoding: 'utf8' })).should.deepEqual('ABC');
    });

    it('Should error if file exists', async () => {
      fs.writeFileSync('./foo.txt', 'EXISTING');
      node.errorIfFileExists = true;
      const result = await node.run(contextify(), { accessKey: ACCESS_KEY_ID, secret: ACCESS_SECRET_KEY });
      result[1].data.out.should.deepEqual({ error: `EEXIST: file already exists, open '${path.resolve('./foo.txt')}'` });
      (fs.readFileSync(node.diskPathTemplate, { encoding: 'utf8' })).should.deepEqual('EXISTING');
    });

    it('Should append if file exists', async () => {
      fs.writeFileSync('./foo.txt', 'EXISTING');
      node.shouldAppend = true;
      const result = await node.run(contextify(), { accessKey: ACCESS_KEY_ID, secret: ACCESS_SECRET_KEY });
      result[1].data.out.value.should.deepEqual(path.resolve('./foo.txt'));
      (fs.readFileSync(node.diskPathTemplate, { encoding: 'utf8' })).should.deepEqual('EXISTINGABC');
    });

    it('Should download a file to the disk', async () => {
      node.encodingTemplate = 'hex';
      const result = await node.run(contextify(), { accessKey: ACCESS_KEY_ID, secret: ACCESS_SECRET_KEY });
      result[1].data.out.value.should.deepEqual(path.resolve('./foo.txt'));
      (fs.readFileSync(node.diskPathTemplate, { encoding: 'utf8' })).should.deepEqual('414243');
    });

    it('Should fail when diskPathTemplate resolves to a directory', async () => {
      fs.mkdirSync(readOnlyDir, { recursive: true });
      node.encodingTemplate = 'hex';
      node.diskPathTemplate = readOnlyDir;
      const result = await node.run(contextify(), { accessKey: ACCESS_KEY_ID, secret: ACCESS_SECRET_KEY });
      result[1].data.out.error.should.equal(`EISDIR: illegal operation on a directory, open '${path.resolve(readOnlyDir)}'`);
    });
    it('Should fail when diskPathTemplate resolves to nothing', async () => {
      node.encodingTemplate = 'hex';
      node.diskPathTemplate = '{{nothing}}';
      await node.run(contextify(), { accessKey: ACCESS_KEY_ID, secret: ACCESS_SECRET_KEY })
        .should.be.rejectedWith({ message: 'The provided disk path cannot be empty.' });
    });
    it('Should fail when file is a losant path', async () => {
      node.encodingTemplate = 'hex';
      node.diskPathTemplate = './foo.txt';
      await node.run(contextify({
        diskUtils: protectedDiskUtils
      }), { accessKey: ACCESS_KEY_ID, secret: ACCESS_SECRET_KEY })
        .should.be.rejectedWith({ message: 'Cannot access within the protected Losant Edge Agent directory.' });
    });

    it('Should fail when diskPathTemplate is a dangling symlink', async () => {
      const danglingLink = './s3-get-dangling-link.txt';
      await fs.promises.symlink('./nonexistent-target.txt', danglingLink);
      try {
        node.encodingTemplate = 'hex';
        node.diskPathTemplate = danglingLink;
        await node.run(contextify(), { accessKey: ACCESS_KEY_ID, secret: ACCESS_SECRET_KEY })
          .should.be.rejectedWith({ message: 'The provided disk path is a symlink with no valid target.' });
      } finally {
        await fs.promises.rm(danglingLink, { force: true });
      }
    });
  });
});
