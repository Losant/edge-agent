import { nock } from '../common.js';
import ParticleCallNode from '../../src/nodes/particle-call-node.js';
import { particleConfigFake } from 'losant-nodejs-utils/test/utils/testing-constants.js';
import { ID_ZERO_STR } from 'losant-nodejs-utils/src/constants/id-zero.js';

describe('ParticleCallNode', () => {
  it('should successfully call function from direct config', async () => {
    nock('https://api.particle.io:443', {
      encodedQueryParams: true,
      reqheaders: { authorization: `Bearer ${particleConfigFake.accessToken}` }
    })
      .post('/v1/devices/3a001d000447343337373737/testFunction', { args: 'myDataMessage' })
      .reply(200,
        { id: '3a001d000447343337373737', last_app: '', connected: true, return_value: 4 },
        [ 'Content-Type', 'application/json; charset=utf-8' ]);

    const node = new ParticleCallNode('id', [[4]], {
      accessToken: particleConfigFake.accessToken,
      argMethod: 'stringTemplate',
      argTemplate: '{{b}}',
      nameTemplate: '{{c}}',
      deviceTemplate: '{{d}}',
      resultPath: 'e'
    });

    const results = await node.run({}, {
      b: 'myDataMessage',
      c: 'testFunction',
      d: '3a001d000447343337373737'
    });
    results.should.deepEqual([ [[4]], {
      b: 'myDataMessage',
      c: 'testFunction',
      d: '3a001d000447343337373737',
      e: {
        connected: true,
        id: '3a001d000447343337373737',
        last_app: '',
        return_value: 4
      }
    }]);
  });

  it('should require direct config', async () => {
    const node = new ParticleCallNode('id', [[4]], {
      integrationId: ID_ZERO_STR,
      argMethod: 'stringTemplate',
      argTemplate: '{{b}}',
      resultPath: 'e'
    });

    const results = await node.run({}, {
      b: 'myDataMessage',
      c: 'testFunction',
      d: '3a001d000447343337373737'
    });
    results.should.deepEqual([ [[4]], {
      b: 'myDataMessage',
      c: 'testFunction',
      d: '3a001d000447343337373737',
      e: { error: { message: 'Access Token is required', type: 'Validation' } }
    }]);
  });
});
