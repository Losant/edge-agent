import {
  pipe, propOr, objOf, thunkify, fpThrow, trim, toLower,
  compose, propEq, anyPass, includes, prop,
  curry, toInteger
} from 'omnibelt';
import errors from 'losant-nodejs-utils/src/errors.js';
const { NodeTimeout, Validation } = errors;
import { DEFAULT_TIMEOUT } from './constants.js';
import * as payloadHelper from 'losant-handlebars';

export const getNodeTimeout = propOr(DEFAULT_TIMEOUT, 'externalTimeout');

export const fpThrowT = thunkify(fpThrow);
/**
 * Takes a node title and returns a thunk that throws a NodeTimeoutError.
 *
 * @signature String -> Function
 *
 * @throws NodeTimeoutError
 */
export const handleNodeTimeoutError = pipe(
  objOf('title'),
  NodeTimeout,
  thunkify(fpThrow)
);

export const trimLower = pipe(trim, toLower);

export const getBasicAuthValue = (username = '', password = '') => {
  return `Basic ${Buffer.from(`${username}:${password}`, 'utf8').toString('base64')}`;
};

export const getDataByTemplateType = (dataTemplate, dataTemplateType, payload) => {
  let data;
  if (dataTemplateType === 'payloadPath') {
    data = payloadHelper.lookup(dataTemplate, payload);
  } else if (dataTemplateType === 'jsonTemplate') {
    data = payloadHelper.render(dataTemplate, payload);
  } else {
    data = {};
    dataTemplate.forEach((attrInfo) => {
      if (!attrInfo.key) { return; }

      const value = payloadHelper.render(attrInfo.valueTemplate, payload);
      const key = payloadHelper.renderToString(attrInfo.key, payload).trim();
      if (!key || value === undefined) { return; }

      data[key] = value;
    });
  }
  return data;
};

export const getTimeoutFieldTemplate = curry((templateName, node, payload, defaultTimeout) => {
  const timeout = toInteger(payloadHelper.render(node[templateName], payload)) || defaultTimeout;
  if (timeout > defaultTimeout) {
    throw Validation({ message: `${templateName} cannot be greater than ${defaultTimeout / 1000} seconds.` });
  }
  return timeout;
});

export const renderToIntegerRange = ({
  template, payload, fieldName, defaultValue, min, max
}) => {
  const potentialValue = template ? payloadHelper.render(template, payload) : defaultValue;

  let intValue;
  if (typeof(potentialValue) !== 'number') {
    intValue = potentialValue ? String(potentialValue).trim() : '';
    intValue = intValue ? Number(intValue) : defaultValue;
  } else {
    intValue = potentialValue;
  }

  if (intValue === defaultValue) { return defaultValue; }

  if (!Number.isSafeInteger(intValue) || intValue < min || intValue > max) {
    throw Validation({ message: `${fieldName} number (${potentialValue}) is invalid.` });
  }

  return intValue;
};

export const renderToNetworkPort = (options) => renderToIntegerRange({ ...options, min: 1, max: 65535 });

export const getTimeoutTemplate = getTimeoutFieldTemplate('timeoutTemplate');

export const isTimeoutError = anyPass([
  propEq('ETIMEDOUT', 'code'),
  propEq('ECONNABORTED', 'code'),
  compose(
    anyPass([ includes('timeout'), includes('timed out') ]),
    toLower,
    prop('message')
  )
]);

// this will either be the amount of time left to run the workflow OR
// the external timeout which ever is smaller.
export const getExternalTimeout = (context, start) => {
  start = start || Date.now();
  return Math.min(context.externalTimeout, context.maxFlowRunTime - (start - context.runStart));
};
