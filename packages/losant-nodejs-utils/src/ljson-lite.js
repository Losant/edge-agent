import errors from './errors.js';
import { isTypedArray } from 'util/types';

// https://github.com/mongodb-js/extended-json/blob/master/lib/modes/strict.js#L139
const dateReviver = (value) => {
  if (typeof(value.$date) === 'object') {
    value = value.$date.$numberLong;
  } else {
    value = value.$date;
  }

  let date = new Date();
  if (isNaN(date.setTime(value))) {
    date = new Date(value);
  }
  return date;
};

const basicReplacer = function(key, value) {
  // can't trust the passed in value, it won't always be the original
  const origValue = this[key];

  if (origValue === undefined) { return { $undefined: true }; }

  // PostgresInterval data type needs a workaround
  if (typeof(origValue?.toISOString) === 'function' && !origValue.toPostgres) {
    return { $date: isNaN(origValue) ? 'NaN' : origValue.toISOString() };
  }

  if (typeof(origValue) === 'number' && !isFinite(origValue)) {
    return { $numberDouble: String(origValue) };
  }

  return value;
};

const isolatedVmReplacer = function(key, value) {
  const newValue = basicReplacer.call(this, key, value);
  if (newValue !== value) { return newValue; }

  // can't trust the passed in value, it won't always be the original
  const origValue = this[key];

  // Don't convert BigInts
  if (
    origValue instanceof BigInt64Array ||
    origValue instanceof BigUint64Array ||
    typeof origValue === 'bigint'
  ) {
    return null;
  }

  // special case for converting node buffers/typed arrays back to expected form
  if (isTypedArray(origValue)) {
    return {
      data: Array.from(origValue),
      type: 'Buffer'
    };
  }

  // special case for transferring 'daysjs' objects back to maintain expected form
  if (origValue?.$L && typeof(origValue?.$d?.toISOString) === 'function') {
    return { $date: isNaN(origValue.$d) ? 'NaN' : origValue.$d.toISOString() };
  }

  if (origValue instanceof Set) { return Array.from(origValue); }
  if (origValue instanceof Map) { return Object.fromEntries(origValue); }

  return value;
};

const extraTypesReplacer = function(key, value) {
  const newValue = basicReplacer.call(this, key, value);
  if (newValue !== value) { return newValue; }

  // can't trust the passed in value, it won't always be the original
  const origValue = this[key];

  if (typeof(origValue?.toHexString) === 'function') {
    return { $oid: origValue.toHexString() };
  }

  if (origValue instanceof RegExp) {
    return {
      $regex: origValue.source,
      $options: origValue.flags
    };
  }

  return value;
};

// the ideas here are taken from
// https://github.com/fastify/fast-json-stringify/blob/master/index.js#L344
const getStrLength = (str, maxAllowedSize) => {
  const len = str.length;

  if (!len) { return 2; } // quotes
  if (len > maxAllowedSize) {
    throw errors.TooLarge({
      maximum: maxAllowedSize,
      size: len,
      title: 'JSON String'
    });
  }
  if (len > 42) {
    return JSON.stringify(str).length;
  }
  let point, extraLen = 2;
  for (let i = 0; i < len; i++) {
    point = str.charCodeAt(i);
    // 9  -> \t
    // 10 -> \n
    // 13 -> \r
    // 92 -> \\
    // 34 -> \"
    if (point === 9 || point === 10 || point === 13 || point === 34 || point === 92) {
      extraLen++;
    } else if ((point >= 0xD800 && point <= 0xDFFF) || point < 32) {
      // The current character is a surrogate or needs other escaping
      return JSON.stringify(str).length;
    }
  }
  return extraLen + len;
};

const buildReplacer = (extraTypes, maxAllowedSize, detectCycles, serializeTypes) => {
  let innerReplacer = basicReplacer;
  if (serializeTypes) {
    innerReplacer = isolatedVmReplacer;
  } else if (extraTypes) {
    innerReplacer = extraTypesReplacer;
  }

  if (!maxAllowedSize && !detectCycles) {
    return innerReplacer;
  }

  let currentSize = 0;
  const parentStack = [];
  const parentSet = new Set();
  let currentParent;
  let realParent = false; // the very first call to replacer has a fake parent
  return function(key, value) {
    let newValue = innerReplacer.call(this, key, value);
    let type = typeof(newValue);
    let newParent = false;

    if (realParent) { // skip the fake root case
      if (currentParent !== this) {
        if (!currentParent || !parentSet.has(this)) {
          // we have traversed one level deeper
          newParent = true;
          parentSet.add(this);
          if (currentParent) { parentStack.push(currentParent); }
          currentParent = this;
        } else {
          do {
            parentSet.delete(currentParent);
            currentParent = parentStack.pop();
          } while (currentParent && currentParent !== this);
        }
      }

      if (detectCycles && newValue && type === 'object' && parentSet.has(newValue)) {
        newValue = '[Circular]';
        type = 'string';
      }
    }

    if (maxAllowedSize) {
      if (realParent) { // skip the fake root case
        if (!Array.isArray(this)) {
          currentSize += getStrLength(key, maxAllowedSize) + 1; // the colon
        }
        if (!newParent) { currentSize += 1; } // the comma
      }

      // newValue will never be undefined or a date,
      // as those are taken care of by innerReplacer
      // symbols, functions are automatically not included
      // maps / sets are automatically translated to empty objects
      // a BigInt will cause json stringify in general to explode
      if (newValue === null) {
        currentSize += 4;
      } else if (type === 'object') {
        currentSize += 2; // {} or []
      } else if (type === 'string') {
        currentSize += getStrLength(newValue, maxAllowedSize);
      } else if (type === 'number') {
        if (!isFinite(newValue)) {
          currentSize += 4; // NaN/Infinity go to null
        } else {
          currentSize += `${newValue}`.length;
        }
      } else if (newValue === true) {
        currentSize += 4;
      } else if (newValue === false) {
        currentSize += 5;
      }

      if (currentSize > maxAllowedSize) {
        throw errors.TooLarge({
          maximum: maxAllowedSize,
          size: currentSize,
          title: 'JSON String'
        });
      }
    }

    realParent = true; // all calls after the first call are real parents
    return newValue;
  };
};

const buildReviver = (undefinedTracker, extraTypesConverter) => {
  if (extraTypesConverter) {
    return function(key, value) {
      if (value === null || typeof value !== 'object') { return value; }
      if (value.$undefined) { undefinedTracker.push([this, key]); return; }
      if (value.$date) { return dateReviver(value); }
      if (value.$numberDouble) { return parseFloat(value.$numberDouble); }
      return extraTypesConverter(value);
    };
  } else {
    return function(key, value) {
      if (value === null || typeof value !== 'object') { return value; }
      if (value.$undefined) { undefinedTracker.push([this, key]); return; }
      if (value.$date) { return dateReviver(value); }
      if (value.$numberDouble) { return parseFloat(value.$numberDouble); }
      return value;
    };
  }
};

const stringify = (value, opts = {}) => {
  return JSON.stringify(value, buildReplacer(opts.extraTypes, opts.maxAllowedSize, opts.detectCycles, opts.serializeTypes));
};

const parse = (value, opts = {}) => {
  const undefinedTracker = [];
  const parsed = JSON.parse(value, buildReviver(undefinedTracker, opts.extraTypesConverter));
  undefinedTracker.forEach(([obj, key]) => { obj[key] = undefined; });
  return parsed;
};

export default {
  dateReviver,
  stringify,
  parse
};
