import * as payloadHelper from 'losant-handlebars';
import errors from 'losant-nodejs-utils/src/errors.js';
import u from 'updeep';
import { compact, flatten, groupBy, has, identity, sortBy, keyBy, uniq, uniqWith } from 'omnibelt';

const opsThatNeedIndex = new Set([
  'insertAt', 'lookupAt', 'replaceAt', 'removeAt'
]);

const opsThatOptionallyNeedIndex = new Set([
  'slice'
]);

const opsThatNeedInput = new Set([
  'concat', 'groupBy', 'indexOf', 'insertAt', 'keyBy', 'push', 'replaceAt', 'sortBy', 'unshift', 'deduplicateBy', 'filter'
]);

const opsThatOptionallyNeedInput = new Set([
  'slice'
]);

const opsThatNeedInputAsPath = new Set([ 'groupBy', 'keyBy', 'sortBy', 'deduplicateBy', 'filter' ]);

const operations = {
  compact: (array) => {
    array = compact(array);
    return { array };
  },
  concat: (array, input) => {
    array = array.concat(input);
    return { array };
  },
  filter: (array, expression, indexValue, order, payload) => {
    const output = array.filter((value, index) => {
      return payloadHelper.evaluateExpression(expression, { value, index, array, payload });
    });
    return { output };
  },
  flatten: (array) => {
    array = flatten(array);
    return { array };
  },
  groupBy: (array, keyPayloadPath) => {
    const output = groupBy((value) => {
      return payloadHelper.lookup(keyPayloadPath, value);
    }, array);
    return { output };
  },
  keyBy: (array, keyPayloadPath) => {
    const output = keyBy((value) => {
      return payloadHelper.lookup(keyPayloadPath, value);
    }, array);
    return { output };
  },
  indexOf: (array, input) => {
    const output = array.indexOf(input);
    return { output };
  },
  insertAt: (array, input, index) => {
    array = array.slice();
    array.splice(index, 0, input);
    return { array };
  },
  length: (array) => {
    const output = array.length;
    return { output };
  },
  lookupAt: (array, input, index) => {
    const output = array[index];
    return { output };
  },
  pop: (array) => {
    array = array.slice();
    const output = array.pop();
    return { array, output };
  },
  push: (array, input) => {
    array = array.slice();
    array.push(input);
    return { array };
  },
  removeAt: (array, input, index) => {
    array = array.slice();
    const output = array.splice(index, 1)[0];
    return { array, output };
  },
  replaceAt: (array, input, index) => {
    array = array.slice();
    const output = array[index];
    array[index] = input;
    return { array, output };
  },
  reverse: (array) => {
    array = array.slice();
    array = array.reverse();
    return { array };
  },
  shift: (array) => {
    array = array.slice();
    const output = array.shift();
    return { array, output };
  },
  slice: (array, input = undefined, index = undefined) => {
    array = array.slice(input, index);
    return { array };
  },
  sort: (array, input, index, order) => {
    let output;
    const getSort = sortBy(identity, array);
    if (order === 'descending') {
      output = getSort.reverse();
    } else {
      output = getSort;
    }

    return { output };
  },
  sortBy: (array, keyPayloadPath, indexValue, order) => {
    let output;
    const getSortBy = sortBy((value) => {
      return payloadHelper.lookup(keyPayloadPath, value);
    }, array);
    if (order === 'descending') {
      output = getSortBy.reverse();
    } else {
      output = getSortBy;
    }

    return { output };
  },
  sum: (array) => {
    let output = 0;
    array.forEach((item) => {
      output += (!isNaN(Number(item)) ? Number(item) : 0);
    });
    return { output };
  },
  unshift: (array, input) => {
    array = array.slice();
    array.unshift(input);
    return { array };
  },
  deduplicate: (array) => {
    array = uniq(array);
    return { array };
  },
  deduplicateBy: (array, keyPayloadPath) => {
    const output = uniqWith((value, value1) => {
      return payloadHelper.lookup(keyPayloadPath, value) === payloadHelper.lookup(keyPayloadPath, value1);
    }, array);
    return { output };
  }
};

class ArrayNode {

