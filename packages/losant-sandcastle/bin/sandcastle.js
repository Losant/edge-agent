#!/usr/bin/env node
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers'; // eslint-disable-line import/no-unresolved
import { noop } from 'omnibelt';
import { pathToFileURL } from 'node:url';

yargs(hideBin(process.argv))
  .usage('Usage sandcastle <command>')
  .command('sandbox', 'start a sandbox server', noop, async (argv) => {
    const Sandbox = (await import(pathToFileURL(argv['sandbox-module-path']).href)).default;
    (new Sandbox({
      socket: argv.socket,
      filename: argv['sandbox-script-file-name'],
      defaultErrorMessage: argv['sandbox-script-default-error-message']
    })).start();
  })
  .option('socket', {
    alias: 's',
    describe: 'path to socket file',
    default: '/tmp/sandcastle.sock'
  })
  .option('sandbox-module-path', {
    describe: 'path to custom sandbox module',
    type: 'string'
  })
  .option('sandbox-script-file-name', {
    describe: 'name of the sandbox script file',
    type: 'string'
  })
  .option('sandbox-script-default-error-message', {
    describe: 'default error message for errors thrown from the sandbox script',
    type: 'string'
  })
  .parse();
