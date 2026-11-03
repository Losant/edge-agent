import path from 'node:path';
import fs from 'node:fs';
import licenseChecker from 'license-checker';
import { uniq } from 'omnibelt';
import { evaluate, loadPolicy } from './license-policy.js';

// Usage: node third-party-licenses.js [dir] [--check]
// --check only enforces the license policy; it doesn't write LICENSES-3rdParty.csv.
const args = process.argv.slice(2);
const checkOnly = args.includes('--check');
const dirArg = args.find((arg) => !arg.startsWith('--'));
const dir = dirArg ? path.resolve(dirArg) : path.resolve(import.meta.dirname, '..');

const ignoreLosant = /^losant-/;
const policy = loadPolicy();

const lines = [
  'tini, MIT, https://github.com/krallin/tini',
  'node, MIT, https://github.com/nodejs/node',
  'pnpm, MIT, https://github.com/pnpm/pnpm'
];

console.log(`processing licenses... ${dir}`);

licenseChecker.init({
  start: path.join(dir, 'node_modules/.pnpm')
}, function(err, data) {
  if (err) { throw err; }
  const violations = [];
  Object.keys(data).forEach((mod) => {
    const name = mod.substring(0, mod.lastIndexOf('@'));
    if (name.match(ignoreLosant)) { return; }

    let repository = data[mod].repository;
    if (repository) {
      repository = repository.replace(/^git:/, 'https:')
        .replace(/^git@github.com:/, 'https://github.com/')
        .replace(/^git\+/, '')
        .replace(/^ssh:\/\/git@/, 'https://')
        .replace(/^github:/, 'https://github.com/')
        .replace(/\.git$/, '')
        .replace('/www.github.com/', '/github.com/')
        .replace(/^http:\/\/github.com/, 'https://github.com');
      if (!repository.startsWith('http')) {
        repository = `https://github.com/${repository}`;
      }
    }

    // if there is no repo, just link to npm package
    if (!repository) {
      repository = `https://www.npmjs.com/package/${name}`;
    }

    const { license, status } = evaluate(name, data[mod].licenses, policy);
    if (status !== 'ok') {
      violations.push(`${status.padEnd(11)} ${mod} - ${license}`);
      return;
    }

    lines.push(`${name}, ${license}, ${repository}`);
  });

  if (violations.length > 0) {
    console.error(`License policy violations:\n${violations.sort().join('\n')}`);
    console.error('Allow a license or add a reviewed override in scripts/license-policy.json.');
    process.exit(1);
  }

  if (checkOnly) {
    console.error('... all licenses allowed.');
    return;
  }

  const fileContents = `Library, License, Location\n${uniq(lines).sort().join('\n')}\n`;
  fs.writeFileSync(path.join(dir, 'LICENSES-3rdParty.csv'), fileContents);

  console.error('... done.');
});
