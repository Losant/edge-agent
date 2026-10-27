import path from 'node:path';
import fs from 'fs-extra';
import errors from 'losant-nodejs-utils/src/errors.js';
import { ONE_MEGABYTE } from 'losant-nodejs-utils/src/constants/size.js';
import { PACKAGE_ROOT_DIR } from '../constants.js';

const PROTECTED_PATH_MESSAGE = 'Cannot access within the protected Losant Edge Agent directory.';
const DIRECTORY_MESSAGE = 'The provided disk path is a directory.';
const NOT_REGULAR_FILE_MESSAGE = 'The provided disk path is not a regular file.';
const DANGLING_SYMLINK_MESSAGE = 'The provided disk path is a symlink with no valid target.';
const EMPTY_PATH_MESSAGE = 'The provided disk path cannot be empty.';
const notFoundMessage = (p) => `No file exists at "${p}"`;
const sizeMessage = (maxSize) => (maxSize >= ONE_MEGABYTE
  ? `Cannot load a file larger than ${Math.round((maxSize / ONE_MEGABYTE) * 100) / 100}MB.`
  : `Cannot load a file larger than ${maxSize} bytes.`);


export const isProtectedPath = (candidate) => {
  const resolved = path.resolve(candidate);
  return resolved === PACKAGE_ROOT_DIR || resolved.startsWith(`${PACKAGE_ROOT_DIR}${path.sep}`);
};

export const checkProtectedPath = (candidate) => {
  if (isProtectedPath(candidate)) {
    throw errors.Validation({ message: PROTECTED_PATH_MESSAGE });
  }
};

// Rejects rawPath if it (or, when something already exists there, its
// realpath) falls inside the protected agent directory. Tolerates rawPath
// not existing yet. When checkAncestors is enabled (e.g. for write operations
// creating intermediate directories), it walks up to the nearest existing
// ancestor and guard-checks that ancestor's realpath instead. For read operations,
// ancestor walking can be omitted (checkAncestors: false) since nonexistent targets
// cannot leak protected data.
//
// An empty/falsy rawPath is never treated as a real path (path.resolve('')
// would otherwise resolve to process.cwd(), silently guarding the wrong
// directory). For read operations, it short-circuits to "doesn't exist" without
// touching disk. For write operations (checkAncestors: true), an empty target
// is invalid and rejected outright.
//
// A dangling symlink (something exists at a candidate path, and it is
// itself a symlink, but fs.realpath can't resolve it because its target is
// missing) is rejected outright rather than tolerated as "nothing here" when
// checkAncestors is enabled - callers like file-write-node.js follow the resolved
// path with fs.outputFile, so a pre-planted dangling symlink whose target would
// land inside the protected directory must not be waved through.
export const guardPath = async (rawPath, { checkAncestors = false } = {}) => {
  if (typeof rawPath !== 'string') {
    throw errors.Validation({ message: 'Path must be a string.' });
  }
  // Paths are used verbatim; surrounding whitespace is significant on disk.
  if (!rawPath) {
    if (checkAncestors) {
      throw errors.Validation({ message: EMPTY_PATH_MESSAGE });
    }
    return { resolvedPath: '', realPath: undefined };
  }
  const resolvedPath = path.resolve(rawPath);
  checkProtectedPath(resolvedPath);

  // 1. If target file exists on disk, resolve its canonical realPath and guard it.
  let realPath;
  try {
    realPath = await fs.realpath(resolvedPath);
  } catch {
    // Target does not exist on disk or is a dangling symlink.
  }
  if (realPath) {
    checkProtectedPath(realPath);
    return { resolvedPath, realPath };
  }

  // 2. Target does not exist. If checkAncestors is enabled (essential for write
  // operations to ensure parent directories don't symlink into the protected agent
  // directory), reject dangling symlinks and walk up to ensure the nearest
  // existing parent directory is safe.
  if (checkAncestors) {
    let lstat;
    try {
      lstat = await fs.lstat(resolvedPath);
    } catch {
      lstat = undefined;
    }
    if (lstat?.isSymbolicLink()) {
      throw errors.Validation({ message: DANGLING_SYMLINK_MESSAGE });
    }

    const guardNearestAncestor = async (dirPath) => {
      const parent = path.dirname(dirPath);
      if (parent === dirPath) { return; } // Reached filesystem root
      let parentRealPath;
      try {
        parentRealPath = await fs.realpath(parent);
      } catch {
        // Parent also does not exist; check if parent itself is a dangling symlink
        let parentLstat;
        try {
          parentLstat = await fs.lstat(parent);
        } catch {
          parentLstat = undefined;
        }
        if (parentLstat?.isSymbolicLink()) {
          throw errors.Validation({ message: DANGLING_SYMLINK_MESSAGE });
        }
        await guardNearestAncestor(parent);
        return;
      }
      checkProtectedPath(parentRealPath);
    };
    await guardNearestAncestor(resolvedPath);
  }
  // File does not exist yet, but its parent path is validated and safe.
  return { resolvedPath, realPath: undefined };
};

export const guardFileReadPath = async (rawPath) => {
  const { realPath } = await guardPath(rawPath);

  let stats;
  try {
    stats = realPath && await fs.stat(realPath);
  } catch { }

  if (!stats) {
    throw errors.NotFound({ message: notFoundMessage(rawPath) });
  }

  if (!stats.isFile()) {
    throw errors.NotFound({ message: stats.isDirectory() ? DIRECTORY_MESSAGE : NOT_REGULAR_FILE_MESSAGE });
  }

  return { realPath, stats };
};

// guardPath, plus a stat, isFile/isDirectory check, optional size cap, and
// read. For sites where the target must already exist.
export const loadGuardedFile = async (rawPath, { maxSize, encoding } = {}) => {
  const { realPath, stats } = await guardFileReadPath(rawPath);

  if (maxSize !== undefined && stats.size > maxSize) {
    throw errors.Validation({ message: sizeMessage(maxSize) });
  }

  return fs.readFile(realPath, encoding);
};
