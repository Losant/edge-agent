import * as payloadHelper from 'losant-handlebars';
import { curry, trim } from 'omnibelt';

export const renderToStringTrimmed = curry((payload, template) => {
  return trim(payloadHelper.renderToString(template, payload));
});
export const lookup = curry((payload, path) => {
  return payloadHelper.lookup(path, payload);
});
export const set = curry((payload, path, value) => {
  return payloadHelper.set(path, value, payload);
});
