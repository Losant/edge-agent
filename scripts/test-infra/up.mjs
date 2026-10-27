// Starts the local test services, reusing any that already answer on their
// port (e.g. another project's Redis or Mongo on 6379/27017) and only
// starting the rest from compose-local.yml.
import { spawnSync } from 'child_process';
import path from 'path';
import { serviceTarget, unreachableServices } from '../../packages/losant-nodejs-utils/test/utils/test-services.js';

// test-services.js name -> compose-local.yml service name
const composeServices = { redis: 'redis', redisCluster: 'redis-cluster', mongo: 'mongodb', mosquitto: 'mosquitto' };
const names = Object.keys(composeServices);

const missing = await unreachableServices(names);
for (const name of names.filter((n) => !missing.includes(n))) {
  const { host, port } = serviceTarget(name);
  console.log(`Reusing ${name} already running at ${host}:${port}`);
}

if (missing.length) {
  const composeFile = path.join(import.meta.dirname, 'compose-local.yml');
  const result = spawnSync('docker', [
    'compose', '-f', composeFile, 'up', '-d', '--wait',
    ...missing.map((name) => composeServices[name])
  ], { stdio: 'inherit' });
  process.exit(result.status ?? 1);
}