  /* Example Config:
  {
    sourceArrayPath: <String - Optional: payload path of the array to manipulate. If blank or nothing exists at the path, an empty array is used>,
    destArrayPath: <String - Optional: payload path where the resulting array is written. If blank, the modified array is discarded and only outputPath results are kept>,
    rules: [
      0 or more of:
      {
        type: <String - Required: one of compact|concat|deduplicate|deduplicateBy|filter|flatten|groupBy|indexOf|insertAt|keyBy|length|lookupAt|pop|push|removeAt|replaceAt|reverse|shift|slice|sort|sortBy|sum|unshift>,
        inputTemplate: <String - Required for concat|deduplicateBy|filter|groupBy|indexOf|insertAt|keyBy|push|replaceAt|sortBy|unshift. Optional for slice (start index). Template that resolves to a value. For deduplicateBy|filter|groupBy|keyBy|sortBy it is not rendered as a template: it is a payload path looked up on each item (groupBy|keyBy|sortBy|deduplicateBy) or an expression evaluated with value, index, array and payload (filter)>,
        indexTemplate: <String - Required for insertAt|lookupAt|removeAt|replaceAt. Optional for slice (end index). Template that resolves to an array index. Negative values count from the end of the array>,
        order: <String - Optional (sort|sortBy): ascending|descending. Default ascending>,
        outputPath: <String - Optional: payload path for the rule's result value. Only used by deduplicateBy|filter|groupBy|indexOf|keyBy|length|lookupAt|pop|removeAt|replaceAt|shift|sort|sortBy|sum>
      }
    ]
  }

  Notes:
  A single output is used (outputIds); errors throw (invalid array operation, missing input/index template, non-numeric index, or a source that is neither an array, a string, nor missing).
  It is valid to have 0 rules, and the node will run, but it does nothing useful.
  Rules run in order, each on the array produced by the previous rule.
  Rules that modify the array: compact, concat, deduplicate, flatten, insertAt, pop, push, removeAt, replaceAt, reverse, shift, slice, unshift. The other rules only produce an outputPath value and leave the array unchanged (sort, sortBy, filter, groupBy, keyBy and deduplicateBy return their result through outputPath, not the array).
  pop, removeAt, replaceAt and shift both modify the array and write the removed/replaced item to outputPath.
  insertAt, lookupAt, removeAt and replaceAt use indexTemplate; a negative index is resolved from the end of the array.
  If nothing exists at the source path, an empty array is used, and it is created at destArrayPath when that is set.
  If a string exists at the source path, it is treated as an array of characters, operated on, and written back to destArrayPath as a string.
  */

  constructor(id, outputIds, config) {
    this.id = id;
    this.outputIds = outputIds;
    this.sourceArrayPath = config.sourceArrayPath;
    this.destArrayPath = config.destArrayPath;
    this.rules = config.rules || [];
  }

  runRule(context, payload, rule, array) {
    const ruleOp = operations[rule.type];
    if (!ruleOp) { throw errors.Validation({ message: `Array operation is invalid: ${rule.type}` }); }

    let inputValue;
    if (opsThatNeedInput.has(rule.type) || (opsThatOptionallyNeedInput.has(rule.type) && rule.inputTemplate)) {
      if (!rule.inputTemplate) {
        throw errors.MissingField({ title: 'Input Template' });
      }
      if (opsThatNeedInputAsPath.has(rule.type)) {
        inputValue = rule.inputTemplate;
      } else {
        inputValue = payloadHelper.render(rule.inputTemplate, payload);
      }
    }

    let indexValue;
    if (opsThatNeedIndex.has(rule.type) || (opsThatOptionallyNeedIndex.has(rule.type) && rule.indexTemplate)) {
      if (!rule.indexTemplate) {
        throw errors.MissingField({ title: 'Index Template' });
      }
      indexValue = Number(payloadHelper.render(rule.indexTemplate, payload));
      if (!isFinite(indexValue)) {
        throw errors.Validation({ message: 'Array index is invalid' });
      } else if (indexValue < 0) {
        // be nice, and negative numbers reference from the end of the array
        indexValue = array.length + indexValue;
      }
    }

    const result = ruleOp(array, inputValue, indexValue, rule.order, payload);
    if (rule.outputPath && has('output', result)) {
      payload = payloadHelper.set(rule.outputPath, result.output, payload);
    }

    if (has('array', result)) { array = u.freeze(result.array); }

    return [array, payload];
  }

  run(context, payload) {
    let arrayWasString = false;
    // blank source path is allowed, becomes empty array
    let array = payloadHelper.lookup(this.sourceArrayPath, payload);
    if (!Array.isArray(array)) {
      if (array === undefined) {
        array = [];
      } else if (typeof array === 'string') {
        arrayWasString = true;
        array = Array.from(array);
      } else {
        throw errors.Validation({ message: 'Array source is invalid' });
      }
    }

    this.rules.forEach((rule) => {
      [array, payload] = this.runRule(context, payload, rule, array);
    });

    if (this.destArrayPath) {
      if (arrayWasString) { array = flatten(array).join(''); }
      payload = payloadHelper.set(this.destArrayPath, array, payload);
    }
    return [this.outputIds, payload];
  }

}

export default ArrayNode;
