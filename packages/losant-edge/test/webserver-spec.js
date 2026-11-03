import { nock, restoreEnv } from './common.js';
import axios from 'losant-nodejs-utils/src/axios.js';
import fs from 'fs-extra';
import path from 'node:path';
import { sleep } from 'omnibelt';
import Webserver from '../src/webserver.js';
import FiredTrigger from '../src/types/fired-trigger.js';
import SslConf from '../src/types/ssl-conf.js';

const standardHeaders = {
  'content-type': 'application/json; charset=utf-8',
  'x-content-type-options': 'nosniff',
  'x-xss-protection': '1; mode=block',
  'access-control-expose-headers': '*, Authorization',
  'access-control-allow-origin': '*',
  'content-security-policy': 'default-src \'none\'',
  'cache-control': 'no-cache, no-store, must-revalidate',
  'pragma': 'no-cache',
  'connection': 'close'
};

let webserver;
describe('Edge Webserver', function() {
  restoreEnv('NODE_TLS_REJECT_UNAUTHORIZED');

  beforeEach(() => {
    nock.enableNetConnect('localhost');
  });

  afterEach(async () => {
    if (webserver) {
      await webserver.shutdown();
      webserver = null;
    }
  });

  it('should respond, default response', async () => {
    const triggers = [];
    webserver = Webserver({ port: 45454 });
    await webserver.initialize([{ triggerId: 'request' }], async (triggerFire) => {
      triggers.push(triggerFire);
      await sleep(0);
    });

    const response = await axios({
      method: 'get',
      url: 'http://localhost:45454/my/test/url?hi=bye',
      headers: {
        'Accept-Encoding': false
      }
    });
    triggers.length.should.equal(1);
    triggers[0].should.deepEqual(FiredTrigger({
      triggerId: 'request',
      triggerType: 'request',
      payload: {
        time: triggers[0].payload.time,
        data: {
          replyId: triggers[0].payload.data.replyId,
          path: '/my/test/url',
          method: 'get',
          headers: {
            'accept': 'application/json, text/plain, */*',
            'user-agent': triggers[0].payload.data.headers['user-agent'],
            'host': 'localhost:45454',
            'connection': 'close'
          },
          query: { hi: 'bye' },
          body: undefined,
          cookies: {}
        }
      }
    }));

    response.status.should.deepEqual(200);
    response.data.should.deepEqual({ success: true });
    ({ ...(response.headers.toJSON()) }).should.deepEqual({
      ...standardHeaders,
      'content-length': '19',
      'accept-ranges': 'bytes',
      'date': response.headers.date
    });
  });

  it('should fire multiple triggers', async () => {
    const triggers = [];
    webserver = Webserver({ port: 45454 });
    await webserver.initialize([
      { triggerId: 'request' },
      { triggerId: 'one', method: '*', route: '/{foo}/{bar}' },
      { triggerId: 'two', method: 'get', route: '/what/{blah}' }
    ], async (triggerFire) => {
      triggers.push(triggerFire);
      await sleep(0);
    });

    let response = await axios({
      method: 'get',
      url: 'http://localhost:45454/what/hello',
      headers: {
        'Accept-Encoding': false
      }
    });

    const commonData = {
      replyId: triggers[0].payload.data.replyId,
      path: '/what/hello',
      method: 'get',
      headers: {
        'accept': 'application/json, text/plain, */*',
        'user-agent': triggers[0].payload.data.headers['user-agent'],
        'host': 'localhost:45454',
        'connection': 'close'
      },
      query: {},
      body: undefined,
      cookies: {}
    };

    triggers.should.deepEqual([
      FiredTrigger({
        triggerId: 'request',
        triggerType: 'request',
        payload: {
          time: triggers[0].payload.time,
          data: commonData
        }
      }),
      FiredTrigger({
        triggerId: 'one',
        triggerType: 'request',
        payload: {
          time: triggers[0].payload.time,
          data: {
            ...commonData,
            params: {
              foo: 'what',
              bar: 'hello'
            }
          }
        }
      }),
      FiredTrigger({
        triggerId: 'two',
        triggerType: 'request',
        payload: {
          time: triggers[0].payload.time,
          data: {
            ...commonData,
            params: {
              blah: 'hello'
            }
          }
        }
      })
    ]);

    response.status.should.deepEqual(200);
    response.data.should.deepEqual({ success: true });
    ({ ...(response.headers.toJSON()) }).should.deepEqual({
      ...standardHeaders,
      'content-length': '19',
      'accept-ranges': 'bytes',
      'date': response.headers.date
    });

    triggers.length = 0;

    await webserver.update([
      { triggerId: 'one', method: '*', route: '/{foo}/{bar}' },
      { triggerId: 'two', method: 'post', route: '/what/{blah}' }
    ]);

    response = await axios({
      method: 'get',
      url: 'http://localhost:45454/what/aaaa',
      headers: {
        'Accept-Encoding': false
      }
    });

    triggers.should.deepEqual([
      FiredTrigger({
        triggerId: 'one',
        triggerType: 'request',
        payload: {
          time: triggers[0].payload.time,
          data: {
            replyId: triggers[0].payload.data.replyId,
            path: '/what/aaaa',
            method: 'get',
            headers: {
              'accept': 'application/json, text/plain, */*',
              'user-agent': triggers[0].payload.data.headers['user-agent'],
              'host': 'localhost:45454',
              'connection': 'close'
            },
            query: {},
            body: undefined,
            cookies: {},
            params: {
              foo: 'what',
              bar: 'aaaa'
            }
          }
        }
      })
    ]);

    response.status.should.deepEqual(200);
    response.data.should.deepEqual({ success: true });
    ({ ...(response.headers.toJSON()) }).should.deepEqual({
      ...standardHeaders,
      'content-length': '19',
      'accept-ranges': 'bytes',
      'date': response.headers.date
    });
  });

  it('should respond, workflow response', async () => {
    const triggers = [];
    webserver = Webserver({ port: 45454 });
    let expireDate;
    await webserver.initialize([{ triggerId: 'request' }], async (triggerFire) => {
      triggers.push(triggerFire);
      await sleep(0);
      setTimeout(() => {
        webserver.flowResponse(triggerFire.payload.data.replyId, {
          body: '1',
          headers: [{ key: 'oneRspId', value: 'twoRspId' }],
          responseCode: 222,
          cookies: [{ name: 'oneRspId', value: 'twoRspId', ttl: 1, path: '/hello' }]
        });
        expireDate = (new Date(Date.now() + 1)).toGMTString();
      }, 100);
    });

    const response = await axios({
      url: 'http://localhost:45454/what',
      method: 'post',
      data: { blah: 'blah' },
      headers: {
        'Accept-Encoding': false
      }
    });

    triggers.should.deepEqual([FiredTrigger({
      triggerId: 'request',
      triggerType: 'request',
      payload: {
        time: triggers[0].payload.time,
        data: {
          replyId: triggers[0].payload.data.replyId,
          path: '/what',
          method: 'post',
          headers: {
            'accept': 'application/json, text/plain, */*',
            'content-type': 'application/json',
            'user-agent': triggers[0].payload.data.headers['user-agent'],
            'content-length': '15',
            'host': 'localhost:45454',
            'connection': 'close'
          },
          query: {},
          body: { blah: 'blah' },
          cookies: {}
        }
      }
    })]);

    response.status.should.deepEqual(222);
    response.data.should.deepEqual(1);
    ({ ...(response.headers.toJSON()) }).should.deepEqual({
      ...standardHeaders,
      'onerspid': 'twoRspId',
      'set-cookie': [
        `oneRspId=twoRspId; Max-Age=0; Expires=${expireDate}; HttpOnly; Domain=localhost; Path=/hello`
      ],
      'content-length': '1',
      'date': response.headers.date
    });
  });

  it('should error with bad basic auth', async () => {
    webserver = Webserver({
      port: 45455,
      username: 'user',
      password: 'pass'
    });
    await webserver.initialize([{ triggerId: 'request' }], () => {
      throw new Error('should not get here');
    });

    let response;
    try {
      response = await axios({
        method: 'get',
        url: 'http://localhost:45455/?hi=bye'
      });
    } catch (e) { response = e.response; }

    response.status.should.deepEqual(401);
    response.data.should.deepEqual({ error: 'Authorization Required' });
    ({ ...(response.headers.toJSON()) }).should.deepEqual({
      ...standardHeaders,
      'content-length': '37',
      'date': response.headers.date
    });
  });

  it('should succeed with good basic auth (and also test cors response)', async () => {
    const triggers = [];
    webserver = Webserver({
      port: 45456,
      username: 'user',
      password: 'pass'
    });
    await webserver.initialize([{ triggerId: 'request' }], async (triggerFire) => {
      triggers.push(triggerFire);
      await sleep(0);
    });

    const response = await axios({
      url: 'http://localhost:45456/?hi=bye',
      method: 'options',
      auth: { username: 'user', password: 'pass' },
      headers: {
        'Accept-Encoding': false
      }
    });

    response.status.should.deepEqual(204);
    response.data.should.equal('');
    ({ ...(response.headers.toJSON()) }).should.deepEqual({
      ...standardHeaders,
      'access-control-max-age': '86400',
      'access-control-allow-methods': '*',
      'access-control-allow-headers': '*, Authorization',
      'date': response.headers.date,
      'vary': 'accept-encoding'
    });
  });

  it('should succeed with webserver with SSL', async () => {
    const sslConf = await SslConf.resolveAndValidate({
      key: await fs.readFile(path.resolve(import.meta.dirname, '__fixtures__', 'fake-ssl.key')),
      certificatePath: path.resolve(import.meta.dirname, '__fixtures__', 'fake-ssl.crt')
    });

    const triggers = [];
    webserver = Webserver({
      port: 45454,
      ssl: sslConf
    });

    await webserver.initialize([{ triggerId: 'request' }], async (triggerFire) => {
      triggers.push(triggerFire);
      await sleep(0);
    });

    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

    const response = await axios({
      method: 'get',
      url: 'https://localhost:45454/my/test/url?hi=SSL',
      headers: {
        'Accept-Encoding': false
      }
    });

    triggers.should.deepEqual([FiredTrigger({
      triggerId: 'request',
      triggerType: 'request',
      payload: {
        time: triggers[0].payload.time,
        data: {
          replyId: triggers[0].payload.data.replyId,
          path: '/my/test/url',
          method: 'get',
          headers: {
            'accept': 'application/json, text/plain, */*',
            'user-agent': triggers[0].payload.data.headers['user-agent'],
            'host': 'localhost:45454',
            'connection': 'close'
          },
          query: { hi: 'SSL' },
          body: undefined,
          cookies: {}
        }
      }
    })]);

    response.status.should.deepEqual(200);
    response.data.should.deepEqual({ success: true });
    ({ ...(response.headers.toJSON()) }).should.deepEqual({
      ...standardHeaders,
      'content-length': '19',
      'accept-ranges': 'bytes',
      'date': response.headers.date
    });
  });

});
