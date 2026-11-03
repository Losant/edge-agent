import * as payloadHelper from 'losant-handlebars';
import ljsonRender from './ljson-render.js';
import errors from 'losant-nodejs-utils/src/errors.js';
import { isNil } from 'omnibelt';

const byLookupType = {
  json: ljsonRender,
  // can't just do something like string: payloadHelper.renderToString
  // cause there are extra args that we don't want passed through
  path: (inputValue, payload) => payloadHelper.lookup(inputValue, payload),
  render: (inputValue, payload) => payloadHelper.render(inputValue, payload),
  string: (inputValue, payload) => payloadHelper.renderToString(inputValue, payload),
  payload: (inputValue, payload) => payload,
  none: () => ({ })
};

byLookupType.payloadPath = byLookupType.path;
byLookupType.jsonTemplate = byLookupType.json;
byLookupType.template = byLookupType.string;
byLookupType.stringTemplate = byLookupType.string;
byLookupType.workflowPayload = byLookupType.payload;

const noErrorOnMissing = new Set(['payload', 'workflowPayload', 'none']);

export default ({
  lookupType, inputValue, payload, title, defaultLookup = 'string', errorOnMissing = false, blankJsonToUndefined = false
}) => {
  if (!Object.hasOwn(byLookupType, lookupType)) { lookupType = defaultLookup; }

  if (errorOnMissing && !noErrorOnMissing.has(lookupType) && isNil(inputValue)) {
    throw errors.MissingField({ title });
  }

  return byLookupType[lookupType](inputValue, payload, title, blankJsonToUndefined);
};
