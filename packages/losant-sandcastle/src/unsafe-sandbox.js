import vm from 'node:vm';
import { createRequire } from 'node:module';
import BaseSandbox from './base-sandbox.js';

const require = createRequire(import.meta.url);

class Sandbox extends BaseSandbox {

  constructor(opts) {
    opts.filename = opts.filename || 'UnsafeScript';
    super(opts);
  }

  shouldUseAsync() {
    // VM-based sandbox supports async/await
    return true;
  }

  async runWrappedSource(wrappedSource, execData, onConsole) {
    const sandbox = {
      onConsole,
      __globalPayload__: execData.context,
      require,
      Buffer,
      Date,
      Map,
      Set,
      BigInt64Array,
      BigUint64Array,
      setTimeout,
      clearTimeout,
      setInterval,
      clearInterval,
      setImmediate,
      clearImmediate
    };

    let result, error;
    try {
      const vmScript = new vm.Script(wrappedSource, { filename: this.filename });
      result = await vmScript.runInContext(vm.createContext(sandbox), {
        displayErrors: false,
        microtaskMode: 'afterEvaluate'
      });
    } catch (e) {
      error = e;
    }

    return { result, error };
  }
}

export default Sandbox;
