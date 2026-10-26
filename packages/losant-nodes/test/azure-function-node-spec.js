import { nock } from './common.js';
import AzureFunctionNode from '../src/azure-function-node.js';

describe('Azure Function Node', () => {
  it('should connect to azure with default configs', async () => {
    nock('https://1.2.3.4:443', { encodedQueryParams: true })
      .post('/api/HttpTrigger1', { arg: 'hello' })
      .query({ code: 'wQF6JiIVlTUJ8OH3nRa5bqZcmCWyIfhRyBqoqrnHzQgyJd9a23Gx0w%3D%3D' })
      .reply(200, { hello: true, foo: { $undefined: true } }, {
        'request-context': 'appId=cid-v1:39665240-a677-4b5b-a4f4-a98dc4cd69ce'
      });
    const result = await new AzureFunctionNode('id', [[4]], {
      hostNameTemplate: '1.2.3.4',
      apiKeyTemplate: 'wQF6JiIVlTUJ8OH3nRa5bqZcmCWyIfhRyBqoqrnHzQgyJd9a23Gx0w==',
      functionNameTemplate: 'HttpTrigger1',
      resultPath: 'output'
    }).run({}, { arg: 'hello' });
    result[1].output.should.deepEqual({ body: { hello: true, foo: undefined }, statusCode: 200, azureHeaders: { 'request-context': 'appId=cid-v1:39665240-a677-4b5b-a4f4-a98dc4cd69ce' } });
  });

  it('should connect to azure with default configs', async () => {
    nock('https://test.azurewebsites.net:443', { encodedQueryParams: true })
      .post('/api/HttpTrigger1', { arg: 'hello' })
      .query({ code: 'wQF6JiIVlTUJ8OH3nRa5bqZcmCWyIfhRyBqoqrnHzQgyJd9a23Gx0w%3D%3D' })
      .reply(200, { hello: true, foo: { $undefined: true } }, {
        'request-context': 'appId=cid-v1:39665240-a677-4b5b-a4f4-a98dc4cd69ce'
      });
    const result = await new AzureFunctionNode('id', [[4]], {
      hostNameTemplate: 'test.azurewebsites.net',
      apiKeyTemplate: 'wQF6JiIVlTUJ8OH3nRa5bqZcmCWyIfhRyBqoqrnHzQgyJd9a23Gx0w==',
      functionNameTemplate: 'HttpTrigger1',
      resultPath: 'output'
    }).run({}, { arg: 'hello' });
    result[1].output.should.deepEqual({ body: { hello: true, foo: undefined }, statusCode: 200, azureHeaders: { 'request-context': 'appId=cid-v1:39665240-a677-4b5b-a4f4-a98dc4cd69ce' } });
  });

  it('should execute an anonymous function', async () => {
    nock('https://test.azurewebsites.net:443', { encodedQueryParams: true })
      .post('/api/HttpTrigger1', { arg: 'hello' })
      .query({ code: '' })
      .reply(200, 'Hello World!', { 'request-context': 'appId=cid-v1:cb3c3bd8-5939-4205-823b-8a877af57554' });
    const result = await new AzureFunctionNode('id', [[4]], {
      hostNameTemplate: 'test.azurewebsites.net',
      functionNameTemplate: 'HttpTrigger1',
      resultPath: 'output'
    }).run({}, { arg: 'hello' });
    result[1].output.should.deepEqual({ body: 'Hello World!', statusCode: 200, azureHeaders: { 'request-context': 'appId=cid-v1:cb3c3bd8-5939-4205-823b-8a877af57554' } });
  });

  it('should connect to a non-http triggered app', async () => {
    nock('https://test.azurewebsites.net:443', { encodedQueryParams: true })
      .post('/admin/functions/TimerTrigger1')
      .query({ code: 'o4xsWjr2ZOFBnD0Oe4azGU5Md0W/oFWE1yb7AGHZmGgGPnIvx7S1uA%3D%3D' })
      .reply(200, 'hello world', { 'request-context': 'appId=cid-v1:39665240-a677-4b5b-a4f4-a98dc4cd69ce' });
    const result = await new AzureFunctionNode('id', [[4]], {
      hostNameTemplate: 'test.azurewebsites.net',
      apiKeyTemplate: 'o4xsWjr2ZOFBnD0Oe4azGU5Md0W/oFWE1yb7AGHZmGgGPnIvx7S1uA==',
      functionNameTemplate: 'TimerTrigger1',
      resultPath: 'output',
      isHttp: false
    }).run({}, {});
    result[1].output.should.deepEqual({ body: 'hello world', statusCode: 200, azureHeaders: { 'request-context': 'appId=cid-v1:39665240-a677-4b5b-a4f4-a98dc4cd69ce' } });
  });

  it('should connect to an http triggered app', async () => {
    nock('https://test.azurewebsites.net:443', { encodedQueryParams: true })
      .post('/api/HttpTrigger1', { arg: 'hello' })
      .query({ code: 'wQF6JiIVlTUJ8OH3nRa5bqZcmCWyIfhRyBqoqrnHzQgyJd9a23Gx0w%3D%3D' })
      .reply(200, 'hello world', { 'request-context': 'appId=cid-v1:39665240-a677-4b5b-a4f4-a98dc4cd69ce' });
    const result = await new AzureFunctionNode('id', [[4]], {
      hostNameTemplate: 'test.azurewebsites.net',
      apiKeyTemplate: 'wQF6JiIVlTUJ8OH3nRa5bqZcmCWyIfhRyBqoqrnHzQgyJd9a23Gx0w==',
      functionNameTemplate: 'HttpTrigger1',
      resultPath: 'output',
      isHttp: true
    }).run({}, { arg: 'hello' });
    result[1].output.should.deepEqual({ body: 'hello world', statusCode: 200, azureHeaders: { 'request-context': 'appId=cid-v1:39665240-a677-4b5b-a4f4-a98dc4cd69ce' } });
  });

  it('should take input from payloadPath', async () => {
    nock('https://test.azurewebsites.net:443', { encodedQueryParams: true })
      .post('/api/HttpTrigger1', { name: 'hello' })
      .query({ code: 'wQF6JiIVlTUJ8OH3nRa5bqZcmCWyIfhRyBqoqrnHzQgyJd9a23Gx0w%3D%3D' })
      .reply(200, 'hello world', { 'request-context': 'appId=cid-v1:39665240-a677-4b5b-a4f4-a98dc4cd69ce' });
    const result = await new AzureFunctionNode('id', [[4]], {
      hostNameTemplate: 'test.azurewebsites.net',
      apiKeyTemplate: 'wQF6JiIVlTUJ8OH3nRa5bqZcmCWyIfhRyBqoqrnHzQgyJd9a23Gx0w==',
      functionNameTemplate: 'HttpTrigger1',
      resultPath: 'output',
      sourceMethodTemplate: 'payloadPath',
      sourceData: 'arg'
    }).run({}, { arg: { name: 'hello' } });
    result[1].output.should.deepEqual({ body: 'hello world', statusCode: 200, azureHeaders: { 'request-context': 'appId=cid-v1:39665240-a677-4b5b-a4f4-a98dc4cd69ce' } });
  });

  it('should take input from jsonTemplate', async () => {
    nock('https://test.azurewebsites.net:443', { encodedQueryParams: true })
      .post('/api/HttpTrigger1', { name: 'hello' })
      .query({ code: 'wQF6JiIVlTUJ8OH3nRa5bqZcmCWyIfhRyBqoqrnHzQgyJd9a23Gx0w%3D%3D' })
      .reply(200, 'hello world', { 'request-context': 'appId=cid-v1:39665240-a677-4b5b-a4f4-a98dc4cd69ce' });
    const result = await new AzureFunctionNode('id', [[4]], {
      hostNameTemplate: 'test.azurewebsites.net',
      apiKeyTemplate: 'wQF6JiIVlTUJ8OH3nRa5bqZcmCWyIfhRyBqoqrnHzQgyJd9a23Gx0w==',
      functionNameTemplate: 'HttpTrigger1',
      resultPath: 'output',
      sourceMethodTemplate: 'jsonTemplate',
      sourceData: '{ "name": "hello" }'
    }).run({}, {});
    result[1].output.should.deepEqual({ body: 'hello world', statusCode: 200, azureHeaders: { 'request-context': 'appId=cid-v1:39665240-a677-4b5b-a4f4-a98dc4cd69ce' } });
  });

  it('should allow JSON objects with jsonTemplate method', async () => {
    nock('https://test.azurewebsites.net:443', { encodedQueryParams: true })
      .post('/api/HttpTrigger1', { name: 'hello' })
      .query({ code: 'wQF6JiIVlTUJ8OH3nRa5bqZcmCWyIfhRyBqoqrnHzQgyJd9a23Gx0w%3D%3D' })
      .reply(200, 'hello world', { 'request-context': 'appId=cid-v1:39665240-a677-4b5b-a4f4-a98dc4cd69ce' });
    const result = await new AzureFunctionNode('id', [[4]], {
      hostNameTemplate: 'test.azurewebsites.net',
      apiKeyTemplate: 'wQF6JiIVlTUJ8OH3nRa5bqZcmCWyIfhRyBqoqrnHzQgyJd9a23Gx0w==',
      functionNameTemplate: 'HttpTrigger1',
      resultPath: 'output',
      sourceMethodTemplate: 'jsonTemplate',
      sourceData: { name: 'hello' }
    }).run({}, {});
    result[1].output.should.deepEqual({ body: 'hello world', statusCode: 200, azureHeaders: { 'request-context': 'appId=cid-v1:39665240-a677-4b5b-a4f4-a98dc4cd69ce' } });
  });

  it('should error on empty payloadPath', async () => {
    await new AzureFunctionNode('id', [[4]], {
      hostNameTemplate: 'test.azurewebsites.net',
      apiKeyTemplate: 'wQF6JiIVlTUJ8OH3nRa5bqZcmCWyIfhRyBqoqrnHzQgyJd9a23Gx0w==',
      functionNameTemplate: 'HttpTrigger1',
      resultPath: 'output',
      sourceMethodTemplate: 'payloadPath'
    }).run({}, {}).should.be.rejectedWith({ type: 'MissingField', message: 'Missing Source Data' });
  });

  it('should error on empty jsonTemplate', async () => {
    await new AzureFunctionNode('id', [[4]], {
      hostNameTemplate: 'test.azurewebsites.net',
      apiKeyTemplate: 'wQF6JiIVlTUJ8OH3nRa5bqZcmCWyIfhRyBqoqrnHzQgyJd9a23Gx0w==',
      functionNameTemplate: 'HttpTrigger1',
      resultPath: 'output',
      sourceMethodTemplate: 'jsonTemplate'
    }).run({}, {}).should.be.rejectedWith({ type: 'MissingField', message: 'Missing Source Data' });
  });

  it('should error the payload when exceeding max response size', async () => {
    let reallyBigString = '';
    for (let i = 0; i < 100000; i++) {
      reallyBigString+='Oh no, this string is getting longer. Very long. Oh no.';
    }
    nock('https://test.azurewebsites.net:443', { encodedQueryParams: true })
      .post('/api/HttpTrigger1', { arg: 'hello' })
      .query({ code: 'wQF6JiIVlTUJ8OH3nRa5bqZcmCWyIfhRyBqoqrnHzQgyJd9a23Gx0w%3D%3D' })
      .reply(200, reallyBigString, { 'request-context': 'appId=cid-v1:39665240-a677-4b5b-a4f4-a98dc4cd69ce' });
    const result = await new AzureFunctionNode('id', [[4]], {
      hostNameTemplate: 'test.azurewebsites.net',
      apiKeyTemplate: 'wQF6JiIVlTUJ8OH3nRa5bqZcmCWyIfhRyBqoqrnHzQgyJd9a23Gx0w==',
      functionNameTemplate: 'HttpTrigger1',
      resultPath: 'output'
    }).run({}, { arg: 'hello' });
    result[1].output.should.deepEqual({ error: { type: 'TooLarge', message: 'Size of Response Body (5MB) is greater than maximum allowed (5MB)' } });
  });

  it('should error on missing function name', async () => {
    await new AzureFunctionNode('id', [[4]], {
      hostNameTemplate: 'test.azurewebsites.net',
      apiKeyTemplate: 'wQF6JiIVlTUJ8OH3nRa5bqZcmCWyIfhRyBqoqrnHzQgyJd9a23Gx0w==',
      functionNameTemplate: ''
    }).run({}, {}).should.be.rejectedWith({ type: 'Validation', message: 'Function Name is required' });
  });

  it('should error on missing host name', async () => {
    await new AzureFunctionNode('id', [[4]], {
      hostNameTemplate: '',
      apiKeyTemplate: 'wQF6JiIVlTUJ8OH3nRa5bqZcmCWyIfhRyBqoqrnHzQgyJd9a23Gx0w==',
      functionNameTemplate: 'HttpTrigger1'
    }).run({}, {}).should.be.rejectedWith({ type: 'Validation', message: 'Host Name is required' });
  });

  it('should error on bad host name', async () => {
    await new AzureFunctionNode('id', [[4]], {
      apiKeyTemplate: 'wQF6JiIVlTUJ8OH3nRa5bqZcmCWyIfhRyBqoqrnHzQgyJd9a23Gx0w==',
      functionNameTemplate: 'HttpTrigger1',
      hostNameTemplate: 'test.#azurewebsites.net'
    }).run({}, {}).should.be.rejectedWith({ type: 'Validation', message: 'Host Name is invalid: test.#azurewebsites.net' });
  });

  it('should 404 on non-existent function', async () => {
    nock('https://test.azurewebsites.net:443', { encodedQueryParams: true })
      .post('/api/notAFunc', { arg: 'hello' })
      .query({ code: 'wQF6JiIVlTUJ8OH3nRa5bqZcmCWyIfhRyBqoqrnHzQgyJd9a23Gx0w%3D%3D' })
      .reply(404, '', { 'request-context': 'appId=cid-v1:39665240-a677-4b5b-a4f4-a98dc4cd69ce' });
    const result = await new AzureFunctionNode('id', [[4]], {
      hostNameTemplate: 'test.azurewebsites.net',
      apiKeyTemplate: 'wQF6JiIVlTUJ8OH3nRa5bqZcmCWyIfhRyBqoqrnHzQgyJd9a23Gx0w==',
      functionNameTemplate: 'notAFunc',
      resultPath: 'output'
    }).run({}, { arg: 'hello' });
    result[1].output.should.deepEqual({ body: '', statusCode: 404, azureHeaders: { 'request-context': 'appId=cid-v1:39665240-a677-4b5b-a4f4-a98dc4cd69ce' } });
  });

  it('should 401 on bad api key', async () => {
    nock('https://test.azurewebsites.net:443', { encodedQueryParams: true })
      .post('/api/HttpTrigger1', { arg: 'hello' })
      .query({ code: '1nv4l1d' })
      .reply(401, '', { 'request-context': 'appId=cid-v1:39665240-a677-4b5b-a4f4-a98dc4cd69ce' });
    const result = await new AzureFunctionNode('id', [[4]], {
      hostNameTemplate: 'test.azurewebsites.net',
      apiKeyTemplate: '1nv4l1d',
      functionNameTemplate: 'HttpTrigger1',
      resultPath: 'output'
    }).run({}, { arg: 'hello' });
    result[1].output.should.deepEqual({ body: '', statusCode: 401, azureHeaders: { 'request-context': 'appId=cid-v1:39665240-a677-4b5b-a4f4-a98dc4cd69ce' } });
  });

  it('should receive errors placed on the response body', async () => {
    nock('https://test.azurewebsites.net:443', { encodedQueryParams: true })
      .post('/api/HttpTrigger1', { arg: 'hello' })
      .query({ code: 'wQF6JiIVlTUJ8OH3nRa5bqZcmCWyIfhRyBqoqrnHzQgyJd9a23Gx0w%3D%3D' })
      .reply(500, {
        ClassName: 'System.DivideByZeroException',
        Message: 'Attempted to divide by zero.',
        Data: null,
        InnerException: null,
        HelpURL: null,
        StackTraceString: '   at Submission#0.<Run>d__1.MoveNext() in D:\\home\\site\\wwwroot\\HttpTrigger1\\run.csx:line 15',
        RemoteStackTraceString: null,
        RemoteStackIndex: 0,
        ExceptionMethod: null,
        HResult: -2147352558,
        Source: 'f-HttpTrigger1__1168770225',
        WatsonBuckets: null
      }, { 'request-context': 'appId=cid-v1:39665240-a677-4b5b-a4f4-a98dc4cd69ce' });
    const result = await new AzureFunctionNode('id', [[4]], {
      hostNameTemplate: 'test.azurewebsites.net',
      apiKeyTemplate: 'wQF6JiIVlTUJ8OH3nRa5bqZcmCWyIfhRyBqoqrnHzQgyJd9a23Gx0w==',
      functionNameTemplate: 'HttpTrigger1',
      resultPath: 'output'
    }).run({}, { arg: 'hello' });
    result[1].output.body.should.deepEqual({
      ClassName: 'System.DivideByZeroException',
      Message: 'Attempted to divide by zero.',
      Data: null,
      InnerException: null,
      HelpURL: null,
      StackTraceString: '   at Submission#0.<Run>d__1.MoveNext() in D:\\home\\site\\wwwroot\\HttpTrigger1\\run.csx:line 15',
      RemoteStackTraceString: null,
      RemoteStackIndex: 0,
      ExceptionMethod: null,
      HResult: -2147352558,
      Source: 'f-HttpTrigger1__1168770225',
      WatsonBuckets: null
    });
  });
});
