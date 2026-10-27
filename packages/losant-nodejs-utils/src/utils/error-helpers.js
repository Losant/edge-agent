// these are the set of core node errors reachable from inside losant-nodes'/losant-edge's
// own error path (a bug in our code, or we forgot to wrap something to throw a more
// useful error). Mongo/Redis driver error names are deliberately NOT here — mongo-node.js
// and redis-node.js always rename driver errors (see cleanMongoErrorWrap/cleanRedisErrorWrap)
// before they'd reach shouldRollbarError below, so those codes only matter closed-side
// (see losant-internal-nodejs/src/utils/error-helpers.js for the full table).
export const errorsToTransform = {
  Error:            101,
  AssertionError:   102,
  RangeError:       103,
  ReferenceError:   104,
  SyntaxError:      105,
  SystemError:      106,
  TypeError:        107
};

export const shouldRollbarError = (err) => {
  return err && !!errorsToTransform[err.name];
};
