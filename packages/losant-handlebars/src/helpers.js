/* global window */

import moment from 'moment-timezone';
import 'moment/min/locales.js'; // this will auto load the locales into moment
import {
  findIndex, equals, toString, includes, toLower, map,
  toUpper, trim, isUndefined, size, is, isNil, isArrayLike, values
} from 'omnibelt';
import { Base64 } from 'js-base64';
import hb from 'handlebars';
import { formatCoordinate, distance as calculateDistance, isPointInside } from './gps-helpers.js';
import qs from 'qs';
import xmlJs from 'xml-js';
import * as inflection from 'inflection';
import eachHelper from './each-helper.js';
import * as hbIndex from './index.js';
import RE2 from './get-re2.js';
import { d3ByLocale } from './d3-locales.js';
const SafeString = hb.SafeString;
const isDate = is(Date);
const isString = is(String);

const unwrapSafeStr = function(val) {
  return val instanceof SafeString ? val.string : val;
};

// the last argument to any handlebars helper is always the HB options object
const resolveHelperArgs = function(expectedCount, args, shouldUnwrapArgs = true, shouldUnwrapHash = false) {
  const missingCount = expectedCount - args.length;
  let resolvedArgs;
  if (missingCount === 0) {
    resolvedArgs = args;
  } else if (missingCount > 0) {
    resolvedArgs = [...args.slice(0, -1), ...(new Array(missingCount)), args.at(-1)];
  } else {
    resolvedArgs = [...args.slice(0, expectedCount-1), args.at(-1)];
  }
  if (shouldUnwrapArgs) { resolvedArgs = resolvedArgs.map(unwrapSafeStr); }
  if (shouldUnwrapHash) {
    const options = args.at(-1);
    if (options.hash) {
      options.hash = map(unwrapSafeStr, options.hash);
    }
  }

  return resolvedArgs;
};

const basicIf = function(val, options, context) {
  if (typeof options.fn !== 'function') {
    return val;
  }
  if (val) {
    return options.fn(context);
  } else {
    return options.inverse(context);
  }
};

// this is up here, cause it confuses babel to
// have a function named typeof get defined inline
// and call the typeof keyword
const typeOfHelper = function(...args) {
  const [val] = resolveHelperArgs(2, args);

  const jsType = typeof(val);
  if (jsType !== 'object') { return jsType; }
  if (val === null) { return 'null'; }
  if (Array.isArray(val)) { return 'array'; }
  if (isDate(val)) { return 'date'; }
  return 'object';
};

const indexByKey = function(...args) {
  const [objArray, keyValue, keyPath] = resolveHelperArgs(4, args);

  if (!Array.isArray(objArray) || !objArray.length) { return -1; }

  const defaultedKeyPath = keyPath || 'key';
  return findIndex((obj) => {
    return equals(keyValue, hbIndex.lookup(defaultedKeyPath, obj));
  }, objArray);
};

