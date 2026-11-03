import '../common.js';
import TensorFlowNode from '../../src/nodes/tensorflow-predict-node.js';
import errors from 'losant-nodejs-utils/src/errors.js';
import path from 'node:path';
import fs from 'fs-extra';
import { guardPath, guardFileReadPath } from '../../src/lib/protected-path-utils.js';

const defaultContext = { diskUtils: { guardPath, guardFileReadPath } };
const LAYERS_MODEL = '/tmp/model.json';
const LAYERS_WEIGHTS = '/tmp/weights.bin';
const GRAPH_WEIGHTS = '/tmp/graph/group1-shard1of1.bin';
const GRAPH_MODEL = '/tmp/graph/model.json';

const get32BitResults = (results) => { return results.map((val) => { return Number(val.toFixed(4)); }); };

let tf;
try { tf = (await import('@tensorflow/tfjs-node')).default; } catch { }
(tf ? describe : describe.skip)('TensorFlowPredictNode', () => {
  beforeEach(async () => {
    TensorFlowNode.modelCache.clear();
    await fs.ensureDir('/tmp');
    await fs.copy(path.resolve(import.meta.dirname, '..', '__fixtures__', 'graphModel', 'model.json'), GRAPH_MODEL);
    await fs.copy(path.resolve(import.meta.dirname, '..', '__fixtures__', 'graphModel', 'group1-shard1of1.bin'), GRAPH_WEIGHTS);
    await fs.copy(path.resolve(import.meta.dirname, '..', '__fixtures__', 'model.json'), LAYERS_MODEL);
    return fs.copy(path.resolve(import.meta.dirname, '..', '__fixtures__', 'weights.bin'), LAYERS_WEIGHTS);
  });
  afterEach(async () => {
    await fs.remove(LAYERS_MODEL);
    await fs.remove(LAYERS_WEIGHTS);
    await fs.remove(GRAPH_MODEL);
    await fs.remove(GRAPH_WEIGHTS);
  });
  it('should throw an error if data type is not valid', async () => {
    const node = new TensorFlowNode('id', [[1]], {
      dataPath: 'myData',
      modelTemplate: '/path/to/model.json',
      dataTypeTemplate: '{{ dataType }}',
      resultPath: 'myResult'
    });
    await node.run({}, { myData: [ 1 ], dataType: 'notDataType' }).should.be.rejectedWith(
      errors.Validation({ message: 'notDataType is not a valid data type.' })
    );
  });
  it('should throw an error if dataPath is undefined/null', async () => {
    const node = new TensorFlowNode('id', [[1]], {
      dataPath: 'myData',
      modelTemplate: '/path/to/model.json',
      dataTypeTemplate: '{{ dataType }}',
      resultPath: 'myResult'
    });
    await node.run({}, { dataType: 'bool' }).should.be.rejectedWith(
      errors.Validation({ message: 'data path must resolve to a value.' })
    );
  });
  it('should return an error if modelPath is referencing code inside losant', async () => {
    const node = new TensorFlowNode('id', [[1]], {
      dataPath: 'myData',
      modelTemplate: path.resolve('model.json'),
      resultPath: 'myResult'
    });
    const result = await node.run(defaultContext, { myData: [ 1 ] });
    result[1].myResult.error.should.deepEqual({
      type: 'TENSOR_FLOW_NODE_ERROR',
      message: 'Cannot access within the protected Losant Edge Agent directory.'
    });
  });
  it('should return an error if modelPath is a symlink referencing code inside losant', async () => {
    const symlinkModel = '/tmp/symlink-model.json';
    await fs.symlink(path.resolve('package.json'), symlinkModel);
    try {
      const node = new TensorFlowNode('id', [[1]], {
        dataPath: 'myData',
        modelTemplate: symlinkModel,
        resultPath: 'myResult'
      });
      const result = await node.run(defaultContext, { myData: [ 1 ] });
      result[1].myResult.error.should.deepEqual({
        type: 'TENSOR_FLOW_NODE_ERROR',
        message: 'Cannot access within the protected Losant Edge Agent directory.'
      });
    } finally {
      await fs.remove(symlinkModel);
    }
  });
  it('should return an error if a weightsManifest path is referencing code inside losant', async () => {
    const maliciousModel = '/tmp/malicious-model.json';
    await fs.writeJson(maliciousModel, {
      weightsManifest: [
        { paths: [ path.resolve('package.json') ] }
      ]
    });
    try {
      const node = new TensorFlowNode('id', [[1]], {
        dataPath: 'myData',
        modelTemplate: maliciousModel,
        resultPath: 'myResult'
      });
      const result = await node.run(defaultContext, { myData: [ 1 ] });
      result[1].myResult.error.should.deepEqual({
        type: 'TENSOR_FLOW_NODE_ERROR',
        message: 'Cannot access within the protected Losant Edge Agent directory.'
      });
    } finally {
      await fs.remove(maliciousModel);
    }
  });
  it('should return an error if a weightsManifest path is a symlink referencing code inside losant', async () => {
    const maliciousModel = '/tmp/malicious-symlink-model.json';
    const symlinkWeight = '/tmp/symlink-weight.bin';
    await fs.symlink(path.resolve('package.json'), symlinkWeight);
    await fs.writeJson(maliciousModel, {
      weightsManifest: [
        { paths: [ symlinkWeight ] }
      ]
    });
    try {
      const node = new TensorFlowNode('id', [[1]], {
        dataPath: 'myData',
        modelTemplate: maliciousModel,
        resultPath: 'myResult'
      });
      const result = await node.run(defaultContext, { myData: [ 1 ] });
      result[1].myResult.error.should.deepEqual({
        type: 'TENSOR_FLOW_NODE_ERROR',
        message: 'Cannot access within the protected Losant Edge Agent directory.'
      });
    } finally {
      await fs.remove(maliciousModel);
      await fs.remove(symlinkWeight);
    }
  });
  it('should throw an error if the shape path does not resolve to an array', async () => {
    const node = new TensorFlowNode('id', [[1]], {
      dataPath: 'myData',
      modelTemplate: LAYERS_MODEL,
      shapePath: 'myShape',
      resultPath: 'myResult'
    });
    await node.run(defaultContext, { myData: [ 1 ], myShape: 'foo' }).should.be.rejectedWith(
      errors.Validation({ message: 'Shape must be an array.' })
    );
  });
  it('should return an error on missing weights', async () => {
    await fs.remove(LAYERS_WEIGHTS);
    const node = new TensorFlowNode('id', [[1]], {
      dataPath: 'myData',
      modelTemplate: LAYERS_MODEL,
      shapePath: 'myShape',
      resultPath: 'myResult'
    });
    const results = await node.run(defaultContext, { myData: [ 1 ], myShape: [ 2 ] });
    results.should.deepEqual([
      [ [ 1 ] ],
      {
        myData: [ 1 ],
        myShape: [ 2 ],
        myResult: {
          error: {
            type: 'TENSOR_FLOW_NODE_ERROR',
            message: 'No file exists at "/tmp/weights.bin"'
          }
        }
      }
    ]);
  });
  it('should load a model and predict on a data point', async function() {
    const node = new TensorFlowNode('id', [[1]], {
      dataPath: 'myData',
      modelTemplate: '{{ model }}',
      dataTypeTemplate: '{{ dataType }}',
      resultPath: 'myResult'
    });
    const result = await node.run(defaultContext, {
      model: LAYERS_MODEL,
      myData: [
        [
          0.6202893170657521,
          0.3900809525340277,
          0.17243920521403583,
          0.21894277212055746,
          0
        ],
        [
          0.6202893170657521,
          0.3900809525340277,
          0.17243920521403583,
          0.21894277212055746,
          0
        ]
      ]
    });
    result[1].myResult.success.should.equal(true);
    get32BitResults(result[1].myResult.result).should.deepEqual([
      0.928,
      0.072,
      0.928,
      0.072
    ]);
  });
  it('should load a model and predict on a data point given the dataType', async function() {
    const node = new TensorFlowNode('id', [[1]], {
      dataPath: 'myData',
      modelTemplate: '{{ model }}',
      dataTypeTemplate: '{{ dataType }}',
      resultPath: 'myResult'
    });
    const result = await node.run(defaultContext, {
      model: LAYERS_MODEL,
      dataType: 'float32',
      myData: [
        [
          0.6202893170657521,
          0.3900809525340277,
          0.17243920521403583,
          0.21894277212055746,
          0
        ],
        [
          0.6202893170657521,
          0.3900809525340277,
          0.17243920521403583,
          0.21894277212055746,
          0
        ]
      ]
    });
    result[1].myResult.success.should.equal(true);
    get32BitResults(result[1].myResult.result).should.deepEqual([
      0.928,
      0.072,
      0.928,
      0.072
    ]);
  });
  it('should load a model and predict on a data point given the shape', async () => {
    const node = new TensorFlowNode('id', [[1]], {
      dataPath: 'myData',
      modelTemplate: '{{ model }}',
      dataTypeTemplate: '{{ dataType }}',
      shapePath: 'shape',
      resultPath: 'myResult'
    });
    const result = await node.run(defaultContext, {
      model: LAYERS_MODEL,
      shape: [ 2, 5 ],
      myData: [
        [
          0.6202893170657521,
          0.3900809525340277,
          0.17243920521403583,
          0.21894277212055746,
          0
        ],
        [
          0.6202893170657521,
          0.3900809525340277,
          0.17243920521403583,
          0.21894277212055746,
          0
        ]
      ]
    });
    result[1].myResult.success.should.equal(true);
    get32BitResults(result[1].myResult.result).should.deepEqual([
      0.928,
      0.072,
      0.928,
      0.072
    ]);
  });
  it('should load a model and predict on a data point given the shape and dataType', async () => {
    const node = new TensorFlowNode('id', [[1]], {
      dataPath: 'myData',
      modelTemplate: '{{ model }}',
      dataTypeTemplate: '{{ dataType }}',
      shapePath: 'shape',
      resultPath: 'myResult'
    });
    const result = await node.run(defaultContext, {
      model: LAYERS_MODEL,
      shape: [ 2, 5 ],
      dataType: 'float32',
      myData: [
        [
          0.6202893170657521,
          0.3900809525340277,
          0.17243920521403583,
          0.21894277212055746,
          0
        ],
        [
          0.6202893170657521,
          0.3900809525340277,
          0.17243920521403583,
          0.21894277212055746,
          0
        ]
      ]
    });
    result[1].myResult.success.should.equal(true);
    get32BitResults(result[1].myResult.result).should.deepEqual([
      0.928,
      0.072,
      0.928,
      0.072
    ]);
  });
  it('should error if file is not found', async () => {
    const node = new TensorFlowNode('id', [[1]], {
      dataPath: 'myData',
      modelTemplate: '{{ model }}',
      dataTypeTemplate: '{{ dataType }}',
      shapePath: 'shape',
      resultPath: 'myResult'
    });
    const result = await node.run(defaultContext, {
      model: '/not/a/file',
      shape: [ 2, 5 ],
      dataType: 'float32',
      myData: [
        [
          0.6202893170657521,
          0.3900809525340277,
          0.17243920521403583,
          0.21894277212055746,
          0
        ],
        [
          0.6202893170657521,
          0.3900809525340277,
          0.17243920521403583,
          0.21894277212055746,
          0
        ]
      ]
    });
    result[1].myResult.error.should.deepEqual({ type: 'TENSOR_FLOW_NODE_ERROR', message: 'No file exists at "/not/a/file"' });
  });
  it('should load a model and predict on a data point given the shape and dataType', async () => {
    const node = new TensorFlowNode('id', [[1]], {
      dataPath: 'myData',
      modelTemplate: '{{ model }}',
      dataTypeTemplate: '{{ dataType }}',
      shapePath: 'shape',
      resultPath: 'myResult'
    });
    const result = await node.run(defaultContext, {
      model: LAYERS_MODEL,
      shape: [ 2, 9 ],
      dataType: 'float32',
      myData: [
        [
          0.6202893170657521,
          0.3900809525340277,
          0.17243920521403583,
          0.21894277212055746,
          0
        ],
        [
          0.6202893170657521,
          0.3900809525340277,
          0.17243920521403583,
          0.21894277212055746,
          0
        ]
      ]
    });
    result[1].myResult.error.should.deepEqual({ type: 'TENSOR_FLOW_NODE_ERROR', message: 'Based on the provided shape, [2,9], the tensor should have 18 values but has 10' });
  });
  it('should load and predict on a graph model', async () => {
    const node = new TensorFlowNode('id', [[1]], {
      modelTypeTemplate: '{{ type }}',
      dataPath: 'myData',
      modelTemplate: '{{ model }}',
      resultPath: 'myResult'
    });
    const myData = [[]];
    for (let i = 0; i < 1000; i++) {
      myData[0].push([ [0], [0], [0] ]);
    }
    const result = await node.run(defaultContext, {
      model: GRAPH_MODEL,
      type: 'graph',
      myData
    });
    result[1].myResult.success.should.equal(true);
    get32BitResults(result[1].myResult.result).should.deepEqual([ 0.3212, 0.6788 ]);
  });
  it('should throw an error if modelTypeTemplate is not defined', async () => {
    const node = new TensorFlowNode('id', [[1]], {
      modelTypeTemplate: '{{ type }}',
      dataPath: 'myData',
      modelTemplate: '{{ model }}',
      resultPath: 'myResult'
    });
    await node.run(defaultContext, {
      model: GRAPH_MODEL,
      type: 'notValid',
      myData: []
    }).should.be.rejectedWith(errors.Validation({ message: 'Model Type Template must equal graph or layers.' }));
  });
});
