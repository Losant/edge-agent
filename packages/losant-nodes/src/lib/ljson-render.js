import * as payloadHelper from 'losant-handlebars';
import LJSON from 'losant-nodejs-utils/src/ljson.js';
import errors from 'losant-nodejs-utils/src/errors.js';

export default (inputValue, payload, title, blankToUndefined = false) => {
  let value = payloadHelper.render(inputValue, payload);
  if (typeof(value) === 'string') {
    if (!value && blankToUndefined) { return undefined; }
    try {
      value = LJSON.parse(value);
    } catch {
      throw errors.InvalidJsonTemplate({ title });
    }
  }
  return value;
};
