import hb from 'handlebars';
const {
  appendContextPath,
  blockParams,
  createFrame,
  isFunction
} = hb.Utils;
import errors from './errors.js';

const MAX_EACH_DEPTH = 20;
const MAX_EACH_ITERATIONS = 4096;
const MAX_EACH_RESULT_SIZE = 1024*1024;
const SYMBOL_SUPPORTED = typeof(Symbol) === 'function';

const checkLength = (length) => {
  if (length > MAX_EACH_ITERATIONS) {
    throw errors.InvalidTemplate({ message: `Maximum #each iteration count (${MAX_EACH_ITERATIONS}) exceeded.` });
  }
};

// Taken from
// https://github.com/handlebars-lang/handlebars.js/blob/v4.7.7/lib/handlebars/helpers/each.js
// with small formatting changes
// and depth check, size check, length checks
const eachHelper = function(context, options) {
  if (!options) {
    throw new Error('Must pass iterator to #each');
  }

  const fn = options.fn;
  const inverse = options.inverse;
  let i = 0, ret = '', contextPath;

  if (options.data && options.ids) {
    contextPath =
      `${appendContextPath(options.data.contextPath, options.ids[0])}.`;
  }

  if (isFunction(context)) {
    context = context.call(this);
  }

  const data = createFrame(options.data || {});
  data._eachDepth = (data._eachDepth || 0) + 1;
  if (data._eachDepth > MAX_EACH_DEPTH) {
    throw errors.InvalidTemplate({ message: `Maximum #each depth size (${MAX_EACH_DEPTH}) exceeded.` });
  }

  if (typeof context === 'number') {
    context = Math.abs(Math.ceil(context));
    if (!isFinite(context)) { context = 0; }
    checkLength(context);
    context = Array.from({ length: context }, (_, index) => index);
  } else if (typeof context === 'string') {
    checkLength(context.length);
    context = Array.from(context);
  }

  const execIteration = function(field, index, last) {
    if (data) {
      data.key = field;
      data.index = index;
      data.first = index === 0;
      data.last = last;

      if (contextPath) {
        data.contextPath = contextPath + field;
      }
    }

    ret =
      ret +
      fn(context[field], {
        data: data,
        blockParams: blockParams(
          [context[field], field],
          [contextPath + field, null]
        )
      });

    if (ret.length > MAX_EACH_RESULT_SIZE) {
      throw errors.InvalidTemplate({ message: 'Maximum #each iteration result size (1MB) exceeded.' });
    }
  };

  if (context && typeof context === 'object') {
    if (Array.isArray(context)) {
      checkLength(context.length);
      for (let j = context.length - 1; i <= j; i++) {
        if (i in context) {
          execIteration(i, i, i === j);
        }
      }
    } else if (SYMBOL_SUPPORTED && context[Symbol.iterator]) {
      const newContext = [];
      const iterator = context[Symbol.iterator]();
      for (let it = iterator.next(); !it.done; it = iterator.next()) {
        newContext.push(it.value);
        checkLength(newContext.length);
      }
      context = newContext;
      for (let j = context.length - 1; i <= j; i++) {
        execIteration(i, i, i === j);
      }
    } else {
      const contextKeys = Object.keys(context);
      checkLength(contextKeys.length);
      for (let j = contextKeys.length - 1; i <= j; i++) {
        execIteration(contextKeys[i], i, i === j);
      }
    }
  }

  if (i === 0) {
    ret = inverse(this);
  }

  return ret;
};

export default eachHelper;
