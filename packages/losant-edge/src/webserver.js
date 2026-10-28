import { nanoid } from 'nanoid';
import Hapi from '@hapi/hapi';
import call from '@hapi/call';
import rollbar from './rollbar.js';
import logger from './logger/index.js';
import util from 'util';
import { is, isNil, toString, trim, always, keys, isNilOrEmpty, has, defer } from 'omnibelt';
import FiredTrigger from './types/fired-trigger.js';
import WebserverConf from './types/webserver-conf.js';
import RequestTriggerConfigs from './types/request-trigger-configs.js';
import LJSON from 'losant-nodejs-utils/src/ljson.js';
import statusCodeCast from 'losant-nodejs-utils/src/utils/status-code-cast.js';
import parseBasicAuthHeader from 'losant-nodejs-utils/src/utils/parse-basic-auth-header.js';
const pSetTimeout = util.promisify(setTimeout);

const waitForErrorWorkflowDelay = 1000;
const serverStartErrMsg =
  'Webserver failed to start. Likely reasons are bad port, bad address or bad ssl certificate.';

//https://tools.ietf.org/html/rfc7230#section-3.2.6
const cleanHeaderKey = /[^!#$%&'*+-.^_`|~0-9a-z]/g;
// hhttps://github.com/hapijs/statehood/blob/v6.0.6/lib/index.js#L91
/* eslint no-control-regex: "off", no-useless-escape: "off" */
const cleanCookieName = /^[^\x00-\x20\(\)<>@\,;\:\\"\/\[\]\?\=\{\}\x7F]+$/;
const cleanCookieValue = /^[^\x00-\x20\"\,\;\\\x7F]*$/;
const cleanCookiePath = /^\/[^\x00-\x1F\;]*$/;

const defaultHeaders = {
  'content-type': always('application/json'),
  'content-security-policy': always('default-src \'none\''),
  'cache-control': always('no-cache, no-store, must-revalidate'),
  'pragma': always('no-cache'),
  'x-content-type-options': always('nosniff'),
  'x-xss-protection': always('1; mode=block'),
  'access-control-expose-headers': always('*, Authorization'),
  'access-control-allow-origin': (r) => {
    return r.headers.origin || '*';
  },
  'access-control-allow-methods': (r) => {
    return r.method === 'options' &&
      (r.headers['access-control-request-method'] || '*');
  },
  'access-control-allow-headers': (r) => {
    return r.method === 'options' &&
      (r.headers['access-control-request-headers'] || '*, Authorization');
  },
  'access-control-max-age': (r) => {
    return r.method === 'options' && '86400';
  }
};

const isAuthorized = (request, config) => {
  const { username, password } = config;
  if (isNilOrEmpty(username) && isNilOrEmpty(password)) { return true; }
  const creds = parseBasicAuthHeader(request.headers.authorization);
  if (!creds) { return false; }
  return toString(username) === creds.username &&
    toString(password) === creds.password;
};

const defaultResponse = (request) => {
  if (request.method === 'options') {
    return { responseCode: 204, body: '' };
  } else {
    return { responseCode: 200, body: '{ "success": true }' };
  }
};

const unauthorizedResponse = () => {
  return { responseCode: 401, body: '{ "error": "Authorization Required" }' };
};

const errorHandler = (request, event, tags) => {
  if (!event.error) { return; }
  // otherwise we get things like 404s, we don't care about that
  if (event.error.isBoom && event.error.output && event.error.output.statusCode < 500) {
    return;
  }

  logger.warn('Problem processing web request');
  return rollbar.error(event.error, request.raw.req, {
    custom: {
      body: request.rawPayload || request.payload,
      event,
      tags
    }
  });
};

const applyResponse = (request, h, response) => {
  if (isNil(response.body)) { response.body = ''; }
  if (Buffer.isBuffer(response.body)) {
    // Sent verbatim as raw bytes - skip JSON/string coercion, which would corrupt binary content.
    // (Buffer instances are `instanceof Object`, so they'd otherwise be caught by the check below.)
  } else {
    if (is(Object, response.body)) {
      response.body = JSON.stringify(response.body);
    }
    response.body = toString(response.body);
  }

  const hapiResponse = h.response(response.body);

  const appliedHeaders = new Set();
  (response.headers || []).forEach((header) => {
    let key = trim(header.key).toLowerCase();
    key = key.replace(cleanHeaderKey, '');
    if (!key) { return; }

    appliedHeaders.add(key);

    // the set-cookie bit allows you to have multiple set cookie headers
    hapiResponse.header(key, toString(header.value), { append: key === 'set-cookie' });
  });

  keys(defaultHeaders).forEach((header) => {
    if (appliedHeaders.has(header)) { return; }
    const value = defaultHeaders[header](request);
    if (value) { hapiResponse.header(header, value); }
  });

  const isSecure = request.headers['x-forwarded-proto'] === 'https';
  (response.cookies || []).forEach((cookie) => {
    if (!cookie.name) { return; }
    if (!cleanCookieName.test(cookie.name)) { return; }
    const cookiePath = cookie.path && cleanCookiePath.test(cookie.path) ? cookie.path : null;
    if (has('value', cookie)) {
      if (!cleanCookieValue.test(cookie.value)) { return; }
      hapiResponse.state(cookie.name, cookie.value, {
        ttl: cookie.ttl || null,
        path: cookiePath,
        domain: request.info.hostname,
        isHttpOnly: true,
        isSameSite: cookie.sameSite || null,
        isSecure,
        encoding: 'none'
      });
    } else {
      hapiResponse.unstate(cookie.name, {
        path: cookiePath,
        domain: request.info.hostname,
        isHttpOnly: true,
        isSameSite: cookie.sameSite || null,
        isSecure,
        encoding: 'none'
      });
    }
  });

  response.responseCode = statusCodeCast({
    statusCode: response.responseCode,
    defaultCode: 200
  });
  hapiResponse.code(response.responseCode);

  return hapiResponse;
};

const triggerConfigsToMap = (requestTriggerConfigs) => {
  const triggerMap = new Map();
  requestTriggerConfigs = RequestTriggerConfigs(requestTriggerConfigs);

  requestTriggerConfigs.forEach((requestTriggerConfig) => {
    if (requestTriggerConfig.triggerId === 'request') { //legacy catch-all key
      triggerMap.set('request', null);
    } else {
      const router = new call.Router();
      try {
        router.add({
          method: requestTriggerConfig.method || '*',
          path: requestTriggerConfig.route || '/{params*}'
        });
        triggerMap.set(requestTriggerConfig.triggerId, router);
      } catch {
        logger.warn(`HTTP Request trigger configuration invalid for triggerId ${requestTriggerConfig.triggerId}`);
      }
    }
  });

  return triggerMap;
};

const Webserver = (webserverConf) => {
  webserverConf = WebserverConf(webserverConf);
  const awaitingReply = new Map();
  let onWebRequest, requestTriggerMap;

  let tls;
  if (!isNilOrEmpty(webserverConf.ssl)) {
    tls = {
      key: webserverConf.ssl.key,
      cert: `${webserverConf.ssl.certificate}\n${webserverConf.ssl.bundle}`
    };
  }

  const server = new Hapi.Server({
    port: webserverConf.port,
    address: webserverConf.address,
    tls
  });

  server.events.on({
    name: 'request',
    channels: ['error', 'internal']
  }, errorHandler);

  const requestHandler = async (request, h) => {
    let response;
    if (isAuthorized(request, webserverConf)) {
      const replyId = nanoid();
      let baseMsg = {
        time: new Date(request.info.received),
        data: {
          replyId,
          path: request.path,
          method: request.method,
          headers: request.headers,
          query: request.query,
          body: request.payload,
          cookies: request.state
        }
      };
      // get rid of any prototypes.
      baseMsg = LJSON.parse(LJSON.stringify(baseMsg));

      const responseDefer = defer();
      awaitingReply.set(replyId, responseDefer.resolve);

      const workflowPromises = [];
      requestTriggerMap.forEach((router, triggerId) => {
        let payload;
        if (!router) {
          payload = baseMsg;
        } else {
          const routeResult = router.route(request.method, request.path);
          if (routeResult.isBoom || !routeResult.route) { return; }
          payload = {
            ...baseMsg,
            data: {
              ...baseMsg.data,
              params: routeResult.params
            }
          };
        }

        workflowPromises.push(
          onWebRequest(FiredTrigger({
            triggerId,
            triggerType: 'request',
            payload
          }))
        );
      });

      // if the workflow promises finish before the responseDefer
      // the workflow won't be giving us a response, so just use the default
      // but give a bit of time in case there is an error workflow that will
      // return something
      response = await Promise.race([
        responseDefer.promise,
        Promise.all(workflowPromises).then(() => pSetTimeout(waitForErrorWorkflowDelay))
      ]);
      awaitingReply.delete(replyId);
    } else {
      response = unauthorizedResponse(request);
    }

    if (isNil(response)) { response = defaultResponse(request); }
    return applyResponse(request, h, response);
  };

  server.route({
    method: ['*'],
    path: '/{path*}',
    handler: requestHandler
  });

  const initialize = async (requestTriggerConfigs, onTriggerFire) => {
    if (onWebRequest) { throw new Error('Initialize has already been called'); }

    onWebRequest = onTriggerFire;
    requestTriggerMap = triggerConfigsToMap(requestTriggerConfigs);

    try {
      if (webserverConf.enabled) {
        await server.start();
        logger.info(`Webserver started on port: ${webserverConf.port}`);
      } else {
        logger.info('Webserver disabled, not starting');
      }
    } catch (e) {
      logger.errorNoRollbar(`${serverStartErrMsg} ${e.name}: ${e.message}`);
    }
  };

  const update = (requestTriggerConfigs) => {
    if (!onWebRequest) { throw new Error('Webserver must be initialized first'); }
    requestTriggerMap = triggerConfigsToMap(requestTriggerConfigs);
  };

  const flowResponse = (replyId, response) => {
    const resolver = awaitingReply.get(replyId);
    if (resolver) { resolver(response); }
  };

  const shutdown = async () => {
    if (webserverConf.enabled) {
      await server.stop();
    }
    onWebRequest = null;
    requestTriggerMap = null;
    awaitingReply.clear();
  };

  return {
    initialize,
    flowResponse,
    shutdown,
    update
  };
};

export default Webserver;
