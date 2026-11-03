import errors from '../errors.js';
const ALLOWED_WS_LIST = [ 'ws:', 'wss:' ];
const ALLOWED_WS_SET = new Set(ALLOWED_WS_LIST);
const ALLOWED_HTTP_LIST = ['http:', 'https:'];
const ALLOWED_HTTP_SET = new Set(ALLOWED_HTTP_LIST);
const ALLOWED_HTTP_WS_LIST = [ ...ALLOWED_HTTP_LIST, ...ALLOWED_WS_LIST ];
const ALLOWED_HTTP_WS_SET = new Set(ALLOWED_HTTP_WS_LIST);

const ALLOWED_MAP = {
  any: {
    allowedSet: ALLOWED_HTTP_WS_SET,
    allowedList: ALLOWED_HTTP_WS_LIST
  },
  http: {
    allowedSet: ALLOWED_HTTP_SET,
    allowedList: ALLOWED_HTTP_LIST
  },
  ws: {
    allowedSet: ALLOWED_WS_SET,
    allowedList: ALLOWED_WS_LIST
  },
  https: {
    allowedSet: new Set(['https:']),
    allowedList: ['https:']
  }
};
// allow can be http, ws or any
export default (uri, { allow = 'http' } = {}) => {
  let parsedUri;
  try { parsedUri = new URL(uri); } catch {}

  if (!parsedUri?.hostname) {
    throw errors.Validation({ message: `Invalid URL: ${uri}` });
  }
  const { allowedSet, allowedList } = ALLOWED_MAP[allow];
  if (!allowedSet.has(parsedUri.protocol)) {
    throw errors.Validation({ message: `Invalid URL (protocol must be ${allowedList.join(', ')}): ${uri}` });
  }
  return parsedUri;
};
