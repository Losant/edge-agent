import { exec, spawn } from 'child_process';
import { promisify } from 'util';
const promiseExec = promisify(exec);
import * as payloadHelper from 'losant-handlebars';
import { checkEncoding, mapRejectNilKeyValTemplatesFlat } from '../utils.js';
import errors from 'losant-nodejs-utils/src/errors.js';
import { FIVE_MEGA_BYTES } from '../constants.js';
import { defer, sleep } from 'omnibelt';

const checkExitCode = (code) => {
  return isFinite(parseInt(code, 10)) ? code : null;
};

class ExecuteNode {

  /* Example Config:
  {
    commandTemplate: <String - Required: template for the command to run>,
    cwdTemplate: <String - Optional: template for the current working directory>,
    envsTemplate: [
      0 or more of:
      { keyTemplate: <String - Required - template for env key name>,
        valueTemplate: <String - Required - template for env value> }
    ],
    encodingTemplate: <String - Optional: encoding to use on stderr and stdout (ascii|utf8|utf16le|ucs2|base64|latin1|binary|hex). Default utf8>,
    detached: <Boolean - Optional: if true, run the command in the background. Default false>,
    resultPath: <String - Required: payload path at which to place the results of the command>
  }
  Notes:
    Env pairs with a missing or blank key are ignored. The resulting env object is
    passed to the command as its entire environment (it is not merged with the agent's
    environment).
    When not detached, the command runs through the shell with a timeout of
    context.externalTimeout and a 5MB output buffer. The result is
    { exitCode, signal, stdout, stderr } plus error: { type: 'EXECUTE_ERROR', message }
    if the command failed, timed out, or exceeded the buffer. exitCode is null when no
    numeric exit code is available and signal is null unless the command was killed by a signal.
    When detached, the command runs via bash -c in its own process group with output
    ignored, and the node waits up to 1 second for it to exit. The result then
    contains only what is known by then: exitCode and signal if the command exited
    within that second, or error if it failed to start; otherwise the result is
    empty and the command keeps running. stdout and stderr are never included.
    A missing command or invalid encoding throws a validation error. Command failures
    do not throw and are written to resultPath.
  */

  constructor(id, outputIds, config) {
    this.id = id;
    this.outputIds = outputIds;
    this.commandTemplate = config.commandTemplate;
    this.cwdTemplate = config.cwdTemplate;
    this.envsTemplate = config.envsTemplate;
    this.encodingTemplate = config.encodingTemplate || 'utf8';
    this.detached = config.detached || false;
    this.resultPath = config.resultPath;
  }

  async run(context, payload) {
    const command = payloadHelper.renderToString(this.commandTemplate, payload).trim();
    if (!command) {
      throw errors.Validation({ message: 'A command is required' });
    }
    const cwd = payloadHelper.renderToString(this.cwdTemplate, payload);

    const env = mapRejectNilKeyValTemplatesFlat(this.envsTemplate || [], payload);
    const encoding = payloadHelper.renderToString(this.encodingTemplate, payload);
    checkEncoding(encoding);
    const options =  { env, cwd, encoding };
    const result = {};
    if (!this.detached) {
      options.timeout = context.externalTimeout;
      options.windowsHide = true;
      options.maxBuffer = FIVE_MEGA_BYTES;
      let execResult;
      try {
        execResult = await promiseExec(command, options);
        execResult.code = 0;
      } catch (err) {
        execResult = err;
        result.error = { type: 'EXECUTE_ERROR', message: err.message };
      }
      result.exitCode = checkExitCode(execResult.code);
      result.signal = execResult.signal || null; // this is only defined on the error result.
      result.stdout = execResult.stdout;
      result.stderr = execResult.stderr;
    } else {
      let exitDeferred = defer();
      options.detached = true;
      options.stdio = 'ignore';
      const subprocess = spawn('bash', [ '-c', command ], options);
      subprocess.on('exit', (code, signal) => {
        if (!exitDeferred) { return; }
        result.exitCode = checkExitCode(code);
        result.signal = signal || null;
        exitDeferred.resolve();
        exitDeferred = null;
      });
      subprocess.on('error', (err) => {
        if (!exitDeferred) { return; }
        result.error = { type: 'EXECUTE_ERROR', message: err.message };
        exitDeferred.resolve();
        exitDeferred = null;
      });
      subprocess.unref();
      await Promise.race([sleep(1000), exitDeferred.promise]);
      subprocess.removeAllListeners('exit');
      subprocess.removeAllListeners('error');
    }
    payload = payloadHelper.set(this.resultPath, result, payload);
    return [this.outputIds, payload];
  }

}


export default ExecuteNode;
