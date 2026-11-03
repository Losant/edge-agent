import { testDirectory, defaultDiskUtils, protectedDiskUtils } from './common.js';
import FTPGetNode from '../src/ftp-get-node.js';
import FtpSrv from 'ftp-srv';
import { defer, noop } from 'omnibelt';
import path from 'node:path';
import ssh2 from 'ssh2';
import stream from 'stream';
import fs from 'fs-extra';
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


describe('FtpGetNode', () => {
  let server;
  const defaultPayload = { user: 'yee', pass: 'haw', filename: 'test.txt', dir: '.' };
  const baseNodeConfig = {
    method: 'ftp',
    hostTemplate: 'localhost',
    portTemplate: 6000,
    userTemplate: '{{user}}',
    passwordTemplate: '{{pass}}',
    resultPath: 'result',
    directoryTemplate: '{{dir}}',
    fileNameTemplate: '{{filename}}'
  };
  afterEach(() => {
    if (server) {
      server.close();
      server = null;
    }
  });

  describe('FTP', () => {
    beforeEach(async () => {
      const log = { info: noop, error: noop, trace: noop, debug: noop };
      log.child = () => { return log; };
      server = new FtpSrv({
        url: 'ftp://127.0.0.1:6000',
        tls: {
          key: fakeServerKey,
          cert: fakeServerCert,
          ca: fakeCaCert
        },
        pasv_url: () => { return '127.0.0.1'; },
        log
      });
      server.on('login', ({ username, password }, resolve, reject) => {
        if (username === 'yee' && password === 'haw') {
          resolve({
            root,
            fs: {
              read: (filename) => {
                const s = new stream.Readable();
                if (filename === 'long.txt') {
                  s.push('xxxxx'.repeat(1024*1024+1));
                } else {
                  s.push('hello world');
                }
                s.push(null);
                return { stream: s };
              }
            }
          });
        } else {
          reject('Bad!');
        }
      });
      await server.listen();
    });

    it('should GET string content over FTP', async () => {
      const node = new FTPGetNode('id', [[4]], baseNodeConfig);
      const result = await node.run(DEFAULT_CONTEXT, defaultPayload);
      result[1].result.should.deepEqual({ value: 'hello world' });
    });

    it('should GET encoded string content over FTP', async () => {
      const node = new FTPGetNode('id', [[4]], { ...baseNodeConfig, encoding: 'base64' });
      const result = await node.run(DEFAULT_CONTEXT, defaultPayload);
      result[1].result.should.deepEqual({ value: 'aGVsbG8gd29ybGQ=' });
    });

    it('should reject very long file', async () => {
      const node = new FTPGetNode('id', [[4]], baseNodeConfig);
      const result = await node.run(DEFAULT_CONTEXT, { ...defaultPayload, filename: 'long.txt' });
      result[1].result.should.deepEqual({ error: { message: 'File size cannot exceed 5MB' } });
    });

    it('should reject invalid creds', async () => {
      const node = new FTPGetNode('id', [[4]], {
        ...baseNodeConfig,
        userTemplate: 'bad',
        passwordTemplate: 'wolf'
      });

      const result = await node.run(DEFAULT_CONTEXT, defaultPayload);
      result[1].result.should.deepEqual({ error: { message: '530 Authentication failed' } });
    });

    describe('FTPS', () => {
      it('should GET correctly over FTPS', async () => {
        const node = new FTPGetNode('id', [[4]], {
          ...baseNodeConfig,
          method: 'ftps',
          caCertTemplate: fakeCaCert
        });
        const result = await node.run(DEFAULT_CONTEXT, defaultPayload);
        result[1].result.should.deepEqual({ value: 'hello world' });
      });

      it('should GET without verifying ca cert', async () => {
        const node = new FTPGetNode('id', [[4]], {
          ...baseNodeConfig,
          method: 'ftps',
          disableSSLVerification: true
        });
        const result = await node.run(DEFAULT_CONTEXT, defaultPayload);
        result[1].result.should.deepEqual({ value: 'hello world' });
      });

      it('should fail on missing ca cert', async () => {
        const node = new FTPGetNode('id', [[4]], {
          ...baseNodeConfig,
          method: 'ftps'
        });
        const result = await node.run(DEFAULT_CONTEXT, defaultPayload);
        result[1].result.should.deepEqual( { error: { message: 'self-signed certificate in certificate chain' } });
      });
    });

    describe('writing to local path', async () => {
      const readOnlyDir = './read-only-test-dir';
      afterEach(() => {
        fs.rmSync('./foo.txt', { force: true });
        if (fs.existsSync(readOnlyDir)) {
          fs.chmodSync(readOnlyDir, 0o755);
          fs.rmSync(readOnlyDir, { recursive: true, force: true });
        }
      });
      it('Should download a file to the disk', async () => {
        const node = new FTPGetNode('id', [[4]], {
          ...baseNodeConfig,
          diskPathTemplate: './foo.txt'
        });
        const result = await node.run(DEFAULT_CONTEXT, defaultPayload);
        result[1].result.value.should.deepEqual(path.resolve('./foo.txt'));
        (fs.readFileSync('./foo.txt', { encoding: 'utf8' })).should.deepEqual('hello world');
      });

      it('Should error if file exists', async () => {
        fs.writeFileSync('./foo.txt', 'EXISTING');
        const node = new FTPGetNode('id', [[4]], {
          ...baseNodeConfig,
          diskPathTemplate: './foo.txt',
          errorIfFileExists: true
        });
        const result = await node.run(DEFAULT_CONTEXT, defaultPayload);
        result[1].result.should.deepEqual({ error: { message: `EEXIST: file already exists, open '${path.resolve('./foo.txt')}'` } });
        (fs.readFileSync('./foo.txt', { encoding: 'utf8' })).should.deepEqual('EXISTING');
      });

      it('Should append if file exists', async () => {
        fs.writeFileSync('./foo.txt', 'EXISTING');
        const node = new FTPGetNode('id', [[4]], {
          ...baseNodeConfig,
          diskPathTemplate: './foo.txt',
          shouldAppend: true
        });
        const result = await node.run(DEFAULT_CONTEXT, defaultPayload);
        result[1].result.value.should.deepEqual(path.resolve('./foo.txt'));
        (fs.readFileSync('./foo.txt', { encoding: 'utf8' })).should.deepEqual('EXISTINGhello world');
      });

      it('Should download a file to the disk with encoding', async () => {
        const node = new FTPGetNode('id', [[4]], {
          ...baseNodeConfig,
          diskPathTemplate: './foo.txt',
          encoding: 'hex'
        });
        const result = await node.run(DEFAULT_CONTEXT, defaultPayload);
        result[1].result.value.should.deepEqual(path.resolve('./foo.txt'));
        (fs.readFileSync('./foo.txt', { encoding: 'hex' })).should.deepEqual('68656c6c6f20776f726c64');
      });

      it('Should fail when diskPathTemplate resolves to a directory', async () => {
        fs.mkdirSync(readOnlyDir, { recursive: true });
        const node = new FTPGetNode('id', [[4]], {
          ...baseNodeConfig,
          diskPathTemplate: readOnlyDir,
          encoding: 'hex'
        });
        const result = await node.run(DEFAULT_CONTEXT, defaultPayload);
        result[1].result.error.message.should.equal(`EISDIR: illegal operation on a directory, open '${path.resolve(readOnlyDir)}'`);
      });

      it('Should fail when diskPathTemplate resolves to nothing', async () => {
        const node = new FTPGetNode('id', [[4]], {
          ...baseNodeConfig,
          diskPathTemplate: '{{nothing}}',
          encoding: 'hex'
        });
        await node.run(DEFAULT_CONTEXT, defaultPayload)
          .should.be.rejectedWith({ message: 'The provided disk path cannot be empty.' });
      });

      it('Should fail when file is a losant path', async () => {
        const node = new FTPGetNode('id', [[4]], {
          ...baseNodeConfig,
          diskPathTemplate: './foo.txt',
          encoding: 'hex'
        });
        await node.run({
          ...DEFAULT_CONTEXT,
          diskUtils: protectedDiskUtils
        }, defaultPayload)
          .should.be.rejectedWith({ message: 'Cannot access within the protected Losant Edge Agent directory.' });
      });

      it('Should fail when diskPathTemplate is a dangling symlink', async () => {
        const danglingLink = './ftp-get-dangling-link.txt';
        await fs.symlink('./nonexistent-target.txt', danglingLink);
        try {
          const node = new FTPGetNode('id', [[4]], {
            ...baseNodeConfig,
            diskPathTemplate: danglingLink,
            encoding: 'hex'
          });
          await node.run(DEFAULT_CONTEXT, defaultPayload)
            .should.be.rejectedWith({ message: 'The provided disk path is a symlink with no valid target.' });
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
              sftp.on('STAT', (reqid, dir) => {
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
              sftp.on('READ', (reqid, handle, offset) => {
                if (offset === 0) {
                  sftp.data(reqid, 'Hello Secure World');
                }
                sftp.status(reqid, ssh2.utils.sftp.STATUS_CODE.EOF);
              });
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
        const node = new FTPGetNode('id', [[4]], {
          ...baseNodeConfig,
          method: 'sftp'
        });
        const result = await node.run(DEFAULT_CONTEXT, { ...defaultPayload, dir: 'exists/aNewOne' });
        result[1].result.should.deepEqual({ value: 'Hello Secure World' });
        deferred.resolve();

      });
      await deferred.promise;
    });

    it('should auth with key', async () => {
      const deferred = defer();
      server.listen(6000, '127.0.0.1', async function() {
        const node = new FTPGetNode('id', [[4]], {
          ...baseNodeConfig,
          privateKeyTemplate: sftpFakeClientKey,
          passwordTemplate: '',
          method: 'sftp'
        });
        const result = await node.run(DEFAULT_CONTEXT, { ...defaultPayload, dir: './offRoot' });
        result[1].result.should.deepEqual({ value: 'Hello Secure World' });
        deferred.resolve();
      });
      await deferred.promise;
    });

    it('should validate key', async () => {
      const deferred = defer();
      server.listen(6000, '127.0.0.1', async function() {
        const node = new FTPGetNode('id', [[4]], {
          ...baseNodeConfig,
          privateKeyTemplate: 'notAKey',
          passwordTemplate: '',
          method: 'sftp'
        });
        const result = await node.run(DEFAULT_CONTEXT, defaultPayload);
        result[1].result.should.deepEqual({
          error: {
            message: 'Cannot parse privateKey: Unsupported key format'
          }

        });
        deferred.resolve();
      });
      await deferred.promise;
    });

    it('should reject bad key', async () => {
      const deferred = defer();
      server.listen(6000, '127.0.0.1', async function() {
        const node = new FTPGetNode('id', [[4]], {
          ...baseNodeConfig,
          privateKeyTemplate: sftpFakeServerKey,
          passwordTemplate: '',
          method: 'sftp'
        });
        const result = await node.run(DEFAULT_CONTEXT, defaultPayload);
        result[1].result.should.deepEqual({
          error: {
            message: 'getConnection: All configured authentication methods failed'
          }

        });
        deferred.resolve();
      });
      await deferred.promise;
    });
  });
});
