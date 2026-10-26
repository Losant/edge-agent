import '../common.js';
import fs from 'fs-extra';
import TensorFlowNode from '../../src/nodes/tensorflow-predict-node.js';
import errors from 'losant-nodejs-utils/src/errors.js';
import path from 'node:path';
import { PACKAGE_ROOT_DIR } from '../../src/constants.js';
const EXECUTE_TF_CHECK_PATH = path.resolve(PACKAGE_ROOT_DIR, 'bin', 'execute-tensorflow-check.js');
let originalTFLoadCheckFileContents;
const errorTFLoadCheckFileContents = `
  let run = async () => {
    await new Promise(() => {
      setImmediate(() => {
        reject(new Error('Cannot load TensorFlow'))
      });
    });
  }
  run();
`;
describe('loading tensorflow library', () => {
  const node = new TensorFlowNode('id', [[1]], {
    dataPath: 'myData',
    modelTemplate: '{{ model }}',
    dataTypeTemplate: '{{ dataType }}',
    resultPath: 'myResult'
  });
  before(async () => {
    originalTFLoadCheckFileContents = await fs.readFile(EXECUTE_TF_CHECK_PATH);
    await fs.writeFile(EXECUTE_TF_CHECK_PATH, errorTFLoadCheckFileContents);
  });
  after(async () => {
    await fs.writeFile(EXECUTE_TF_CHECK_PATH, originalTFLoadCheckFileContents);
    TensorFlowNode.tfLoadAttempted = false;
  });
  it('should throw an error if tensor flow cannot be required', async () => {
    await node.run({}, {}).should.be.rejectedWith(errors.UnsupportedNode({ message: 'This version of the edge agent does not support the TensorFlow Predict Node.' }));
  });
});
