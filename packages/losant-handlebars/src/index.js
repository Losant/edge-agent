import QuickLRU from '@alloc/quick-lru';
import h from './wrapper.js';
import { is, includes, toString } from 'omnibelt';
import ExpressionParser from './expression-parser.js';
import errors from './errors.js';
import u from 'updeep';
import { pathSplit as pathSplitInner, partsFromParsed, fakeDataProxyBase, fakeDataHandler, RANDOM_PATH_NUMBER } from './path-helpers.js';
import { normalizeHBError } from './error-helpers.js';

const isString = is(String);
const uRejectIndex = function(toReject) {
  return u.reject((v, i) => { return i === toReject; });
};

const CACHE_SIZE = (typeof(process) !== 'undefined' && Number(process.env.LSHB_CACHE_SIZE)) || 10000;

const renderCache = new QuickLRU({ maxSize: CACHE_SIZE });
const expCache = new QuickLRU({ maxSize: CACHE_SIZE });
const pathCache = new QuickLRU({ maxSize: CACHE_SIZE });

const pathSplit = (path) => {
  let parts = pathCache.get(path);
  if (parts === undefined) {
    parts = pathSplitInner(h, path);
    pathCache.set(path, parts);
  }
  return parts;
};

const lookupParts = function(parts, payload) {
  let index = 0;
  let value = payload;
  let type = typeof(payload);
  while (index < parts.length) {
    // trying to get a subproperty of null, undefined, boolean, or number
    // thats not valid, return undefined
    if (value === null || (type !== 'object' && type !== 'string')) {
      return undefined;
    }

    value = value[parts[index++]];
    type = typeof(value);

    // this points at a pre existing function, not allowed
    if (type === 'function') { return undefined; }
  }
  return value;
};

const idToString = function() { return this.id; };
const emptyStringFunc = () => '';

const _buildTemplateRenderer = (template, noBlocks) => {
  try {
    const parsed = h.parse(template);
    if (!parsed || !parsed.body || parsed.body.length === 0) {
      return emptyStringFunc;
    }

    const parts = partsFromParsed(parsed);
    if (parts) {
      // single handlebars path expression,
      // do simple no-cast-to-string lookup
      return (payload) => lookupParts(parts, payload);
    }
    return h.compile(parsed, noBlocks);
  } catch (e) {
    const error = normalizeHBError(e);
    return () => { throw error; };
  }
};

const _buildExpressionEvaluator = (expression) => {
  try {
    const parsed = ExpressionParser.parse(expression);
    const vars = [];
    parsed.variables().forEach((varTemplate) => {
      const renderer = _buildTemplateRenderer(`{{${varTemplate}}}`, true);
      vars.push([varTemplate, renderer]);
    });
    return (payload, options) => {
      const varMap = {};
      vars.forEach(([varTemplate, renderer]) => {
        varMap[varTemplate] = renderer(payload, options);
      });
      return parsed.evaluate(varMap);
    };
  } catch (e) {
    return () => { throw e; };
  }
};

export const compile = h.compile;

export const isValidPath = function(path, { returnError } = {}) {
  const result = pathSplit(path);
  if (result === false) {
    return returnError ? errors.InvalidPayloadPath({ path }) : false;
  } else {
    return returnError ? null : true;
  }
};

export const render = function(template, payload, { noErrors, castAsString, frameData } = {}) {
  if (!isString(template)) { return castAsString ? toString(template) : template; }
  if (!includes('{{', template)) { return template; }

  let templateFunc = renderCache.get(template);
  if (!templateFunc) {
    templateFunc = _buildTemplateRenderer(template);
    renderCache.set(template, templateFunc);
  }

  let result;
  try {
    const options = frameData ? { data: frameData } : { };
    result = templateFunc(payload, options);
  } catch (e) {
    if (!noErrors) {
      if (e.type === 'InvalidTemplate') { throw e; }
      throw normalizeHBError(e);
    }
    result = template;
  }
  return castAsString ? toString(result) : result;
};

export const renderToString = function(template, payload) {
  return render(template, payload, { castAsString: true });
};

export const isValidTemplate = function(template, { returnError } = {}) {
  try {
    render(template, {});
    return returnError ? null : true;
  } catch (e) {
    return returnError ? e : false;
  }
};

export const isValidJsonTemplate = function(template, { returnError } = {}) {
  if (!template) { return true; }
  template = String(template);

  let proxy;
  if (typeof(Proxy) === 'function') {
    proxy = new Proxy(fakeDataProxyBase, fakeDataHandler);
  }

  try {
    if (!template.includes('{{')) {
      // doesn't actually have handlebars
      // so should be straight valid json
      JSON.parse(template);
    } else {
      let rendered = renderToString(template, proxy || {});
      if (proxy) {
        try {
          JSON.parse(rendered);
        } catch {
          // attempt to quote unquoted RANDOM_PATH_NUMBER object keys
          // this is not perfect but it captures a lot of cases
          // see test case for example where it is broken in a super edge case
          rendered = rendered.replace(/\s/g, '').replace(new RegExp(`([\\,\\{])${RANDOM_PATH_NUMBER}:`, 'g'), `$1"${RANDOM_PATH_NUMBER}":`);
          JSON.parse(rendered);
        }
      }
    }
    return returnError ? null : true;
  } catch (e) {
    return returnError ? e : false;
  }
};

export const renderIfValid = function(template, payload) {
  return render(template, payload, { noErrors: true });
};

export const renderIfValidToString = function(template, payload) {
  return render(template, payload, { noErrors: true, castAsString: true });
};

