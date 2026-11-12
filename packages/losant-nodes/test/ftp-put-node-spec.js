import { nock, testDirectory, defaultDiskUtils, protectedDiskUtils } from './common.js';
import FTPPutNode from '../src/ftp-put-node.js';
import FtpSrv from 'ftp-srv';
import { defer, noop } from 'omnibelt';
import path from 'node:path';
import fs from 'fs-extra';
import ssh2 from 'ssh2';
import http from 'node:http';
const root = path.join(testDirectory, '__fixtures__');
const DEFAULT_CONTEXT = {
  externalTimeout: 30000,
  flowId: 'abc',
  diskUtils: defaultDiskUtils
};
import {
  fakeServerKey,
  fakeServerCert,
  fakeCaCert,
  sftpFakeClientKey,
  sftpFakeServerKey
} from './__fixtures__/fake-keys.js';


describe('FtpPutNode', () => {
  let server;
  const defaultPayload = { user: 'yee', pass: 'haw', content: 'to write', filename: 'test.txt', dir: '.' };
  const baseNodeConfig = {
    method: 'ftp',
    hostTemplate: 'localhost',
    portTemplate: 6000,
    userTemplate: '{{user}}',
    passwordTemplate: '{{pass}}',
    resultPath: 'result',
    directoryTemplate: '{{dir}}',
    fileNameTemplate: '{{filename}}',
    fileContentTemplate: '{{content}}'
  };
  afterEach(() => {
    if (server) {
      server.close();
      server = null;
    }
  });

  describe('FTP', () => {
    beforeEach(async () => {
      // ftp-srv and basic-ftp use real TCP/TLS sockets. nock's active
      // interceptor patches net.Socket/tls.TLSSocket globally, which crashes
      // on these non-HTTP connections, so turn it off for this suite.
      nock.restore();
      const log = { info: noop, error: noop, trace: noop, debug: noop };
      log.child = () => { return log; };
      server = new FtpSrv({
        url: 'ftp://127.0.0.1:6000',
        tls: { key: fakeServerKey, cert: fakeServerCert, ca: fakeCaCert },
        pasv_url: () => { return '127.0.0.1'; },
        log
      });
      server.on('login', ({ connection, username, password }, resolve, reject) => {
        if (username === 'yee' && password === 'haw') {
          resolve({ root });
        } else {
          reject('Bad!');
        }
        connection.on('STOR', async (error, fileName) => {
          const remoteRoot = fileName.split(root)[1].split('/')[1];
          const stats = await fs.stat(fileName);
          stats.size.should.be.greaterThanOrEqual(1);
          await fs.remove(path.join(root, remoteRoot));
        });
      });
      await server.listen();
    });

    it('should PUT string content over FTP', async () => {
      const node = new FTPPutNode('id', [[4]], baseNodeConfig);
      const result = await node.run(DEFAULT_CONTEXT, defaultPayload);
      result[1].result.should.deepEqual({ success: true });
    });

    it('should PUT url content over FTP', async () => {
      // The download and the FTP upload happen concurrently (the HTTP response
      // body is streamed straight into the FTP data connection), so nock can't
      // be toggled on just for the download: both a real raw FTP data socket and
      // an active nock interceptor would need to coexist, which nock's global
      // net.Socket/tls.TLSSocket patching doesn't tolerate (see the comment in
      // the outer beforeEach). Use a real local HTTP server instead of nock.
      const httpServer = http.createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<!doctype html>\n<html>\n<head>\n    <title>Example Domain</title>\n</head>\n<body>\n<div>\n    <h1>Example Domain</h1>\n</div>\n</body>\n</html>\n');
      });
      const deferred = defer();
      httpServer.listen(0, '127.0.0.1', () => deferred.resolve());
      await deferred.promise;
      try {
        const { port: httpPort } = httpServer.address();

        const node = new FTPPutNode('id', [[4]], {
          ...baseNodeConfig,
          fileUrlTemplate: `http://127.0.0.1:${httpPort}`,
          fileContentTemplate: ''
        });
        const result = await node.run(DEFAULT_CONTEXT, { ...defaultPayload, dir: '/nested/twice/' });
        result[1].result.should.deepEqual({ success: true });
      } finally {
        const closeDeferred = defer();
        httpServer.close(() => closeDeferred.resolve());
        await closeDeferred.promise;
      }
    });

    it('should reject invalid creds', async () => {
      const node = new FTPPutNode('id', [[4]], {
        ...baseNodeConfig,
        userTemplate: 'bad',
        passwordTemplate: 'wolf'
      });

      const result = await node.run(DEFAULT_CONTEXT, defaultPayload);
      result[1].result.should.deepEqual({ error: { message: '530 Authentication failed' }, success: false });
    });

    describe('FTPS', () => {
      it('should PUT correctly over FTPS', async () => {
        const node = new FTPPutNode('id', [[4]], {
          ...baseNodeConfig,
          method: 'ftps',
          caCertTemplate: fakeCaCert
        });
        const result = await node.run(DEFAULT_CONTEXT, defaultPayload);
        result[1].result.should.deepEqual({ success: true });
      });

      it('should PUT without verifying ca cert', async () => {
        const node = new FTPPutNode('id', [[4]], {
          ...baseNodeConfig,
          method: 'ftps',
          disableSSLVerification: true
        });
        const result = await node.run(DEFAULT_CONTEXT, defaultPayload);
        result[1].result.should.deepEqual({ success: true });
      });

      it('should fail on missing ca cert', async () => {
        const node = new FTPPutNode('id', [[4]], {
          ...baseNodeConfig,
          method: 'ftps'
        });
        const result = await node.run(DEFAULT_CONTEXT, defaultPayload);
        result[1].result.should.deepEqual( { error: { message: 'self-signed certificate in certificate chain' }, success: false });
      });
    });

    describe('reading from a local path', async () => {
      const readOnlyDir = './read-only-test-dir';
      afterEach(() => {
        fs.rmSync('./foo.txt', { force: true });
        fs.rmSync(readOnlyDir, { recursive: true, force: true });
      });
      it('should upload a file from a disk path', async () => {
        const node = new FTPPutNode('id', [[4]], {
          ...baseNodeConfig,
          diskPathTemplate: './foo.txt',
          fileContentTemplate: ''
        });
        await fs.writeFile('./foo.txt', 'ABC');
        const result = await node.run(DEFAULT_CONTEXT, defaultPayload);
        result[1].result.should.deepEqual({ success: true });
      });

      it('should upload a file from a disk path with encoding', async () => {
        const node = new FTPPutNode('id', [[4]], {
          ...baseNodeConfig,
          diskPathTemplate: './foo.txt',
          fileContentTemplate: '',
          encoding: 'hex'
        });
        await fs.writeFile('./foo.txt', 'some text content');
        const result = await node.run(DEFAULT_CONTEXT, defaultPayload);
        result[1].result.should.deepEqual({ success: true });
      });

      it('Should fail when diskPathTemplate resolves to a directory', async () => {
        fs.mkdirSync(readOnlyDir, { recursive: true });
        const node = new FTPPutNode('id', [[4]], {
          ...baseNodeConfig,
          diskPathTemplate: readOnlyDir,
          fileContentTemplate: '',
          encoding: 'hex'
        });
        const result = await node.run(DEFAULT_CONTEXT, defaultPayload);
        result[1].result.should.deepEqual({ error: { message: 'The provided disk path is a directory.' }, success: false });
      });

      it('Should fail when diskPathTemplate resolves to nothing', async () => {
        fs.mkdirSync(readOnlyDir, { recursive: true });
        const node = new FTPPutNode('id', [[4]], {
          ...baseNodeConfig,
          diskPathTemplate: '{{nothing}}',
          fileContentTemplate: '',
          encoding: 'hex'
        });
        const result = await node.run(DEFAULT_CONTEXT, defaultPayload);
        result[1].result.should.deepEqual({ error: { message: 'No file exists at ""' }, success: false });
      });

      it('Should fail when file is a losant path', async () => {
        fs.mkdirSync(readOnlyDir, { recursive: true });
        const node = new FTPPutNode('id', [[4]], {
          ...baseNodeConfig,
          diskPathTemplate: './foo.txt',
          fileContentTemplate: '',
          encoding: 'hex'
        });
        const result = await node.run({
          ...DEFAULT_CONTEXT,
          diskUtils: protectedDiskUtils
        }, defaultPayload);
        result[1].result.should.deepEqual({ error: { message: 'Cannot access within the protected Losant Edge Agent directory.' }, success: false });
      });

      it('Should fail when diskPathTemplate is a dangling symlink', async () => {
        const danglingLink = './ftp-put-dangling-link.txt';
        await fs.symlink('./nonexistent-target.txt', danglingLink);
        try {
          const node = new FTPPutNode('id', [[4]], {
            ...baseNodeConfig,
            diskPathTemplate: danglingLink,
            fileContentTemplate: '',
            encoding: 'hex'
          });
          const result = await node.run(DEFAULT_CONTEXT, defaultPayload);
          result[1].result.should.deepEqual({ error: { message: `No file exists at "${danglingLink}"` }, success: false });
        } finally {
          await fs.remove(danglingLink);
        }
      });
    });
  });
  describe('SFTP', () => {
    beforeEach(() => {
      const listener = (client) => {
        client.on('authentication', (ctx) => {
          let allowed = false;
          if (ctx.method === 'password') {
            allowed = ctx.username === 'yee' && ctx.password === 'haw';
          } else if (ctx.method === 'publickey') {
            allowed = ctx.key.data.toString('base64').startsWith('AAAAB3NzaC1yc2EAAAADAQABAAACAQDlhBKGFi');
          }
          if (allowed) { ctx.accept(); } else { ctx.reject(); }
        }).on('ready', () => {
          client.on('session', (acceptSession) => {
            const session = acceptSession();
            session.on('sftp', (accept) => {
              let handleCount = 0;
              const sftp = accept();
              sftp.on('LSTAT', (reqid, dir) => {
                if (dir === 'exists') {
                  sftp.attrs(reqid, { isDirectory: () => true });
                } else {
                  //root dir will return true before the STAT call
                  sftp.attrs(reqid, { isDirectory: () => false });
                }
              });
              sftp.on('MKDIR', (reqid) => { sftp.status(reqid, ssh2.utils.sftp.STATUS_CODE.OK); });
              sftp.on('OPEN', (reqid) => {
                const handle = Buffer.alloc(4);
                handle.writeUInt32BE(handleCount++, 0);
                sftp.handle(reqid, handle);
              });
              sftp.on('REALPATH', (reqid) => { sftp.name(reqid, [{ filename: 'home' }]); });
              sftp.on('WRITE', (reqid) => { sftp.status(reqid, ssh2.utils.sftp.STATUS_CODE.OK); });
              sftp.on('CLOSE', (reqid) => { sftp.status(reqid, ssh2.utils.sftp.STATUS_CODE.OK); });
            });
          });
        });
      };
      server = new ssh2.Server({ hostKeys: [sftpFakeServerKey] }, listener);
    });

    it('should auth with password', async () => {
      const deferred = defer();
      server.listen(6000, '127.0.0.1', async function() {
        const node = new FTPPutNode('id', [[4]], {
          ...baseNodeConfig,
          method: 'sftp'
        });
        const result = await node.run(DEFAULT_CONTEXT, { ...defaultPayload, dir: 'exists/aNewOne' });
        result[1].result.should.deepEqual({ success: true });
        deferred.resolve();

      });
      await deferred.promise;
    });

    it('should auth with key', async () => {
      const deferred = defer();
      server.listen(6000, '127.0.0.1', async function() {
        const node = new FTPPutNode('id', [[4]], {
          ...baseNodeConfig,
          privateKeyTemplate: sftpFakeClientKey,
          passwordTemplate: '',
          method: 'sftp'
        });
        const result = await node.run(DEFAULT_CONTEXT, { ...defaultPayload, dir: './offRoot' });
        result[1].result.should.deepEqual({ success: true });
        deferred.resolve();
      });
      await deferred.promise;
    });

    it('should validate key', async () => {
      const deferred = defer();
      server.listen(6000, '127.0.0.1', async function() {
        const node = new FTPPutNode('id', [[4]], {
          ...baseNodeConfig,
          privateKeyTemplate: 'notAKey',
          passwordTemplate: '',
          method: 'sftp'
        });
        const result = await node.run(DEFAULT_CONTEXT, defaultPayload);
        result[1].result.should.deepEqual({
          error: {
            message: 'Cannot parse privateKey: Unsupported key format'
          },
          success: false
        });
        deferred.resolve();
      });
      await deferred.promise;
    });

    it('should reject bad key', async () => {
      const deferred = defer();
      server.listen(6000, '127.0.0.1', async function() {
        const node = new FTPPutNode('id', [[4]], {
          ...baseNodeConfig,
          privateKeyTemplate: sftpFakeServerKey,
          passwordTemplate: '',
          method: 'sftp'
        });
        const result = await node.run(DEFAULT_CONTEXT, defaultPayload);
        result[1].result.should.deepEqual({
          error: {
            message: 'getConnection: All configured authentication methods failed'
          },
          success: false
        });
        deferred.resolve();
      });
      await deferred.promise;
    });
  });
});
