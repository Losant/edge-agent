import {
  toTestableLinesDir, testingWorkspace, pathToEdgeConfFixture
} from './common.js';
import path from 'node:path';
import fs from 'fs-extra';
import childProcess from 'child_process';
import should from 'should';
import { sleep, defer, split } from 'omnibelt';

const workingDir = path.resolve(testingWorkspace, 'index-spec');
let toTestableLines;

const agentLocation = path.resolve(import.meta.dirname, '..', 'losant-edge-agent');

const baseConfig = fs.readFileSync(pathToEdgeConfFixture);
const baseEnv = {
  PATH: process.env.PATH,
  CONF_PATH_DEFAULT: path.resolve(workingDir, 'config.toml'),
  STORE_PATH_DEFAULT: path.resolve(workingDir, 'store.db'),
  WEBSERVER_PORT_DEFAULT: 8081,
  NODE_NO_WARNINGS: 1
};

let isAlpine = false;
try {
  isAlpine = !!fs.readFileSync('/etc/os-release').toString().match(/alpine/i);
} catch { }

const CLI_TEST_TIMEOUT = 60000;

const streamToString = (stream) => {
  const deferred = defer();
  let str = '';
  stream.on('error', deferred.reject);
  stream.on('data', (chunk) => {
    // to block opcua crypto from corrupting these tests
    if (chunk.toString() !== 'using nodejs crypto (native)\n') {
      str += chunk;
    }
  });
  stream.on('end', () => { deferred.resolve(str); });
  const currentLineCount = () => {
    return split('\n', str.trim()).length;
  };

  return { currentLineCount, promise: deferred.promise };
};

const waitForLineCount = async (currentLineCount, expected) => {
  if (currentLineCount() >= expected) { return; }
  await sleep(100);
  return waitForLineCount(currentLineCount, expected);
};

const spawnAgent = ({
  expectedCode = 0,
  cliFlags = [],
  env = {}
} = {}) => {
  cliFlags = cliFlags.slice();
  cliFlags.unshift(agentLocation);
  const subprocess = childProcess.spawn(
    process.env.NODE,
    cliFlags,
    {
      detached: false,
      stdio: 'pipe',
      env: {
        ...baseEnv,
        ...env
      },
      cwd: workingDir
    }
  );

  let deferred = defer();
  const promise = deferred.promise;
  subprocess.on('error', (...args) => {
    if (!deferred) { return; }
    deferred.reject(args);
    deferred = null;
  });
  subprocess.on('exit', (...args) => {
    if (!deferred) { return; }
    should(args[0]).equal(expectedCode);
    deferred.resolve();
    deferred = null;
  });

  const { currentLineCount: errLineCount, promise: stdErr }
    = streamToString(subprocess.stderr);
  const { currentLineCount: outLineCount, promise: stdOut }
    = streamToString(subprocess.stdout);

  const currentLineCount = () => {
    return errLineCount() + outLineCount();
  };
  return { subprocess, promise, stdErr, stdOut, currentLineCount };
};

