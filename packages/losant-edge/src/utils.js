import {
  compose, mergeDeepWith, curry, where,
  cond, isNotNil, T, prop, forEachObjIndexed, mapRejectNil, isNilOrEmpty,
  fromPairs, identity, clampPositive, toNumber
} from 'omnibelt';
import * as payloadHelper from 'losant-handlebars';
import { ENCODINGS } from './constants.js';
import path from 'node:path';
import errors from 'losant-nodejs-utils/src/errors.js';


// NOTE: This is used to work around `tcomb` structs `has`ing props that are undefined
const omitNil = curry((x, y) =>
  cond([
    [ where({ y: isNotNil }), prop('y') ],
    [ T, prop('x') ]
  ])({ x, y })
);

export const mergeDeepNil = mergeDeepWith(omitNil);

// :: ( -> Object a) -> a -> a
export const resetTo = curry((origStateThunk, state) => {
  forEachObjIndexed(
    (val, key) => { state[key] = val; },
    origStateThunk()
  );
});

export const checkEncoding = (encoding) => {
  if (!ENCODINGS.is(encoding)) {
    throw errors.Validation({ message: `Encoding must be one of the following: ${ENCODINGS.allows.join(', ')}.` });
  }
};

const keyValueToArray = ({ key, value }) => {
  return [ key, value ];
};

const mapRejectNilKeyValTemplatesCurry = curry((transform, templates, payload) => {
  return mapRejectNil(({ keyTemplate, valueTemplate }) => {
    if (isNilOrEmpty(keyTemplate)) { return; }
    const key = payloadHelper.renderToString(keyTemplate, payload).trim();
    if (isNilOrEmpty(key)) { return; }
    const value = payloadHelper.renderToString(valueTemplate, payload);
    return transform({ key, value });
  }, templates);
});
export const mapRejectNilKeyValTemplates = mapRejectNilKeyValTemplatesCurry(identity);
export const mapRejectNilKeyValTemplatesFlat = compose(fromPairs, mapRejectNilKeyValTemplatesCurry(keyValueToArray));

export const pathRelativeToCwd = (absoluteDest) => {
  const relative = `./${path.relative(process.cwd(), absoluteDest)}`;
  return relative.length < absoluteDest.length ? relative : absoluteDest;
};

export const clampPositiveEnv = (envName, defaultTo) => {
  if (typeof envName !== 'string') {
    // passing process.env.X instead of 'X' silently ignores the variable
    throw new TypeError(`clampPositiveEnv expects an environment variable name, received ${typeof envName}`);
  }
  return clampPositive(toNumber(process.env[envName] || defaultTo));
};

