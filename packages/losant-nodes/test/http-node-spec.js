import { nock, contextify, protectedDiskUtils } from './common.js';
import HttpNode from '../src/http-node.js';
import https from 'https';
import { defer } from 'omnibelt';
import fs from 'node:fs';
import path from 'node:path';
import {
  fakeServerKey,
  fakeServerCert,
  fakeClientKey,
  fakeClientCert,
  fakeCaCert
} from './__fixtures__/fake-keys.js';

const DEFAULT_CONTEXT = {
  externalTimeout: 30000,
  flowId: 'abc'
};

describe('HttpNode', () => {
  describe('writing to local path', () => {
    const localFile = './foo.txt';
    afterEach(() => {
      fs.rmSync(localFile, { force: true });
    });

    it('should send a request with a body from a local file', async () => {
      fs.writeFileSync(localFile, 'I\'m a hex string!');
      nock(
        'http://www.example.com',
        { reqheaders: { Header: 'Header' } }
      ).post( '/post', (body) => {
        body.should.equal('49276d20612068657820737472696e6721');
        return true;
      }).reply(201);

      const result = await new HttpNode('id', [[4]], {
        method: 'POST',
        uriTemplate: 'http://www.example.com/post',
        headerInfo: [
          { key: 'Header', valueTemplate: 'Header' }
        ],
        bodyType: 'diskPath',
        bodyTemplate: localFile,
        responsePath: 'data.resp',
        requestEncodingTemplate: 'hex'
      }).run(contextify(DEFAULT_CONTEXT), {});
      result.should.deepEqual([
        [[4]],
        {
          data: {
            resp: {
              requestDuration: result[1].data.resp.requestDuration,
              statusCode: 201,
              headers: {},
              body: '',
              request: {
                method: 'POST',
                uri: 'http://www.example.com/post',
                strictSSL: true,
                headers: {
                  'Header': 'Header',
                  'User-Agent': 'LosantWorkflow/abc'
                },
                bodyDiskPath: path.resolve(localFile)
              }
            }
          }
        }
      ]);
    });

    it('should fail when bodyTemplate is inside protected Losant directory', async () => {
      fs.writeFileSync(localFile, 'test');
      const node = new HttpNode('id', [[4]], {
        method: 'POST',
        uriTemplate: 'http://www.example.com/post',
        bodyType: 'diskPath',
        bodyTemplate: localFile,
        responsePath: 'data.resp'
      });
      await node.run(contextify({
        ...DEFAULT_CONTEXT,
        diskUtils: protectedDiskUtils
      }), {}).should.be.rejectedWith({ message: 'Cannot access within the protected Losant Edge Agent directory.' });
    });

    it('should fail when bodyTemplate is a dangling symlink', async () => {
      const danglingLink = './http-read-dangling-link.txt';
      await fs.promises.symlink('./nonexistent-target.txt', danglingLink);
      try {
        const node = new HttpNode('id', [[4]], {
          method: 'POST',
          uriTemplate: 'http://www.example.com/post',
          bodyType: 'diskPath',
          bodyTemplate: danglingLink,
          responsePath: 'data.resp'
        });
        await node.run(contextify(DEFAULT_CONTEXT), {})
          .should.be.rejectedWith({ message: `No file exists at "${danglingLink}"` });
      } finally {
        await fs.promises.rm(danglingLink, { force: true });
      }
    });

    it('should write a response to a local file', async () => {
      const bodyResponse = 'My response body to be written to disk';
      nock(
        'http://www.example.com',
        { reqheaders: { Header: 'Header' } }
      ).get('/get').reply(200, bodyResponse);
      const result = await new HttpNode('id', [[4]], {
        method: 'GET',
        uriTemplate: 'http://www.example.com/get',
        headerInfo: [
          { key: 'Header', valueTemplate: 'Header' }
        ],
        diskPathTemplate: localFile,
        responsePath: 'data.resp'
      }).run(contextify(DEFAULT_CONTEXT), {});
      result.should.deepEqual([
        [[4]],
        {
          data: {
            resp: {
              body: path.resolve(localFile),
              requestDuration: result[1].data.resp.requestDuration,
              statusCode: 200,
              headers: {},
              request: {
                method: 'GET',
                uri: 'http://www.example.com/get',
                strictSSL: true,
                headers: {
                  'Header': 'Header',
                  'User-Agent': 'LosantWorkflow/abc'
                }
              }
            }
          }
        }
      ]);
      (fs.readFileSync(localFile, { encoding: 'utf8' })).should.deepEqual(bodyResponse);
    });

    it('should fail when diskPathTemplate is inside protected Losant directory', async () => {
      const node = new HttpNode('id', [[4]], {
        method: 'GET',
        uriTemplate: 'http://www.example.com/get',
        diskPathTemplate: localFile,
        responsePath: 'data.resp'
      });
      await node.run(contextify({
        ...DEFAULT_CONTEXT,
        diskUtils: protectedDiskUtils
      }), {}).should.be.rejectedWith({ message: 'Cannot access within the protected Losant Edge Agent directory.' });
    });

    it('should fail when diskPathTemplate is a dangling symlink', async () => {
      const danglingLink = './http-write-dangling-link.txt';
      await fs.promises.symlink('./nonexistent-target.txt', danglingLink);
      try {
        const node = new HttpNode('id', [[4]], {
          method: 'GET',
          uriTemplate: 'http://www.example.com/get',
          diskPathTemplate: danglingLink,
          responsePath: 'data.resp'
        });
        await node.run(contextify(DEFAULT_CONTEXT), {})
          .should.be.rejectedWith({ message: 'The provided disk path is a symlink with no valid target.' });
      } finally {
        await fs.promises.rm(danglingLink, { force: true });
      }
    });
  });
  it('should send http request correctly', () => {
    nock('http://www.example.com', { reqheaders: { 'Header1': 'z-1', 'Header2': '1-y', 'ACCEPT-ENCODING': 'foo' } })
      .post('/z?key=y', (body) => {
        body.should.deepEqual(['z', 'y']);
        return true;
      }).reply(201, '{ "ok": true, "foo": { "$undefined": true } }', { 'X-My-Headers': 'My Header value' });

    return new HttpNode('id', [[4]], {
      method: 'POST',
      responsePath: 'a.b',
      uriTemplate: 'http://www.example.com/{{attr.a}}?key={{attr.b}}',
      bodyTemplate: '["{{attr.a}}", "{{attr.b}}"]',
      headerInfo: [
        { key: 'Header1', valueTemplate: '{{attr.a}}-1' },
        { key: 'Header2', valueTemplate: '1-{{attr.b}}' },
        { key: 'ACCEPT-ENCODING', valueTemplate: 'foo' }
      ],
      encodingTemplate: '{{encodeWith}}'
    }).run({ externalTimeout: 15000, flowId: 'abc' }, { attr: { a: 'z', b: 'y' }, encodeWith: 'utf8' })
      .then(([oids, p]) => {
        oids.should.deepEqual([[4]]);
        p.should.deepEqual({
          attr: { a: 'z', b: 'y' },
          encodeWith: 'utf8',
          a: {
            b: {
              body: { ok: true, foo: undefined },
              headers: { 'x-my-headers': 'My Header value' },
              statusCode: 201,
              requestDuration: p.a.b.requestDuration,
              request: {

                body: ['z', 'y'],
                headers: {
                  'Header1': 'z-1',
                  'Header2': '1-y',
                  'Content-Length': 10,
                  'User-Agent': 'LosantWorkflow/abc',
                  'ACCEPT-ENCODING': 'foo'
                },
                method: 'POST',
                strictSSL: true,
                uri: 'http://www.example.com/z?key=y'
              }
            }
          }
        });
      });
  });

  it('should send a request with custom body encoding', async () => {
    nock(
      'http://www.example.com',
      { reqheaders: { Header: 'Header' } }
    ).post('/post', "I'm a hex string!").reply(201);

    const result = await new HttpNode('id', [[4]], {
      method: 'POST',
      uriTemplate: 'http://www.example.com/post',
      headerInfo: [
        { key: 'Header', valueTemplate: 'Header' }
      ],
      bodyTemplate: '49276d20612068657820737472696e6721',
      responsePath: 'data.resp',
      requestEncodingTemplate: 'hex'
    }).run(DEFAULT_CONTEXT, {});
    result.should.deepEqual([
      [[4]],
      {
        data: {
          resp: {
            requestDuration: result[1].data.resp.requestDuration,
            statusCode: 201,
            headers: {},
            body: '',
            request: {
              method: 'POST',
              uri: 'http://www.example.com/post',
              strictSSL: true,
              headers: {
                'Header': 'Header',
                'Content-Length': 17,
                'User-Agent': 'LosantWorkflow/abc'
              },
              body: '49276d20612068657820737472696e6721'
            }
          }
        }
      }
    ]);
  });

  it('should validate IPV6 uri templates', async () => {
    const node = new HttpNode('id', [[4]], {
      method: 'GET',
      uriTemplate: 'http://[::1]/post',
      headerInfo: [
        { key: 'Header', valueTemplate: 'Header' }
      ],
      bodyTemplate: '49276d20612068657820737472696e6721',
      responsePath: 'data.resp',
      requestEncodingTemplate: 'hex'
    });
    const result = await node.run(DEFAULT_CONTEXT, {}).catch((e) => {
      return e;
    });
    result.message.should.equal('Nock: Disallowed net connect for "::1:80/post"');
  });

  it('should error on bad protocol', () => {
    return new HttpNode('id', [[4]], {
      method: 'POST',
      responsePath: 'a.b',
      uriTemplate: 'mqtt://whatnotaurl'
    }).run(DEFAULT_CONTEXT, {})
      .should.be.rejectedWith('Invalid URL (protocol must be http:, https:): mqtt://whatnotaurl');
  });

  it('should error on bad hex request body', () => {
    return new HttpNode('id', [[4]], {
      method: 'POST',
      responsePath: 'a.b',
      uriTemplate: 'http://www.example.com/post',
      requestEncodingTemplate: 'hex',
      bodyTemplate: 'notHex'
    }).run(DEFAULT_CONTEXT, {})
      .should.be.rejectedWith('Invalid hexadecimal string.');
  });

  it('should error on bad base64 request body', () => {
    return new HttpNode('id', [[4]], {
      method: 'POST',
      responsePath: 'a.b',
      uriTemplate: 'http://www.example.com/post',
      requestEncodingTemplate: 'base64',
      bodyTemplate: 'notBase64'
    }).run(DEFAULT_CONTEXT, {})
      .should.be.rejectedWith('Invalid base64 string.');
  });

  it('should error on bad urls', () => {
    return new HttpNode('id', [[4]], {
      method: 'POST',
      responsePath: 'a.b',
      errorBehavior: 'payloadPath',
      errorPath: 'problem',
      uriTemplate: 'https://'
    }).run(DEFAULT_CONTEXT, {})
      .should.be.fulfilledWith([
        [[4]],
        {
          problem: {
            error: {
              name: 'ValidationError',
              message: 'Invalid URL: https://'
            },
            request: {
              headers: {
                'User-Agent': 'LosantWorkflow/abc'
              },
              method: 'POST',
              strictSSL: true,
              timeout: 30000,
              uri: 'https://'
            }
          }
        }
      ]);
  });

  // SSRF coverage for this node lives in losant-workers' http-node-spec.js. This package
  // ships no network-access policy, so there is nothing here to block a private IP with.

  it('should yell about unknown error behavior directives', () => {
    return new HttpNode('id', [[4]], {
      method: 'POST',
      errorBehavior: 'not a thing',
      uriTemplate: 'http://www.example.com'
    }).run(DEFAULT_CONTEXT, {})
      .should.be.rejectedWith(/Invalid errorBehavior "not a thing"/);
  });

  it('should allow for an empty `errorPath`', () => {
    nock('http://www.example.com', {})
      .get('/')
      .replyWithError('some error');

    return new HttpNode('id', [[4]], {
      method: 'GET',
      errorBehavior: 'payloadPath',
      uriTemplate: 'http://www.example.com'
    }).run(DEFAULT_CONTEXT, { a: 'a' })
      .should.be.fulfilledWith([
        [[4]],
        { a: 'a' }
      ]);
  });

  it('should allow for configurable timeout', async () => {
    nock('http://www.example.com', {})
      .get('/500')
      .delay(1500)
      .reply(200, 'hello');
    nock('http://www.example.com', {})
      .get('/')
      .delay(250)
      .reply(200, 'hello');

    await new HttpNode('id', [[4]], {
      method: 'GET',
      responsePath: 'a.b',
      errorBehavior: 'throw',
      uriTemplate: 'http://www.example.com/500',
      timeoutTemplate: '{{timeout}}'
    }).run(DEFAULT_CONTEXT, { timeout: 1 })
      .should.be.rejectedWith(Error, {
        name: 'NodeTimeoutError',
        message: 'Timeout running HTTP node'
      });

    const shouldSucceed = await new HttpNode('id', [[4]], {
      method: 'GET',
      responsePath: 'a',
      errorBehavior: 'throw',
      uriTemplate: 'http://www.example.com/',
      timeoutTemplate: 5 // NOTE: Also tests that timeout is being treated as seconds
    }).run(DEFAULT_CONTEXT, {});
    shouldSucceed.should.deepEqual([
      [[4]],
      {
        a: {
          requestDuration: shouldSucceed[1].a.requestDuration,
          body: 'hello',
          headers: {},
          statusCode: 200,
          request: {
            headers: {
              'User-Agent': 'LosantWorkflow/abc'
            },
            method: 'GET',
            strictSSL: true,
            uri: 'http://www.example.com/'
          }
        }
      }
    ]);
  });

  it('should allow for configurable timeout', async () => {
    nock.enableNetConnect('example.com');
    const time = Date.now();
    const shouldTimeout = new HttpNode('id', [[4]], {
      method: 'GET',
      responsePath: 'a.b',
      errorBehavior: 'throw',
      uriTemplate: 'https://example.com:81',
      timeoutTemplate: '{{timeout}}'
    }).run(DEFAULT_CONTEXT, { timeout: 1 })
      .should.be.rejectedWith(Error, {
        name: 'NodeTimeoutError',
        message: 'Timeout running HTTP node'
      });
    await shouldTimeout;
    const postTime = Date.now();
    (postTime - time).should.be.belowOrEqual(2000);
  });

  it('should fallback on `externalTimeout` when `timeoutTemplate` is too large', () => {
    nock('http://www.example.com', {})
      .get('/500')
      .delay(500)
      .reply(200, 'hello');

    return new HttpNode('id', [[4]], {
      method: 'GET',
      responsePath: 'a.b',
      errorBehavior: 'throw',
      uriTemplate: 'http://www.example.com/500',
      timeoutTemplate: '{{ timeout }}'
    }).run({ externalTimeout: 250 }, { timeout: 30000 })
      .should.be.rejectedWith(Error, {
        name: 'NodeTimeoutError',
        message: 'Timeout running HTTP node'
      });
  });

  it('should fallback on `externalTimeout` when `timeoutTemplate` is missing', () => {
    nock('http://www.example.com', {})
      .get('/500')
      .delay(500)
      .reply(200, 'hello');

    return new HttpNode('id', [[4]], {
      method: 'GET',
      responsePath: 'a.b',
      errorBehavior: 'throw',
      uriTemplate: 'http://www.example.com/500'
    }).run({ externalTimeout: 250 }, {})
      .should.be.rejectedWith(Error, {
        name: 'NodeTimeoutError',
        message: 'Timeout running HTTP node'
      });
  });

  it('[errorBehavior=throw] should throw error on HTTP request has error', () => {
    nock('http://www.example.com', {})
      .post('/error')
      .replyWithError('some error');

    return new HttpNode('id', [[4]], {
      method: 'POST',
      responsePath: 'a.b',
      errorBehavior: 'throw',
      uriTemplate: 'http://www.example.com/error'
    }).run(DEFAULT_CONTEXT, {})
      .should.be.rejectedWith(Error, {
        name: 'HttpError',
        message: 'some error'
      });
  });

  it('[errorBehavior=payloadPath] should put HTTP error at payload path: string', () => {
    nock('http://www.example.com', {})
      .post('/error')
      .replyWithError('danger will robinson');

    return new HttpNode('id', [[4]], {
      method: 'POST',
      errorBehavior: 'payloadPath',
      errorPath: 'a',
      bodyTemplate: 'abody',
      uriTemplate: 'http://www.example.com/error'
    }).run(DEFAULT_CONTEXT, {})
      .should.be.fulfilledWith([
        [[4]],
        {
          a: {
            error: {
              name: 'HttpError',
              message: 'danger will robinson'
            },
            request: {
              headers: {
                'User-Agent': 'LosantWorkflow/abc'
              },
              body: 'abody',
              method: 'POST',
              strictSSL: true,
              timeout: 30000,
              uri: 'http://www.example.com/error'
            }

          }
        }
      ]);
  });

  it('[errorBehavior=payloadPath] should put HTTP error at payload path: stringified object', () => {
    nock('http://www.example.com', {})
      .post('/error')
      .replyWithError('{ "problem": "danger will robinson" }');

    return new HttpNode('id', [[4]], {
      method: 'POST',
      errorBehavior: 'payloadPath',
      errorPath: 'a',
      uriTemplate: 'http://www.example.com/error'
    }).run(DEFAULT_CONTEXT, {})
      .should.be.fulfilledWith([
        [[4]],
        {
          a: {
            error: {
              name: 'HttpError',
              message: {
                problem: 'danger will robinson'
              }
            },
            request: {
              headers: {
                'User-Agent': 'LosantWorkflow/abc'
              },
              method: 'POST',
              strictSSL: true,
              timeout: 30000,
              uri: 'http://www.example.com/error'
            }
          }
        }
      ]);
  });

  it('[errorBehavior=payloadPath] should put HTTP timeout error at error path', () => {
    nock('http://www.example.com', {})
      .get('/timeout')
      .delay(1500)
      .reply(200, 'hello');

    return new HttpNode('id', [[4]], {
      method: 'GET',
      errorBehavior: 'payloadPath',
      errorPath: 'a',
      timeoutTemplate: 1,
      uriTemplate: 'http://www.example.com/timeout'
    }).run(DEFAULT_CONTEXT, {})
      .should.be.fulfilledWith([
        [[4]],
        {
          a: {
            error: {
              message: 'Timeout running HTTP node',
              name: 'NodeTimeoutError'
            },
            request: {
              headers: {
                'User-Agent': 'LosantWorkflow/abc'
              },
              method: 'GET',
              strictSSL: true,
              timeout: 1000,
              uri: 'http://www.example.com/timeout'
            }
          }
        }
      ]);
  });

  // uses actual network connection to https://badssl.com/
  it('should work correctly with TLS 1.0', async () => {
    nock.enableNetConnect('tls-v1-0.badssl.com');

    const result = await(new HttpNode('id', [[4]], {
      method: 'GET',
      errorBehavior: 'payloadPath',
      errorPath: 'a',
      responsePath: 'b',
      uriTemplate: 'https://tls-v1-0.badssl.com:1010/'
    }).run(DEFAULT_CONTEXT, {}));

    result[1].b.statusCode.should.equal(200);
  });

  it('should have request information on `responsePath`', async () => {
    nock(
      'http://www.example.com',
      { reqheaders: { Header: 'Header' } }
    )
      .post('/post')
      .query({ query: 'foo' })
      .reply(201, '{"qux": 5}');

    const result = await new HttpNode('id', [[4]], {
      method: 'POST',
      uriTemplate: 'http://www.example.com/post?query=foo',
      headerInfo: [
        { key: 'Header', valueTemplate: 'Header' }
      ],
      bodyTemplate: '{ "bar": "bar" }',
      responsePath: 'data.resp'
    }).run(DEFAULT_CONTEXT, {});
    result.should.be.deepEqual([
      [[4]],
      {
        data: {
          resp: {
            requestDuration: result[1].data.resp.requestDuration,
            statusCode: 201,
            headers: {},
            body: {
              qux: 5
            },
            request: {
              method: 'POST',
              uri: 'http://www.example.com/post?query=foo',
              strictSSL: true,
              headers: {
                'Header': 'Header',
                'Content-Length': 16,
                'User-Agent': 'LosantWorkflow/abc'
              },
              body: {
                bar: 'bar'
              }
            }
          }
        }
      }
    ]);
  });

  it('should have request information on `errorPath` for validation errors', () => {
    return new HttpNode('id', [[4]], {
      method: 'POST',
      uriTemplate: 'mqtt://www.example.com',
      errorBehavior: 'payloadPath',
      errorPath: 'data.resp'
    }).run(DEFAULT_CONTEXT, {})
      .should.be.fulfilledWith([
        [[4]],
        {
          data: {
            resp: {
              error: {
                message: 'Invalid URL (protocol must be http:, https:): mqtt://www.example.com',
                name: 'ValidationError'
              },
              request: {
                method: 'POST',
                uri: 'mqtt://www.example.com',
                headers: {
                  'User-Agent': 'LosantWorkflow/abc'
                },
                strictSSL: true,
                timeout: 30000
              }
            }
          }
        }
      ]);
  });

  it('should have request information on `errorPath` for timeout errors', () => {
    nock(
      'http://www.example.com',
      { reqheaders: { Header: 'Header' } }
    )
      .get('/')
      .delay(1500)
      .reply(200, 'hello');

    return new HttpNode('id', [[4]], {
      method: 'GET',
      uriTemplate: 'http://www.example.com/',
      headerInfo: [
        { key: 'Header', valueTemplate: 'Header' }
      ],
      timeoutTemplate: 1,
      errorBehavior: 'payloadPath',
      errorPath: 'data.resp'
    }).run(DEFAULT_CONTEXT, {})
      .should.be.fulfilledWith([
        [[4]],
        {
          data: {
            resp: {
              error: {
                name: 'NodeTimeoutError',
                message: 'Timeout running HTTP node'
              },
              request: {
                method: 'GET',
                uri: 'http://www.example.com/',
                headers: {
                  'Header': 'Header',
                  'User-Agent': 'LosantWorkflow/abc'
                },
                strictSSL: true,
                timeout: 1000
              }
            }
          }
        }
      ]);
  });

  it('should successfully return request if only username and password Basic Auth creds provided', async () => {
    nock(
      'http://www.example.com',
      {
        reqHeaders: {
          Authorization: 'Basic foo:bar'
        }
      })
      .get('/')
      .reply(200, 'hello');

    const result = await new HttpNode('id', [[4]], {
      method: 'GET',
      uriTemplate: 'http://www.example.com/',
      authType: 'basic',
      authCredentials: {
        usernameTemplate: 'foo'
      },
      responsePath: 'data'
    }).run(DEFAULT_CONTEXT, {});
    result.should.deepEqual(
      [[[4]], {
        data: {
          requestDuration: result[1].data.requestDuration,
          body: 'hello',
          headers: {},
          request: {
            headers: {
              'Authorization': 'Basic Zm9vOg==',
              'User-Agent': 'LosantWorkflow/abc'
            },
            method: 'GET',
            strictSSL: true,
            uri: 'http://www.example.com/'
          },
          statusCode: 200
        }
      }]);
  });

  it('should successfully return request if only password Basic Auth creds provided', async () => {
    nock(
      'http://www.example.com',
      {
        reqHeaders: {
          Authorization: 'Basic foo:bar'
        }
      })
      .get('/')
      .reply(200, 'hello');

    const result = await new HttpNode('id', [[4]], {
      method: 'GET',
      uriTemplate: 'http://www.example.com/',
      authType: 'basic',
      authCredentials: {
        passwordTemplate: 'bar'
      },
      responsePath: 'data'
    }).run(DEFAULT_CONTEXT, {});
    result.should.be.deepEqual(
      [[[4]], {
        data: {
          requestDuration: result[1].data.requestDuration,
          body: 'hello',
          headers: {},
          request: {
            headers: {
              'Authorization': 'Basic OmJhcg==',
              'User-Agent': 'LosantWorkflow/abc'
            },
            method: 'GET',
            strictSSL: true,
            uri: 'http://www.example.com/'
          },
          statusCode: 200
        }
      }]);
  });

  it('should successfully return request if username and password Basic Auth creds provided', async () => {
    nock(
      'http://www.example.com',
      {
        reqHeaders: {
          Authorization: 'Basic foo:bar'
        }
      })
      .get('/')
      .reply(200, 'hello');

    const result = await new HttpNode('id', [[4]], {
      method: 'GET',
      uriTemplate: 'http://www.example.com/',
      authType: 'basic',
      authCredentials: {
        usernameTemplate: 'foo',
        passwordTemplate: 'bar'
      },
      responsePath: 'data'
    }).run(DEFAULT_CONTEXT, {});
    result.should.deepEqual(
      [[[4]], {
        data: {
          requestDuration: result[1].data.requestDuration,
          body: 'hello',
          headers: {},
          request: {
            headers: {
              'Authorization': 'Basic Zm9vOmJhcg==',
              'User-Agent': 'LosantWorkflow/abc'
            },
            method: 'GET',
            strictSSL: true,
            uri: 'http://www.example.com/'
          },
          statusCode: 200
        }
      }]);
  });

  it('should successfully work for multipart form data', async () => {
    const scope = nock('http://www.example.com')
      .post('/')
      .reply(200, 'hello');

    let boundary, reqBody;
    scope.on('request', (req, interceptor, body) => {
      boundary = req.options.headers['content-type'].split('=')[1];
      reqBody = body;
    });

    const node = new HttpNode('id', [[4]], {
      method: 'POST',
      uriTemplate: 'http://www.example.com/',
      bodyFields: [
        { keyTemplate: '{{a}}', valueTemplate: '{{b}}' },
        { keyTemplate: '{{c}}', valueTemplate: '{{d}}' },
        { keyTemplate: '{{e}}', valueTemplate: '{{f}}' }
      ],
      bodyType: 'multipart',
      responsePath: 'data'
    });
    const result = await node.run(DEFAULT_CONTEXT, { a: 1, b: 2, c: 3, d: [4, 5] });

    reqBody.should.equal(`--${boundary}\r\nContent-Disposition: form-data; name="1"\r\n\r\n2\r\n--${boundary}\r\nContent-Disposition: form-data; name="3"\r\n\r\n[4,5]\r\n--${boundary}--\r\n`);
    result.should.deepEqual(
      [[[4]], {
        a: 1,
        b: 2,
        c: 3,
        d: [4, 5],
        data: {
          requestDuration: result[1].data.requestDuration,
          body: 'hello',
          headers: {},
          request: {
            body: reqBody,
            headers: {
              'Content-Length': 262,
              'Content-Type': `multipart/form-data; boundary=${boundary}`,
              'User-Agent': 'LosantWorkflow/abc'
            },
            method: 'POST',
            strictSSL: true,
            uri: 'http://www.example.com/'
          },
          statusCode: 200
        }
      }]);
  });

  it('should successfully work for urlencoded form data', async () => {
    nock('http://www.example.com', {
      reqHeaders: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8'
      }
    })
      .post('/', '1=2&3%5B0%5D=4&3%5B1%5D=5')
      .reply(200, 'hello');

    const node = new HttpNode('id', [[4]], {
      method: 'POST',
      uriTemplate: 'http://www.example.com/',
      bodyFields: [
        { keyTemplate: '{{a}}', valueTemplate: '{{b}}' },
        { keyTemplate: '{{c}}', valueTemplate: '{{d}}' },
        { keyTemplate: '{{e}}', valueTemplate: '{{f}}' }
      ],
      bodyType: 'urlencoded',
      responsePath: 'data'
    });
    const result = await node.run(DEFAULT_CONTEXT, { a: 1, b: 2, c: 3, d: [4, 5] });

    result.should.deepEqual(
      [[[4]], {
        a: 1,
        b: 2,
        c: 3,
        d: [4, 5],
        data: {
          requestDuration: result[1].data.requestDuration,
          body: 'hello',
          headers: {},
          request: {
            body: '1=2&3%5B0%5D=4&3%5B1%5D=5',
            headers: {
              'Content-Length': 25,
              'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
              'User-Agent': 'LosantWorkflow/abc'
            },
            method: 'POST',
            strictSSL: true,
            uri: 'http://www.example.com/'
          },
          statusCode: 200
        }
      }]);
  });

  it('should successfully work for urlencoded form data with duplicate keys', async () => {
    let receivedBody;
    nock('http://www.example.com', {
      reqHeaders: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' }
    })
      .post('/', (body) => {
        receivedBody = { ...body };
        return true;
      })
      .reply(200, 'hello');

    const node = new HttpNode('id', [[4]], {
      method: 'POST',
      uriTemplate: 'http://www.example.com/',
      bodyFields: [
        { keyTemplate: '{{a}}', valueTemplate: '{{b}}' },
        { keyTemplate: '{{b}}', valueTemplate: '{{a}}' },
        { keyTemplate: '{{a}}', valueTemplate: '{{c}}' },
        { keyTemplate: '{{b}}', valueTemplate: '{{c}}' },
        { keyTemplate: '{{a}}', valueTemplate: '{{d}}' },
        { keyTemplate: '{{b}}', valueTemplate: '{{d}}' }
      ],
      bodyType: 'urlencoded',
      responsePath: 'data'
    });
    const result = await node.run(DEFAULT_CONTEXT, { a: 1, b: 2, c: 3, d: [4, 5] });

    result.should.deepEqual(
      [[[4]], {
        a: 1,
        b: 2,
        c: 3,
        d: [4, 5],
        data: {
          requestDuration: result[1].data.requestDuration,
          body: 'hello',
          headers: {},
          request: {
            body: '1=2&2=1&1=3&2=3&1%5B0%5D=4&1%5B1%5D=5&2%5B0%5D=4&2%5B1%5D=5',
            headers: {
              'Content-Length': 59,
              'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
              'User-Agent': 'LosantWorkflow/abc'
            },
            method: 'POST',
            strictSSL: true,
            uri: 'http://www.example.com/'
          },
          statusCode: 200
        }
      }]);
    receivedBody.should.deepEqual({
      '1': [ '2', '3' ],
      '2': [ '1', '3' ],
      '1[0]': '4',
      '1[1]': '5',
      '2[0]': '4',
      '2[1]': '5'
    });
  });

  it('should successfully work for body type jsonTemplate', async () => {
    nock('http://www.example.com', {
      reqHeaders: {
        'Content-Type': 'application/json'
      }
    })
      .post('/', '[4,5,{"1":2}]')
      .reply(200, 'hello');

    const node = new HttpNode('id', [[4]], {
      method: 'POST',
      uriTemplate: 'http://www.example.com/',
      bodyTemplate: '[{{c}}, { "{{a}}": {{b}} }]',
      bodyType: 'jsonTemplate',
      responsePath: 'data'
    });
    const result = await node.run(DEFAULT_CONTEXT, { a: 1, b: 2, c: [4, 5] });

    result.should.deepEqual(
      [[[4]], {
        a: 1,
        b: 2,
        c: [4, 5],
        data: {
          requestDuration: result[1].data.requestDuration,
          body: 'hello',
          headers: {},
          request: {
            body: [ 4, 5, { 1: 2 } ],
            headers: {
              'Content-Length': 13,
              'Content-Type': 'application/json',
              'User-Agent': 'LosantWorkflow/abc'
            },
            method: 'POST',
            strictSSL: true,
            uri: 'http://www.example.com/'
          },
          statusCode: 200
        }
      }]);
  });

  it('should successfully work for body type url', async () => {
    nock('http://www.example.com/')
      .get('/input')
      .reply(200, 'some content that is from a url');

    nock('http://www.example.com')
      .post('/output', 'some content that is from a url')
      .reply(200, 'works');

    const node = new HttpNode('id', [[4]], {
      method: 'POST',
      uriTemplate: 'http://www.example.com/output',
      bodyTemplate: '{{sourceUrl}}',
      bodyType: 'url',
      responsePath: 'data'
    });
    const result = await node.run(DEFAULT_CONTEXT, {
      sourceUrl: 'http://www.example.com/input'
    });

    result.should.deepEqual(
      [[[4]], {
        sourceUrl: 'http://www.example.com/input',
        data: {
          requestDuration: result[1].data.requestDuration,
          body: 'works',
          headers: {},
          request: {
            bodyUrl: 'http://www.example.com/input',
            headers: {
              'User-Agent': 'LosantWorkflow/abc'
            },
            method: 'POST',
            strictSSL: true,
            uri: 'http://www.example.com/output'
          },
          statusCode: 200
        }
      }]);
  });

  it('should correctly error with bad body type url', async () => {
    const node = new HttpNode('id', [[4]], {
      method: 'POST',
      uriTemplate: 'http://www.example.com/output',
      bodyTemplate: '{{sourceUrl}}',
      bodyType: 'url',
      errorBehavior: 'payloadPath',
      errorPath: 'whoops'
    });

    let result = await node.run(DEFAULT_CONTEXT, {
      sourceUrl: ' nope '
    });
    result.should.deepEqual(
      [[[4]], {
        sourceUrl: ' nope ',
        whoops: {
          request: {
            method: 'POST',
            uri: 'http://www.example.com/output',
            headers: { 'User-Agent': 'LosantWorkflow/abc' },
            timeout: 30000,
            strictSSL: true
          },
          error: { name: 'ValidationError', message: 'Invalid URL:  nope ' }
        }
      }]);

    nock('http://www.example.com', {})
      .get('/')
      .replyWithError('some error');

    result = await node.run(DEFAULT_CONTEXT, {
      sourceUrl: 'http://www.example.com'
    });
    result.should.deepEqual(
      [[[4]], {
        sourceUrl: 'http://www.example.com',
        whoops: {
          request: {
            method: 'POST',
            uri: 'http://www.example.com/output',
            headers: { 'User-Agent': 'LosantWorkflow/abc' },
            timeout: 30000,
            strictSSL: true
          },
          error: { name: 'HttpError', message: 'some error' }
        }
      }]);

    nock.restore();
  });

  // The bodyType: 'url' fetch goes through the same shared axios wrapper as the main
  // request, so it's also subject to SSRF blocking - covered where a real policy is
  // registered, in losant-workers' http-node-spec.js.

  it('should successfully work for bodyType none', async () => {
    nock('http://www.example.com')
      .post('/', '')
      .reply(200, 'hello');

    const node = new HttpNode('id', [[4]], {
      method: 'POST',
      uriTemplate: 'http://www.example.com/',
      bodyTemplate: 'hi',
      bodyType: 'none',
      responsePath: 'data'
    });
    const result = await node.run(DEFAULT_CONTEXT, {});

    result.should.deepEqual(
      [[[4]], {
        data: {
          requestDuration: result[1].data.requestDuration,
          body: 'hello',
          headers: {},
          request: {
            headers: {
              'User-Agent': 'LosantWorkflow/abc'
            },
            method: 'POST',
            strictSSL: true,
            uri: 'http://www.example.com/'
          },
          statusCode: 200
        }
      }]);
  });

  it('should successfully work for method HEAD', async () => {
    nock('http://www.example.com')
      .head('/', '')
      .reply(200);

    const node = new HttpNode('id', [[4]], {
      method: 'HEAD',
      uriTemplate: 'http://www.example.com/',
      responsePath: 'data'
    });
    const result = await node.run(DEFAULT_CONTEXT, {});

    result.should.deepEqual(
      [[[4]], {
        data: {
          requestDuration: result[1].data.requestDuration,
          body: '',
          headers: {},
          request: {
            headers: {
              'User-Agent': 'LosantWorkflow/abc'
            },
            method: 'HEAD',
            strictSSL: true,
            uri: 'http://www.example.com/'
          },
          statusCode: 200
        }
      }]);
  });

  it('should successfully work for templated method', async () => {
    nock('http://www.example.com')
      .patch('/', '')
      .reply(200, 'words');

    const node = new HttpNode('id', [[4]], {
      method: ' {{foo}} ',
      uriTemplate: 'http://www.example.com/',
      responsePath: 'data'
    });
    const result = await node.run(DEFAULT_CONTEXT, { foo: ' patch ' });

    result.should.deepEqual(
      [[[4]], {
        foo: ' patch ',
        data: {
          requestDuration: result[1].data.requestDuration,
          body: 'words',
          headers: {},
          request: {
            headers: {
              'User-Agent': 'LosantWorkflow/abc'
            },
            method: 'PATCH',
            strictSSL: true,
            uri: 'http://www.example.com/'
          },
          statusCode: 200
        }
      }]);
  });

  it('should error on bad method', () => {
    return new HttpNode('id', [[4]], {
      method: '{{what}}',
      responsePath: 'a.b',
      uriTemplate: 'http://www.example.com/post'
    }).run(DEFAULT_CONTEXT, { what: 'nope' })
      .should.be.rejectedWith('Invalid method "NOPE". Must be one of: GET,POST,PUT,PATCH,DELETE,HEAD');
  });

  it('should redirect the request when receiving a 3xx response without the disableRedirects option', async () => {
    nock('http://www.redirectfrom.com')
      .get('/')
      .reply(302, 'Moved to redirectto.com', { location: 'http://www.redirectto.com' });

    nock('http://www.redirectto.com')
      .get('/')
      .reply(200, 'Hello from redirectto.com!', { redirecttoheader: 'hello' });
    const result = await new HttpNode('id', [[4]], {
      method: 'GET',
      responsePath: 'data',
      uriTemplate: 'http://www.redirectfrom.com'
    }).run(DEFAULT_CONTEXT, {});
    result.should.be.deepEqual(
      [[[4]], {
        data: {
          requestDuration: result[1].data.requestDuration,
          body: 'Hello from redirectto.com!',
          headers: {
            redirecttoheader: 'hello'
          },
          request: {
            headers: {
              'User-Agent': 'LosantWorkflow/abc'
            },
            method: 'GET',
            strictSSL: true,
            uri: 'http://www.redirectfrom.com'
          },
          statusCode: 200
        }
      }]);
  });

  it('should return a 3xx response instead of redirecting when the disableRedirects option is set', async () => {
    nock('http://www.redirectfrom.com')
      .get('/')
      .reply(302, 'Moved to redirectto.com', { location: 'http://www.redirectto.com' });

    nock('http://www.redirectto.com')
      .get('/')
      .reply(200, 'Hello from redirectto.com!');

    const result = await new HttpNode('id', [[4]], {
      method: 'GET',
      responsePath: 'data',
      uriTemplate: 'http://www.redirectfrom.com',
      disableRedirects: true
    }).run(DEFAULT_CONTEXT, {});
    result.should.be.deepEqual(
      [[[4]], {
        data: {
          requestDuration: result[1].data.requestDuration,
          body: 'Moved to redirectto.com',
          headers: {
            location: 'http://www.redirectto.com'
          },
          request: {
            headers: {
              'User-Agent': 'LosantWorkflow/abc'
            },
            method: 'GET',
            strictSSL: true,
            uri: 'http://www.redirectfrom.com'
          },
          statusCode: 302
        }
      }]);
    nock.cleanAll();
  });

  describe('tests with fake local https server', () => {
    let httpsServer;
    afterEach(async () => {
      if (!httpsServer) { return; }
      const deferred = defer();
      httpsServer.close(deferred.resolve);
      await deferred.promise;
      httpsServer = null;
    });

    it('should disable the ssl verification check on the request when enabled', async () => {
      nock.enableNetConnect('localhost');
      const options = {
        key: fakeServerKey,
        cert: fakeServerCert,
        ca: fakeCaCert
      };

      httpsServer = https.createServer(options, (req, res) => {
        res.writeHead(404);
        res.end('hello world\n');
      }).listen(55443);

      const node = new HttpNode('id', [[4]], {
        method: 'POST',
        responsePath: 'resp',
        uriTemplate: 'https://localhost:55443/',
        disableSSLVerification: true
      });

      node.disableSSLVerification.should.be.true();

      return node.run(DEFAULT_CONTEXT, { attr: { a: 'z', b: 'y' } })
        .should.be.fulfilled()
        .then(([oids, p]) => {
          oids.should.deepEqual([[4]]);
          p.resp.statusCode.should.equal(404);
        });
    });

    it('should abort large downloads', function() {
      nock.enableNetConnect('localhost');
      const options = {
        key: fakeServerKey,
        cert: fakeServerCert,
        ca: fakeCaCert
      };

      httpsServer = https.createServer(options, (req, res) => {
        res.writeHead(200);
        const writer = () => {
          res.write(fakeClientKey+fakeClientKey+fakeClientKey+fakeClientKey, writer);
        };
        writer();
      }).listen(55443);

      return new HttpNode('id', [[4]], {
        method: 'GET',
        uriTemplate: 'https://localhost:55443/',
        responsePath: 'res',
        errorBehavior: 'payloadPath',
        errorPath: 'res',
        disableSSLVerification: true
      }).run(DEFAULT_CONTEXT, { attr: { a: 'z', b: 'y' } })
        .should.be.fulfilled()
        .then(([oids, p]) => {
          oids.should.deepEqual([[4]]);
          p.res.error.name.should.equal('TooLargeError');
          p.res.request.should.deepEqual({
            headers: {
              'User-Agent': 'LosantWorkflow/abc'
            },
            method: 'GET',
            strictSSL: false,
            timeout: 30000,
            uri: 'https://localhost:55443/'
          });
        });
    });

    it('should work with a custom CA cert', async () => {
      nock.enableNetConnect('localhost');

      const options = {
        key: fakeServerKey,
        cert: fakeServerCert,
        ca: fakeCaCert
      };

      httpsServer = https.createServer(options, (req, res) => {
        res.writeHead(200);
        res.end('hello world\n');
      }).listen(55443);

      const node = new HttpNode('id', [[4]], {
        method: 'GET',
        caCertTemplate: '{{ca}}',
        uriTemplate: 'https://localhost:55443/',
        responsePath: 'data',
        errorPath: 'error',
        errorBehavior: 'payloadPath'
      });

      let result = await node.run(DEFAULT_CONTEXT, {});
      result.should.deepEqual([
        [[ 4 ]],
        {
          error: {
            request: {
              method: 'GET',
              uri: 'https://localhost:55443/',
              strictSSL: true,
              headers: {
                'User-Agent': 'LosantWorkflow/abc'
              },
              timeout: 30000
            },
            error: {
              name: 'HttpError',
              message: 'self-signed certificate in certificate chain'
            }
          }
        }
      ]);

      result = await node.run(DEFAULT_CONTEXT, { ca: fakeCaCert });
      result.should.deepEqual([
        [[ 4 ]],
        {
          ca: fakeCaCert,
          data: {
            requestDuration: result[1].data.requestDuration,
            request: {
              method: 'GET',
              uri: 'https://localhost:55443/',
              strictSSL: true,
              headers: {
                'User-Agent': 'LosantWorkflow/abc'
              }
            },
            statusCode: 200,
            headers: {
              'date': result[1].data.headers.date,
              'connection': 'close',
              'transfer-encoding': 'chunked'
            },
            body: 'hello world\n'
          }
        }
      ]);
    });

    it('should work with a client cert auth', async () => {
      nock.enableNetConnect('localhost');

      const options = {
        key: fakeServerKey,
        cert: fakeServerCert,
        ca: fakeCaCert,
        requestCert: true,
        ciphers: 'DEFAULT@SECLEVEL=1',
        rejectUnauthorized: true
      };

      httpsServer = https.createServer(options, (req, res) => {
        res.writeHead(200);
        res.end('hello world\n');
      }).listen(55443);

      const node = new HttpNode('id', [[4]], {
        method: 'GET',
        caCertTemplate: '{{ca}}',
        authType: 'clientCert',
        uriTemplate: 'https://localhost:55443/',
        responsePath: 'data',
        errorPath: 'error',
        errorBehavior: 'payloadPath',
        authCredentials: { keyTemplate: '{{clientKey}}', certTemplate: '{{clientCert}}' }
      });

      let result = await node.run(DEFAULT_CONTEXT, { ca: fakeCaCert });
      result.should.deepEqual([
        [[ 4 ]],
        {
          ca: fakeCaCert,
          error: {
            request: {
              method: 'GET',
              uri: 'https://localhost:55443/',
              strictSSL: true,
              headers: {
                'User-Agent': 'LosantWorkflow/abc'
              },
              timeout: 30000
            },
            error: {
              name: 'HttpError',
              message: result[1].error.error.message
            }
          }
        }
      ]);
      result[1].error.error.message.should.match(/SSL alert number 116/);

      result = await node.run(DEFAULT_CONTEXT, { clientKey: fakeClientKey, clientCert: fakeClientCert, ca: fakeCaCert });
      result.should.deepEqual([
        [[ 4 ]],
        {
          ca: fakeCaCert,
          clientCert: fakeClientCert,
          clientKey: fakeClientKey,
          data: {
            requestDuration: result[1].data.requestDuration,
            request: {
              method: 'GET',
              uri: 'https://localhost:55443/',
              strictSSL: true,
              headers: {
                'User-Agent': 'LosantWorkflow/abc'
              }
            },
            statusCode: 200,
            headers: {
              'date': result[1].data.headers.date,
              'connection': 'close',
              'transfer-encoding': 'chunked'
            },
            body: 'hello world\n'
          }
        }
      ]);
    });
  });

});
