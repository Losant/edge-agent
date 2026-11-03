import { nock, tk, contextify, protectedDiskUtils } from './common.js';
import GoogleCloudStorageGetNode from '../src/google-storage-get-node.js';
import { fakeGoogleCredentials as GCP_JWT_INFO } from 'losant-nodejs-utils/test/utils/testing-constants.js';
import fs from 'node:fs';
import path from 'node:path';

describe('GoogleCloudStorageGetNode', () => {
  let node;

  beforeEach( () => {
    node = new GoogleCloudStorageGetNode('id', [[4]], {
      bucketNameTemplate: 'test-bucket',
      fileNameTemplate: 'test.txt',
      contentTypeTemplate: 'text/plain',
      destination: 'out',
      jwtData: JSON.stringify(GCP_JWT_INFO)
    });
  });

  it('should properly receive a 404', async () => {
    nock('https://www.googleapis.com:443', { encodedQueryParams: true })
      .post('/oauth2/v4/token')
      .reply(200, ['1f8b0800000000000013ab564a4c4e4e2d2e8e2fc9cf4ecd53b252aa4c34b2d44b4bcc4ed58588e828a556146416a516c76702a58d4d2d2d7594c032f1259505a9400d4ea98945a9454ab50031448f984a000000'], [
        'Content-Type',
        'application/json; charset=UTF-8',
        'Content-Encoding',
        'gzip'
      ]);

    nock('https://storage.googleapis.com:443', { encodedQueryParams: true })
      .get('/storage/v1/b/test-bucket/o/test.txt')
      .query({})
      .reply(404, { error: { code: 404, message: 'No such object: test-bucket/test.txt', errors: [{ message: 'No such object: test-bucket/test.txt', domain: 'global', reason: 'notFound' }] } });
    const result = await node.run({}, {});
    result[1].out.should.deepEqual({ error: 'The file test.txt was not found.' });
  });

  it('should read a file', async () => {
    nock('https://www.googleapis.com:443', { encodedQueryParams: true })
      .post('/oauth2/v4/token')
      .reply(200, ['1f8b0800000000000013ab564a4c4e4e2d2e8e2fc9cf4ecd53b252aa4c34b2d44b4bcc4ed58588e828a556146416a516c76702a58d4d2d2d7594c032f1259505a9400d4ea98945a9454ab50031448f984a000000'], [
        'Content-Type',
        'application/json; charset=UTF-8',
        'Content-Encoding',
        'gzip'
      ]);

    nock('https://storage.googleapis.com:443', { encodedQueryParams: true })
      .get('/storage/v1/b/test-bucket/o/test.txt').times(1)
      .query({})
      .reply(200, {
        kind: 'storage#object', id: 'test-bucket/test.txt/1660877588123632', selfLink: 'https://www.googleapis.com/storage/v1/b/test-bucket/o/test.txt', mediaLink: 'https://storage.googleapis.com/download/storage/v1/b/test-bucket/o/test.txt?generation=1660877588123632&alt=media', name: 'test.txt', bucket: 'test-bucket', generation: '1660877588123632', metageneration: '1', contentType: 'text/plain', storageClass: 'STANDARD', size: '13', md5Hash: 'hFrMx0qYyC22fH8kfr8Zgw==', crc32c: 'eFrvDA==', etag: 'CPCfn5Xz0fkCEAE=', timeCreated: '2022-08-19T02:53:08.158Z', updated: '2022-08-19T02:53:08.158Z', timeStorageClassUpdated: '2022-08-19T02:53:08.158Z'
      });

    nock('https://storage.googleapis.com:443', { encodedQueryParams: true })
      .get('/storage/v1/b/test-bucket/o/test.txt')
      .query({ alt: 'media' })
      .reply(200, "I'm a result!", [
        'X-GUploader-UploadID',
        'ADPycdvM4KSGwHpmyFxO69jeSPVNCXhwIZK3zmVujryExz9mjT0nRfBqWml2XLQMF5AskS4T-OZw8Co6XMFXV_51wc9uN-ArJcNf',
        'ETag',
        'CPCfn5Xz0fkCEAE=',
        'X-Goog-Hash',
        'crc32c=eFrvDA==,md5=hFrMx0qYyC22fH8kfr8Zgw==',
        'Content-Type',
        'text/plain',
        'X-Goog-Generation',
        '1660877588123632',
        'X-Goog-Metageneration',
        '1',
        'X-Goog-Storage-Class',
        'STANDARD',
        'Pragma',
        'no-cache',
        'Expires',
        'Mon, 01 Jan 1990 00:00:00 GMT',
        'Cache-Control',
        'no-cache, no-store, max-age=0, must-revalidate',
        'Content-Disposition',
        'attachment',
        'Date',
        'Fri, 19 Aug 2022 02:53:16 GMT',
        'Vary',
        'Origin',
        'Vary',
        'X-Origin',
        'Content-Length',
        '13',
        'Server',
        'UploadServer',
        'Alt-Svc',
        'h3=":443"; ma=2592000,h3-29=":443"; ma=2592000,h3-Q050=":443"; ma=2592000,h3-Q046=":443"; ma=2592000,h3-Q043=":443"; ma=2592000,quic=":443"; ma=2592000; v="46,43"',
        'Connection',
        'close'
      ]);


    const result = await node.run({}, {});
    result[1].out.value.should.deepEqual("I'm a result!");
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
    it('should read a file', async () => {
      node.encodingTemplate = 'utf8';
      node.diskPathTemplate = './foo.txt';
      nock('https://www.googleapis.com:443', { encodedQueryParams: true })
        .post('/oauth2/v4/token')
        .reply(200, ['1f8b0800000000000013ab564a4c4e4e2d2e8e2fc9cf4ecd53b252aa4c34b2d44b4bcc4ed58588e828a556146416a516c76702a58d4d2d2d7594c032f1259505a9400d4ea98945a9454ab50031448f984a000000'], [
          'Content-Type',
          'application/json; charset=UTF-8',
          'Content-Encoding',
          'gzip'
        ]);

      nock('https://storage.googleapis.com:443', { encodedQueryParams: true })
        .get('/storage/v1/b/test-bucket/o/test.txt').times(1)
        .query({})
        .reply(200, {
          kind: 'storage#object', id: 'test-bucket/test.txt/1660877588123632', selfLink: 'https://www.googleapis.com/storage/v1/b/test-bucket/o/test.txt', mediaLink: 'https://storage.googleapis.com/download/storage/v1/b/test-bucket/o/test.txt?generation=1660877588123632&alt=media', name: 'test.txt', bucket: 'test-bucket', generation: '1660877588123632', metageneration: '1', contentType: 'text/plain', storageClass: 'STANDARD', size: '13', md5Hash: 'hFrMx0qYyC22fH8kfr8Zgw==', crc32c: 'eFrvDA==', etag: 'CPCfn5Xz0fkCEAE=', timeCreated: '2022-08-19T02:53:08.158Z', updated: '2022-08-19T02:53:08.158Z', timeStorageClassUpdated: '2022-08-19T02:53:08.158Z'
        });

      nock('https://storage.googleapis.com:443', { encodedQueryParams: true })
        .get('/storage/v1/b/test-bucket/o/test.txt')
        .query({ alt: 'media' })
        .reply(200, "I'm a result!", [
          'X-GUploader-UploadID',
          'ADPycdvM4KSGwHpmyFxO69jeSPVNCXhwIZK3zmVujryExz9mjT0nRfBqWml2XLQMF5AskS4T-OZw8Co6XMFXV_51wc9uN-ArJcNf',
          'ETag',
          'CPCfn5Xz0fkCEAE=',
          'X-Goog-Hash',
          'crc32c=eFrvDA==,md5=hFrMx0qYyC22fH8kfr8Zgw==',
          'Content-Type',
          'text/plain',
          'X-Goog-Generation',
          '1660877588123632',
          'X-Goog-Metageneration',
          '1',
          'X-Goog-Storage-Class',
          'STANDARD',
          'Pragma',
          'no-cache',
          'Expires',
          'Mon, 01 Jan 1990 00:00:00 GMT',
          'Cache-Control',
          'no-cache, no-store, max-age=0, must-revalidate',
          'Content-Disposition',
          'attachment',
          'Date',
          'Fri, 19 Aug 2022 02:53:16 GMT',
          'Vary',
          'Origin',
          'Vary',
          'X-Origin',
          'Content-Length',
          '13',
          'Server',
          'UploadServer',
          'Alt-Svc',
          'h3=":443"; ma=2592000,h3-29=":443"; ma=2592000,h3-Q050=":443"; ma=2592000,h3-Q046=":443"; ma=2592000,h3-Q043=":443"; ma=2592000,quic=":443"; ma=2592000; v="46,43"',
          'Connection',
          'close'
        ]);
      const result = await node.run(contextify(), {});
      result[1].out.value.should.deepEqual(path.resolve('./foo.txt'));
      (fs.readFileSync(node.diskPathTemplate, { encoding: 'utf8' })).should.deepEqual('I\'m a result!');
    });

    it('Should fail when diskPathTemplate resolves to a directory', async () => {
      fs.mkdirSync(readOnlyDir, { recursive: true });
      node.encodingTemplate = 'hex';
      node.diskPathTemplate = readOnlyDir;
      nock('https://www.googleapis.com:443', { encodedQueryParams: true })
        .post('/oauth2/v4/token')
        .reply(200, ['1f8b0800000000000013ab564a4c4e4e2d2e8e2fc9cf4ecd53b252aa4c34b2d44b4bcc4ed58588e828a556146416a516c76702a58d4d2d2d7594c032f1259505a9400d4ea98945a9454ab50031448f984a000000'], [
          'Content-Type',
          'application/json; charset=UTF-8',
          'Content-Encoding',
          'gzip'
        ]);

      nock('https://storage.googleapis.com:443', { encodedQueryParams: true })
        .get('/storage/v1/b/test-bucket/o/test.txt').times(1)
        .query({})
        .reply(200, {
          kind: 'storage#object', id: 'test-bucket/test.txt/1660877588123632', selfLink: 'https://www.googleapis.com/storage/v1/b/test-bucket/o/test.txt', mediaLink: 'https://storage.googleapis.com/download/storage/v1/b/test-bucket/o/test.txt?generation=1660877588123632&alt=media', name: 'test.txt', bucket: 'test-bucket', generation: '1660877588123632', metageneration: '1', contentType: 'text/plain', storageClass: 'STANDARD', size: '13', md5Hash: 'hFrMx0qYyC22fH8kfr8Zgw==', crc32c: 'eFrvDA==', etag: 'CPCfn5Xz0fkCEAE=', timeCreated: '2022-08-19T02:53:08.158Z', updated: '2022-08-19T02:53:08.158Z', timeStorageClassUpdated: '2022-08-19T02:53:08.158Z'
        });

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
      const danglingLink = './gcs-get-dangling-link.txt';
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

    it('Should fail when attempting to write to a file that already exists and errorIfFileExists is true', async () => {
      fs.mkdirSync(readOnlyDir, { recursive: true });
      node.encodingTemplate = 'hex';
      node.diskPathTemplate = './foo.txt';
      node.errorIfFileExists = true;
      fs.writeFileSync(node.diskPathTemplate, 'foo bar bat');
      nock('https://www.googleapis.com:443', { encodedQueryParams: true })
        .post('/oauth2/v4/token')
        .reply(200, ['1f8b0800000000000013ab564a4c4e4e2d2e8e2fc9cf4ecd53b252aa4c34b2d44b4bcc4ed58588e828a556146416a516c76702a58d4d2d2d7594c032f1259505a9400d4ea98945a9454ab50031448f984a000000'], [
          'Content-Type',
          'application/json; charset=UTF-8',
          'Content-Encoding',
          'gzip'
        ]);

      nock('https://storage.googleapis.com:443', { encodedQueryParams: true })
        .get('/storage/v1/b/test-bucket/o/test.txt').times(1)
        .query({})
        .reply(200, {
          kind: 'storage#object', id: 'test-bucket/test.txt/1660877588123632', selfLink: 'https://www.googleapis.com/storage/v1/b/test-bucket/o/test.txt', mediaLink: 'https://storage.googleapis.com/download/storage/v1/b/test-bucket/o/test.txt?generation=1660877588123632&alt=media', name: 'test.txt', bucket: 'test-bucket', generation: '1660877588123632', metageneration: '1', contentType: 'text/plain', storageClass: 'STANDARD', size: '13', md5Hash: 'hFrMx0qYyC22fH8kfr8Zgw==', crc32c: 'eFrvDA==', etag: 'CPCfn5Xz0fkCEAE=', timeCreated: '2022-08-19T02:53:08.158Z', updated: '2022-08-19T02:53:08.158Z', timeStorageClassUpdated: '2022-08-19T02:53:08.158Z'
        });

      nock('https://storage.googleapis.com:443', { encodedQueryParams: true })
        .get('/storage/v1/b/test-bucket/o/test.txt')
        .query({ alt: 'media' })
        .reply(200, "I'm a result!", [
          'X-GUploader-UploadID',
          'ADPycdvM4KSGwHpmyFxO69jeSPVNCXhwIZK3zmVujryExz9mjT0nRfBqWml2XLQMF5AskS4T-OZw8Co6XMFXV_51wc9uN-ArJcNf',
          'ETag',
          'CPCfn5Xz0fkCEAE=',
          'X-Goog-Hash',
          'crc32c=eFrvDA==,md5=hFrMx0qYyC22fH8kfr8Zgw==',
          'Content-Type',
          'text/plain',
          'X-Goog-Generation',
          '1660877588123632',
          'X-Goog-Metageneration',
          '1',
          'X-Goog-Storage-Class',
          'STANDARD',
          'Pragma',
          'no-cache',
          'Expires',
          'Mon, 01 Jan 1990 00:00:00 GMT',
          'Cache-Control',
          'no-cache, no-store, max-age=0, must-revalidate',
          'Content-Disposition',
          'attachment',
          'Date',
          'Fri, 19 Aug 2022 02:53:16 GMT',
          'Vary',
          'Origin',
          'Vary',
          'X-Origin',
          'Content-Length',
          '13',
          'Server',
          'UploadServer',
          'Alt-Svc',
          'h3=":443"; ma=2592000,h3-29=":443"; ma=2592000,h3-Q050=":443"; ma=2592000,h3-Q046=":443"; ma=2592000,h3-Q043=":443"; ma=2592000,quic=":443"; ma=2592000; v="46,43"',
          'Connection',
          'close'
        ]);
      const result = await node.run(contextify(), {});
      result[1].out.should.deepEqual({ error: `EEXIST: file already exists, open '${path.resolve('./foo.txt')}'` });
    });

  });

  it('should read a file with project id separate', async () => {
    const jwtData = { ...GCP_JWT_INFO };
    const projectId = jwtData.project_id;
    delete jwtData.project_id;
    const newNode = new GoogleCloudStorageGetNode('id', [[4]], {
      bucketNameTemplate: 'test-bucket',
      fileNameTemplate: 'test.txt',
      contentTypeTemplate: 'text/plain',
      destination: 'out',
      jwtData: JSON.stringify(jwtData),
      projectIdTemplate: '{{ projectId }}'
    });
    nock('https://www.googleapis.com:443', { encodedQueryParams: true })
      .post('/oauth2/v4/token')
      .reply(200, ['1f8b0800000000000013ab564a4c4e4e2d2e8e2fc9cf4ecd53b252aa4c34b2d44b4bcc4ed58588e828a556146416a516c76702a58d4d2d2d7594c032f1259505a9400d4ea98945a9454ab50031448f984a000000'], [
        'Content-Type',
        'application/json; charset=UTF-8',
        'Content-Encoding',
        'gzip'
      ]);

    nock('https://storage.googleapis.com:443', { encodedQueryParams: true })
      .get('/storage/v1/b/test-bucket/o/test.txt').times(1)
      .query({})
      .reply(200, {
        kind: 'storage#object', id: 'test-bucket/test.txt/1660877588123632', selfLink: 'https://www.googleapis.com/storage/v1/b/test-bucket/o/test.txt', mediaLink: 'https://storage.googleapis.com/download/storage/v1/b/test-bucket/o/test.txt?generation=1660877588123632&alt=media', name: 'test.txt', bucket: 'test-bucket', generation: '1660877588123632', metageneration: '1', contentType: 'text/plain', storageClass: 'STANDARD', size: '13', md5Hash: 'hFrMx0qYyC22fH8kfr8Zgw==', crc32c: 'eFrvDA==', etag: 'CPCfn5Xz0fkCEAE=', timeCreated: '2022-08-19T02:53:08.158Z', updated: '2022-08-19T02:53:08.158Z', timeStorageClassUpdated: '2022-08-19T02:53:08.158Z'
      });

    nock('https://storage.googleapis.com:443', { encodedQueryParams: true })
      .get('/storage/v1/b/test-bucket/o/test.txt')
      .query({ alt: 'media' })
      .reply(200, "I'm a result!", [
        'X-GUploader-UploadID',
        'ADPycdvM4KSGwHpmyFxO69jeSPVNCXhwIZK3zmVujryExz9mjT0nRfBqWml2XLQMF5AskS4T-OZw8Co6XMFXV_51wc9uN-ArJcNf',
        'ETag',
        'CPCfn5Xz0fkCEAE=',
        'X-Goog-Hash',
        'crc32c=eFrvDA==,md5=hFrMx0qYyC22fH8kfr8Zgw==',
        'Content-Type',
        'text/plain',
        'X-Goog-Generation',
        '1660877588123632',
        'X-Goog-Metageneration',
        '1',
        'X-Goog-Storage-Class',
        'STANDARD',
        'Pragma',
        'no-cache',
        'Expires',
        'Mon, 01 Jan 1990 00:00:00 GMT',
        'Cache-Control',
        'no-cache, no-store, max-age=0, must-revalidate',
        'Content-Disposition',
        'attachment',
        'Date',
        'Fri, 19 Aug 2022 02:53:16 GMT',
        'Vary',
        'Origin',
        'Vary',
        'X-Origin',
        'Content-Length',
        '13',
        'Server',
        'UploadServer',
        'Alt-Svc',
        'h3=":443"; ma=2592000,h3-29=":443"; ma=2592000,h3-Q050=":443"; ma=2592000,h3-Q046=":443"; ma=2592000,h3-Q043=":443"; ma=2592000,quic=":443"; ma=2592000; v="46,43"',
        'Connection',
        'close'
      ]);


    const result = await newNode.run({}, { projectId });
    result[1].out.value.should.deepEqual("I'm a result!");
  });

  it('should get a download link to a file', async () => {
    tk.freeze(0);
    nock('https://www.googleapis.com:443', { encodedQueryParams: true })
      .post('/oauth2/v4/token')
      .reply(200, ['1f8b0800000000000013ab564a4c4e4e2d2e8e2fc9cf4ecd53b252aa4c34b2d44b4bcc4ed58588e828a556146416a516c76702a58d4d2d2d7594c032f1259505a9400d4ea98945a9454ab50031448f984a000000'], [
        'Content-Type',
        'application/json; charset=UTF-8',
        'Content-Encoding',
        'gzip'
      ]);

    nock('https://storage.googleapis.com:443', { encodedQueryParams: true })
      .get('/storage/v1/b/test-bucket/o/test.txt')
      .query({})
      .reply(200, {
        kind: 'storage#object', id: 'test-bucket/test.txt/1660877588123632', selfLink: 'https://www.googleapis.com/storage/v1/b/test-bucket/o/test.txt', mediaLink: 'https://storage.googleapis.com/download/storage/v1/b/test-bucket/o/test.txt?generation=1660877588123632&alt=media', name: 'test.txt', bucket: 'test-bucket', generation: '1660877588123632', metageneration: '1', contentType: 'text/plain', storageClass: 'STANDARD', size: '13', md5Hash: 'hFrMx0qYyC22fH8kfr8Zgw==', crc32c: 'eFrvDA==', etag: 'CPCfn5Xz0fkCEAE=', timeCreated: '2022-08-19T02:53:08.158Z', updated: '2022-08-19T02:53:08.158Z', timeStorageClassUpdated: '2022-08-19T02:53:08.158Z'
      });

    node.isDownloadURL = true;
    const result = await node.run({}, {});
    result[1].out.value.should.deepEqual('https://storage.googleapis.com/test-bucket/test.txt?GoogleAccessId=fake-account%40test-playground.iam.gserviceaccount.com&Expires=604800&Signature=F4PhJac0GD64xhptVRmBLyY133EK%2FL8wldwX7qhVeMOc6HFVhJLuy5Cvi9xw%2FrRf8Y9oouOrDIlVsstMMZOAplnNDXOtuf2ntkDjAjEJPW8G0u2xkbrno4H4%2BtEHxPdQmc4A%2BBKhfHNRfagVX8nzB2I7FtpcfofxtwYl1HwuMUH4hfgfwKEqphstkRXXtwfm0YwmO8N2cZbbox5HJvvyi754bK3Ovyn%2FcosK5UHeVbBTU39go4YHQnDpFaCStxxgKMTi3YkwwtQRPFs2I8nefDhgKHS%2BFY9TR8Z4naKPvasZLwx84XUfeu0oizhMVMJmv8WHku2OQ8p6kmsTqyJL%2Fw%3D%3D&response-content-disposition=attachment%3B%20filename%3D%22test.txt%22');
  });

  it('should download a file with custom encoding', async () => {
    nock('https://www.googleapis.com:443', { encodedQueryParams: true })
      .post('/oauth2/v4/token')
      .reply(200, ['1f8b0800000000000013ab564a4c4e4e2d2e8e2fc9cf4ecd53b252aa4c34b2d44b4bcc4ed58588e828a556146416a516c76702a58d4d2d2d7594c032f1259505a9400d4ea98945a9454ab50031448f984a000000'], [
        'Content-Type',
        'application/json; charset=UTF-8',
        'Content-Encoding',
        'gzip'
      ]);

    nock('https://storage.googleapis.com:443', { encodedQueryParams: true })
      .get('/storage/v1/b/test-bucket/o/test.txt').times(1)
      .query({})
      .reply(200, {
        kind: 'storage#object', id: 'test-bucket/test.txt/1660877588123632', selfLink: 'https://www.googleapis.com/storage/v1/b/test-bucket/o/test.txt', mediaLink: 'https://storage.googleapis.com/download/storage/v1/b/test-bucket/o/test.txt?generation=1660877588123632&alt=media', name: 'test.txt', bucket: 'test-bucket', generation: '1660877588123632', metageneration: '1', contentType: 'text/plain', storageClass: 'STANDARD', size: '13', md5Hash: 'hFrMx0qYyC22fH8kfr8Zgw==', crc32c: 'eFrvDA==', etag: 'CPCfn5Xz0fkCEAE=', timeCreated: '2022-08-19T02:53:08.158Z', updated: '2022-08-19T02:53:08.158Z', timeStorageClassUpdated: '2022-08-19T02:53:08.158Z'
      });

    nock('https://storage.googleapis.com:443', { encodedQueryParams: true })
      .get('/storage/v1/b/test-bucket/o/test.txt')
      .query({ alt: 'media' })
      .reply(200, "I'm a result!", [
        'X-GUploader-UploadID',
        'ADPycdvM4KSGwHpmyFxO69jeSPVNCXhwIZK3zmVujryExz9mjT0nRfBqWml2XLQMF5AskS4T-OZw8Co6XMFXV_51wc9uN-ArJcNf',
        'ETag',
        'CPCfn5Xz0fkCEAE=',
        'X-Goog-Hash',
        'crc32c=eFrvDA==,md5=hFrMx0qYyC22fH8kfr8Zgw==',
        'Content-Type',
        'text/plain',
        'X-Goog-Generation',
        '1660877588123632',
        'X-Goog-Metageneration',
        '1',
        'X-Goog-Storage-Class',
        'STANDARD',
        'Pragma',
        'no-cache',
        'Expires',
        'Mon, 01 Jan 1990 00:00:00 GMT',
        'Cache-Control',
        'no-cache, no-store, max-age=0, must-revalidate',
        'Content-Disposition',
        'attachment',
        'Date',
        'Fri, 19 Aug 2022 02:53:16 GMT',
        'Vary',
        'Origin',
        'Vary',
        'X-Origin',
        'Content-Length',
        '13',
        'Server',
        'UploadServer',
        'Alt-Svc',
        'h3=":443"; ma=2592000,h3-29=":443"; ma=2592000,h3-Q050=":443"; ma=2592000,h3-Q046=":443"; ma=2592000,h3-Q043=":443"; ma=2592000,quic=":443"; ma=2592000; v="46,43"',
        'Connection',
        'close'
      ]);

    node.encodingTemplate = 'hex';
    const result = await node.run({}, {});
    result[1].out.should.deepEqual({
      metadata: { etag: 'CPCfn5Xz0fkCEAE=', fileSize: 13, contentType: 'text/plain' },
      value: '49276d206120726573756c7421'
    });
  });

  it('should error when trying to read a too big file', async () => {
    nock('https://www.googleapis.com:443', { encodedQueryParams: true })
      .post('/oauth2/v4/token')
      .reply(200, ['1f8b0800000000000013ab564a4c4e4e2d2e8e2fc9cf4ecd53b252aa4c34b2d44b4bcc4ed58588e828a556146416a516c76702a58d4d2d2d7594c032f1259505a9400d4ea98945a9454ab50031448f984a000000'], [
        'Content-Type',
        'application/json; charset=UTF-8',
        'Content-Encoding',
        'gzip'
      ]);

    nock('https://storage.googleapis.com:443', { encodedQueryParams: true })
      .get('/storage/v1/b/test-bucket/o/test.txt').times(1)
      .query({})
      .reply(200, {
        kind: 'storage#object', id: 'test-bucket/test.txt/1660877588123632', selfLink: 'https://www.googleapis.com/storage/v1/b/test-bucket/o/test.txt', mediaLink: 'https://storage.googleapis.com/download/storage/v1/b/test-bucket/o/test.txt?generation=1660877588123632&alt=media', name: 'test.txt', bucket: 'test-bucket', generation: '1660877588123632', metageneration: '1', contentType: 'text/plain', storageClass: 'STANDARD', size: '9999999999999', md5Hash: 'hFrMx0qYyC22fH8kfr8Zgw==', crc32c: 'eFrvDA==', etag: 'CPCfn5Xz0fkCEAE=', timeCreated: '2022-08-19T02:53:08.158Z', updated: '2022-08-19T02:53:08.158Z', timeStorageClassUpdated: '2022-08-19T02:53:08.158Z'
      });

    const result = await node.run({}, {});
    result[1].out.error.should.deepEqual('File size cannot exceed 5MB');
  });
});
