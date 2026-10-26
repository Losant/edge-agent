import { curry, pipe, propSatisfies, test, is, isNil, reject, defer, mergeRight } from 'omnibelt';

import { DEFAULT_TIMEOUT } from './constants.js';

const AXIOS_TIMEOUT_MESSAGE_REGEX = /^timeout of (\d)+ms exceeded$/;

const isAxiosTimeoutError = propSatisfies(test(AXIOS_TIMEOUT_MESSAGE_REGEX), 'message');

/**
 * Fetch Google API result via the `googleapis` package.
 *
 * @signature Function -> Object -> Promise
 *
 * @param {function}   doRequest           A Google API request function.
 * @param {Object}     args                Function args.
 * @param {AuthClient} args.authClient     Auth client.
 * @param {number=}    args.timeout        Request timeout (in ms).
 * @param {string}     args.timeoutMessage Timeout error message.
 * @param {Object}     args.params         API request params.
 *
 * @return {Promise} The API result or error.
 */
export default curry((doRequest, args) => {
  if (!is(Function, doRequest)) {
    throw Error('fetchApiResult :: doRequest must be a function');
  }

  const {
    authClient,
    timeout,
    timeoutMessage,
    params
  } = args;

  const requestTimeout = timeout || DEFAULT_TIMEOUT;

  const requestParams = pipe(
    reject(isNil),
    mergeRight({ auth: authClient })
  )(params);

  const requestOptions = { timeout: requestTimeout };

  const deferred = defer();

  doRequest(requestParams, requestOptions, (error, response) => {
    // When a non-200 status is returned, axios rejects the promise and puts the
    // response on the error object.
    if (error && !error.response) {
      if (isAxiosTimeoutError(error)) { error.code = timeoutMessage; }
      deferred.reject(error);
      return;
    }

    const responseData = (error && error.response || response).data;

    // Empty responses come back as an empty string so we use `null` as a fallback so
    // `defaultTo` can replace it with the default response.
    deferred.resolve(responseData || null);
  });

  return deferred.promise;
});