const helpers = {
  lookup: function(...args) {
    // overriding https://github.com/handlebars-lang/handlebars.js/blob/v4.7.8/lib/handlebars/helpers/lookup.js
    // to avoid throwing when the field argument is missing
    const [obj, field, options] = resolveHelperArgs(3, args);
    if (!obj) { return obj; }
    return options.lookupProperty(obj, field);
  },
  each: function(...args) {
    const [context, options] = resolveHelperArgs(2, args);
    return eachHelper(context, options);
  },
  ne: function(...args) {
    const [p1, p2, options] = resolveHelperArgs(3, args);
    return basicIf(p1 !== p2, options, this);
  },
  eq: function(...args) {
    const [p1, p2, options] = resolveHelperArgs(3, args);
    return basicIf(p1 === p2, options, this);
  },
  gt: function(...args) {
    const [p1, p2, options] = resolveHelperArgs(3, args);
    return basicIf(p1 > p2, options, this);
  },
  lt: function(...args) {
    const [p1, p2, options] = resolveHelperArgs(3, args);
    return basicIf(p1 < p2, options, this);
  },
  gte: function(...args) {
    const [p1, p2, options] = resolveHelperArgs(3, args);
    return basicIf(p1 >= p2, options, this);
  },
  lte: function(...args) {
    const [p1, p2, options] = resolveHelperArgs(3, args);
    return basicIf(p1 <= p2, options, this);
  },
  match: function(...args) {
    const [str, regExpStr, options] = resolveHelperArgs(3, args);
    let regExp;
    try {
      regExp = new RE2(toString(regExpStr));
    } catch {
      return basicIf(false, options, this);
    }
    return basicIf(
      !!toString(str).match(regExp),
      options, this);
  },
  includes: function(...args) {
    const [collection, value, options] = resolveHelperArgs(3, args);
    if (isNil(collection) || isNil(value)) { return basicIf(false, options, this); }
    const convertedCollection = isArrayLike(collection) ? collection : values(collection);
    const convertedValue = typeof convertedCollection === 'string' ? toString(value) : value;
    return basicIf(includes(convertedValue, convertedCollection), options, this);
  },
  format: function(...args) {
    const [val, formatStr, options] = resolveHelperArgs(3, args, true, true);

    const type = typeof(val);
    if (type === 'number') {
      let formatter;
      if (typeof options.hash?.locale === 'string') {
        formatter = d3ByLocale[options.hash.locale.toLowerCase()];
      }
      return (formatter || d3ByLocale.default)(formatStr || ',.6')(val);
    } else if (type === 'object') {
      if (isDate(val)) {
        return helpers.formatDate(val, formatStr, options);
      } else {
        return new SafeString(JSON.stringify(val, null, 2));
      }
    } else {
      return val;
    }
  },
  formatDate: function(...args) {
    const [origVal, formatStr, options] = resolveHelperArgs(3, args, true, true);
    let val = origVal;
    if (val?.length > 8) { // 8 for YYYYMMDD
      const numVal = Math.floor(Number(val));
      if (String(numVal) === val) { val = numVal; }
    }
    val = moment(val);
    if (typeof options.hash?.locale === 'string') {
      val = val.locale(options.hash.locale);
    }
    if (typeof options.hash?.tz === 'string') {
      val = val.tz(options.hash.tz);
    }
    return val.format(formatStr || 'L LTS');
  },
  formatDateRelative: function(...args) {
    const [origVal, origRelativeTo, options] = resolveHelperArgs(3, args, true, true);
    let val = origVal;
    if (val?.length > 8) { // 8 for YYYYMMDD
      const numVal = Math.floor(Number(val));
      if (String(numVal) === val) { val = numVal; }
    }
    let relativeTo = origRelativeTo;
    if (relativeTo?.length > 8) { // 8 for YYYYMMDD
      const numRelativeTo = Math.floor(Number(relativeTo));
      if (String(numRelativeTo) === relativeTo) { relativeTo = numRelativeTo; }
    }

    val = moment(val);
    if (typeof options.hash?.locale === 'string') {
      val = val.locale(options.hash.locale);
    }

    // undefined relativeTo means relative to now
    return val.from(relativeTo);
  },
  formatGps: function(...args) {
    const [val, toFormat, precision] = resolveHelperArgs(4, args);
    return formatCoordinate(val, toFormat, precision);
  },
  currentDateTime: function(...args) {
    const [formatStr, options] = resolveHelperArgs(2, args, true, true);

    let val = moment();
    if (typeof options.hash?.locale === 'string') {
      val = val.locale(options.hash.locale);
    }
    if (typeof options.hash?.tz === 'string') {
      val = val.tz(options.hash.tz);
    }

    return val.format(formatStr || 'L LTS');
  },
  lower: function(...args) {
    const [str] = resolveHelperArgs(2, args);
    return toLower(str);
  },
  upper: function(...args) {
    const [str] = resolveHelperArgs(2, args);
    return toUpper(str);
  },
  trim: function(...args) {
    const [str] = resolveHelperArgs(2, args);
    return trim(str);
  },
  encodeURI: function(...args) {
    const [str] = resolveHelperArgs(2, args);
    return encodeURI(toString(str));
  },
  encodeURIComponent: function(...args) {
    const [str] = resolveHelperArgs(2, args);
    return encodeURIComponent(toString(str));
  },
  decodeURI: function(...args) {
    const [str] = resolveHelperArgs(2, args);
    return decodeURI(toString(str));
  },
  decodeURIComponent: function(...args) {
    const [str] = resolveHelperArgs(2, args);
    return decodeURIComponent(toString(str));
  },
  encodeBase64: function(...args) {
    const [str] = resolveHelperArgs(2, args);
    return Base64.encode(toString(str));
  },
  decodeBase64: function(...args) {
    const [str] = resolveHelperArgs(2, args);
    return Base64.decode(toString(str));
  },
  defaultTo: function(...args) {
    const [desiredValue, defaultValue] = resolveHelperArgs(3, args, false);
    const unwrappedDesiredValue = unwrapSafeStr(desiredValue);
    return isUndefined(unwrappedDesiredValue) || unwrappedDesiredValue === '' || unwrappedDesiredValue === null ? defaultValue : desiredValue;
  },
  jsonEncode: function(...args) {
    const [val, spacer] = resolveHelperArgs(3, args);
    // so that handlebars doesn't by default escape this string
    return new SafeString(JSON.stringify(val, null, spacer));
  },
  queryStringEncode: function(...args) {
    const [val] = resolveHelperArgs(2, args);
    return qs.stringify(val);
  },
  length: function(...args) {
    const [val] = resolveHelperArgs(2, args);
    if (val !== null && (typeof val === 'object' || isString(val))) {
      return size(val);
    } else {
      return undefined;
    }
  },
  add: function(...args) {
    const [p1, p2] = resolveHelperArgs(3, args);
    return Number(p1) + Number(p2);
  },
  subtract: function(...args) {
    const [p1, p2] = resolveHelperArgs(3, args);
    return Number(p1) - Number(p2);
  },
  multiply: function(...args) {
    const [p1, p2] = resolveHelperArgs(3, args);
    return Number(p1) * Number(p2);
  },
  divide: function(...args) {
    const [p1, p2] = resolveHelperArgs(3, args);
    return Number(p1) / Number(p2);
  },
  min: function(...args) {
    const [p1, p2] = resolveHelperArgs(3, args);
    return p1 <= p2 ? p1 : p2;
  },
  max: function(...args) {
    const [p1, p2] = resolveHelperArgs(3, args);
    return p1 >= p2 ? p1 : p2;
  },
  ceil: function(...args) {
    const [p1] = resolveHelperArgs(2, args);
    return Math.ceil(Number(p1));
  },
  floor: function(...args) {
    const [p1] = resolveHelperArgs(2, args);
    return Math.floor(Number(p1));
  },
  indexByKey,
  valueByKey: function(...args) {
    const [objArray, keyValue, keyPath, valuePath, options] = resolveHelperArgs(5, args);
    const index = indexByKey(objArray, keyValue, keyPath, options);
    if (index < 0) { return undefined; }

    return hbIndex.lookup(valuePath || 'value', objArray[index]);
  },
  colorMarker: function(...args) {
    let [color] = resolveHelperArgs(2, args);
    color = toString(color);
    if (!color.startsWith('rgb') && !color.startsWith('#')) {
      color = '#000000';
    }
    const svgStr = Base64.encode(`<svg width="30" height="70" id="map_pin" data-name="Map Pin" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 30 70"><defs><radialGradient id="radial-gradient" cx="15" cy="35" r="11.9" gradientTransform="translate(2.28 21.8) scale(0.85 0.38)" gradientUnits="userSpaceOnUse"><stop offset="0" stop-opacity="0.25"/><stop offset="0.8" stop-opacity="0"/></radialGradient></defs><title>Pin</title><ellipse cx="15" cy="35" rx="10.09" ry="4.49" style="fill:url(#radial-gradient)"/><path style="fill:${color}" d="M15,.9A11.93,11.93,0,0,0,3.1,12.8C3.1,21.8,15,35,15,35S26.9,21.8,26.9,12.8A11.93,11.93,0,0,0,15,.9Z"/><g style="opacity:0.25"><path d="M15,2.15A10.66,10.66,0,0,1,25.65,12.8c0,7-7.9,17-10.65,20.28C12.25,29.8,4.35,19.8,4.35,12.8A10.66,10.66,0,0,1,15,2.15M15,.9A11.93,11.93,0,0,0,3.1,12.8C3.1,21.8,15,35,15,35S26.9,21.8,26.9,12.8A11.93,11.93,0,0,0,15,.9Z" style="fill:#fff"/></g><circle cx="15" cy="12.7" r="5.2" style="fill:#fff;opacity:0.2;isolation:isolate"/></svg>`);
    return new SafeString(`data:image/svg+xml;base64,${svgStr}`);
  },
  gpsDistance: function(...args) {
    const [point1, point2] = resolveHelperArgs(3, args);
    const distance = calculateDistance(point1, point2);
    return isFinite(distance) ? distance : false;
  },
  gpsIsPointInside: function(...args) {
    const [point, polyArray] = resolveHelperArgs(3, args);
    return isPointInside(point, polyArray) || false;
  },
  join: function(...args) {
    let [ary, sep] = resolveHelperArgs(3, args);
    sep = toString(sep || ',');
    if (Array.isArray(ary)) { ary = ary.join(sep); }

    return ary;
  },
  typeof: typeOfHelper,
  dashboardUrl: function(...args) {
    const [userDashboardId, options] = resolveHelperArgs(2, args, true, true);

    let baseUrl = process.env.APP_URL || 'https://app.losant.com';
    let queryOpts = { };
    let dashboardId = toString(userDashboardId);

    if (typeof(window) !== 'undefined') {
      baseUrl = window.location.origin;
      if (window.location.pathname.startsWith('/dashboards/') || window.location.pathname.startsWith('/block/')) {
        if (!dashboardId) {
          let startSlice = 12;
          const idLength = 24;
          if (window.location.pathname.startsWith('/block/')) {
            startSlice = 7;
          }
          dashboardId = window.location.pathname.slice(startSlice, startSlice + idLength);
        }
        if (window.location.search && window.location.search.length > 1) {
          queryOpts = qs.parse(window.location.search.slice(1));
        }
      }
    }

    let url = `${baseUrl}/dashboards/${dashboardId}`;
    queryOpts = { ...queryOpts, ...(options.hash || {}) };

    if (Object.keys(queryOpts).length > 0) {
      url += `?${qs.stringify(queryOpts)}`;
    }

    return new SafeString(url);
  },
  toHtml: function(...args) {
    const [userDocObj, options] = resolveHelperArgs(2, args, true, true);

    let docObj = userDocObj;
    if (!docObj || typeof(docObj) !== 'object') { return ''; }

    if (Array.isArray(docObj)) {
      docObj = { children: docObj };
    }

    let builderOpts = {
      elementsKey: 'children',
      ...(options.hash || {})
    };
    if (!builderOpts.compact) {
      // when expanded form, default to 'value' as key names
      // for these guys if not set
      builderOpts = {
        textKey: 'value',
        cdataKey: 'value',
        commentKey: 'value',
        ...(builderOpts || {})
      };
    }

    try {
      let result = xmlJs.js2xml(docObj, builderOpts);
      // xmlJs does not have built in support for doctype,
      // and does not deal with xml declarations super well
      if (docObj.doctype) { result = `<!DOCTYPE ${docObj.doctype}>\n${result}`; }
      return new SafeString(result);
    } catch {
      return '';
    }
  },
  template: function(...args) {
    const [str, ctx, options] = resolveHelperArgs(3, args);

    if (options.data._nestedTemplate) {
      return '';
    }

    const payload = ctx === undefined ? options.data.root : ctx;
    const frameData = { root: options.data.root, _nestedTemplate: true };

    return hbIndex.render(str, payload, { noErrors: true, frameData });
  },
  evalExpression: function(...args) {
    const [str, ctx, options] = resolveHelperArgs(3, args);

    if (options.data._nestedTemplate) {
      return undefined;
    }

    const payload = ctx === undefined ? options.data.root : ctx;
    const frameData = { root: options.data.root, _nestedTemplate: true };

    return hbIndex.evaluateExpression(str, payload, { frameData, noErrors: true });
  },
  scaleLinear: function(...args) {
    let [fromLow, fromHigh, toLow, toHigh, value] = resolveHelperArgs(6, args);
    fromLow = Number(fromLow);
    fromHigh = Number(fromHigh);
    toLow = Number(toLow);
    toHigh = Number(toHigh);
    value = Number(value);
    return (value - fromLow) * ((toHigh - toLow) / (fromHigh - fromLow)) + toLow;
  },
  last: function(...args) {
    if (args.length <= 1) {
      // @last ends up referencing the helper, even if there is a @last data variable
      // so if you call @last with nothing, lets see if the data variable is there
      // on options and return that. This is specifically to support @last with no arguments
      return args.at(-1)?.data?.last;
    }

    const potentialArray = unwrapSafeStr(args[0]);
    if (Array.isArray(potentialArray) || typeof potentialArray === 'string') {
      return potentialArray.at(-1);
    }
  },
  titleCase: function(...args) {
    const [str] = resolveHelperArgs(2, args);
    return inflection.titleize(toString(str));
  },
  // helpers that do not return strings
  // and so are only useful when used nested with
  // other helpers
  obj: function(...args) {
    const options = args.at(-1);
    if (!options.hash) { return { }; }
    return map(unwrapSafeStr, options.hash);
  },
  array: function(...args) {
    // last item in args will be handlebars options
    return args.slice(0, -1).map(unwrapSafeStr);
  },
  merge: function(...args) {
    // last item in args will be handlebars options
    // numbers, boolean, null, undefined are ignored
    // arrays and strings are treated as objects with keys of indices
    return Object.assign({}, ...args.slice(0, -1).map(unwrapSafeStr));
  },
  jsonDecode: function(...args) {
    const [val] = resolveHelperArgs(2, args);
    if (val && typeof val === 'string') {
      try {
        return JSON.parse(val);
      } catch { }
    }
  },
  substring: function(...args) {
    const [str, indexStart, indexEnd] = resolveHelperArgs(4, args);
    return toString(str).substring(indexStart, indexEnd);
  }
};

export default helpers;
