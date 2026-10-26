const path = require('path');
const fs = require('fs');
const licenseChecker = require('license-checker');
const { uniq, intersection } = require('omnibelt');
const extraData = require('./extra-license-data.json');

const ignoreLosant = /^losant-/;
const allowedLicenses = [
  '0BSD', 'Apache 2.0', 'Apache-2.0', 'Apache2', 'BSD', 'BSD-2-Clause', 'BSD-3-Clause', 'BSD-like',
  'BlueOak-1.0.0', 'CC-BY-3.0', 'CC-BY-4.0', 'CC0', 'CC0-1.0', 'ISC', 'MIT', 'MIT-0',
  'MIT/X11', 'MPL-2.0', 'Mapbox', 'Public Domain', 'Python-2.0', 'Unlicense', 'WTFPL'
];

const lines = [
  'tini, MIT, https://github.com/krallin/tini',
  'yarn, BSD-2-Clause, https://github.com/yarnpkg/yarn',
  'node, MIT, https://github.com/nodejs/node',
  'pnpm, MIT, https://github.com/pnpm/pnpm'
];

const dir = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(__dirname, '..');

console.log(`processing licenses... ${dir}`);

licenseChecker.init({
  start: path.join(dir, 'node_modules/.pnpm')
}, function(err, data) {
  if (err) { throw err; }
  let hasBadLicenseData = false;
  Object.keys(data).forEach((mod) => {
    const name = mod.substring(0, mod.lastIndexOf('@'));
    if (name.match(ignoreLosant)) { return; }

    let licenses = data[mod].licenses;
    if (!Array.isArray(licenses)) {
      licenses = licenses.replace('(', '').replace(')', '').replace('*', '').split(/( OR )|( AND )/);
    }

    let repository = data[mod].repository;
    const extra = extraData[name];
    if (extra) {
      if (extra.repo) { repository = extraData[name].repo; }
      if (extra.licenses) { licenses = extraData[name].licenses; }
    }

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

    licenses = intersection(allowedLicenses, licenses);
    if (licenses.length === 0) {
      hasBadLicenseData = true;
      console.error(`No allowed license! - ${JSON.stringify(mod)}`);
    }

    lines.push(`${name}, ${licenses[0]}, ${repository}`);
  });

  if (hasBadLicenseData) {
    throw new Error('One or more missing licenses');
  }

  const fileContents = `Library, License, Location\n${uniq(lines).sort().join('\n')}\n`;
  fs.writeFileSync(path.join(dir, 'LICENSES-3rdParty.csv'), fileContents);

  console.error('... done.');
});
