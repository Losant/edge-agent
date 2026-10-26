import net from 'node:net';
import LengthPrefixedStream from 'length-prefixed-stream';
import LJSON from 'losant-nodejs-utils/src/ljson-lite.js';

const wrapForExecution = (source, async = false) => {
  return `(${async ? 'async' : ''}() => {
    const gc = undefined;
    const console = (() => {
      const localOnConsole = this.onConsole;
      return new Proxy({}, {
        get: (target, lvl) => {
          if(lvl === 'toJSON'){ return () => { return {}; }; }
          return (...msg) => { localOnConsole?.({ lvl, msg, payload }); };
        }
      });
    })();
    let payload = this.__globalPayload__;
    delete this.onConsole;
    delete this.__globalPayload__;
    let __newPayload__ = ${async ? 'await (async ' : '('}() => {
${source}
    })();
    if(__newPayload__ === undefined){ __newPayload__ = payload; }
    return __newPayload__;
  })()`;
};

export default class BaseSandbox {
  constructor({ socket, filename, defaultErrorMessage }) {
    this.start = this.start.bind(this);
    this._sendError = this._sendError.bind(this);
    this.executeScript = this.executeScript.bind(this);
    this.socket = socket;
    this.filename = filename;
    this.defaultErrorMessage = defaultErrorMessage || 'Unserializable message';
  }

  async start() {
    this.server = net.createServer((c) => {
      const encodeStream = LengthPrefixedStream.encode();
      encodeStream.pipe(c);

      const decodeStream = c.pipe(LengthPrefixedStream.decode());

      decodeStream.on('data', (chunk) => {
        this.executeScript(encodeStream, chunk);
      });

      c.once('close', (hadError) => {
        if (hadError) { c.destroy(); }
        c.removeAllListeners();
        decodeStream.removeAllListeners();
        setImmediate(global.gc);
      });
    });

    this.server.listen(this.socket, () => {
      // emit data so that sandcastle knows sandbox is created
      console.log('sandbox server created'); // eslint-disable-line no-console
    });

    this.server.on('error', () => {
      this.server.removeAllListeners();
      this.server = null;
      setTimeout(this.start, 500);
    });
  }

  _wrappedWrite(encodeStream, end, output, error) {
    let msg;
    try {
      msg = LJSON.stringify({ output, error, end }, { serializeTypes: true });
    } catch {
      msg = JSON.stringify({ end: true, error: { message: this.defaultErrorMessage } });
    }
    try { encodeStream.write(Buffer.from(msg)); } catch { }
  }

  _sendError(encodeStream, e) {
    const error = {
      message: e.message,
      name: e.name
    };
    if (e.stack) {
      error.stack = e.stack.replace();
    }

    this._wrappedWrite(encodeStream, true, null, error);
  }

  async executeScript(encodeStream, data) {
    let execData;
    try {
      execData = LJSON.parse(data);
    } catch {
      this._sendError(encodeStream, { message: 'Unparseable payload' });
      return;
    }

    const useAsync = this.shouldUseAsync();
    const wrappedSource = wrapForExecution(execData.source || '', useAsync);

    let onConsole;
    if (execData.consoleLog) {
      onConsole = (output) => {
        this._wrappedWrite(encodeStream, false, output, null);
      };
    }
    const { result, error } = await this.runWrappedSource(wrappedSource, execData, onConsole, encodeStream);
    if (error) {
      this._sendError(encodeStream, error);
    } else {
      this._wrappedWrite(encodeStream, true, result, null);
    }
  }

  shouldUseAsync() {
    // Override in subclass to control async wrapping
    return false;
  }

  async runWrappedSource(/*wrappedSource, execData, onConsole*/) {
    throw new Error('runWrappedSource must be implemented by subclass');
  }

}
