// Polyfills util.isNullOrUndefined and util.isArray, which Node removed but
// @tensorflow/tfjs-node still calls. Can be removed once tfjs stops using them.
import util from 'util';
if (!util.isNullOrUndefined) {
  util.isNullOrUndefined = (val) => {
    return val === null || val === undefined;
  };
}

if (!util.isArray) {
  util.isArray = (val) => {
    return Array.isArray(val);
  };
}
// Silences TensorFlow's startup warning that the CPU supports instructions this binary was not compiled to use.
process.env.TF_CPP_MIN_LOG_LEVEL=2;
const UNSUPPORTED_ERROR_MSG = 'This version of the edge agent does not support the TensorFlow Predict Node.';
import fs from 'fs-extra';
import path from 'node:path';
import * as payloadHelper from 'losant-handlebars';
import errors from 'losant-nodejs-utils/src/errors.js';
import childProcess from 'child_process';
const exec = util.promisify(childProcess.exec);
import { isNil, union, mapP, max } from 'omnibelt';
import logger from '../logger/index.js';
import { PACKAGE_ROOT_DIR } from '../constants.js';
let tf;

const modelCache = new Map();
const VALID_DATA_TYPES = new Map([
  [ 'float32', true ],
  [ 'int32', true ],
  [ 'bool', true ],
  [ 'string', true ]
]);
const THIRTY_MINUTES_IN_MILLISECONDS = 30 * 60 * 1000;
const FIVE_MINUTES_IN_MILLISECONDS = 5 * 60 * 1000;

let cleanCacheIntervalId = setInterval(() => {
  modelCache.forEach((value, key) => {
    if (Date.now() - value.lastUsed >= THIRTY_MINUTES_IN_MILLISECONDS) {
      modelCache.delete(key);
    }
  });
}, FIVE_MINUTES_IN_MILLISECONDS);

class TensorFlowPredictNode {

  /* Example Config:
    {
      modelTypeTemplate: <String - Optional: the type of model to load, either layers or graph. Default layers>,
      dataPath: <String - Required: payload path to the data to predict on, resolves to an array of values and must not be empty/undefined>,
      modelTemplate: <String - Required: a template for the local disk path of the model JSON file. The weight files listed
        in the model's weightsManifest must also be readable relative to that file>,
      dataTypeTemplate: <String - Optional: the data type of the data to predict on, one of float32|int32|bool|string. If blank, the type is inferred from the data>,
      shapePath: <String - Optional: payload path to an array describing the shape of the data. If blank, the shape is inferred from the data>,
      resultPath: <String - Optional: payload path for { success: true, result: [numbers] } or
        { error: { type: 'TENSOR_FLOW_NODE_ERROR', message } }. If blank, the result is discarded>
    }
    Notes:
      Invalid configuration (an invalid model type, data type, or shape, or data that does not resolve to a value) throws,
      as does running on an Edge Agent that does not support TensorFlow. Problems reading or loading the model, or running the
      prediction, do not throw and are written to resultPath as the error shape above.
      Loaded models are cached by model type and path, and reloaded if the model or weight files change.
      Models unused for 30 minutes are evicted from the cache.
  */

  constructor(id, outputIds, config) {
    this.id = id;
    this.outputIds = outputIds;
    this.modelTypeTemplate = config.modelTypeTemplate || 'layers';
    this.dataPath = config.dataPath; // an array from the payload
    this.modelTemplate = config.modelTemplate;
    this.dataTypeTemplate = config.dataTypeTemplate;
    this.shapePath = config.shapePath;
    this.resultPath = config.resultPath;
  }