export const lookup = function(path, payload) {
  const parts = pathSplit(path);
  if (parts === false) {
    throw errors.InvalidPayloadPath({ path });
  }
  if (!parts) { return undefined; }

  return lookupParts(parts, payload);
};

export const remove = function(path, payload) {
  const parts = pathSplit(path);
  if (parts === false) { throw errors.InvalidPayloadPath({ path }); }
  if (!parts) { return payload; }

  // a path of "." (or "this") refers to the whole payload; removing it leaves an empty object
  if (parts.length === 0) { return {}; }

  const updeepPath = [];
  let updeepValue;

  let nextPart, nextPartType;
  let current = payload;
  let currentType = typeof(current);
  let pathSoFar = 'this';

  for (let i = 0; i < parts.length; i++) {
    // nothing to remove
    if (currentType === 'undefined') { return payload; }

    if (current === null || (currentType !== 'object' && currentType !== 'string')) {
      throw errors.PayloadPathMismatch({
        message: `Payload is wrong type at '${pathSoFar}' to remove value`
      });
    }

    nextPart = parts[i];
    nextPartType = typeof(nextPart);

    if (currentType === 'string' || Array.isArray(current)) {
      if (nextPartType !== 'number') {
        throw errors.PayloadPathMismatch({
          message: `Payload is wrong type at '${pathSoFar}' to remove value`
        });
      }
    }

    if (currentType === 'string' && i !== parts.length - 1) {
      throw errors.PayloadPathMismatch({
        message: 'Cannot remove properties on part of a string'
      });
    }

    if (i === parts.length - 1) {
      if (currentType === 'string') {
        updeepValue = current.substr(0, nextPart) +
          current.substr(nextPart + 1);
      } else if (Array.isArray(current)) {
        updeepValue = uRejectIndex(nextPart);
      } else {
        updeepValue = u.omit(nextPart);
      }
    } else {
      current = current[nextPart];
      currentType = typeof(current);
      pathSoFar = `${pathSoFar}.[${nextPart}]`;
      updeepPath.push(nextPart);
    }
  }

  return u(u.updateIn(updeepPath, updeepValue), payload);
};

export const set = function(path, value, payload) {
  if (value === undefined) {
    return remove(path, payload);
  }

  const parts = pathSplit(path);
  if (parts === false) { throw errors.InvalidPayloadPath({ path }); }
  if (!parts) { return payload; }

  // a path of "." (or "this") refers to the whole payload; replace it with the value
  if (parts.length === 0) { return value; }

  const updeepPath = [];
  let updeepValue;

  let parent, nextPart, nextPartType;
  let current = payload;
  let currentType = typeof(current);
  let pathSoFar = 'this';

  for (let i = 0; i < parts.length; i++) {
    nextPart = parts[i];
    nextPartType = typeof(nextPart);

    if (currentType === 'undefined') {
      currentType = 'object';
      current = nextPartType === 'number' ? [] : {};
      if (updeepValue) {
        parent[parts[i-1]] = current;
      } else {
        parent = null;
        updeepValue = current;
      }
    }

    if (current === null || (currentType !== 'object' && currentType !== 'string')) {
      throw errors.PayloadPathMismatch({
        message: `Payload is wrong type at '${pathSoFar}' to set value`
      });
    }

    if (currentType === 'string' || Array.isArray(current)) {
      if (nextPartType !== 'number') {
        throw errors.PayloadPathMismatch({
          message: `Payload is wrong type at '${pathSoFar}' to set value`
        });
      }
    }

    if (currentType === 'string' && i !== parts.length - 1) {
      throw errors.PayloadPathMismatch({
        message: 'Cannot set properties on part of a string'
      });
    }

    if (i === parts.length - 1) {
      if (currentType === 'string') {
        value = String(value);
        if (value.length !== 1) {
          throw errors.PayloadPathMismatch({
            message: 'Can only set single chars at string index'
          });
        }
        current = current.substr(0, nextPart) + value +
          current.substr(nextPart + 1);
        // currentType will never be a string if
        // updeepValue && parent are both set
        updeepValue = current;
      } else {
        if (updeepValue) {
          current[nextPart] = value;
        } else {
          updeepPath.push(nextPart);
          updeepValue = value;
        }
      }
    } else {
      parent = current;
      current = current[nextPart];
      currentType = typeof(current);
      pathSoFar = `${pathSoFar}.[${nextPart}]`;
      if (!updeepValue) {
        updeepPath.push(nextPart);
      }
    }
  }

  return u(u.updateIn(updeepPath, u.constant(updeepValue)), payload);
};

export const evaluateExpression = function(expression, payload, { noErrors, frameData } = {}) {
  expression = String(expression);

  let expFunc = expCache.get(expression);
  if (!expFunc) {
    expFunc = _buildExpressionEvaluator(expression);
    expCache.set(expression, expFunc);
  }

  const options = frameData ? { data: frameData } : { };
  let result;
  if (noErrors) {
    try { result = expFunc(payload, options); } catch { }
  } else {
    result = expFunc(payload, options);
  }

  return result;
};

export const isValidExpression = function(expression, { returnError } = {}) {
  try {
    evaluateExpression(expression, {});
    return returnError ? null : true;
  } catch (e) {
    return returnError ? e : false;
  }
};

export const applyIdToString = function(obj) {
  if (!obj) { return; }
  Object.values(obj).forEach((value) => {
    if (value
      && Object.hasOwnProperty.call(value, 'id')
      && value.toString === Object.prototype.toString
    ) {
      value.toString = idToString;
    }
  });
};
