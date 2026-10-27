import handlebars from 'handlebars';
import errors from './errors.js';
import helpers from './helpers.js';
import { applyHBParseErrorOverride } from './error-helpers.js';

let basicH, noBlockH;
const knownHelpers = {};

// only allow helpers that are not block helpers
// so ne, eq, gt, lt, gte, lte, match, includes are disabled
const nonBlockHelpers = {
  // internal - only allow the lookup helper
  each: false,
  if: false,
  unless: false,
  with: false,
  log: false,
  lookup: true,

  // our non-block helpers
  format: true,
  formatDate: true,
  formatDateRelative: true,
  formatGps: true,
  currentDateTime: true,
  lower: true,
  upper: true,
  trim: true,
  encodeURI: true,
  encodeURIComponent: true,
  decodeURI: true,
  decodeURIComponent: true,
  encodeBase64: true,
  decodeBase64: true,
  defaultTo: true,
  jsonEncode: true,
  queryStringEncode: true,
  length: true,
  add: true,
  subtract: true,
  multiply: true,
  divide: true,
  min: true,
  max: true,
  ceil: true,
  floor: true,
  valueByKey: true,
  indexByKey: true,
  colorMarker: true,
  gpsDistance: true,
  gpsIsPointInside: true,
  join: true,
  dashboardUrl: true,
  template: true,
  scaleLinear: true,
  titleCase: true,
  typeof: true,
  toHtml: true,
  evalExpression: true,
  last: true,
  obj: true,
  array: true,
  merge: true,
  jsonDecode: true,
  substring: true
};

const registerHelpers = () => {
  basicH = handlebars.create();
  noBlockH = handlebars.create();

  basicH.registerHelper(helpers);
  basicH.registerDecorator('inline', () => {
    throw errors.InvalidTemplate({
      message: 'Inline partials are not supported.'
    });
  });

  noBlockH.registerHelper(helpers);
  noBlockH.registerHelper('blockHelperMissing', (context, options) => {
    throw errors.InvalidTemplate({
      message: `Block helpers are not allowed: ${options.name}.`
    });
  });
  noBlockH.registerDecorator('inline', () => {
    throw errors.InvalidTemplate({
      message: 'Inline partials are not supported.'
    });
  });

  Object.keys(helpers).forEach((helperName) => {
    knownHelpers[helperName] = true;
  });
  knownHelpers.log = false;

  applyHBParseErrorOverride(basicH);
  applyHBParseErrorOverride(noBlockH);
};

export default {
  compile: function(template, noBlocks) {
    if (!noBlockH) { registerHelpers(); }
    if (noBlocks) {
      return noBlockH.compile(template,
        { knownHelpersOnly: true, knownHelpers: nonBlockHelpers }
      );
    } else {
      return basicH.compile(template,
        { knownHelpersOnly: true, knownHelpers: knownHelpers }
      );
    }
  },
  parse: function(template) {
    if (!noBlockH) { registerHelpers(); }
    return basicH.parse(template);
  },
  nonBlockHelpers
};
