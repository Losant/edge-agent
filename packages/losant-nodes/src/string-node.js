import errors from 'losant-nodejs-utils/src/errors.js';
import {
  renderToString, render,
  set as payloadHelperSet
} from 'losant-handlebars';
import {
  toString, escapeRegExp, identity, map, pipe, length, concat,
  curryN, __, evolve, toLower, replace, padChars, padCharsStart,
  padCharsEnd, reverse, split, toUpper, toNumber, trim, trimStart,
  trimEnd, keys, toInteger, truncate
} from 'omnibelt';


const render2 = curryN(2, render);

const MAX_INT_ARG = 1000;
const MIN_INT_ARG = 0;
const toConstrainedInteger = (val) => {
  if (!val) { return 0; }
  if (!isFinite(val)) {
    throw errors.Validation({ message: 'Argument must be a valid number' });
  }
  val = toInteger(val);
  if (val < MIN_INT_ARG || val > MAX_INT_ARG) {
    throw errors.Validation({ message: `Argument must be between ${MIN_INT_ARG} and ${MAX_INT_ARG}` });
  }
  return val;
};

const reverseArgs = (func) => {
  return (...args) => {
    return func(...reverse(args));
  };
};

const defaultToSpace = (padStr) => {
  padStr = toString(padStr);
  return padStr || ' ';
};

const methods = {
  concat: {
    argTypes: [toString],
    func: concat
  },
  indexOf: {
    argTypes: [toString, toConstrainedInteger],
    func: (haystack, needle, fromIndex = 0) => {
      return haystack.indexOf(needle, fromIndex);
    }
  },
  noop: identity,
  pad: {
    argTypes: [toConstrainedInteger, defaultToSpace],
    func: reverseArgs(padChars)
  },
  padEnd: {
    argTypes: [toConstrainedInteger, defaultToSpace],
    func: reverseArgs(padCharsEnd)
  },
  padStart: {
    argTypes: [toConstrainedInteger, defaultToSpace],
    func: reverseArgs(padCharsStart)
  },
  replaceAll: {
    argTypes: [toString, toString],
    func: (str, pattern, replacement) => {
      return replace(
        new RegExp(escapeRegExp(pattern), 'g'),
        replacement,
        str
      );
    }
  },
  replaceFirst: {
    argTypes: [toString, toString],
    func: (str, pattern, replacement) => {
      return replace(
        pattern,
        replacement,
        str
      );
    }
  },
  split: {
    argTypes: [toString],
    func: reverseArgs(split)
  },
  toLower,
  toNumber,
  toUpper,
  trim,
  trimEnd,
  trimStart,
  truncate: {
    argTypes: [toConstrainedInteger, toString],
    func: (str, trunclength, omission) => {
      if (trunclength <= 0) { trunclength = 30; }
      return truncate({ length: trunclength, omission }, str);
    }
  }
};
const methodNames = new Set(keys(methods));

/*
  Example Config:
  {
    sourceData: [<String>='']: Source template of the string to operate on,
    method: <[Enum<String>='noop']>: One of the methods below to be executed on `sourceData`,
    methodArgs: <[Array[Any]]>: Argument templates, minus the actual source data, to be applied to the `method`. The number of arguments must match the method exactly,
    resultPath: [<String>]: Payload path of where to place the result on the payload,
  }

  Methods and the arguments (methodArgs) each one takes:
  - concat: (string) string to append
  - indexOf: (search string, from index) index of the first match, or -1
  - noop: none, returns sourceData unchanged
  - pad, padEnd, padStart: (target length, pad string) pad string defaults to a space
  - replaceAll: (pattern, replacement) pattern is matched literally, not as a regular expression
  - replaceFirst: (pattern, replacement) replaces the first match of pattern
  - split: (separator) returns an array
  - toLower, toUpper, trim, trimEnd, trimStart: none
  - toNumber: none, converts the string to a number
  - truncate: (length, omission) a length of 0 or less uses 30
  Integer arguments (lengths and indexes) must be between 0 and 1000.

  NOTES:
  - `resultPath` is optional but this node effectively doesn't do anything when
    the result doesn't land somewhere.
  - An unknown method, or the wrong number of methodArgs, throws.
*/

class StringNode {

  constructor(id, outputIds, config) {
    this.id = id;
    this.outputIds = outputIds;
    this.method = config.method || 'noop';
    this.methodArgs = config.methodArgs || [];
    this.sourceData = config.sourceData || '';
    this.resultPath = config.resultPath;
  }

  async run(context, payload) {
    const { method, resultPath, outputIds } = this;
    let { sourceData, methodArgs } = this;
    if (!methodNames.has(method)) {
      throw errors.Validation({ message: 'Method is invalid' });
    }

    let def = methods[method];
    if (typeof def === 'function') {
      def = {
        argTypes: [],
        func: def
      };
    }
    if (length(def.argTypes) !== length(methodArgs)) {
      throw errors.Validation({ message: 'Incorrect number of method arguments' });
    }

    const castToArgsTypes = evolve(def.argTypes);
    methodArgs = pipe(
      map(render2(__, payload)),
      castToArgsTypes
    )(methodArgs);

    sourceData = renderToString(sourceData, payload);

    const methodResult = def.func(sourceData, ...methodArgs);
    const payloadResult = payloadHelperSet(resultPath, methodResult, payload);
    return [outputIds, payloadResult];
  }

}

export default StringNode;
