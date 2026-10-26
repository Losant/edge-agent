import childProcess from 'child_process';
import fs from 'fs-extra';
import { defer, noop, sleep } from 'omnibelt';
import { DEFAULT_SERIAL_CONFIG } from '../../src/constants.js';
import { SerialPort } from 'serialport';
import { slowWriteToPort } from '../../src/lib/serial-utils.js';

const openPort = async (path, config) => {
  const serialConfig = {
    path,
    baudRate: Number(config.baudRate || DEFAULT_SERIAL_CONFIG.baudRate),
    dataBits: Number(config.dataBits || DEFAULT_SERIAL_CONFIG.dataBits),
    parity: config.parity || DEFAULT_SERIAL_CONFIG.parity,
    rtscts: config.rtscts || DEFAULT_SERIAL_CONFIG.rtscts,
    stopBits: Number(config.stopBits || DEFAULT_SERIAL_CONFIG.stopBits),
    autoOpen: false,
    lock: false
  };
  const port = new SerialPort(serialConfig);

  const deferredOpen = defer();

  const received = Buffer.from('');
  const portWrapper = { received, port };

  port.on('open', deferredOpen.resolve);
  port.on('error', deferredOpen.reject);
  port.on('close', deferredOpen.reject);
  port.on('data', (chunk) => {
    portWrapper.received = Buffer.concat([portWrapper.received, chunk]);
  });

  port.open();
  await deferredOpen.promise;

  return portWrapper;
};

const closePort = (port) => {
  const waitToClose = defer();
  port.removeAllListeners();
  port.on('error', noop);
  port.close(waitToClose.resolve);
  port.removeAllListeners();
};

const waitUntil = async (isDone, deadline) => {
  if (isDone() || Date.now() >= deadline) { return; }
  await sleep(5);
  return waitUntil(isDone, deadline);
};

export default async () => {
  let socatPath = '/usr/bin/socat';
  if (!await fs.exists(socatPath)) {
    socatPath = '/opt/homebrew/bin/socat';
    if (!await fs.exists(socatPath)) {
      throw new Error('socat is required to run tests');
    }
  }

  const process = childProcess.spawn(
    socatPath,
    ['-d', '-d', 'pty,raw,echo=0', 'pty,raw,echo=0'],
    { detached: false, stdio: 'pipe', env: {} }
  );

  const deferred = defer();
  let output = '';
  process.on('error', deferred.reject);
  process.on('exit', deferred.reject);
  process.stderr.on('data', (chunk) => {
    output += chunk.toString();
    if (output.includes('starting data transfer loop')) {
      deferred.resolve();
    }
  });
  await deferred.promise;
  const [serialPathSideA, serialPathSideB] =
    Array.from(output.matchAll(/\/dev.*/g)).map((match) => match[0]);
  if (!serialPathSideA || !serialPathSideB) {
    throw new Error(`pty not found from socat output: ${output}`);
  }

  let portWrapperSideB;

  const reset = async () => {
    if (portWrapperSideB) {
      await closePort(portWrapperSideB.port);
      portWrapperSideB = null;
    }
  };

  return {
    serialPathSideA,
    serialPathSideB,
    reset,
    shutdown: async () => {
      await reset();
      const shutdownDefer = defer();
      process.on('exit', shutdownDefer.resolve);
      process.kill();
      await shutdownDefer.promise;
    },
    listenSideB: async (config = {}) => {
      portWrapperSideB = portWrapperSideB || await openPort(serialPathSideB, config);
    },
    receivedSideB: (encoding = 'utf8') => {
      if (!portWrapperSideB) { throw new Error('call listenSideB first'); }
      return portWrapperSideB.received.toString(encoding);
    },
    // Side B gets data through socat after the writer has drained and closed,
    // so a read right after a write can see a partial buffer. Resolves once
    // `expected` has arrived, or after `timeout`, leaving the caller's own
    // assertion to report what actually arrived.
    waitForSideB: async (expected, { encoding = 'utf8', timeout = 2000 } = {}) => {
      if (!portWrapperSideB) { throw new Error('call listenSideB first'); }
      await waitUntil(
        () => portWrapperSideB.received.toString(encoding) === expected,
        Date.now() + timeout
      );
    },
    writeSideB: async (strOrBuffer) => {
      if (!portWrapperSideB) { throw new Error('call listenSideB first'); }
      if (typeof strOrBuffer === 'string') { strOrBuffer = Buffer.from(strOrBuffer); }
      await slowWriteToPort(portWrapperSideB.port, strOrBuffer);
    }
  };
};