  async run(context, payload) {
    if (!TensorFlowPredictNode.tfLoadAttempted) {
      try {
        // this will throw an error if its exit code is not 0.
        await exec(`node ${path.resolve(PACKAGE_ROOT_DIR, 'bin', 'execute-tensorflow-check.js')}`);
        tf = (await import('@tensorflow/tfjs-node')).default;
      } catch {
        logger.warn(UNSUPPORTED_ERROR_MSG);
      } finally {
        TensorFlowPredictNode.tfLoadAttempted = true;
      }
    }
    if (!tf) {
      throw errors.UnsupportedNode({ message: UNSUPPORTED_ERROR_MSG });
    }
    const modelType = payloadHelper.renderToString(this.modelTypeTemplate, payload);
    const data = payloadHelper.lookup(this.dataPath, payload);
    const modelPath = payloadHelper.renderToString(this.modelTemplate, payload);
    let dataType = payloadHelper.renderToString(this.dataTypeTemplate, payload);
    let shape = payloadHelper.lookup(this.shapePath, payload);
    if (modelType !== 'graph' && modelType !== 'layers') {
      throw errors.Validation({ message: 'Model Type Template must equal graph or layers.' });
    }
    if (isNil(data)) {
      throw errors.Validation({ message: 'data path must resolve to a value.' });
    }
    if (dataType && !VALID_DATA_TYPES.has(dataType)) {
      throw errors.Validation({ message: `${dataType} is not a valid data type.` });
    }

    if (shape && !Array.isArray(shape)) {
      throw errors.Validation({ message: 'Shape must be an array.' });
    }

    const setResult = (result) => {
      if (this.resultPath) {
        payload = payloadHelper.set(this.resultPath, result, payload);
      }
      return [this.outputIds, payload];
    };

    let mtime = 0, realModelPath;
    try {
      const guardResult = await context.diskUtils.guardFileReadPath(modelPath);
      realModelPath = guardResult.realPath;
      mtime = Number(guardResult.stats.mtime);
      // checking the weights path
      const modelJson = await fs.readJson(realModelPath);
      const weightsManifest = modelJson.weightsManifest;
      let allWeightPaths = [];
      weightsManifest.forEach(({ paths }) => {
        allWeightPaths = union(allWeightPaths, paths);
      });
      const dirname = path.dirname(realModelPath);
      await mapP(async (weightPath) => {
        const { stats: weightStat } = await context.diskUtils.guardFileReadPath(path.resolve(dirname, weightPath));
        mtime = max(mtime, Number(weightStat.mtime));
      }, allWeightPaths);
    } catch (e) {
      return setResult({
        error: {
          type: 'TENSOR_FLOW_NODE_ERROR',
          message: e.message
        }
      });
    }

    let loadedModel;
    const cacheKey = `${modelType}-${realModelPath}`;
    if (modelCache.has(cacheKey) && mtime === modelCache.get(cacheKey).mtime) {
      const wrapper = modelCache.get(cacheKey);
      loadedModel = wrapper.model;
      wrapper.lastUsed = Date.now();
    } else {
      try {
        const funcName = modelType === 'graph' ? 'loadGraphModel' : 'loadLayersModel';
        loadedModel = await tf[funcName](`file://${realModelPath}`);
      } catch (e) {
        return setResult({
          error: {
            type: 'TENSOR_FLOW_NODE_ERROR',
            message: e.message
          }
        });
      }
      modelCache.set(cacheKey, { model: loadedModel, mtime, lastUsed: Date.now() });
    }
    if (!shape) { shape = undefined; } // An empty string is not a valid shape, so a blank shape is passed as undefined.
    if (!dataType) { dataType = undefined; }
    try {
      const tensor = tf.tensor(data, shape, dataType);
      const result = await loadedModel.predict(tensor).data();
      return setResult({ success: true, result: Array.from(result) });
    } catch (e) {
      return setResult({
        error: {
          type: 'TENSOR_FLOW_NODE_ERROR',
          message: e.message
        }
      });
    }
  }

  static shutdown() {
    if (cleanCacheIntervalId) {
      clearInterval(cleanCacheIntervalId);
      cleanCacheIntervalId = null;
    }
    modelCache.clear();
  }

}

TensorFlowPredictNode.tfLoadAttempted = false;
TensorFlowPredictNode.modelCache = modelCache;

export default TensorFlowPredictNode;

