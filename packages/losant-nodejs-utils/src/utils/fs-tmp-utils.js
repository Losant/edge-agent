import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmpDir = tmpdir();

export const createTmpDir = (prefix = 'losant-') =>
  mkdtemp(join(tmpDir, prefix));
