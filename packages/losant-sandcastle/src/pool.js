import autoBind from 'losant-nodejs-utils/src/utils/auto-bind.js';
import SandCastle from './sandcastle.js';
import { noop, T } from 'omnibelt';
const SCRIPT_TIMEOUT_THRESHOLD_MS = 25; // ms

export default class Pool {

  constructor(opts, sandCastleCreationOpts) {
    autoBind(this);

    this.numberOfInstances = opts.numberOfInstances || 1;
    this.sandCastleCreationOpts = sandCastleCreationOpts || {};
    this.canRunCheck = opts.canRunCheck || T;
    this.preScriptRunCallback = opts.preScriptRunCallback || noop;
    this.postScriptRunCallback = opts.postScriptRunCallback || noop;

    if (this.numberOfInstances < 1) {
      throw new Error("Can't create a pool with zero instances");
    }

    this.sandcastles = [];
    this.runQueue = [];
    this.consumerSleeping = true;

    for (let i = 0; i < this.numberOfInstances; ++i) {
      const sandCastleOptions = {
        ...this.sandCastleCreationOpts,
        socket: `/tmp/sandcastle_${i}.sock`
      };

      this.sandcastles.push({
        castle: new SandCastle(sandCastleOptions),
        running: false
      });
    }
  }

  async waitForPoolReady() {
    return Promise.all(this.sandcastles.map((sandcastle) => {
      return new Promise((resolve) => {
        sandcastle.castle.onSandboxReady(resolve);
      });
    }));
  }

  shutdown() {
    const queue = this.runQueue;
    this.runQueue = [];
    queue.forEach((script) => {
      script.script.reset();
    });
    this.sandcastles.forEach((sandcastleData) => {
      sandcastleData.castle.shutdown();
    });
  }

  consumeScript() {
    if (!this.runQueue.length) {
      this.consumerSleeping = true;
      return;
    }

    const now = Date.now();
    for (let i = 0; i < this.sandcastles.length; ++i) {
      const sandcastleData = this.sandcastles[i];
      if (!sandcastleData.running && sandcastleData.castle.sandboxInitialized) {
        if (!this.runQueue.length) { break; } // nothing in the queue;
        let nextScriptToRun;
        let index = 0;
        while (!nextScriptToRun && index < this.runQueue.length) {
          const maybeNext = this.runQueue[index];
          const timeTakenByQueue = now - maybeNext.queuedAt;
          if (timeTakenByQueue + SCRIPT_TIMEOUT_THRESHOLD_MS > maybeNext.script.timeout) {
            // no more timeout left just emit timeout and leave the queue
            const scriptTimedOut = this.runQueue.splice(index, 1)[0];
            scriptTimedOut.script.emit('timeout');
          } else if (this.canRunCheck(maybeNext)) {
            // this script has timeout time left
            // and it's owner isn't taking too many resources
            nextScriptToRun = this.runQueue.splice(index, 1)[0];
            nextScriptToRun.script.timeout = nextScriptToRun.script.timeout - timeTakenByQueue;
          } else {
            index++;
          }
        }
        if (nextScriptToRun) {
          this.runOnSandCastle(nextScriptToRun, sandcastleData);
        }
      }
    }
    setImmediate(this.consumeScript);
    this.consumerSleeping = false;
  }

  runOnSandCastle({ script, context, ownerId }, sandcastleData) {
    sandcastleData.running = true;

    const endFunc = () => {
      sandcastleData.running = false;
      this.postScriptRunCallback({ script, context, ownerId });
      script.removeListener('exit', endFunc);
      script.removeListener('timeout', endFunc);
      script.removeListener('error', endFunc);
    };

    script.once('exit', endFunc);
    script.once('timeout', endFunc);
    script.once('error', endFunc);

    script.sandcastle = sandcastleData.castle;
    this.preScriptRunCallback({ script, context, ownerId });
    script.originalRun(context);
  }

  requestRun(script, context, ownerId) {
    this.runQueue.push({ script, context, ownerId, queuedAt: Date.now() });
    if (this.consumerSleeping) {
      this.consumeScript();
    }
  }

  createScript(source, ownerId, opts) {
    // All scripts are created from first sandbox, but the
    // final target-sandbox is decided just before running.
    const newScript = this.sandcastles[0].castle.createScript(source, opts);
    // Override run-function, but keep the run function of superclass in
    // originalRun. This allows drop in placement of Pool in place of SandCastle.
    newScript.originalRun = newScript.run;
    newScript.run = (context) => {
      this.requestRun(newScript, context, ownerId);
    };
    return newScript;
  }

}
