// NOTE: Do not rely on any local files here.
//       Used by `src/index` for `dotenv` path.

import path from 'node:path';

export default (...paths) =>
  path.resolve(import.meta.dirname, '..', '..', ...paths);
