import axios, { CancelToken, create } from 'axios';
import ensureValidHttpUri from './utils/ensure-valid-uri.js';
import LJSON from './ljson.js';
import { timeoutP, append, T } from 'omnibelt';

const DEFAULT_TIMEOUT = 30000;
const noDefaultInst = create();
noDefaultInst.defaults.headers = {
  common: {},
  delete: {},
  get: {},
  head: {},
  post: {},
  put: {},
  patch: {}
};

const ljsonTransform = (data) => {
  try {
    data = LJSON.parse(data);
  } catch {}
  return data;
};

// (axiosOptions, wrapperOptions) => { httpAgent, httpsAgent } | undefined
let registered = null;

const axiosWrapper = async (axiosOptions, wrapperOptions = {}) => {
  const { blankDefaultHeaders, allStatusCodesAreValid, parseAsLJson } = wrapperOptions;
  ensureValidHttpUri(axiosOptions.url);

  const axiosInstance = blankDefaultHeaders ? noDefaultInst : axios;
  const cancelSrc = CancelToken.source();

  axiosOptions = { ...axiosOptions };
  axiosOptions.cancelToken = cancelSrc.token;
  // Fail-open: with no resolver registered the caller's agents are left exactly as passed
  // and nothing checks the destination. Any network-access policy - including the agents
  // that enforce it - is supplied from outside this package.
  const agents = registered?.(axiosOptions, wrapperOptions);
  if (agents) {
    axiosOptions.httpAgent = agents.httpAgent;
    axiosOptions.httpsAgent = agents.httpsAgent;
  }
  if (!axiosOptions.timeout) {
    axiosOptions.timeout = DEFAULT_TIMEOUT;
  }
  if (allStatusCodesAreValid) {
    axiosOptions.validateStatus = T;
  }
  if (parseAsLJson) {
    axiosOptions.transformResponse =
      append(ljsonTransform, axiosOptions.transformResponse || []);
  }

  let response;
  try {
    response = await timeoutP(axiosOptions.timeout, axiosInstance(axiosOptions));
  } catch (err) {
    cancelSrc.cancel();
    throw err;
  }
  return response;
};

// Installs the agent resolver; pass null to clear it. Registering a different function while
// one is already installed throws - an explicit null first is how a caller signals it means
// to replace it, so two callers can't silently fight over what this hook does. The same
// function twice (e.g. an entrypoint and its test bootstrap) is a no-op.
axiosWrapper.resolveCustomAgents = (fn) => {
  if (fn === null) {
    registered = null;
    return;
  }
  if (registered && registered !== fn) {
    throw new Error('axiosWrapper.resolveCustomAgents() was already called with a different function');
  }
  registered = fn;
};

export default axiosWrapper;
