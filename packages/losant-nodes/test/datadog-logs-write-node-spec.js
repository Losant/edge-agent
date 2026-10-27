import { nock, contextify } from './common.js';
import DatadogLogsWriteNode from '../src/datadog-logs-write-node.js';
import { sleep } from 'omnibelt';

describe('Datadog Logs: Write Node', () => {
  it('should error if message is missing', async () => {
    const node = new DatadogLogsWriteNode('id', [[4]], {
      apiKeyTemplate: 'fake-datadog-api-key',
      siteTemplate: 'us5.datadoghq.com',
      writeMethod: 'individualFields',
      writeFields: [{
        messageTemplate: '{{ msg }}'
      }],
      resultPath: 'ddResult'
    });
    await node.run(contextify(), {}).should.be.rejectedWith({
      message: 'Missing Message'
    });
  });
  it('error if attributes field is not an object', async () => {
    const node = new DatadogLogsWriteNode('id', [[4]], {
      apiKeyTemplate: 'fake-datadog-api-key',
      siteTemplate: 'us5.datadoghq.com',
      writeMethod: 'individualFields',
      writeFields: [{
        messageTemplate: 'oh no!',
        attributesTemplate: '{{ jsonEncode str }}'
      }],
      resultPath: 'ddResult'
    });
    await node.run(contextify(), { str: 'foo' }).should.be.rejectedWith({
      message: 'Attributes field must be an object.'
    });
  });
  it('should timeout the request and error correctly', async () => {
    nock('https://http-intake.logs.us5.datadoghq.com:443', { encodedQueryParams: true })
      .post('/api/v2/logs', [{
        message: 'From a node test!', ddsource: 'workflow', hostname: 'losant.com', service: 'mocha', ddtags: 'one:two,three:four,foo:double,foo:trouble', foo: 'bar'
      }])
      .reply(202, async () => {
        await sleep(1000);
        return {};
      });
    const node = new DatadogLogsWriteNode('id', [[4]], {
      apiKeyTemplate: 'fake-datadog-api-key',
      siteTemplate: 'us5.datadoghq.com',
      writeMethod: 'individualFields',
      writeFields: [{
        sourceTemplate: 'workflow',
        hostnameTemplate: 'losant.com',
        messageTemplate: 'From a node test!',
        serviceTemplate: 'mocha',
        attributesTemplate: '{{ data }}',
        tagsTemplate: '{{ tags }}'
      }],
      resultPath: 'ddResult'
    });
    const result = await node.run(contextify({ externalTimeout: 10 }), { data: { foo: 'bar' }, tags: { one: 'two', three: 'four', foo: [ 'double', 'trouble' ] } });
    result[1].ddResult.should.deepEqual({ success: false, error: { message: 'Timeout running Datadog Log: Write node' } });
  });
  it('should error if site cannot be resolved', async () => {
    const node = new DatadogLogsWriteNode('id', [[4]], {
      apiKeyTemplate: 'fakeApiKey',
      siteTemplate: 'invalid.invalid.com',
      writeMethod: 'individualFields',
      writeFields: [{
        sourceTemplate: 'workflow',
        hostnameTemplate: 'losant.com',
        messageTemplate: 'From a node test!',
        serviceTemplate: 'mocha',
        attributesTemplate: '{{ data }}',
        tagsTemplate: '{{ tags }}'
      }],
      resultPath: 'ddResult'
    });
    await node.run(contextify({}), { data: { foo: 'bar' }, tags: { one: 'two', three: 'four', foo: [ 'double', 'trouble' ] } })
      .should.be.rejectedWith({
        message: 'Cannot resolve host: invalid.invalid.com'
      });
  });
  it('should return a forbidden or not found error', async () => {
    nock('https://http-intake.logs.us5.datadoghq.com:443', { encodedQueryParams: true })
      .post('/api/v2/logs', [{
        message: 'From a node test!', ddsource: 'workflow', hostname: 'losant.com', service: 'mocha', ddtags: 'one:two,three:four,foo:double,foo:trouble', foo: 'bar'
      }])
      .reply(403, { errors: [{ status: '403', title: 'Forbidden', detail: 'API key is invalid.' }] });
    const node = new DatadogLogsWriteNode('id', [[4]], {
      apiKeyTemplate: 'fake-datadog-api-key',
      siteTemplate: 'us5.datadoghq.com',
      writeMethod: 'individualFields',
      writeFields: [{
        sourceTemplate: 'workflow',
        hostnameTemplate: 'losant.com',
        messageTemplate: 'From a node test!',
        serviceTemplate: 'mocha',
        attributesTemplate: '{{ jsonEncode data }}',
        tagsTemplate: '{{ tags }}'
      }],
      resultPath: 'ddResult'
    });
    const result = await node.run(contextify({}), { data: { foo: 'bar' }, tags: { one: 'two', three: 'four', foo: [ 'double', 'trouble' ] } });
    result[1].ddResult.should.deepEqual({ success: false, error: { message: 'Forbidden (403) API key is invalid.' } });
  });
  it('should correctly send dog some data', async () => {
    nock('https://http-intake.logs.us5.datadoghq.com:443', { encodedQueryParams: true })
      .post('/api/v2/logs', [{
        message: 'From a node test!', ddsource: 'workflow', hostname: 'losant.com', service: 'mocha', ddtags: 'one:two,three:four,foo:double,foo:trouble', foo: 'bar'
      }])
      .reply(202, {});

    const node = new DatadogLogsWriteNode('id', [[4]], {
      apiKeyTemplate: 'fake-datadog-api-key',
      siteTemplate: 'us5.datadoghq.com',
      writeMethod: 'individualFields',
      writeFields: [{
        sourceTemplate: 'workflow',
        hostnameTemplate: 'losant.com',
        messageTemplate: 'From a node test!',
        serviceTemplate: 'mocha',
        attributesTemplate: '{{ data }}',
        tagsTemplate: '{{ tags }}'
      }],
      resultPath: 'ddResult'
    });
    const result = await node.run(contextify({}), { data: { foo: 'bar' }, tags: { one: 'two', three: 'four', foo: [ 'double', 'trouble' ] } });
    result[1].ddResult.should.deepEqual({ success: true });
  });
  it('should correctly send dog some data with tags as a string', async () => {
    nock('https://http-intake.logs.us5.datadoghq.com:443', { encodedQueryParams: true })
      .post('/api/v2/logs', [{
        message: 'From a node test!', ddsource: 'workflow', hostname: 'losant.com', service: 'mocha', ddtags: 'one:two,three:four,foo:double,foo:trouble', foo: 'bar'
      }])
      .reply(202, {});

    const node = new DatadogLogsWriteNode('id', [[4]], {
      apiKeyTemplate: 'fake-datadog-api-key',
      siteTemplate: 'us5.datadoghq.com',
      writeMethod: 'individualFields',
      writeFields: [{
        sourceTemplate: 'workflow',
        hostnameTemplate: 'losant.com',
        messageTemplate: 'From a node test!',
        serviceTemplate: 'mocha',
        attributesTemplate: '{{ data }}',
        tagsTemplate: '{{ tags }}'
      }],
      resultPath: 'ddResult'
    });
    const result = await node.run(contextify({}), { data: { foo: 'bar' }, tags: 'one:two,three:four,foo:double,foo:trouble' });
    result[1].ddResult.should.deepEqual({ success: true });
  });
  it('should correctly send dog some data with payloadPath as the writeMethod', async () => {
    nock('https://http-intake.logs.us5.datadoghq.com:443', { encodedQueryParams: true })
      .post('/api/v2/logs', [{
        hostname: 'losant.com', message: '1234453', service: 'mocha', ddtags: 'one:two,three:four,foo:double,foo:trouble', ddsource: 'workflow', foo: 'bar'
      }])
      .reply(202, {});

    nock('https://http-intake.logs.us5.datadoghq.com:443', { encodedQueryParams: true })
      .post('/api/v2/logs', [{
        hostname: 'losant.com', message: 'From a node test!', service: 'mocha', ddtags: 'one:two,three:four,foo:double,foo:trouble', ddsource: 'workflow', foo: 'bar'
      }])
      .reply(202, {});

    const node = new DatadogLogsWriteNode('id', [[4]], {
      apiKeyTemplate: 'fake-datadog-api-key',
      siteTemplate: 'us5.datadoghq.com',
      writeMethod: 'payloadPath',
      writePayloadPath: 'logs',
      resultPath: 'ddResult'
    });
    const result = await node.run(contextify({}), {
      logs: [{
        source: 'workflow',
        hostname: 'losant.com',
        message: 1234453,
        service: 'mocha',
        attributes: { foo: 'bar' },
        tags: { one: 'two', three: 'four', foo: [ 'double', 'trouble' ] }
      }]
    });
    result[1].ddResult.should.deepEqual({ success: true });

    const result2 = await node.run(contextify({}), {
      logs: [{
        source: 'workflow',
        hostname: 'losant.com',
        message: 'From a node test!',
        service: 'mocha',
        attributes: { foo: 'bar' },
        tags: 'one:two,three:four,foo:double,foo:trouble'
      }]
    });
    result2[1].ddResult.should.deepEqual({ success: true });
  });

  it('should correctly send dog some data with jsonTemplate writeMethod', async () => {
    nock('https://http-intake.logs.us5.datadoghq.com:443', { encodedQueryParams: true })
      .post('/api/v2/logs', [{
        hostname: 'losant.com', message: 'From a node test!', service: 'mocha', ddtags: 'one:two,three:four,foo:double,foo:trouble', ddsource: 'workflow', foo: 'bar'
      }])
      .twice()
      .reply(202, {});

    const node = new DatadogLogsWriteNode('id', [[4]], {
      apiKeyTemplate: 'fake-datadog-api-key',
      siteTemplate: 'us5.datadoghq.com',
      writeMethod: 'jsonTemplate',
      writeJsonTemplate: '{{ logs }}',
      resultPath: 'ddResult'
    });
    const result = await node.run(contextify({}), {
      logs: [{
        source: 'workflow',
        hostname: 'losant.com',
        message: 'From a node test!',
        service: 'mocha',
        attributes: { foo: 'bar' },
        tags: { one: 'two', three: 'four', foo: [ 'double', 'trouble' ] }
      }]
    });
    result[1].ddResult.should.deepEqual({ success: true });

    const result2 = await node.run(contextify({}), {
      logs: [{
        source: 'workflow',
        hostname: 'losant.com',
        message: 'From a node test!',
        service: 'mocha',
        attributes: { foo: 'bar' },
        tags: 'one:two,three:four,foo:double,foo:trouble'
      }]
    });
    result2[1].ddResult.should.deepEqual({ success: true });
  });
});
