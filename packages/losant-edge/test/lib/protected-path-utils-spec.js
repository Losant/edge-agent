import { execSync } from 'node:child_process';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import fs from 'fs-extra';
import { should } from '../common.js';
import { PACKAGE_ROOT_DIR } from '../../src/constants.js';
import { ONE_MEGABYTE } from 'losant-nodejs-utils/src/constants/size.js';
import { guardPath, guardFileReadPath, loadGuardedFile, isProtectedPath } from '../../src/lib/protected-path-utils.js';

describe('protected-path-utils', () => {

  describe('`isProtectedPath`', function() {
    it('Recognizes project paths', function() {
      isProtectedPath(PACKAGE_ROOT_DIR).should.equal(true);
      isProtectedPath('./').should.equal(true);
    });

    it('Recognizes non project paths', function() {
      isProtectedPath(`${PACKAGE_ROOT_DIR}/..`).should.equal(false);
      isProtectedPath('/var/lib').should.equal(false);
      isProtectedPath(`${PACKAGE_ROOT_DIR}-sibling`).should.equal(false);
    });
  });

  describe('guardPath', () => {
    const filePath = path.resolve(os.tmpdir(), 'protected-path-utils-spec-file.txt');
    const symlinkPath = path.resolve(os.tmpdir(), 'protected-path-utils-spec-link.txt');
    const danglingLinkPath = path.resolve(os.tmpdir(), 'protected-path-utils-spec-dangling.txt');
    // A real file inside PACKAGE_ROOT_DIR, so realpath has something to resolve to.
    const protectedTarget = path.resolve(PACKAGE_ROOT_DIR, 'package.json');

    before(async () => {
      await fs.writeFile(filePath, 'hello');
      await fs.ensureSymlink(protectedTarget, symlinkPath);
      await fs.symlink(path.resolve(os.tmpdir(), 'protected-path-utils-spec-no-such-target'), danglingLinkPath);
    });

    after(async () => {
      await fs.remove(filePath);
      await fs.remove(symlinkPath);
      await fs.remove(danglingLinkPath);
    });

    it('resolves an allowed, existing path', async () => {
      const { resolvedPath, realPath } = await guardPath(filePath);
      resolvedPath.should.equal(filePath);
      // tmpdir itself may be a symlink (e.g. macOS's /var -> /private/var), so
      // compare against fs.realpath rather than the lexical path.
      realPath.should.equal(await fs.realpath(filePath));
    });

    it('tolerates a path that does not exist yet', async () => {
      const missing = path.resolve(os.tmpdir(), 'protected-path-utils-spec-does-not-exist.txt');
      const { resolvedPath, realPath } = await guardPath(missing);
      resolvedPath.should.equal(missing);
      should.not.exist(realPath);
    });

    it('tolerates a nonexistent target under a nonexistent parent directory', async () => {
      const missing = path.resolve(os.tmpdir(), 'protected-path-utils-spec-no-such-dir', 'file.txt');
      const { resolvedPath, realPath } = await guardPath(missing);
      resolvedPath.should.equal(missing);
      should.not.exist(realPath);
    });

    it('refuses a path directly inside the protected agent directory', async () => {
      await guardPath(path.resolve(PACKAGE_ROOT_DIR, 'losant-edge-agent-config.toml'))
        .should.be.rejectedWith(/protected Losant Edge Agent directory/);
    });

    it('refuses a traversal that resolves back into the agent directory', async () => {
      // Starts at tmpdir and walks back in via '..', so the raw string does not
      // begin with PACKAGE_ROOT_DIR - only resolving it first catches this.
      const target = path.resolve(PACKAGE_ROOT_DIR, 'losant-edge-agent-config.toml');
      // Concatenated, not path.join'd - join would normalize the '..' away.
      const traversal = `${os.tmpdir()}${path.sep}${path.relative(os.tmpdir(), target)}`;
      traversal.should.containEql('..');
      await guardPath(traversal).should.be.rejectedWith(/protected Losant Edge Agent directory/);
    });

    // The lexical guard passes here - the link itself is in tmpdir - so only
    // resolving it with realpath first catches where it actually points.
    it('refuses a symlink whose target is inside the protected agent directory', async () => {
      await guardPath(symlinkPath).should.be.rejectedWith(/protected Losant Edge Agent directory/);
    });

    it('refuses a nonexistent write target whose parent directory is a symlink into the protected agent directory', async () => {
      const parentLink = path.resolve(os.tmpdir(), 'protected-path-utils-spec-dir-link');
      await fs.ensureSymlink(PACKAGE_ROOT_DIR, parentLink, 'dir');
      try {
        await guardPath(path.resolve(parentLink, 'new-file.txt'), { checkAncestors: true })
          .should.be.rejectedWith(/protected Losant Edge Agent directory/);

        // Defaults to checkAncestors: false, skipping ancestor walking for reads
        const { resolvedPath, realPath } = await guardPath(path.resolve(parentLink, 'new-file.txt'));
        resolvedPath.should.equal(path.resolve(parentLink, 'new-file.txt'));
        should.not.exist(realPath);
      } finally {
        await fs.remove(parentLink);
      }
    });

    it('refuses a dangling symlink when checkAncestors is true', async () => {
      await guardPath(danglingLinkPath, { checkAncestors: true })
        .should.be.rejectedWith(/symlink with no valid target/);
    });

    it('tolerates a dangling symlink when checkAncestors is false', async () => {
      const { resolvedPath, realPath } = await guardPath(danglingLinkPath);
      resolvedPath.should.equal(danglingLinkPath);
      should.not.exist(realPath);
    });

    it('tolerates an empty path without touching the filesystem', async () => {
      const { resolvedPath, realPath } = await guardPath('');
      resolvedPath.should.equal('');
      should.not.exist(realPath);
    });

    it('does not treat a whitespace-only path as empty (it resolves relative to the cwd)', async () => {
      await guardPath('   \t\n')
        .should.be.rejectedWith({ type: 'Validation', message: 'Cannot access within the protected Losant Edge Agent directory.' });
    });

    it('refuses an empty path when checkAncestors is true', async () => {
      await guardPath('', { checkAncestors: true })
        .should.be.rejectedWith({ type: 'Validation', message: 'The provided disk path cannot be empty.' });
    });

    it('does not trim surrounding whitespace from path strings', async () => {
      const padded = `${filePath} `;
      const { resolvedPath, realPath } = await guardPath(padded);
      resolvedPath.should.equal(padded);
      should.not.exist(realPath);
    });

    it('rejects with a typed error when path is not a string', async () => {
      await guardPath(123)
        .should.be.rejectedWith({ type: 'Validation', message: 'Path must be a string.' });
      await guardPath(null)
        .should.be.rejectedWith({ type: 'Validation', message: 'Path must be a string.' });
      await guardPath(undefined)
        .should.be.rejectedWith({ type: 'Validation', message: 'Path must be a string.' });
      await guardPath({})
        .should.be.rejectedWith({ type: 'Validation', message: 'Path must be a string.' });
    });
  });

  describe('guardFileReadPath', () => {
    const filePath = path.resolve(os.tmpdir(), 'protected-path-utils-spec-read-file.txt');
    const symlinkPath = path.resolve(os.tmpdir(), 'protected-path-utils-spec-read-link.txt');
    const protectedTarget = path.resolve(PACKAGE_ROOT_DIR, 'package.json');

    before(async () => {
      await fs.writeFile(filePath, 'read me');
      await fs.ensureSymlink(protectedTarget, symlinkPath);
    });

    after(async () => {
      await fs.remove(filePath);
      await fs.remove(symlinkPath);
    });

    it('resolves an allowed regular file and returns realPath and stats', async () => {
      const { realPath, stats } = await guardFileReadPath(filePath);
      realPath.should.equal(await fs.realpath(filePath));
      stats.isFile().should.be.true();
    });

    it('rejects with a NotFound error when the file does not exist', async () => {
      const missing = path.resolve(os.tmpdir(), 'protected-path-utils-spec-read-missing.txt');
      await guardFileReadPath(missing)
        .should.be.rejectedWith({ type: 'NotFound', message: `No file exists at "${missing}"` });
    });

    it('rejects with a NotFound error when path is empty', async () => {
      await guardFileReadPath('')
        .should.be.rejectedWith({ type: 'NotFound', message: 'No file exists at ""' });
    });

    it('does not trim surrounding whitespace from disk paths', async () => {
      await guardFileReadPath(`${filePath} `)
        .should.be.rejectedWith({ type: 'NotFound', message: `No file exists at "${filePath} "` });
    });

    it('rejects when the path is a directory', async () => {
      await guardFileReadPath(os.tmpdir())
        .should.be.rejectedWith({ type: 'NotFound', message: 'The provided disk path is a directory.' });
    });

    it('rejects a non-regular character device (/dev/null)', async () => {
      await guardFileReadPath('/dev/null')
        .should.be.rejectedWith({ type: 'NotFound', message: 'The provided disk path is not a regular file.' });
    });

    it('rejects a socket', async () => {
      const socketPath = path.resolve(os.tmpdir(), 'protected-path-utils-spec.sock');
      await fs.remove(socketPath);
      const server = net.createServer();
      await new Promise((resolve) => server.listen(socketPath, resolve));
      try {
        await guardFileReadPath(socketPath)
          .should.be.rejectedWith({ type: 'NotFound', message: 'The provided disk path is not a regular file.' });
      } finally {
        await new Promise((resolve) => server.close(resolve));
        await fs.remove(socketPath);
      }
    });

    it('rejects a FIFO', async () => {
      if (process.platform === 'win32') {
        return;
      }
      const fifoPath = path.resolve(os.tmpdir(), 'protected-path-utils-spec.fifo');
      await fs.remove(fifoPath);
      execSync(`mkfifo "${fifoPath}"`);
      try {
        await guardFileReadPath(fifoPath)
          .should.be.rejectedWith({ type: 'NotFound', message: 'The provided disk path is not a regular file.' });
      } finally {
        await fs.remove(fifoPath);
      }
    });

    it('rejects a path inside the protected agent directory', async () => {
      await guardFileReadPath(path.resolve(PACKAGE_ROOT_DIR, 'losant-edge-agent-config.toml'))
        .should.be.rejectedWith(/protected Losant Edge Agent directory/);
    });

    it('rejects a symlink whose target is inside the protected agent directory', async () => {
      await guardFileReadPath(symlinkPath)
        .should.be.rejectedWith(/protected Losant Edge Agent directory/);
    });
  });

  describe('loadGuardedFile', () => {
    const filePath = path.resolve(os.tmpdir(), 'protected-path-utils-spec-load-file.txt');
    const contents = 'hello world';

    before(async () => {
      await fs.writeFile(filePath, contents);
    });

    after(async () => {
      await fs.remove(filePath);
    });

    it('reads file contents with the given encoding', async () => {
      (await loadGuardedFile(filePath, { encoding: 'utf8' })).should.equal(contents);
    });

    it('defaults to a Buffer when no encoding is given', async () => {
      const result = await loadGuardedFile(filePath);
      Buffer.isBuffer(result).should.be.true();
      result.toString('utf8').should.equal(contents);
    });

    it('does not trim surrounding whitespace from disk paths', async () => {
      await loadGuardedFile(`${filePath} `, { encoding: 'utf8' })
        .should.be.rejectedWith({ type: 'NotFound', message: `No file exists at "${filePath} "` });
    });

    it('rejects with a typed error when the path does not exist', async () => {
      const missing = path.resolve(os.tmpdir(), 'protected-path-utils-spec-load-missing.txt');
      await loadGuardedFile(missing).should.be.rejectedWith({ type: 'NotFound', message: `No file exists at "${missing}"` });
    });

    it('rejects when the path is a directory', async () => {
      await loadGuardedFile(os.tmpdir())
        .should.be.rejectedWith({ type: 'NotFound', message: 'The provided disk path is a directory.' });
    });

    it('rejects a non-regular file', async () => {
      await loadGuardedFile('/dev/null')
        .should.be.rejectedWith({ type: 'NotFound', message: 'The provided disk path is not a regular file.' });
    });

    it('rejects a path inside the protected agent directory', async () => {
      await loadGuardedFile(path.resolve(PACKAGE_ROOT_DIR, 'losant-edge-agent-config.toml'))
        .should.be.rejectedWith(/protected Losant Edge Agent directory/);
    });

    it('enforces an optional size cap', async () => {
      const maxSize = contents.length - 1;
      await loadGuardedFile(filePath, { maxSize })
        .should.be.rejectedWith({ type: 'Validation', message: `Cannot load a file larger than ${maxSize} bytes.` });
    });

    it('formats size caps >= 1MB in MB', async () => {
      const bigFilePath = path.resolve(os.tmpdir(), 'protected-path-utils-spec-big-file.txt');
      const bigBuffer = Buffer.alloc(ONE_MEGABYTE + 10, 'a');
      await fs.writeFile(bigFilePath, bigBuffer);
      try {
        await loadGuardedFile(bigFilePath, { maxSize: ONE_MEGABYTE })
          .should.be.rejectedWith({ type: 'Validation', message: 'Cannot load a file larger than 1MB.' });
      } finally {
        await fs.remove(bigFilePath);
      }
    });

    it('allows a file exactly at the size cap', async () => {
      (await loadGuardedFile(filePath, { maxSize: contents.length, encoding: 'utf8' })).should.equal(contents);
    });
  });

});
