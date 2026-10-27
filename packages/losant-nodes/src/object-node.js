import errors from 'losant-nodejs-utils/src/errors.js';
import { fromPairs, omit, mergeDeepRight, pick, has, isPlainObject, compact, zipObj } from 'omnibelt';
import ljsonRender from './lib/ljson-render.js';
import * as payloadHelper from 'losant-handlebars';

const opsThatNeedObjectInput = new Set([
  'assign', 'mergeDeep'
]);

const opsThatNeedArrayInput = new Set([
  'omit', 'pick', 'zipObject'
]);

const opsThatNeedInput = new Set([
  ...opsThatNeedArrayInput, ...opsThatNeedObjectInput
]);

const opsFromArray = new Set([ 'fromPairs', 'zipObject' ]);

const operations = {
  assign: (object, input) => {
    return { object: { ...object, ...input } };
  },
  entries: (object) => {
    const output = Object.entries(object);
    return { object, output };
  },
  fromPairs: (array) => {
    const output = Array.isArray(array) ? fromPairs(compact(array)) : {};
    return { object: array, output };
  },
  keys: (object) => {
    const output = Object.keys(object);
    return { object, output };
  },
  mergeDeep: (object, input) => {
    object = mergeDeepRight(object, input);
    return { object };
  },
  omit: (object, toOmit) => {
    object = omit(toOmit, object);
    return { object };
  },
  pick: (object, toPick) => {
    object = pick(toPick, object);
    return { object };
  },
  values: (object) => {
    const output = Object.values(object);
    return { object, output };
  },
  zipObject: (keys, vals) => {
    const object = zipObj(keys, vals);
    return { object };
  }
};

const errorMessage = (input, type) => {
  return `Invalid input ${input} for ${type} operation.`;
};


class ObjectNode {
  /* Example Config:
  {
    sourcePath: <String - Optional: payload path of the object or array to manipulate. If nothing is found at the path, an empty object is used>,
    destPath: <String - Optional: payload path where the manipulated object / array should be placed. If not set, the manipulated value is discarded and only outputPath results are kept>,
    operations: <Array - Optional: zero or more of [{
      type: <String - Required: one of assign|entries|fromPairs|keys|mergeDeep|omit|pick|values|zipObject>,
      inputTemplate: <String - Required for (assign|mergeDeep|omit|pick|zipObject): JSON template that resolves to an input value. An object for assign|mergeDeep, an array for omit|pick|zipObject>,
      outputPath: <String - Optional (for entries|keys|values|fromPairs): payload path to place the operation's output>
    }]>
  }
  Notes:
    Operations run in order, each on the result of the previous one.
    The source must be an object or array, otherwise the node throws. An array source is only valid
    for fromPairs and zipObject. For zipObject, the source array supplies the keys and the
    inputTemplate array supplies the values.
    entries, keys, values, and fromPairs leave the manipulated value unchanged and only produce output,
    which is written to outputPath. fromPairs builds that output object from an array of [key, value]
    pairs (an empty object if the source is not an array).
    Invalid operations or inputs throw a validation error.
  */
  constructor(id, outputIds, config) {
    this.id = id;
    this.outputIds = outputIds;
    this.sourcePath = config.sourcePath;
    this.destPath = config.destPath;
    this.operations = config.operations || [];
  }

  runOp(context, payload, operation, source) {
    const op = operations[operation.type];
    if (!op) { throw errors.Validation({ message: `Object operation is invalid: ${operation.type}` }); }
    if (Array.isArray(source) && !opsFromArray.has(operation.type)) {
      throw errors.Validation({ message: `Array input invalid for ${operation.type} operation.` });
    }
    let input;
    if (opsThatNeedInput.has(operation.type)) {
      if (!operation.inputTemplate) { throw errors.MissingField({ title: 'Input Template' }); }
      input = ljsonRender(operation.inputTemplate, payload);
      if (opsThatNeedObjectInput.has(operation.type) && !isPlainObject(input)) {
        throw errors.Validation({ message: errorMessage(input, operation.type) });
      }
      if (opsThatNeedArrayInput.has(operation.type) && !Array.isArray(input)) {
        const text = typeof input === 'object' ? `of ${typeof input}` : input;
        throw errors.Validation({ message: errorMessage(text, operation.type) });
      }
    }
    const result = op(source, input);
    if (operation.outputPath && has('output', result)) {
      payload = payloadHelper.set(operation.outputPath, result.output, payload);
    }
    return [result.object, payload];
  }

  run(context, payload) {
    let source = payloadHelper.lookup(this.sourcePath, payload);
    if (!isPlainObject(source) && !Array.isArray(source)) {
      if (source === undefined) {
        source = {};
      } else {
        throw errors.Validation({ message: 'Source is invalid.' });
      }
    }
    this.operations.forEach((op) => {
      [source, payload] = this.runOp(context, payload, op, source);
    });
    if (this.destPath) {
      payload = payloadHelper.set(this.destPath, source, payload);
    }
    return [this.outputIds, payload];
  }
}

export default ObjectNode;
