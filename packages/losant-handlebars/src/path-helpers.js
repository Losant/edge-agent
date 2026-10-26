export const RANDOM_PATH_NUMBER = 6854369048960; // random number for checking dynamic keys

// helpers that are valid to call with no parameters
// and so look exactly like normal paths
const noParamHelpers = ['dashboardUrl', 'currentDateTime'];

export const partsFromParsed = function(parsed) {
  if (!parsed || !parsed.body || parsed.body.length !== 1) { return false; }
  parsed = parsed.body[0];
  if (parsed.type !== 'MustacheStatement') { return false; }
  if (parsed.params && parsed.params.length !== 0) { return false; }
  if (parsed.hash) { return false; }
  if (!parsed.path || parsed.path.type !== 'PathExpression') { return false; }
  if (noParamHelpers.indexOf(parsed.path.original) >= 0) { return false; }

  return parsed.path.parts.map((part) => {
    const intPart = parseInt(part, 10);
    if (isFinite(intPart) && intPart >= 0 && String(intPart) === part) {
      return intPart;
    } else {
      return part;
    }
  });
};

export const pathSplit = function(h, path) {
  if (!path) { return; }
  path = String(path).trim();
  if (!path) { return false; }

  let parsed;
  try {
    parsed = h.parse(`{{${path}}}`);
  } catch {
    return false;
  }

  return partsFromParsed(parsed);
};

const fakeDataOneStr = function() { return `${RANDOM_PATH_NUMBER}`; };
export const fakeDataProxyBase = {
  inspect: fakeDataOneStr,
  toHTML: fakeDataOneStr,
  // so that json stringify returns the string '1'
  toJSON: function() { return RANDOM_PATH_NUMBER; },
  toPrimitive: fakeDataOneStr,
  toString: fakeDataOneStr,
  valueOf: fakeDataOneStr
};

if (typeof(Symbol) === 'function') {
  fakeDataProxyBase[Symbol.toPrimitive] = fakeDataOneStr;
  fakeDataProxyBase[Symbol.toString] = fakeDataOneStr;
  fakeDataProxyBase[Symbol.iterator] = function *() { };
}

export const fakeDataHandler = {
  get: function(target, key) {
    if (key === '_isAMomentObject') { return undefined; }

    let fakeVal = target[key];
    if (fakeVal === undefined) {
      fakeVal = new Proxy(fakeDataProxyBase, fakeDataHandler);
    }

    return fakeVal;
  },
  // target, property
  getOwnPropertyDescriptor: function() {
    return { configurable: true, enumerable: true };
  }
};