describe('Edge Agent CLI', function() {
  before(() => {
    toTestableLines = toTestableLinesDir(workingDir);
  });
  beforeEach(async () => {
    await fs.mkdirp(workingDir);
  });

  afterEach(async () => {
    await fs.remove(workingDir);
    await fs.writeFile(pathToEdgeConfFixture, baseConfig);
    await sleep(100);
  });

  it('should hang open with EXIT_ON_INVALID_CONFIG as false', async function() {
    const {
      subprocess, stdErr, stdOut, promise, currentLineCount
    } = spawnAgent({
      expectedCode: null,
      env: {
        EXIT_ON_INVALID_CONFIG: 'false',
        BROKER_HOST: '127.0.0.2', // i.e., force invalid
        DEVICE_ID: 'bad',
        ACCESS_KEY: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        ACCESS_SECRET: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
      }
    });

    await waitForLineCount(currentLineCount, 3);
    (await Promise.race([sleep(1000).then(() => 'not exited yet'), promise])).should.equal('not exited yet');

    subprocess.kill('SIGKILL');
    await promise;

    toTestableLines(await stdOut).should.deepEqual([
      '0000-00-00T00:00:00.000Z [warn] Unable to read and parse agent config file at expected path: __WORKING_DIR__/config.toml',
      '0000-00-00T00:00:00.000Z [warn] Attempting startup using configuration from only environment variables and command line flags.',
      '0000-00-00T00:00:00.000Z [info] The Losant Edge Agent is awaiting device specific configuration. Please edit the config.toml file or provide configuration environment variables. The Edge Agent container must be restarted for any configuration changes to take affect.'
    ]);
    toTestableLines(await stdErr).should.deepEqual([]);
  }).timeout(CLI_TEST_TIMEOUT);

  it('should run with env config', async function() {
    const {
      subprocess, stdErr, stdOut, promise, currentLineCount
    } = spawnAgent({
      env: {
        DEVICE_ID: '123412341234123412341234',
        ACCESS_KEY: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        ACCESS_SECRET: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        BROKER_HOST: '127.0.0.2', // i.e., force invalid
        BROKER_PROTOCOL: 'mqtt://'
      }
    });

    await waitForLineCount(currentLineCount, isAlpine ? 10 : 7);

    subprocess.kill('SIGTERM');
    await promise;

    toTestableLines(await stdOut).should.containDeep([
      '0000-00-00T00:00:00.000Z [warn] Unable to read and parse agent config file at expected path: __WORKING_DIR__/config.toml',
      '0000-00-00T00:00:00.000Z [warn] Attempting startup using configuration from only environment variables and command line flags.',
      '0000-00-00T00:00:00.000Z [info] Agent Starting...',
      '0000-00-00T00:00:00.000Z [info] Agent Version: 0.0.0',
      '0000-00-00T00:00:00.000Z [info] Webserver started on port: 8081',
      '0000-00-00T00:00:00.000Z [info] Workflows initialized and running...',
      '0000-00-00T00:00:00.000Z [info] Connecting to: mqtt://127.0.0.2 ...',
      '0000-00-00T00:00:00.000Z [info] Agent shutdown requested',
      '0000-00-00T00:00:00.000Z [info] 0 workflow(s) run since agent startup.',
      '0000-00-00T00:00:00.000Z [info] Clean shutdown, exiting'
    ]);
    toTestableLines(await stdErr).should.deepEqual([]);
  }).timeout(CLI_TEST_TIMEOUT);

  it('should run with file config (env var)', async function() {
    const {
      subprocess, stdErr, stdOut, promise, currentLineCount
    } = spawnAgent({
      env: {
        CONF_PATH: pathToEdgeConfFixture,
        BROKER_HOST: '127.0.0.2', // i.e., force invalid
        BROKER_PROTOCOL: 'mqtt'
      }
    });

    await waitForLineCount(currentLineCount, isAlpine ? 8 : 5);

    subprocess.kill('SIGTERM');
    await promise;

    toTestableLines(await stdOut).should.containDeep([
      '0000-00-00T00:00:00.000Z [info] Agent Starting...',
      '0000-00-00T00:00:00.000Z [info] Agent Version: 0.0.0',
      '0000-00-00T00:00:00.000Z [info] Webserver started on port: 8081',
      '0000-00-00T00:00:00.000Z [info] Workflows initialized and running...',
      '0000-00-00T00:00:00.000Z [info] Connecting to: mqtt://127.0.0.2 ...',
      '0000-00-00T00:00:00.000Z [info] Agent shutdown requested',
      '0000-00-00T00:00:00.000Z [info] 0 workflow(s) run since agent startup.',
      '0000-00-00T00:00:00.000Z [info] Clean shutdown, exiting'
    ]);
    toTestableLines(await stdErr).should.deepEqual([]);
  }).timeout(CLI_TEST_TIMEOUT);

  it('should run with file config (cmd line flag)', async function() {
    const {
      subprocess, stdErr, stdOut, promise, currentLineCount
    } = spawnAgent({
      env: {
        BROKER_HOST: '127.0.0.2' // i.e., force invalid
      },
      cliFlags: ['-f', pathToEdgeConfFixture]
    });

    await waitForLineCount(currentLineCount, isAlpine ? 8 : 5);

    subprocess.kill('SIGTERM');
    await promise;
    toTestableLines(await stdOut).should.containDeep([
      '0000-00-00T00:00:00.000Z [info] Agent Starting...',
      '0000-00-00T00:00:00.000Z [info] Agent Version: 0.0.0',
      '0000-00-00T00:00:00.000Z [info] Webserver started on port: 8081',
      '0000-00-00T00:00:00.000Z [info] Workflows initialized and running...',
      '0000-00-00T00:00:00.000Z [info] Connecting to: mqtts://127.0.0.2 ...',
      '0000-00-00T00:00:00.000Z [info] Agent shutdown requested',
      '0000-00-00T00:00:00.000Z [info] 0 workflow(s) run since agent startup.',
      '0000-00-00T00:00:00.000Z [info] Clean shutdown, exiting'
    ]);
    toTestableLines(await stdErr).should.deepEqual([]);
  }).timeout(CLI_TEST_TIMEOUT);

  it('should run with cli config', async function() {
    const {
      subprocess, stdErr, stdOut, promise, currentLineCount
    } = spawnAgent({
      env: {
        BROKER_HOST: '127.0.0.2' // i.e., force invalid
      },
      cliFlags: [
        '--device-id',
        '123412341234123412341234',
        '--access-key',
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        '--access-secret',
        'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
      ]
    });

    await waitForLineCount(currentLineCount, isAlpine ? 10 : 7);

    subprocess.kill('SIGTERM');
    await promise;

    toTestableLines(await stdOut).should.containDeep([
      '0000-00-00T00:00:00.000Z [warn] Unable to read and parse agent config file at expected path: __WORKING_DIR__/config.toml',
      '0000-00-00T00:00:00.000Z [warn] Attempting startup using configuration from only environment variables and command line flags.',
      '0000-00-00T00:00:00.000Z [info] Agent Starting...',
      '0000-00-00T00:00:00.000Z [info] Agent Version: 0.0.0',
      '0000-00-00T00:00:00.000Z [info] Webserver started on port: 8081',
      '0000-00-00T00:00:00.000Z [info] Workflows initialized and running...',
      '0000-00-00T00:00:00.000Z [info] Connecting to: mqtts://127.0.0.2 ...',
      '0000-00-00T00:00:00.000Z [info] Agent shutdown requested',
      '0000-00-00T00:00:00.000Z [info] 0 workflow(s) run since agent startup.',
      '0000-00-00T00:00:00.000Z [info] Clean shutdown, exiting'
    ]);
    toTestableLines(await stdErr).should.deepEqual([]);
  }).timeout(CLI_TEST_TIMEOUT);

  it('should correctly display help', async function() {
    const {
      stdErr, stdOut, promise
    } = spawnAgent({ cliFlags: ['--help'] });

    await promise;

    toTestableLines(await stdOut).should.containDeep([
      'Usage: losant-edge-agent [options]',
      '',
      'Options:',
      '  -V, --version                                 output the version number',
      '  -f, --conf-path <./config.toml>               Path to configuration file.',
      '  --logger-out <console>                        Desired destination for logging. One of "console" or a file path.',
      '  --logger-level <info>                         Desired log level. One of "error, warn, info, verbose".',
      '  --store-path <./store.db>                     Path to persistent store.',
      '  --device-id <your-device-id>                  Device ID of Agent.',
      '  --access-key <your-access-key>                Access key of Agent.',
      '  --access-secret <your-access-secret>          Access key of Agent.',
      '  --queue-offline-messages <true>               If the agent should queue messages while offline to send later.',
      '  --offline-message-replay-order <oldestFirst>  In what order the agent should send queued offline messages once reconnected. One of oldestFirst, newestFirst',
      '  --subscribe-to-peripheral-updates <true>      If the agent should subscribe to peripheral updates. One of "true, false, floating, peripheral".',
      '  --udp-address <0.0.0.0>                       Address to bind UDP triggers to.',
      '  --webserver-port <8081>                       Port to run webserver on.',
      '  --webserver-address <0.0.0.0>                 Address to run webserver on.',
      '  --webserver-username <username>               Username for webserver basic auth.',
      '  --webserver-password <password>               Password for webserver basic auth.',
      '  --webserver-ssl-key-path <path>               Path to SSL key for webserver.',
      '  --webserver-ssl-cert-path <path>              Path to SSL cert for webserver.',
      '  --webserver-ssl-bundle-path <path>            Path to SSL bundle for webserver.',
      '  --webserver-enabled <true>                    If webserver should be enabled.',
      '  --workflow-directory <./../../../workflows>   Directory containing on-disk workflows.',
      '  --local-broker-port <1883>                    Port to run local broker on.',
      '  --local-broker-address <0.0.0.0>              Address to run local broker on.',
      '  --local-broker-username <username>            Username for local broker.',
      '  --local-broker-password <password>            Password for local broker.',
      '  --local-broker-ssl-key-path <path>            Path to SSL key for local broker.',
      '  --local-broker-ssl-cert-path <path>           Path to SSL cert for local broker.',
      '  --local-broker-ssl-bundle-path <path>         Path to SSL bundle for local broker.',
      '  --local-broker-enabled <false>                If local broker should be enabled.',
      '  --otel-reporting-enabled <true,false>         If automated container metric reporting to the OpenTelemetry collector should be enabled. Defaults to false.',
      '  -h, --help                                    display help for command',
      '',
      '    NOTE: Conf file configuration can be overridden by Environment Variables or CLI flags.'
    ]);
    toTestableLines(await stdErr).should.deepEqual([]);
  }).timeout(CLI_TEST_TIMEOUT);

  it('should reload with new config', async function() {
    const {
      subprocess, stdErr, stdOut, promise, currentLineCount
    } = spawnAgent({
      env: {
        CONF_PATH: pathToEdgeConfFixture,
        BROKER_HOST: '127.0.0.2' // i.e., force invalid
      }
    });
    await waitForLineCount(currentLineCount, isAlpine ? 11 : 8);

    const newConfig = await fs.readFile(path.resolve(import.meta.dirname, '__fixtures__', 'test-configs', 'losant-edge-agent-config.simple.toml'));
    await fs.writeFile(pathToEdgeConfFixture, newConfig);

    subprocess.kill('SIGHUP');
    await waitForLineCount(currentLineCount, isAlpine ? 19 : 16);

    subprocess.kill('SIGTERM');
    await promise;

    toTestableLines(await stdOut).should.containDeep([
      '0000-00-00T00:00:00.000Z [info] Agent Starting...',
      '0000-00-00T00:00:00.000Z [info] Agent Version: 0.0.0',
      '0000-00-00T00:00:00.000Z [info] Webserver started on port: 8081',
      '0000-00-00T00:00:00.000Z [info] Workflows initialized and running...',
      '0000-00-00T00:00:00.000Z [info] Connecting to: mqtts://127.0.0.2 ...',
      '0000-00-00T00:00:00.000Z [info] Local broker listening on 0.0.0.0:45458',
      '0000-00-00T00:00:00.000Z [info] Reloading agent configuration...',
      '0000-00-00T00:00:00.000Z [info] Local broker listening on 0.0.0.0:2319',
      '0000-00-00T00:00:00.000Z [info] Agent shutdown requested',
      '0000-00-00T00:00:00.000Z [info] 0 workflow(s) run since agent startup.',
      '0000-00-00T00:00:00.000Z [info] Clean shutdown, exiting'
    ]);
    toTestableLines(await stdErr).should.deepEqual([]);
  }).timeout(CLI_TEST_TIMEOUT);

  it('should error when store cannot be created', async function() {
    const {
      subprocess, stdErr, stdOut, promise, currentLineCount
    } = spawnAgent({
      env: {
        DEVICE_ID: '123412341234123412341234',
        ACCESS_KEY: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        ACCESS_SECRET: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        BROKER_HOST: '127.0.0.2', // i.e., force invalid
        STORE_PATH: '/dev/null'
      },
      expectedCode: 2
    });

    await waitForLineCount(currentLineCount, 6);

    subprocess.kill('SIGTERM');
    await promise;

    toTestableLines(await stdOut).should.deepEqual([
      '0000-00-00T00:00:00.000Z [warn] Unable to read and parse agent config file at expected path: __WORKING_DIR__/config.toml',
      '0000-00-00T00:00:00.000Z [warn] Attempting startup using configuration from only environment variables and command line flags.',
      '0000-00-00T00:00:00.000Z [info] Agent Starting...',
      '0000-00-00T00:00:00.000Z [info] Agent Version: 0.0.0'
    ]);
    const errorLines = toTestableLines(await stdErr);
    errorLines[0].should.equal('0000-00-00T00:00:00.000Z [error] The following configuration errors were found:');
    errorLines[1].should.equalOneOf(
      'ENOTDIR error when attempting to initialize persistent store at path /dev/null',
      'Permission denied when attempting to initialize persistent store at path /dev/null'
    );
  }).timeout(CLI_TEST_TIMEOUT);

  it('should error when multiple processes are pointed to same store', async function() {
    const env = {
      DEVICE_ID: '123412341234123412341234',
      ACCESS_KEY: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      ACCESS_SECRET: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      BROKER_HOST: '127.0.0.2' // i.e., force invalid
    };

    const agent1 = spawnAgent({ env });
    await waitForLineCount(agent1.currentLineCount, isAlpine ? 10 : 7);

    const agent2 = spawnAgent({ env, expectedCode: 2 });
    await waitForLineCount(agent2.currentLineCount, 6);

    agent1.subprocess.kill('SIGTERM');
    agent2.subprocess.kill('SIGTERM');

    await agent1.promise;
    await agent2.promise;

    toTestableLines(await agent1.stdOut).should.containDeep([
      '0000-00-00T00:00:00.000Z [warn] Unable to read and parse agent config file at expected path: __WORKING_DIR__/config.toml',
      '0000-00-00T00:00:00.000Z [warn] Attempting startup using configuration from only environment variables and command line flags.',
      '0000-00-00T00:00:00.000Z [info] Agent Starting...',
      '0000-00-00T00:00:00.000Z [info] Agent Version: 0.0.0',
      '0000-00-00T00:00:00.000Z [info] Workflows initialized and running...',
      '0000-00-00T00:00:00.000Z [info] Connecting to: mqtts://127.0.0.2 ...',
      '0000-00-00T00:00:00.000Z [info] Agent shutdown requested',
      '0000-00-00T00:00:00.000Z [info] 0 workflow(s) run since agent startup.',
      '0000-00-00T00:00:00.000Z [info] Clean shutdown, exiting'
    ]);
    toTestableLines(await agent1.stdErr).should.deepEqual([]);

    toTestableLines(await agent2.stdOut).should.deepEqual([
      '0000-00-00T00:00:00.000Z [warn] Unable to read and parse agent config file at expected path: __WORKING_DIR__/config.toml',
      '0000-00-00T00:00:00.000Z [warn] Attempting startup using configuration from only environment variables and command line flags.',
      '0000-00-00T00:00:00.000Z [info] Agent Starting...',
      '0000-00-00T00:00:00.000Z [info] Agent Version: 0.0.0',
      '0000-00-00T00:00:00.000Z [warn] Persistent Storage Open Error: Database failed to open'
    ]);

    toTestableLines(await agent2.stdErr).should.deepEqual([
      '0000-00-00T00:00:00.000Z [error] Failed to start Health Check Endpoint Error: listen EADDRINUSE: address already in use 127.0.0.1:8010',
      '0000-00-00T00:00:00.000Z [error] The following configuration errors were found:',
      'LEVEL_DATABASE_NOT_OPEN error when attempting to initialize persistent store at path __WORKING_DIR__/store.db',
      '0000-00-00T00:00:00.000Z [error] The Losant Edge Agent was unable to start due to configuration errors. Please fix the above configuration errors by editing the config.toml file or by providing configuration environment variables, and attempt to start the Edge Agent again.'
    ]);
  }).timeout(2 * CLI_TEST_TIMEOUT);

});
