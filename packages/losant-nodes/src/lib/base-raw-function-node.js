import errors from 'losant-nodejs-utils/src/errors.js';
import cleanError from 'losant-nodejs-utils/src/utils/clean-error.js';
import * as payloadHelper from 'losant-handlebars';
import { defer, toUpper, toNumber, clampPositive } from 'omnibelt';
import { Pool as SandcastlePool } from 'losant-sandcastle';
import DEBUG_LEVEL from 'losant-nodejs-utils/src/constants/debug-level.js';

const DEFAULT_TIMEOUT = clampPositive(
  toNumber(process.env.RAW_FUNCTION_DEFAULT_TIMEOUT) || toNumber(process.env.MAX_FLOW_RUN_TIME) || 59000);
const MAX_RETRIES = clampPositive(toNumber(process.env.RAW_FUNCTION_MAX_RETRIES) || 3);

const LINES_MOD = 15; // comes from wrapper sandbox code
const consoleToDebugMap = {
  TRACE: DEBUG_LEVEL.verbose,
  DEBUG: DEBUG_LEVEL.verbose,
  INFO: DEBUG_LEVEL.info,
  LOG: DEBUG_LEVEL.info,
  WARN: DEBUG_LEVEL.warn,
  ERROR: DEBUG_LEVEL.error
};

class BaseRawFunctionNode {

  /* Example Config:
    {
      script: <String - Optional: code to run against payload. If blank, the payload passes through unchanged>,
      scopePath: <String - Optional: payload path for specific input to the function. If set, the function receives only that value and its result is set back at that path. Otherwise it receives and returns the whole payload>
    }
   */

  constructor(id, outputIds, config) {
    this.constructor.startup();
    this.id = id;
    this.outputIds = outputIds;
    this.scopePath = config.scopePath;

    if (typeof(config.script) === 'string' && config.script.trim()) {
      this.scriptLength = config.script.split('\n').length;
      this.script = config.script;
    }
  }

  cleanFunctionError(error) {
    const className = this.constructor.name;
    const clean = cleanError(error);
    clean.name = `FunctionNode${clean.name}`;
    if (clean.message) {
      clean.message = clean.message.replace(new RegExp(`\\[${className}:\\d+:\\d+\\]`), (match) => {
        const parts = match.split(':');
        parts[1] = parseInt(parts[1], 10) - LINES_MOD;
        if (!isFinite(parts[1]) || parts[1] < 1 || parts[1] > this.scriptLength) { return ''; }
        return parts.join(':');
      });
      clean.message = clean.message.replace('Isolate', 'Function Node');
    }

    if (!error.stack) { return clean; }

    const result = [];
    let inTrace = true;
    error.stack.split('\n').reverse().forEach((line) => {
      let lineNum;
      if (inTrace && line.startsWith('    at ')) {
        if (!line.includes(className)) { return; }
        line = line.replace('__newPayload__', 'customFunction');
        line = line.split(':');
        lineNum = parseInt(line[line.length - 2], 10) - LINES_MOD;
        if (!isFinite(lineNum) || lineNum < 1 || lineNum > this.scriptLength) { return; }
        line[line.length - 2] = lineNum;
        line = line.join(':');
        result.push(line.trim());
      } else if (inTrace) {
        inTrace = false;
        const potentialName = line.split(':')[0];
        if (potentialName.endsWith('Error')) {
          clean.name = `FunctionNode${potentialName}`;
        } else {
          result.push(line);
        }
      } else {
        if (line.includes(className)) {
          lineNum = parseInt(line.split(':')[1], 10) - LINES_MOD;
          if (!isFinite(lineNum) || lineNum < 1 || lineNum > this.scriptLength) { return; }
          result.push(`${className}:${lineNum}`);
        } else if (line.trim()) {
          result.push(line);
        }
      }
    });

    if (result.length > 0) { clean.stack = result.reverse(); }

    return clean;
  }

  async run(context, payload, prevNodeInfo) {
    if (!this.script) { return [this.outputIds, payload]; }

    const opts = { maxRetries: MAX_RETRIES, consoleLog: !!context.publishDebugMessage };
    const maxTimeout = context.maxFlowRunTime || DEFAULT_TIMEOUT;
    opts.timeout = maxTimeout - (Date.now() - context.runStart);
    if (opts.timeout <= 0) {
      throw errors.NodeTimeout({ title: 'Raw Function' });
    }

    const deferred = defer();
    const sandbox = BaseRawFunctionNode.pool.createScript(this.script, context.applicationId, opts);
    sandbox.on('exit', (err, output) => {
      if (err) {
        // this is an error from *inside* the user's code
        err = this.cleanFunctionError(err);
        deferred.reject(err);
      } else {
        deferred.resolve(output);
      }
    });

    sandbox.on('error', (err) => {
      // this is an error from our validation *before* the users code
      deferred.reject(err);
    });

    sandbox.on('timeout', () => {
      deferred.reject(errors.NodeTimeout({ title: 'Raw Function' }));
    });

    let debugChain;
    if (opts.consoleLog) {
      sandbox.on('console', ({ lvl, msg, payload: consolePayload }) => {
        msg = msg.map((m) => { return typeof(m) === 'string' ? m : JSON.stringify(m); });
        const body = msg.join(' ');
        const title = lvl ? toUpper(lvl) : 'LOG';
        const level = consoleToDebugMap[title] || DEBUG_LEVEL.default;

        if (!debugChain) { debugChain = Promise.resolve(); }
        debugChain = debugChain
          .then(() => {
            const debugMsg = {
              message: `${title}: ${body}`,
              sourceNode: this.id,
              payload: consolePayload,
              level
            };
            if (this.scopePath) { debugMsg.payloadPath = this.scopePath; }
            return context.publishDebugMessage(debugMsg, prevNodeInfo);
          });
      });
    }

    const functionInput = this.scopePath ?
      payloadHelper.lookup(this.scopePath, payload) :
      payload;

    sandbox.run(functionInput);

    try {
      const functionOutput = await deferred.promise;
      if (debugChain) { await debugChain; }

      const newPayload = this.scopePath ?
        payloadHelper.set(this.scopePath, functionOutput, payload) :
        functionOutput;

      return [this.outputIds, newPayload];
    } finally {
      sandbox.removeAllListeners();
    }
  }

  static shutdown() {
    if (!BaseRawFunctionNode.pool) { return; }
    BaseRawFunctionNode.pool.shutdown();
    BaseRawFunctionNode.pool = null;
  }

  static getCustomSandCastlePoolOptions() { return {}; }
  static getCustomSandboxOptions() { return {}; }

  static startup() {
    if (BaseRawFunctionNode.pool) { return; }

    const numberOfInstances = clampPositive(toNumber(process.env.RAW_FUNCTION_INSTANCES) || 4);
    const startupTimeout = clampPositive(toNumber(process.env.RAW_FUNCTION_STARTUP_TIMEOUT) || (DEFAULT_TIMEOUT * 2));
    const memoryLimitMB = clampPositive(toNumber(process.env.RAW_FUNCTION_MEM_LIMIT_MB) || 128);
    BaseRawFunctionNode.pool = new SandcastlePool(
      { numberOfInstances, ...(this.getCustomSandCastlePoolOptions({ numberOfInstances }) || {}) },
      {
        memoryLimitMB,
        timeout: DEFAULT_TIMEOUT,
        startupTimeout,
        sandboxScriptFileName: 'RawFunctionNode',
        sandboxScriptDefaultErrorMessage: 'Unserializable function node message',
        ...this.getCustomSandboxOptions()
      }
    );
  }
}

export default BaseRawFunctionNode;
