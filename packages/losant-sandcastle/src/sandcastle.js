import autoBind from 'losant-nodejs-utils/src/utils/auto-bind.js';
import fs from 'fs-extra';
import { spawn } from 'node:child_process';
import Script from './script.js';
import path from 'node:path';

export default class SandCastle {

  constructor(opts = {}) {
    autoBind(this);

    this.timeout = opts.timeout || 5000;
    this.startupTimeout = opts.startupTimeout || 5000;
    this.socket = opts.socket || '/tmp/sandcastle.sock';
    this.memoryLimitMB = opts.memoryLimitMB || 0;
    this.cwd = opts.cwd || process.cwd();
    this.sandboxModulePath = opts.sandboxModulePath;
    this.sandboxScriptFileName = opts.sandboxScriptFileName;
    this.sandboxScriptDefaultErrorMessage = opts.sandboxScriptDefaultErrorMessage;
    this.spawnEnv = opts.spawnEnv;

    this.readyCallbacks = [];
    this._spawnSandbox();
    this._startHeartbeat();
    process.on('exit', this.shutdown);
  }

  shutdown() {
    this.sandcastleShutdown = true;
    if (this.heartbeatId) {
      clearInterval(this.heartbeatId);
      this.heartbeatId = null;
    }
    this.kickOverSandCastle(true);
    process.removeListener('exit', this.shutdown);
  }

  onSandboxReady(callback) {
    if (this.sandboxInitialized) {
      callback();
      return;
    }
    this.readyCallbacks.push(callback);
  }

  createScript(source, opts = {}) {
    return new Script({
      source,
      timeout: opts.timeout || this.timeout,
      socket: this.socket,
      sandcastle: this,
      maxRetries: opts.maxRetries,
      consoleLog: opts.consoleLog
    });
  }

  kickOverSandCastle(permanent) {
    this.sandboxInitialized = false;
    if (this.heartbeatScript) {
      this.heartbeatScript.reset();
      this.heartbeatScript.removeAllListeners();
      this.heartbeatScript = null;
    }
    if (!this.sandbox) { return; }
    const sandbox = this.sandbox;
    sandbox.stdout.removeAllListeners();
    if (permanent) {
      sandbox.removeAllListeners();
      this.sandbox = null;
    }
    sandbox.kill('SIGHUP');
  }

  async _spawnSandbox() {
    // attempt to unlink the old socket.
    try { await fs.unlink(this.socket); } catch {}
    if (this.sandcastleShutdown) { return; }
    const args = [
      '--no-node-snapshot',
      '--no-network-family-autoselection',
      '--dns-result-order=ipv4first',
      '--openssl-legacy-provider',
      '--expose-gc',
      '--zero-fill-buffers',
      '--use_strict',
      `--max_old_space_size=${this.memoryLimitMB}`,
      path.resolve(import.meta.dirname, '..', 'bin', 'sandcastle.js'),
      'sandbox',
      `--socket=${this.socket}`
    ];
    if (this.sandboxModulePath) {
      args.push(`--sandbox-module-path="${this.sandboxModulePath}"`);
    }
    if (this.sandboxScriptFileName) {
      args.push(`--sandbox-script-file-name="${this.sandboxScriptFileName}"`);
    }
    if (this.sandboxScriptDefaultErrorMessage) {
      args.push(`--sandbox-script-default-error-message="${this.sandboxScriptDefaultErrorMessage}"`);
    }
    const sandbox = spawn(process.execPath, args, { cwd: this.cwd, env: this.spawnEnv });

    // Assume that the sandbox is ready once
    // data is emitted on stdout.
    sandbox.stdout.on('data', () => {
      this._markSandboxReady();
    });

    sandbox.on('exit', () => {
      sandbox.stdout.removeAllListeners();
      sandbox.removeAllListeners();
      this.sandboxInitialized = false;
      this.sandbox = null;
      this._spawnSandbox();
    });

    this.lastHeartbeat = Date.now();
    this.sandbox = sandbox;
  }

  _markSandboxReady() {
    if (this.sandboxInitialized) { return; }
    this.sandboxInitialized = true;
    this.waitingOnHeartbeat = false;
    this.lastHeartbeat = Date.now();
    const cbs = this.readyCallbacks;
    this.readyCallbacks = [];
    cbs.forEach((cb) => { cb(); });
  }

  _startHeartbeat() {
    this.heartbeatId = setInterval(() => {
      const sinceLastHeartbeat = Date.now() - this.lastHeartbeat;
      if (this.sandboxInitialized) {
        if (sinceLastHeartbeat > this.timeout) {
          this.kickOverSandCastle();
        } else {
          this._runHeartbeatScript();
        }
      } else if (sinceLastHeartbeat > this.startupTimeout) {
        this.kickOverSandCastle();
      }
    }, this.timeout / 4);
  }

  _runHeartbeatScript() {
    // Only wait for one heartbeat script to execute at a time.
    if (this.waitingOnHeartbeat) { return; }
    this.waitingOnHeartbeat = true;

    if (this.heartbeatScript) {
      this.heartbeatScript.reset();
      this.heartbeatScript.removeAllListeners();
      this.heartbeatScript = null;
    }

    this.heartbeatScript = this.createScript('return true;');

    this.heartbeatScript.once('timeout', () => {
      this.waitingOnHeartbeat = false;
    });
    this.heartbeatScript.once('error', () => {
      this.waitingOnHeartbeat = false;
    });

    this.heartbeatScript.once('exit', (err, output) => {
      this.waitingOnHeartbeat = false;
      if (err || !output) { return; }
      this.lastHeartbeat = Date.now();
    });

    this.heartbeatScript.run();
  }

}
