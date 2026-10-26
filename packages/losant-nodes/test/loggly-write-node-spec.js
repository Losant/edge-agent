import { nock } from './common.js';
import LogglyWriteNode from '../src/loggly-write-node.js';

const config = {
  apiTokenTemplate: '11111111-bbbb-cccc-dddd-222233332222',
  writeMethod: 'individualFields',
  writeFields: [
    {
      messageTemplate: 'test'
    }
  ],
  writeJsonTemplate: '',
  writePayloadPath: '',
  resultPath: 'out'
};

describe('LogglyWriteNode', () => {
  it('Should properly handle Loggly API error', async () => {
    nock('https://logs-01.loggly.com:443')
      .post('/inputs/11111111-bbbb-cccc-dddd-')
      .reply(403, 'Invalid API key');

    const node = new LogglyWriteNode('id', [[4]], {
      ...config,
      apiTokenTemplate: '11111111-bbbb-cccc-dddd-'
    });

    const result = await node.run({}, {});

    result[1].out.should.deepEqual({
      success: false,
      results: [{
        error: 'Invalid API key',
        success: false
      }]
    });
  });

  it('Should throw error when token is invalid', async () => {
    const node = new LogglyWriteNode('id', [[4]], {
      ...config,
      apiTokenTemplate: undefined
    });

    await node
      .run({}, {})
      .should.be.rejectedWith({
        type: 'MissingField',
        message: 'Missing Token'
      });
  });

  it('should error when timeout has been completely used', async () => {
    nock('https://logs-01.loggly.com:443')
      .post('/inputs/11111111-bbbb-cccc-dddd-222233332222', (body) => {
        body.should.equal('foo{"foo":"bar"}');
        return true;
      })
      .reply(200, { response: 'ok' });

    const node = new LogglyWriteNode('id', [[4]], {
      ...config,
      writeFields: [
        { messageTemplate: 'foo', jsonTemplate: { foo: 'bar' } },
        { messageTemplate: 'foo', jsonTemplate: { foo: 'bar' } },
        { messageTemplate: 'foo', jsonTemplate: { foo: 'bar' } },
        { messageTemplate: 'foo', jsonTemplate: { foo: 'bar' } }
      ]
    });
    const result = await node.run({ externalTimeout: 0.1 }, {});
    result[1].out.success.should.equal(false);
    result[1].out.results.should.deepEqual([
      { success: false, error: 'Request timed out.' },
      { success: false, error: 'Request timed out.' },
      { success: false, error: 'Request timed out.' },
      { success: false, error: 'Request timed out.' }
    ]);
  });

  describe('When writeMethod is jsonTemplate', () => {
    it('Should send all logs', async () => {
      const jsonTemplateInput = JSON.stringify([{
        message: 'Hello',
        json: { aProperty: 'and Value' },
        tags: ['firstTag', 'secondTag']
      }, {
        json: { bProperty: 'and Value2' },
        tags: ['thirdTag']
      }]);
      nock('https://logs-01.loggly.com:443')
        .matchHeader('X-LOGGLY-TAG', 'firstTag,secondTag')
        .post('/inputs/11111111-bbbb-cccc-dddd-222233332222', (body) => {
          body.should.equal('Hello{"aProperty":"and Value"}');
          return true;
        })
        .reply(200, { response: 'ok' });

      nock('https://logs-01.loggly.com:443')
        .matchHeader('X-LOGGLY-TAG', 'thirdTag')
        .post('/inputs/11111111-bbbb-cccc-dddd-222233332222', (body) => {
          body.should.deepEqual({ bProperty: 'and Value2' });
          return true;
        })
        .reply(200, { response: 'ok' });

      const node = new LogglyWriteNode('id', [[4]], {
        ...config,
        writeJsonTemplate: jsonTemplateInput,
        writeMethod: 'jsonTemplate'
      });

      const result = await node.run({}, {});

      const expected = [
        { success: true, response: 'ok' },
        { success: true, response: 'ok' }
      ];

      result[0].should.deepEqual([[4]]);
      result[1].out.should.deepEqual({
        success: true,
        results: expected
      });
    });

    it('Should send all logs with templates', async () => {
      const messageTemplate = 'Test Message Template';
      const tag3Value = 'thirdTag';
      const jsonTemplateInput = JSON.stringify([{
        message: '{{messageTemplate}}',
        json: { aProperty: 'and Value' },
        tags: ['firstTag', 'secondTag']
      }, {
        json: { bProperty: 'and Value2' },
        tags: ['{{tag3}}']
      }]);

      nock('https://logs-01.loggly.com:443')
        .matchHeader('X-LOGGLY-TAG', 'firstTag,secondTag')
        .post('/inputs/11111111-bbbb-cccc-dddd-222233332222', (body) => {
          body.should.equal(`${messageTemplate}{"aProperty":"and Value"}`);
          return true;
        })
        .reply(200, { response: 'ok' });

      nock('https://logs-01.loggly.com:443')
        .matchHeader('X-LOGGLY-TAG', 'thirdTag')
        .post('/inputs/11111111-bbbb-cccc-dddd-222233332222', (body) => {
          body.should.deepEqual({ bProperty: 'and Value2' });
          return true;
        })
        .reply(200, { response: 'ok' });

      const node = new LogglyWriteNode('id', [[4]], {
        ...config,
        writeJsonTemplate: jsonTemplateInput,
        writeMethod: 'jsonTemplate'
      });

      const result = await node.run(
        {},
        {
          messageTemplate: messageTemplate,
          tag3: tag3Value
        }
      );

      const expected = [
        { success: true, response: 'ok' },
        { success: true, response: 'ok' }
      ];

      result[0].should.deepEqual([[4]]);
      result[1].out.should.deepEqual({
        success: true,
        results: expected
      });
    });
  });

  describe('When writeMethod is individualFields', () => {
    it('Should properly handle templates', async () => {
      const stringValue = 'Hello World';
      const tag2Value = 'testTag2';
      const jsonExample = { aString: '{{testTemplate}}', aNumber: 42, aBoolean: true };
      const node = new LogglyWriteNode('id', [[4]], {
        ...config,
        apiTokenTemplate: '{{logglyToken}}',
        subdomainTemplate: '{{logglySubdomain}}',
        writeFields: [
          {
            jsonTemplate: JSON.stringify(jsonExample),
            tagsTemplate: '{{tag2}}'
          }
        ]
      });

      nock('https://logs-01.loggly.com:443')
        .matchHeader('X-LOGGLY-TAG', tag2Value)
        .post('/inputs/11111111-bbbb-cccc-dddd-222233332222', (body) => {
          body.should.deepEqual({ aString: 'Hello World', aNumber: 42, aBoolean: true });
          return true;
        })
        .reply(200, { response: 'ok' });

      const result = await node.run(
        {},
        {
          logglySubdomain: 'losanttest',
          logglyToken: '11111111-bbbb-cccc-dddd-222233332222',
          testTemplate: stringValue,
          tag2: tag2Value
        }
      );

      result[0].should.deepEqual([[4]]);
      result[1].logglyToken.should.equal('11111111-bbbb-cccc-dddd-222233332222');
      result[1].out.should.deepEqual({ success: true, results: [ { success: true, response: 'ok' }] });
    });

    it('Should properly handle empty writeFields', async () => {
      const node = new LogglyWriteNode('id', [[4]], {
        ...config,
        writeFields: [{ messageTemplate: '', jsonTemplate: '', tagsTemplate: '' }]
      });

      const result = await node.run({}, {});
      result[1].out.should.deepEqual({ success: true, results: [{ success: true }] });
    });

    it('Should properly handle invalid writeFields', async () => {
      const node = new LogglyWriteNode('id', [[4]], {
        ...config,
        writeFields: [{ messageTemplate: '', jsonTemplate: '{', tagsTemplate: '' }]
      });

      const result = await node.run({}, {});
      result[1].out.should.deepEqual({
        success: false,
        error: 'JSON template did not render to valid JSON'
      });
    });
  });

  describe('When writeMethod is payloadPath', () => {
    it('Should properly send log', async () => {
      const stringValue = 'Hello World';
      const tags = ['testTag1', 'testTag2'];
      const jsonExample = { aString: stringValue, aNumber: 42, aBoolean: true };
      const node = new LogglyWriteNode('id', [[4]], {
        ...config,
        writeMethod: 'payloadPath',
        writePayloadPath: 'data.loggly'
      });

      nock('https://logs-01.loggly.com:443')
        .matchHeader('X-LOGGLY-TAG', 'testTag1,testTag2')
        .post('/inputs/11111111-bbbb-cccc-dddd-222233332222', (body) => {
          body.should.equal('My test log{"aString":"Hello World","aNumber":42,"aBoolean":true}');
          return true;
        })
        .reply(200, { response: 'ok' });

      const result = await node.run(
        {},
        {
          testTemplate: stringValue,
          data: {
            loggly: {
              message: 'My test log',
              json: jsonExample,
              tags: tags
            }
          }
        }
      );

      result[1].out.should.deepEqual({
        success: true,
        results: [
          { success: true, response: 'ok' }
        ]
      });
    });

    it('Should properly send multiple logs', async () => {
      const stringValue = 'Hello World';
      const jsonExample = { aString: stringValue, aNumber: 42, aBoolean: true };
      const node = new LogglyWriteNode('id', [[4]], {
        ...config,
        writeMethod: 'payloadPath',
        writePayloadPath: 'data.loggly'
      });

      nock('https://logs-01.loggly.com:443')
        .matchHeader('X-LOGGLY-TAG', 'testTag1,testTag2')
        .post('/inputs/11111111-bbbb-cccc-dddd-222233332222', (body) => {
          body.should.deepEqual({ aString: 'Hello World', aNumber: 42, aBoolean: true });
          return true;
        })
        .reply(200, { response: 'ok' });

      nock('https://logs-01.loggly.com:443')
        .post('/inputs/11111111-bbbb-cccc-dddd-222233332222', (body) => {
          body.should.equal('Next log');
          return true;
        })
        .reply(200, { response: 'ok' });

      const result = await node.run(
        {},
        {
          testTemplate: stringValue,
          data: {
            loggly: [
              {
                json: jsonExample,
                tags: ['testTag1', 'testTag2']
              },
              {
                message: 'Next log'
              }
            ]
          }
        }
      );

      result[1].out.should.deepEqual({
        success: true,
        results: [
          { success: true, response: 'ok' },
          { success: true, response: 'ok' }
        ]
      });
    });

    it('Should throw error when payload path is invalid', async () => {
      const node = new LogglyWriteNode('id', [[4]], {
        ...config,
        writeMethod: 'payloadPath',
        writePayloadPath: 'data.foo'
      });

      const result = await node.run({}, {
        data: {
          loggly: {
            message: 'My test log'
          }
        }
      });
      result[1].out.should.deepEqual({
        success: false,
        error: 'Log data not found'
      });
    });
  });
});
