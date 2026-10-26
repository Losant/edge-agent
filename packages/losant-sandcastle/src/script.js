import EventEmitter from 'node:events';
import net from 'node:net';
import LengthPrefixedStream from 'length-prefixed-stream';
import LJSON from 'losant-nodejs-utils/src/ljson.js';
import errors from 'losant-nodejs-utils/src/errors.js';
import { MAX_RESPONSE_SIZE } from 'losant-nodejs-utils/src/utils/storage-helpers.js';
import autoBind from 'losant-nodejs-utils/src/utils/auto-bind.js';

const MAX_RETRIES = 3;

const parseChunk = (data) => {
  let result;
  try {
    result = LJSON.parse(data);
  } catch (error) {
    result = { output: null, error, end: true };
  }
  if (result.error) {
    const error = new Error(result.error.message);
    error.stack = result.error.stack;
    result.error = error;
  }
  return result;
};

class Script extends EventEmitter {

  constructor(opts) {
    super();
    autoBind(this);

    this.source = opts.source || '';
    this.sandcastle = opts.sandcastle;
    this.timeout = opts.timeout;
    this.retryCount = 0;
    this.maxRetries = opts.maxRetries || MAX_RETRIES;
    this.consoleLog = opts.consoleLog;
  }

  reset() {
    this.exited = true;
    this.retryCount = 0;
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    if (this.retryTimerId) {
      clearTimeout(this.retryTimerId);
      this.retryTimerId = null;
    }
  }

  createTimeout() {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }

    this.timeoutId = setTimeout(() => {
      if (this.exited) { return; }
      this.reset();
      this.sandcastle.kickOverSandCastle();
      this.emit('timeout');
    }, this.timeout);
  }

  run(context) {
    this.reset();

    if (this.sandcastle.sandcastleShutdown) {
      // this should not happen
      this.emit('error', new Error(`${this.sandcastle.sandboxScriptFileName || 'Script'} Shutdown`));
      return;
    }

    let clientPayload = { source: this.source, context };
    if (this.consoleLog) { clientPayload.consoleLog = true; }

    try {
      clientPayload = LJSON.stringify(clientPayload);
    } catch {
      this.emit('error', errors.UnserializablePayload());
      return;
    }
    clientPayload = Buffer.from(clientPayload);

    const payloadLength = Buffer.byteLength(clientPayload);
    if (payloadLength > MAX_RESPONSE_SIZE) {
      this.emit('error', errors.TooLarge({
        maximum: '5MB',
        size: `${Math.round(payloadLength / 1024 / 1024 * 100) / 100}MB`,
        title: 'Payload Size'
      }));
      return;
    }

    const runSandbox = () => {
      if (this.exited) { return; }
      if (this.retryTimerId) {
        this.retryCount++;
        clearTimeout(this.retryTimerId);
        this.retryTimerId = null;
      }

      if (this.retryCount >= this.maxRetries) {
        this.reset();
        this.emit('error', errors.NodeMaxRetryReached({
          title: 'Function Node',
          times: this.maxRetries
        }));
        return;
      }

      this.sandcastle.onSandboxReady(() => {
        if (this.exited) { return; }
        let dataReceived = false;
        const client = net.createConnection(this.sandcastle.socket, () => {
          const encodeStream = LengthPrefixedStream.encode();
          encodeStream.pipe(client);
          encodeStream.write(clientPayload);
        });

        const decodeStream = client.pipe(LengthPrefixedStream.decode());

        client.once('close', (hasError) => {
          if (hasError) {
            client.destroy();
          }
          client.removeAllListeners();
          decodeStream.removeAllListeners();
          if (!dataReceived && !this.retryTimerId) {
            this.retryTimerId = setTimeout(runSandbox, 500);
          }
        });

        client.on('error', () => {
          if (this.exited) { return; }
          if (!dataReceived && !this.retryTimerId) {
            this.retryTimerId = setTimeout(runSandbox, 500);
          }
        });

        decodeStream.on('data', (chunk) => {
          if (this.exited) {
            return;
          }
          dataReceived = true;
          const result = parseChunk(chunk);
          if (!result.end) {
            this.emit('console', result.output || {});
            return;
          }

          this.reset();
          client.end();
          this.emit('exit', result.error, result.output);
        });
      });
    };

    this.exited = false;
    this.createTimeout();
    runSandbox();
  }
}

export default Script;
