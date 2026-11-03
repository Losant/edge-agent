import BaseRawFunctionNode from 'losant-nodes/src/lib/base-raw-function-node.js';
import { fileURLToPath } from 'node:url';

class RawFunctionNode extends BaseRawFunctionNode {
  static getCustomSandboxOptions() {
    return {
      sandboxModulePath: fileURLToPath(import.meta.resolve('losant-sandcastle/src/unsafe-sandbox.js'))
    };
  }
}

export default RawFunctionNode;
