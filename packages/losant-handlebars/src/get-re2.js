import { createRequire } from 'module';
let RE2;
try {
  const require = createRequire(import.meta.url);
  RE2 = require('re2');
} catch {
  RE2 = RegExp;
}

export default RE2;
