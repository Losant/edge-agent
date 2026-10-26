import dotEnv from 'dotenv';
import { has, forEach } from 'omnibelt';
import fromPackageRoot from './lib/from-package-root.js';

dotEnv.config({
  path: fromPackageRoot('.env'),
  quiet: true
});
forEach(([envVar, defaultVal]) => {
  if (!has(envVar, process.env)) {
    process.env[envVar] = defaultVal;
  }
}, [
  ['NODE_ENV', 'production'],
  ['ENABLE_EDGE_AGENT_FEATURES', 'true'],
  ['EXIT_ON_INVALID_CONFIG', 'true']
]);
