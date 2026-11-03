import { nock } from  './common.js';
import { omit } from 'omnibelt';
import AwsLambdaNode from '../src/aws-lambda-node.js';
import { cacheable, lambdaRequestHandler } from '../src/lib/base-aws-node.js';
import { mockClient } from 'aws-sdk-client-mock';
import { Lambda } from '@aws-sdk/client-lambda';
import { awsConfig } from 'losant-nodejs-utils/test/utils/testing-constants.js';

const ACCESS_KEY_ID = awsConfig.accessKeyId;
const ACCESS_SECRET_KEY = awsConfig.secretAccessKey;

const harness = ({ config, payload, theSum }) => {
  const baseConfig = {
    awsAccessKeyId: ACCESS_KEY_ID,
    awsSecretAccessKey: ACCESS_SECRET_KEY,
    awsRegion: 'us-west-2',
    functionName: 'value-addition',
    resultPath: 'result'
  };
  return new AwsLambdaNode('id', [[4]], { ...baseConfig, ...config })
    .run({ externalTimeout: 5000 }, payload)
    .then(([ oids, result ]) => {
      oids.should.deepEqual([[4]]);
      result.result.LogResult.startsWith('START ').should.equal(true);
      result.should.deepEqual({
        ...payload,
        result: {
          ExecutedVersion: '$LATEST',
          LogResult: result.result.LogResult,
          Payload: { theSum },
          StatusCode: 200
        }
      });
    });
};
let mock;
describe('AwsLambdaNode', () => {

  afterEach(() => {
    if (mock) {
      mock.restore();
      mock = undefined;
    }
  });

  it('should correctly place timeout error onto payload path', async function() {
    nock.enableNetConnect();
    const baseConfig = {
      awsAccessKeyId: ACCESS_KEY_ID,
      awsSecretAccessKey: ACCESS_SECRET_KEY,
      awsRegion: 'us-west-2',
      functionName: 'value-addition',
      resultPath: 'result',
      errorPath: 'putErrorHere',
      errorBehavior: 'payloadPath',
      timeoutTemplate: '1'
    };
    const payload = {
      data: {
        val1: 3,
        val2: 4
      }
    };

    const node = new AwsLambdaNode('id', [[4]], { ...baseConfig });
    const [ , result ] = await node.run({ externalTimeout: 1 }, payload);
    result.putErrorHere.should.deepEqual({
      type: 'NodeTimeout',
      message: 'Timeout running AWS Lambda node'
    });
  });

  it('should throw when missing config', async function() {
    const innerHarness = (config) => {
      return new AwsLambdaNode('id', [[4]], config)
        .run({}, {
          awsAccessKeyId: ACCESS_KEY_ID,
          awsSecretAccessKey: ACCESS_SECRET_KEY,
          awsRegion: 'us-west-2'
        });
    };

    const fullConfig = {
      sourceMethod: 'payloadPath',
      awsAccessKeyId: '{{awsAccessKeyId}}',
      awsSecretAccessKey: '{{awsSecretAccessKey}}',
      awsRegion: '{{awsRegion}}',
      functionName: 'value-addition'
    };
    await Promise.all([
      { omit: ['awsAccessKeyId'], message: /AWS Access Key ID/ },
      { omit: ['awsSecretAccessKey'], message: /AWS Secret Key/ },
      { omit: ['awsRegion'], message: /AWS Region/ },
      { omit: ['functionName'], message: /Function Name/ }
    ].map(({ omit: omitList, message }) => {
      return innerHarness(omit(omitList, fullConfig)).should.be.rejectedWith(message);
    }));
  });

  it('should correctly call lambda function: `workflowPayload`', function() {
    mock = mockClient(Lambda);
    mock.resolves({
      LogResult: 'U1RBUlQgUmVxdWVzdElkOiBmMzRkYTU0ZC0xMDNmLTRmOWItOGZmYy0zODk2MTJmNmFlNjEgVmVyc2lvbjogJExBVEVTVApFTkQgUmVxdWVzdElkOiBmMzRkYTU0ZC0xMDNmLTRmOWItOGZmYy0zODk2MTJmNmFlNjEKUkVQT1JUIFJlcXVlc3RJZDogZjM0ZGE1NGQtMTAzZi00ZjliLThmZmMtMzg5NjEyZjZhZTYxCUR1cmF0aW9uOiA1LjMxIG1zCUJpbGxlZCBEdXJhdGlvbjogMTAwIG1zIAlNZW1vcnkgU2l6ZTogMTI4IE1CCU1heCBNZW1vcnkgVXNlZDogNDkgTUIJCg==',
      ExecutedVersion: '$LATEST',
      Payload: { theSum: 7 },
      StatusCode: 200
    });

    return harness({
      config: {
        // also test defaulting to `workflowPayload` by omission
      },
      payload: {
        data: {
          val1: 3,
          val2: 4
        }
      },
      theSum: 7
    });
  });

  it('should correctly call lambda payload: `payloadPath`', function() {
    mock = mockClient(Lambda);
    mock.resolves({
      LogResult: 'U1RBUlQgUmVxdWVzdElkOiBiNjM0MTE0Mi0xZWY1LTRkNzYtOTU5NS0wZjk0MmYxYzlkNjMgVmVyc2lvbjogJExBVEVTVApFTkQgUmVxdWVzdElkOiBiNjM0MTE0Mi0xZWY1LTRkNzYtOTU5NS0wZjk0MmYxYzlkNjMKUkVQT1JUIFJlcXVlc3RJZDogYjYzNDExNDItMWVmNS00ZDc2LTk1OTUtMGY5NDJmMWM5ZDYzCUR1cmF0aW9uOiAyLjUyIG1zCUJpbGxlZCBEdXJhdGlvbjogMTAwIG1zIAlNZW1vcnkgU2l6ZTogMTI4IE1CCU1heCBNZW1vcnkgVXNlZDogNDkgTUIJCg==',
      ExecutedVersion: '$LATEST',
      Payload: { theSum: 10 },
      StatusCode: 200
    });

    return harness({
      config: {
        sourceMethod: 'payloadPath',
        sourceData: 'foo.bar'
      },
      payload: {
        foo: {
          bar: {
            data: {
              val1: 5,
              val2: 5
            }
          }
        }
      },
      theSum: 10
    });
  });

  it('should correctly call lambda payload: `jsonTemplate`', function() {
    mock = mockClient(Lambda);
    mock.resolves({
      LogResult: 'U1RBUlQgUmVxdWVzdElkOiBlMGVjYWYyMS05NWI1LTRjOWYtOWRkOS01ZTEyYzRjMzdiZGEgVmVyc2lvbjogJExBVEVTVApFTkQgUmVxdWVzdElkOiBlMGVjYWYyMS05NWI1LTRjOWYtOWRkOS01ZTEyYzRjMzdiZGEKUkVQT1JUIFJlcXVlc3RJZDogZTBlY2FmMjEtOTViNS00YzlmLTlkZDktNWUxMmM0YzM3YmRhCUR1cmF0aW9uOiAwLjUxIG1zCUJpbGxlZCBEdXJhdGlvbjogMTAwIG1zIAlNZW1vcnkgU2l6ZTogMTI4IE1CCU1heCBNZW1vcnkgVXNlZDogNDkgTUIJCg==',
      ExecutedVersion: '$LATEST',
      Payload: { theSum: 10 },
      StatusCode: 200
    });

    return harness({
      config: {
        sourceMethod: 'jsonTemplate',
        sourceData: '{ "data": { "val1": {{foo.bar}}, "val2": {{baz.qux}} } }'
      },
      payload: {
        foo: { bar: 7 },
        baz: { qux: 3 }
      },
      theSum: 10
    });
  });

  it('should throw when `jsonTemplate` isn\'t valid JSON', function() {
    return harness({
      config: {
        sourceMethod: 'jsonTemplate',
        sourceData: '{ "data": { "val1": {{foo.missing}} } }'
      },
      payload: {}
    }).should.be.rejectedWith(/did not render to valid JSON/);
  });

  it('should throw when `jsonTemplate` is missing', function() {
    return harness({
      config: {
        sourceMethod: 'jsonTemplate'
      },
      payload: {}
    }).should.be.rejectedWith({ type: 'MissingField', message: 'Missing Source Data' });
  });

  it('should throw when `payloadPath` is missing', function() {
    return harness({
      config: {
        sourceMethod: 'payloadPath'
      },
      payload: {}
    }).should.be.rejectedWith({ type: 'MissingField', message: 'Missing Source Data' });
  });

  it('should thrown when timeout is greater than external timeout', async () => {
    await harness({
      config: {
        sourceMethod: 'jsonTemplate',
        sourceData: JSON.stringify({ data: { val1: 7, val2: 3 } }),
        timeoutTemplate: '30000'
      },
      payload: {}
    }).should.be.rejectedWith({ type: 'Validation', message: 'timeoutTemplate cannot be greater than 5 seconds.' });
  });

  it('should pass the shared DNS-caching handler to Lambda clients', async function() {
    const node = new AwsLambdaNode('id', [[4]], {
      awsAccessKeyId: ACCESS_KEY_ID,
      awsSecretAccessKey: ACCESS_SECRET_KEY,
      awsRegion: 'us-east-2',
      functionName: 'value-addition'
    });
    const lambda = await node.createLambdaInstance({ externalTimeout: 5000 }, {});
    lambda.config.requestHandler.should.equal(lambdaRequestHandler);
  });

  it('should cache DNS lookups across Lambda invocations', async function() {
    nock.enableNetConnect();

    const hostname = 'lambda.us-east-2.amazonaws.com';
    cacheable.clear(hostname);

    let resolveCount = 0;
    const origResolve4 = cacheable._resolve4;
    const origResolve6 = cacheable._resolve6;
    cacheable._resolve4 = async () => {
      resolveCount++;
      return [{ address: '127.0.0.1', ttl: 60 }];
    };
    cacheable._resolve6 = async () => [];

    const node = new AwsLambdaNode('id', [[4]], {
      awsAccessKeyId: ACCESS_KEY_ID,
      awsSecretAccessKey: ACCESS_SECRET_KEY,
      awsRegion: 'us-east-2',
      functionName: 'value-addition'
    });

    const runNode = () => node.run({ externalTimeout: 2000 }, {}).catch(() => {});

    try {
      await runNode();
      await runNode();
      resolveCount.should.equal(1);
    } finally {
      cacheable._resolve4 = origResolve4;
      cacheable._resolve6 = origResolve6;
      cacheable.clear(hostname);
    }
  });

  it('should retry once on EAI_AGAIN DNS error and succeed', async function() {
    mock = mockClient(Lambda);
    mock
      .rejectsOnce(Object.assign(new Error('getaddrinfo EAI_AGAIN lambda.us-east-2.amazonaws.com'), { code: 'EAI_AGAIN' }))
      .resolves({
        LogResult: 'U1RBUlQgUmVxdWVzdElkOiBmMzRkYTU0ZC0xMDNmLTRmOWItOGZmYy0zODk2MTJmNmFlNjEgVmVyc2lvbjogJExBVEVTVApFTkQgUmVxdWVzdElkOiBmMzRkYTU0ZC0xMDNmLTRmOWItOGZmYy0zODk2MTJmNmFlNjEKUkVQT1JUIFJlcXVlc3RJZDogZjM0ZGE1NGQtMTAzZi00ZjliLThmZmMtMzg5NjEyZjZhZTYxCUR1cmF0aW9uOiA1LjMxIG1zCUJpbGxlZCBEdXJhdGlvbjogMTAwIG1zIAlNZW1vcnkgU2l6ZTogMTI4IE1CCU1heCBNZW1vcnkgVXNlZDogNDkgTUIJCg==',
        ExecutedVersion: '$LATEST',
        Payload: { theSum: 7 },
        StatusCode: 200
      });

    const increments = [];
    const [oids, result] = await new AwsLambdaNode('id', [[4]], {
      awsAccessKeyId: ACCESS_KEY_ID,
      awsSecretAccessKey: ACCESS_SECRET_KEY,
      awsRegion: 'us-east-2',
      functionName: 'value-addition',
      resultPath: 'result'
    }).run({ externalTimeout: 5000, I: { increment: (k) => increments.push(k) } }, { data: { val1: 3, val2: 4 } });

    oids.should.deepEqual([[4]]);
    result.result.Payload.should.deepEqual({ theSum: 7 });
    result.result.StatusCode.should.equal(200);
    increments.should.deepEqual(['flow.AwsLambdaNode.errorRetry']);
  });

  it('should not retry a second time on repeated EAI_AGAIN DNS error', async function() {
    mock = mockClient(Lambda);
    mock.rejects(Object.assign(new Error('getaddrinfo EAI_AGAIN lambda.us-east-2.amazonaws.com'), { code: 'EAI_AGAIN' }));

    await new AwsLambdaNode('id', [[4]], {
      awsAccessKeyId: ACCESS_KEY_ID,
      awsSecretAccessKey: ACCESS_SECRET_KEY,
      awsRegion: 'us-east-2',
      functionName: 'value-addition',
      resultPath: 'result'
    }).run({ externalTimeout: 5000 }, {}).should.be.rejectedWith(/EAI_AGAIN/);
  });

  it('should put error from response on payload path when errorPath is set', async () => {
    mock = mockClient(Lambda);
    mock.rejects({ name: 'EC2AccessDeniedException', message: 'Need additional permissions to configure VPC settings.' });

    const innerHarness = ({ config, payload }) => {
      const baseConfig = {
        awsAccessKeyId: ACCESS_KEY_ID,
        awsSecretAccessKey: ACCESS_SECRET_KEY,
        awsRegion: 'us-west-2',
        functionName: 'value-addition',
        resultPath: 'result'
      };
      return new AwsLambdaNode('id', [[4]], { ...baseConfig, ...config })
        .run({ externalTimeout: 5000 }, payload)
        .then(([ oids, result ]) => {
          oids.should.deepEqual([[4]]);
          result.should.deepEqual({
            ...payload,
            putErrorHere: { type: 'EC2AccessDeniedException', message: 'Need additional permissions to configure VPC settings.' }
          });
        });
    };
    return innerHarness({
      config: {
        errorPath: 'putErrorHere',
        errorBehavior: 'payloadPath'
      },
      payload: {
        data: {
          val1: 3,
          val2: 4
        }
      }
    });
  });
});
