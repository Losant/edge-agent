import { nock } from './common.js';
import GoogleFunctionNode from '../src/google-function-node.js';
import { fakeGoogleCredentials as jwt } from 'losant-nodejs-utils/test/utils/testing-constants.js';

describe('Google Function Node', () => {
  it('should connect to google with default configs', async () => {
    nock('https://oauth2.googleapis.com:443', { encodedQueryParams: true })
      .post('/token')
      .reply(200, ['1f8b0800000000000013abe65250504a4c4e4e2d2e8e2fc9cf4ecd53b25250aa4c34b2d44b4bcc4ed58508e98014a556146416a516c7678294189b19188045c10ae24b2a0b52411a9d52138b528b94b86a013074434b57000000'], {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Encoding': 'gzip',
        'Transfer-Encoding': 'chunked'
      });
    nock('https://cloudfunctions.googleapis.com:443', { encodedQueryParams: true })
      .post('/v1/projects/test-playground/locations/us-central1/functions/fun1:call')
      .query({ data: '%7B%22message%22%3A%22YELLOW%22%7D' })
      .reply(200, ['1f', '8b', '08', '000000000002ffabe65250504aad484d2e2dc9cccff34c51b252504aca2e4d4cb6ccceca342f3050d20129284a2d2ecd2901c945bafaf8f8872b71d57201000eb9c2163a000000'], {
        'Content-Type': 'application/json; charset=UTF-8',
        'Content-Encoding': 'gzip',
        'Transfer-Encoding': 'chunked'
      });
    const result = await new GoogleFunctionNode('id', [[4]], {
      regionTemplate: 'us-central1',
      functionNameTemplate: 'fun1',
      resultPath: 'output',
      jwtDataTemplate: JSON.stringify(jwt)
    }).run({ externalTimeout: 5000 }, { message: 'YELLOW' });
    result[1].output.should.deepEqual({
      result: 'YELLOW',
      executionId: 'bkuac9kji7p0'
    });
  });

  it('should connect to google with default configs and use a given project id', async () => {
    nock('https://oauth2.googleapis.com:443', { encodedQueryParams: true })
      .post('/token')
      .reply(200, ['1f8b0800000000000013abe65250504a4c4e4e2d2e8e2fc9cf4ecd53b25250aa4c34b2d44b4bcc4ed58508e98014a556146416a516c7678294189b19188045c10ae24b2a0b52411a9d52138b528b94b86a013074434b57000000'], {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Encoding': 'gzip',
        'Transfer-Encoding': 'chunked'
      });
    nock('https://cloudfunctions.googleapis.com:443', { encodedQueryParams: true })
      .post('/v1/projects/foo-bar/locations/us-central1/functions/fun1:call')
      .query({ data: '%7B%22message%22%3A%22YELLOW%22%7D' })
      .reply(200, ['1f', '8b', '08', '000000000002ffabe65250504aad484d2e2dc9cccff34c51b252504aca2e4d4cb6ccceca342f3050d20129284a2d2ecd2901c945bafaf8f8872b71d57201000eb9c2163a000000'], {
        'Content-Type': 'application/json; charset=UTF-8',
        'Content-Encoding': 'gzip',
        'Transfer-Encoding': 'chunked'
      });
    const result = await new GoogleFunctionNode('id', [[4]], {
      regionTemplate: 'us-central1',
      functionNameTemplate: 'fun1',
      resultPath: 'output',
      jwtDataTemplate: JSON.stringify(jwt),
      projectIdTemplate: 'foo-bar'
    }).run({ externalTimeout: 5000 }, { message: 'YELLOW' });
    result[1].output.should.deepEqual({
      result: 'YELLOW',
      executionId: 'bkuac9kji7p0'
    });
  });

  it('should connect to google via unauthenticated http trigger', async () => {
    nock('https://us-central1-test-playground.cloudfunctions.net:443', { encodedQueryParams: true })
      .post('/fun1', { message: 'YELLOW' })
      .reply(200, 'YELLOW', [ 'Content-Type', 'text/html; charset=utf-8', 'Etag', 'W/"6-+DoOVEeFBVE3BNBWnmGHHouLN6c"', 'Function-Execution-Id', 'ck6dnd3z0vge'
      ]);

    const result = await new GoogleFunctionNode('id', [[4]], {
      invocationMethod: 'http',
      triggerUrlTemplate: 'https://us-central1-test-playground.cloudfunctions.net/fun1',
      allowUnauthenticated: true,
      resultPath: 'output'
    }).run({ externalTimeout: 5000 }, { message: 'YELLOW' });

    result[1].output.should.deepEqual({
      result: 'YELLOW',
      executionId: 'ck6dnd3z0vge'
    });
  });

  it('should connect to google via authenticated http trigger', async () => {
    nock('https://oauth2.googleapis.com:443', { encodedQueryParams: true })
      .post('/token')
      .reply(200, ['1f8b0800000000000013b5914baf9b301085ff4bf6a9800402dde5e940305c1eb1c19b0830c4e6157243c2a3ea7f2f69d54a5d74d9c5d148d6cc39339fbfcd38bdb4b722ad675f67e960b01824dce686771e75d1e2fa43afda866c7545af9c915484873963049c3b880d6e01c260150e16b6aa30df7736b07282f5a5bd8302dc9122c4909b5b434883f5dbf384448767ce97770cc5cefbe9468f6e978cb797b940a389ad32aedd21c45d6f066e992c9c36013d4b311de2057a92ad9cc740130920625c594284b56732c84f1238af08a0470cd4964ada1003e71dcbd2fa676c15e2b634f1210f254d9cfcd714a0916ec52e0607992c8c17c5726156258b3db94e2434d0aa9ccef8ddef3ca7daeabce3048b2cc2dd7ff0ec335aa121c2a4216f2e13038acf137ab44c26f4d00f875fda8fd6b6e3113e087a7eebad5c9fb45f583e14a67b9b6401ff662afdd96f342bfa8a25fa20dec45012de7c468af5a95fefe06efd2fbdbfeb406bc717fb921a86b645655469e5dd06c7d721b92f657b100f32f6b55d886d8e2cdb6050e81555dc5304938ee33a3826fb2cadc3bb345fb0159d366d98e7dc4eb15949ada26660c3dd0c0c146c1559d145e9599e3f4850c8d666be597bb2c3a2dced24adbe0717792348c79512432d97449f3cdcaab81817fb2a44d0431bcd74cff9f5a92c7791122d579f1f502bd0d97892e4235be6190add2ec8c4650687a0695a0d8a6827ced77e0ecb9415f99add0278f9e0e9895d41b48a71fd286e97873c4dece79fa179d58f45b3b694566d76877ad8e334c9c74e9dbff83648420fba7e808caacb8f692fd53b9ff74699a4edc5eb9943578ea9b2665c1eb8aaa2fee29c72dc3bb3ef3f00cece197d7b030000'], [ 'Content-Type', 'application/json; charset=UTF-8', 'Vary', 'Origin', 'Vary', 'X-Origin', 'Vary', 'Referer', 'Content-Encoding', 'gzip' ]);

    nock('https://us-central1-test-playground.cloudfunctions.net:443', { encodedQueryParams: true })
      .post('/hello-world', { message: 'YELLOW' })
      .reply(200, ['1f', '8b', '08', '00', '00', '00', '00', '00', '02', 'ff', '8b', '74', 'f5', 'f1', 'f1', '0f', '07', '00', '19', '2b', 'fc2006000000'], [ 'Content-Type', 'text/html; charset=utf-8', 'Function-Execution-Id', 'a0kztc9znmzk', 'Content-Encoding', 'gzip' ]);

    const result = await new GoogleFunctionNode('id', [[4]], {
      invocationMethod: 'http',
      triggerUrlTemplate: 'https://us-central1-test-playground.cloudfunctions.net/hello-world',
      allowUnauthenticated: false,
      resultPath: 'output',
      jwtDataTemplate: JSON.stringify(jwt)
    }).run({ externalTimeout: 5000 }, { message: 'YELLOW' });
    result[1].output.should.deepEqual({
      result: 'YELLOW',
      executionId: 'a0kztc9znmzk'
    });
  });

  it('should 500 on http function errors', async () => {
    nock('https://us-central1-test-playground.cloudfunctions.net:443', { encodedQueryParams: true })
      .post('/fun1', { message: 'YELLOW' })
      .reply(500, 'Error: could not handle the request\n', [ 'Content-Type', 'text/plain; charset=utf-8' ]);

    const result = await new GoogleFunctionNode('id', [[4]], {
      invocationMethod: 'http',
      triggerUrlTemplate: 'https://us-central1-test-playground.cloudfunctions.net/fun1',
      allowUnauthenticated: true,
      resultPath: 'output'
    }).run({ externalTimeout: 5000 }, { message: 'YELLOW' });

    result[1].output.should.deepEqual({
      error: {
        message: 'Request failed with status code 500',
        type: 'GCP_FUNCTION_ERROR'
      }
    });
  });

  it('should take input from a payloadPath', async () => {
    nock('https://oauth2.googleapis.com:443', { encodedQueryParams: true })
      .post('/token')
      .reply(200, ['1f8b0800000000000013abe65250504a4c4e4e2d2e8e2fc9cf4ecd53b25250aa4c34b2d44b4bcc4ed58508e98014a556146416a516c7678294189b19188045c10ae24b2a0b52411a9d52138b528b94b86a013074434b57000000'], {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Encoding': 'gzip',
        'Transfer-Encoding': 'chunked'
      });
    nock('https://cloudfunctions.googleapis.com:443', { encodedQueryParams: true })
      .post('/v1/projects/test-playground/locations/us-central1/functions/fun1:call')
      .query({ data: '%7B%22message%22%3A%22RED%22%7D' })
      .reply(200, ['1f', '8b', '08', '00', '00', '00', '00', '0002ffabe65250504aad484d2e2dc9cccff34c51b25250b22ccfca2a2aad2c48334f4e51d20129284a2d2ecd2901c905b9ba2871d57201008b2c544b37000000'], {
        'Content-Type': 'application/json; charset=UTF-8',
        'Content-Encoding': 'gzip',
        'Transfer-Encoding': 'chunked'
      });
    const result = await new GoogleFunctionNode('id', [[4]], {
      regionTemplate: 'us-central1',
      functionNameTemplate: 'fun1',
      resultPath: 'output',
      sourceDataMethod: 'payloadPath',
      sourceDataTemplate: 'data',
      jwtDataTemplate: JSON.stringify(jwt)
    }).run({ externalTimeout: 5000 }, {
      data: { message: 'RED' }
    });
    result[1].output.should.deepEqual({
      result: 'RED',
      executionId: '9wjjruypf7cd'
    });
  });

  it('should take input from a jsonTemplate', async () => {
    nock('https://oauth2.googleapis.com:443', { encodedQueryParams: true })
      .post('/token')
      .reply(200, ['1f8b0800000000000013abe65250504a4c4e4e2d2e8e2fc9cf4ecd53b25250aa4c34b2d44b4bcc4ed58508e98014a556146416a516c7678294189b19188045c10ae24b2a0b52411a9d52138b528b94b86a013074434b57000000'], {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Encoding': 'gzip',
        'Transfer-Encoding': 'chunked'
      });
    nock('https://cloudfunctions.googleapis.com:443', { encodedQueryParams: true })
      .post('/v1/projects/test-playground/locations/us-central1/functions/fun1:call')
      .query({ data: '%7B%22message%22%3A%22BLUE%22%7D' })
      .reply(200, ['1f', '8b', '08', '00', '00', '00', '00', '00', '02ffabe65250504aad484d2e2dc9cccff34c51b25250b22ccfcaca4a4a34b728cd4a55d20129284a2d2ecd2901c939f984ba2a71d5720100cebef5f438000000']
        , {
          'Content-Type': 'application/json; charset=UTF-8',
          'Content-Encoding': 'gzip',
          'Transfer-Encoding': 'chunked'
        });
    const result = await new GoogleFunctionNode('id', [[4]], {
      regionTemplate: 'us-central1',
      functionNameTemplate: 'fun1',
      resultPath: 'output',
      sourceDataMethod: 'jsonTemplate',
      sourceDataTemplate: '{"message":"BLUE"}',
      jwtDataMethod: 'jsonTemplate',
      jwtDataTemplate: JSON.stringify(jwt)
    }).run({ externalTimeout: 5000 }, {});
    result[1].output.should.deepEqual({
      result: 'BLUE',
      executionId: '9wjjjba78uje'
    });
  });

  it('should take a JWT from a payloadPath', async () => {
    nock('https://oauth2.googleapis.com:443', { encodedQueryParams: true })
      .post('/token')
      .reply(200, ['1f8b0800000000000013abe65250504a4c4e4e2d2e8e2fc9cf4ecd53b25250aa4c34b2d44b4bcc4ed58508e98014a556146416a516c7678294189b19188045c10ae24b2a0b52411a9d52138b528b94b86a013074434b57000000'], {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Encoding': 'gzip',
        'Transfer-Encoding': 'chunked'
      });
    nock('https://cloudfunctions.googleapis.com:443', { encodedQueryParams: true })
      .post('/v1/projects/test-playground/locations/us-central1/functions/fun1:call')
      .query({ data: '%7B%22message%22%3A%22YELLOW%22%7D' })
      .reply(200, ['1f', '8b', '08', '00', '00', '00', '00', '00', '02', 'ffabe65250504aad484d2e2dc9cccff34c51b25250ca4b2f484d4b2aceab344e4a56d20129284a2d2ecd2901c945bafaf8f8872b71d57201002b1f07513a000000'], {
        'Content-Type': 'application/json; charset=UTF-8',
        'Content-Encoding': 'gzip',
        'Transfer-Encoding': 'chunked'
      });
    const result = await new GoogleFunctionNode('id', [[4]], {
      regionTemplate: 'us-central1',
      functionNameTemplate: 'fun1',
      resultPath: 'output',
      jwtDataMethod: 'payloadPath',
      jwtDataTemplate: 'jwt',
      sourceDataMethod: 'payloadPath',
      sourceDataTemplate: 'input'
    }).run({ externalTimeout: 5000 }, {
      input: { message: 'YELLOW' },
      jwt
    });
    result[1].output.should.deepEqual({
      result: 'YELLOW',
      executionId: 'ngpefbsny3bc'
    });
  });

  it('should error on missing jsonTemplate', async () => {
    await new GoogleFunctionNode('id', [[4]], {
      regionTemplate: 'us-central1',
      functionNameTemplate: 'fun1',
      resultPath: 'output',
      sourceDataMethod: 'jsonTemplate',
      jwtDataTemplate: JSON.stringify(jwt)
    }).run({ externalTimeout: 5000 }, {}).should.be.rejectedWith({ type: 'MissingField', message: 'Missing Source Data' });
  });

  it('should error on missing payloadPath', async () => {
    await new GoogleFunctionNode('id', [[4]], {
      regionTemplate: 'us-central1',
      functionNameTemplate: 'fun1',
      resultPath: 'output',
      sourceDataMethod: 'payloadPath',
      jwtDataTemplate: JSON.stringify(jwt)
    }).run({ externalTimeout: 5000 }, {}).should.be.rejectedWith({ type: 'MissingField', message: 'Missing Source Data' });
  });

  it('should correctly error when auth credentials cannot be resolved', async () => {
    await new GoogleFunctionNode('id', [[4]], {
      regionTemplate: 'us-central1',
      invocationMethod: 'http',
      functionNameTemplate: 'fun1',
      resultPath: 'output',
      jwtDataMethod: 'payloadPath',
      jwtDataTemplate: 'jwt'
    }).run({ externalTimeout: 5000 }, { }).should.be.rejectedWith({ type: 'MissingField', message: 'Missing JWT Payload Path' });
  });


  it('should error on invalid projectId', async () => {
    await new GoogleFunctionNode('id', [[4]], {
      regionTemplate: 'us-central1',
      functionNameTemplate: 'fun1',
      resultPath: 'output',
      jwtDataTemplate: JSON.stringify({ ...jwt, project_id: '-1nv4l1d' })
    }).run({ externalTimeout: 5000 }, {}).should.be.rejectedWith({ type: 'Validation', message: 'Invalid Project ID' });
  });

  it('should error on missing projectId', async () => {
    await new GoogleFunctionNode('id', [[4]], {
      regionTemplate: 'us-central1',
      functionNameTemplate: 'fun1',
      resultPath: 'output',
      jwtDataTemplate: JSON.stringify({ ...jwt, project_id: '' })
    }).run({ externalTimeout: 5000 }, {}).should.be.rejectedWith({ type: 'Validation', message: 'Project ID is required' });
  });

  it('should error on missing region', async () => {
    await new GoogleFunctionNode('id', [[4]], {
      regionTemplate: '',
      functionNameTemplate: 'fun1',
      resultPath: 'output',
      jwtDataTemplate: JSON.stringify(jwt)
    }).run({ externalTimeout: 5000 }, {}).should.be.rejectedWith({ type: 'Validation', message: 'Region is required' });
  });

  it('should error on missing function name', async () => {
    await new GoogleFunctionNode('id', [[4]], {
      regionTemplate: 'us-central1',
      functionNameTemplate: '',
      resultPath: 'output',
      jwtDataTemplate: JSON.stringify(jwt)
    }).run({ externalTimeout: 5000 }, {}).should.be.rejectedWith({ type: 'Validation', message: 'Function Name is required' });
  });

  it('should error on invalid function name', async () => {
    await new GoogleFunctionNode('id', [[4]], {
      regionTemplate: 'us-central1',
      functionNameTemplate: '-1nv4lid-',
      resultPath: 'output',
      jwtDataTemplate: JSON.stringify(jwt)
    }).run({ externalTimeout: 5000 }, {}).should.be.rejectedWith({ type: 'Validation', message: 'Invalid Function Name' });
  });

  it('should validate triggerUrl', async () => {
    await new GoogleFunctionNode('id', [[4]], {
      regionTemplate: 'us-central1',
      invocationMethod: 'http',
      triggerUrlTemplate: 'Spongebob',
      resultPath: 'output',
      jwtDataTemplate: JSON.stringify(jwt)
    }).run({ externalTimeout: 5000 }, {}).should.be.rejectedWith({ type: 'Validation', message: 'Invalid URL: Spongebob' });

    await new GoogleFunctionNode('id', [[4]], {
      regionTemplate: 'us-central1',
      invocationMethod: 'http',
      triggerUrlTemplate: 'https://www.losant.com',
      resultPath: 'output',
      jwtDataTemplate: JSON.stringify(jwt)
    }).run({ externalTimeout: 5000 }, {}).should.be.rejectedWith({ type: 'Validation', message: 'Google Cloud functions must be at hostname ".cloudfunctions.net, .run.app".' });
  });

  it('should 403 on inaccessible projectId', async () => {
    nock('https://oauth2.googleapis.com:443', { encodedQueryParams: true })
      .post('/token')
      .reply(200, ['1f8b0800000000000013abe65250504a4c4e4e2d2e8e2fc9cf4ecd53b25250aa4c34b2d44b4bcc4ed58508e98014a556146416a516c7678294189b19188045c10ae24b2a0b52411a9d52138b528b94b86a013074434b57000000'], {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Encoding': 'gzip',
        'Transfer-Encoding': 'chunked'
      });
    nock('https://cloudfunctions.googleapis.com:443', { encodedQueryParams: true })
      .post('/v1/projects/example-project/locations/us-central1/functions/fun1:call')
      .query({ data: '%7B%22message%22%3A%22YELLOW%22%7D' })
      .reply(403, ['1f8b0800000000000013ad8e310f82400c85777e4573b31a139d9c6160108c8cc69883abe40c47490b8909e1bf7b9c37f8039cdaefbdf4bdce09804266627582d983c7860c7a3aee0f9bafe05044b7aba62ec8ce8a58eac1606fd180df1885266e1006a6173623e05bbba1c36de49d8a41a1487cce2d30c4c6bf968430434edb7ecd6a3baa75f7eb316aa1e03d896b6b7c858aee12e63d7e2ba31e27090f65d7735e5579593cd2acc8b3743d589225f900591356583f010000'], {
        'Content-Type': 'application/json; charset=UTF-8',
        'Content-Encoding': 'gzip'
      });

    const result = await new GoogleFunctionNode('id', [[4]], {
      regionTemplate: 'us-central1',
      functionNameTemplate: 'fun1',
      resultPath: 'output',
      jwtDataTemplate: JSON.stringify({ ...jwt, client_email: 'bob', project_id: 'example-project' })
    }).run({ externalTimeout: 5000 }, { message: 'YELLOW' });
    result[1].output.should.deepEqual({
      error: {
        code: 403,
        message:
           'Permission denied on resource project example-project.',
        errors:  [{
          message: 'Permission denied on resource project example-project.',
          domain: 'global',
          reason: 'forbidden'
        }],
        status: 'PERMISSION_DENIED'
      }
    });
  });

  it('should 403 on inaccessible function', async () => {
    nock('https://oauth2.googleapis.com:443', { encodedQueryParams: true })
      .post('/token')
      .reply(200, ['1f8b0800000000000013abe65250504a4c4e4e2d2e8e2fc9cf4ecd53b25250aa4c34b2d44b4bcc4ed58508e98014a556146416a516c7678294189b19188045c10ae24b2a0b52411a9d52138b528b94b86a013074434b57000000'], {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Encoding': 'gzip',
        'Transfer-Encoding': 'chunked'
      });
    nock('https://cloudfunctions.googleapis.com:443', { encodedQueryParams: true })
      .post('/v1/projects/test-playground/locations/us-central1/functions/doesntexist:call')
      .query({ data: '%7B%22message%22%3A%22YELLOW%22%7D' })
      .reply(403, ['1f', '8b', '08', '00', '00', '00', '00', '00', '02', 'ff', '9d', '8e', 'b1', '0e', 'c2', '300c44f77e859599010926e676e84041940d21e436a6444a63141796aaff4e1232303359ef4eefe4b90050e43d7bb5833940c09e3505daae37ab6f3092080e3153e707418fd69207cd24e0788207be099ee4472362d8a96ca55509d22531e4f9ff1793a97944e3a23858eed0fe769e50387577f69dd19a9ccaed92ee35bf26134eaff89a3a56a77dddb6f5a1b99555535765149662293e0320879f19010000'], {
        'Content-Type': 'application/json; charset=UTF-8',
        'Content-Encoding': 'gzip',
        'Transfer-Encoding': 'chunked'
      });
    const result = await new GoogleFunctionNode('id', [[4]], {
      regionTemplate: 'us-central1',
      functionNameTemplate: 'doesntexist',
      resultPath: 'output',
      jwtDataTemplate: JSON.stringify(jwt)
    }).run({ externalTimeout: 5000 }, { message: 'YELLOW' });
    result[1].output.should.deepEqual({
      error: {
        code: 403,
        message: 'The caller does not have permission',
        errors: [{
          message: 'The caller does not have permission',
          domain: 'global',
          reason: 'forbidden'
        }],
        status: 'PERMISSION_DENIED'
      }
    });
  });

  it('should place errors from GCP on the payload', async () => {
    nock('https://oauth2.googleapis.com:443', { encodedQueryParams: true })
      .post('/token')
      .reply(200, ['1f8b0800000000000013abe65250504a4c4e4e2d2e8e2fc9cf4ecd53b25250aa4c34b2d44b4bcc4ed58508e98014a556146416a516c7678294189b19188045c10ae24b2a0b52411a9d52138b528b94b86a013074434b57000000'], {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Encoding': 'gzip',
        'Transfer-Encoding': 'chunked'
      });
    nock('https://cloudfunctions.googleapis.com:443', { encodedQueryParams: true })
      .post('/v1/projects/test-playground/locations/us-central1/functions/fun1:call')
      .query({ data: '%7B%22message%22%3A%22YELLOW%22%7D' })
      .reply(200, ['1f', '8b', '08', '00', '00', '00', '00', '00', '02', 'ff', 'ab', 'e6', '52', '50', '50', '4a', '2d', '2aca2f52b25250720531ac14d24af3924b32f3f314928b128b335253f4145c524b1233738aad62f2423d14fc3d143c155c8382fc835c5d94b86ab900d0bb4f6044000000'], {
        'Content-Type': 'application/json; charset=UTF-8',
        'Content-Encoding': 'gzip',
        'Transfer-Encoding': 'chunked'
      });
    const result = await new GoogleFunctionNode('id', [[4]], {
      regionTemplate: 'us-central1',
      functionNameTemplate: 'fun1',
      resultPath: 'output',
      jwtDataTemplate: JSON.stringify(jwt)
    }).run({ externalTimeout: 5000 }, { message: 'YELLOW' });
    result[1].output.should.deepEqual({
      error: 'Error: function crashed. Details:\nUH OH I ERRORED'
    });
  });

  it('should allow for gen2 hostnames to be used', async () => {
    nock('https://hello-example-uc.a.run.app:443', { encodedQueryParams: true })
      .post('/', { message: 'YELLOW' })
      .reply(200, 'Hello World!', [
        'content-type',
        'text/html; charset=utf-8',
        'X-Cloud-Trace-Context',
        '16c9a7625ae6d2b5bfb15123b48795ce;o=1',
        'Date',
        'Thu, 16 Feb 2023 17:02:22 GMT',
        'Server',
        'Google Frontend',
        'Content-Length',
        '12',
        'Alt-Svc',
        'h3=":443"; ma=2592000,h3-29=":443"; ma=2592000,h3-Q050=":443"; ma=2592000,h3-Q046=":443"; ma=2592000,h3-Q043=":443"; ma=2592000,quic=":443"; ma=2592000; v="46,43"',
        'Connection',
        'close'
      ]);

    const result = await new GoogleFunctionNode('id', [[4]], {
      regionTemplate: 'us-central1',
      triggerUrlTemplate: 'https://hello-example-uc.a.run.app',
      functionNameTemplate: 'dts-2nd-gen-hello',
      resultPath: 'output',
      invocationMethod: 'http',
      allowUnauthenticated: true
    }).run({ externalTimeout: 5000 }, { message: 'YELLOW' });
    result[1].output.should.deepEqual({ result: 'Hello World!', executionId: undefined });
  });
});

