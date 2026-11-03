import { nock } from './common.js';
import fixtureData from './__fixtures__/google-ml-node/static.js';
import GoogleMlNode from '../src/google-ml-node.js';
import {
  DATA_METHOD_PAYLOAD_PATH,
  DATA_METHOD_JSON_TEMPLATE
} from '../src/lib/constants.js';

const { validData, invalidData } = fixtureData;

describe('GoogleMlNode', () => {
  it('should get predictions for valid input data with a valid JWT payload path', async function() {
    const {
      accessToken, predictions, jwt, modelName, modelVersion, instances
    } = validData;
    nock('https://oauth2.googleapis.com:443', { encodedQueryParams: true })
      .post('/token')
      .reply(200,
        { access_token: accessToken, expires_in: 3600, token_type: 'Bearer' },
        [ 'Content-Type', 'application/json; charset=utf-8' ]
      );

    nock('https://ml.googleapis.com:443', { encodedQueryParams: true })
      .post('/v1/projects/test-playground/models/smart_factory_vibration/versions/v1:predict', { instances })
      .reply(200, { predictions }, ['Content-Type', 'application/json']);

    const node = new GoogleMlNode('id', [[4]], {
      modelName,
      modelVersion,
      jwtDataMethod: DATA_METHOD_PAYLOAD_PATH,
      jwtPayloadPath: 'jwt',
      instancesPath: 'instances',
      resultPath: 'predictions'
    });

    const [outputIds, payload] = await node.run({}, { jwt, instances });

    outputIds.should.deepEqual([[4]]);
    payload.predictions.should.deepEqual(predictions);
  });

  it('should get predictions for valid input data with a valid JWT payload path with a different project id', async function() {
    const {
      accessToken, predictions, jwt, modelName, modelVersion, instances
    } = validData;

    nock('https://oauth2.googleapis.com:443', { encodedQueryParams: true })
      .post('/token')
      .reply(200,
        { access_token: accessToken, expires_in: 3600, token_type: 'Bearer' },
        [ 'Content-Type', 'application/json; charset=utf-8' ]
      );

    nock('https://ml.googleapis.com:443', { encodedQueryParams: true })
      .post('/v1/projects/foo-bar/models/smart_factory_vibration/versions/v1:predict', { instances })
      .reply(200, { predictions }, ['Content-Type', 'application/json']);

    const node = new GoogleMlNode('id', [[4]], {
      modelName,
      modelVersion,
      jwtDataMethod: DATA_METHOD_PAYLOAD_PATH,
      projectIdTemplate: '{{ project }}',
      jwtPayloadPath: 'jwt',
      instancesPath: 'instances',
      resultPath: 'predictions'
    });

    const [outputIds, payload] = await node.run({}, { jwt, instances, project: 'foo-bar' });

    outputIds.should.deepEqual([[4]]);
    payload.predictions.should.deepEqual(predictions);
  });

  it('should get predictions for valid input data with a valid JWT JSON template', async function() {
    const {
      accessToken, predictions, jwt, modelName, modelVersion, instances
    } = validData;

    nock('https://oauth2.googleapis.com:443', { encodedQueryParams: true })
      .post('/token')
      .reply(200,
        { access_token: accessToken, expires_in: 3600, token_type: 'Bearer' },
        [ 'Content-Type', 'application/json; charset=utf-8' ]
      );

    nock('https://ml.googleapis.com:443', { encodedQueryParams: true })
      .post('/v1/projects/test-playground/models/smart_factory_vibration/versions/v1:predict', { instances })
      .reply(200, { predictions }, ['Content-Type', 'application/json']);

    const node = new GoogleMlNode('id', [[4]], {
      modelName,
      modelVersion,
      jwtDataMethod: DATA_METHOD_JSON_TEMPLATE,
      jwtJsonTemplate: JSON.stringify(jwt),
      instancesPath: 'instances',
      resultPath: 'predictions'
    });

    const [outputIds, payload] = await node.run({}, { instances });

    outputIds.should.deepEqual([[4]]);
    payload.predictions.should.deepEqual(predictions);
  });

  it('should throw a NodeTimeoutError if fetch promise times out', async function() {
    const {
      accessToken, predictions, jwt, modelName, modelVersion, instances
    } = validData;

    nock('https://oauth2.googleapis.com:443', { encodedQueryParams: true })
      .post('/token')
      .reply(200,
        { access_token: accessToken, expires_in: 3600, token_type: 'Bearer' },
        [ 'Content-Type', 'application/json; charset=utf-8' ]
      );

    nock('https://ml.googleapis.com:443', { encodedQueryParams: true })
      .post('/v1/projects/test-playground/models/smart_factory_vibration/versions/v1:predict', { instances })
      .delayBody(500)
      .reply(200, { predictions }, ['Content-Type', 'application/json']);

    const node = new GoogleMlNode('id', [[4]], {
      modelName,
      modelVersion,
      jwtDataMethod: DATA_METHOD_PAYLOAD_PATH,
      jwtPayloadPath: 'jwt',
      instancesPath: 'instances',
      resultPath: 'predictions'
    });

    await node.run({ externalTimeout: 10 }, { jwt, instances }).should.be.rejectedWith({ name: 'NodeTimeoutError' });
  });

  it('should throw an InvalidEnumValue for invalid jwtDataMethod value', async function() {
    const { jwt, modelName, modelVersion, instances } = validData;

    const node = new GoogleMlNode('id', [[4]], {
      modelName,
      modelVersion,
      jwtDataMethod: 'not a valid data method',
      jwtJsonTemplate: jwt,
      instancesPath: 'instances',
      resultPath: 'predictions'
    });

    await node.run({}, { instances }).should.be.rejectedWith({ name: 'InvalidEnumValueError' });
  });

  it('should throw an AuthenticationError for invalid credentials', async function() {
    const { jwt } = invalidData;
    const { modelName, modelVersion, instances } = validData;

    const node = new GoogleMlNode('id', [[4]], {
      modelName,
      modelVersion,
      jwtDataMethod: DATA_METHOD_JSON_TEMPLATE,
      jwtJsonTemplate: JSON.stringify(jwt),
      instancesPath: 'instances',
      resultPath: 'predictions'
    });

    await node.run({}, { instances }).should.be.rejectedWith({ name: 'AuthenticationError' });
  });

  it('should throw an InvalidTypeError if instances is not array', async function() {
    const { jwt, modelName, modelVersion } = validData;

    const node = new GoogleMlNode('id', [[4]], {
      modelName,
      modelVersion,
      jwtDataMethod: DATA_METHOD_JSON_TEMPLATE,
      jwtJsonTemplate: JSON.stringify(jwt),
      instancesPath: 'instances',
      resultPath: 'predictions'
    });

    await node.run({}, { instances: null }).should.be.rejectedWith({ name: 'InvalidTypeError' });
  });

  it('should throw a InvalidJsonError if JWT is an empty string', async function() {
    const jwt = '';
    const { modelName, modelVersion, instances } = validData;

    const node = new GoogleMlNode('id', [[4]], {
      modelName,
      modelVersion,
      jwtDataMethod: DATA_METHOD_JSON_TEMPLATE,
      jwtJsonTemplate: jwt,
      instancesPath: 'instances',
      resultPath: 'predictions'
    });

    await node.run({}, { instances }).should.be.rejectedWith({ name: 'InvalidJsonError' });
  });

  it('should not throw an error if node config is correct and we get an error back from Cloud ML', async function() {
    const { instances, error } = invalidData;
    const { accessToken, jwt, modelName, modelVersion } = validData;

    nock('https://oauth2.googleapis.com:443', { encodedQueryParams: true })
      .post('/token')
      .reply(200,
        { access_token: accessToken, expires_in: 3600, token_type: 'Bearer' },
        [ 'Content-Type', 'application/json; charset=utf-8' ]
      );

    nock('https://ml.googleapis.com:443', { encodedQueryParams: true })
      .post('/v1/projects/test-playground/models/smart_factory_vibration/versions/v1:predict', { instances })
      .reply(200, { error }, ['Content-Type', 'application/json']);

    const node = new GoogleMlNode('id', [[4]], {
      modelName,
      modelVersion,
      jwtDataMethod: DATA_METHOD_JSON_TEMPLATE,
      jwtJsonTemplate: JSON.stringify(jwt),
      instancesPath: 'instances',
      resultPath: 'result'
    });

    const [outputIds, payload] = await node.run({}, { instances });

    outputIds.should.deepEqual([[4]]);
    payload.result.should.deepEqual({ error });
  });
});
