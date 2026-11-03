import { nock } from '../common.js';
import LosantApiNode from '../../src/nodes/losant-api-node.js';

describe('LosantApiNode', () => {
  it('should send http request correctly, with retry', async () => {
    const node = new LosantApiNode('id', [[4]], {
      resource: 'device',
      responsePath: 'a.b',
      action: 'get',
      params: [{ name: 'deviceId', type: 'string', value: '{{a.c}}' }]
    });

    nock('https://foo.bar.com', { reqheaders: { 'accept-version': '*' } })
      .post('/auth/device?_actions=false&_links=true&_embedded=true', {
        deviceId: '569ff47597b69c01001e2300',
        key: 'aKey',
        secret: 'aSecret'
      })
      .reply(200, '{ "token": "thisIsAToken" }');

    nock('https://foo.bar.com', { reqheaders: { 'accept-version': '*', 'Authorization': 'Bearer thisIsAToken' } })
      .get('/applications/569ff47597b69c01001e230f/devices/569ff4bc97b69c01001e2310?_actions=false&_links=false&_embedded=true')
      .replyWithError('ECONNREFUSED');

    nock('https://foo.bar.com', { reqheaders: { 'accept-version': '*', 'Authorization': 'Bearer thisIsAToken' } })
      .get('/applications/569ff47597b69c01001e230f/devices/569ff4bc97b69c01001e2310?_actions=false&_links=false&_embedded=true')
      .reply(200, '{ "hi": "bye" }');

    const [oids, p] = await node.run(
      {
        flowId: '57c84a330ef69d0100340e93',
        applicationId: '569ff47597b69c01001e230f',
        gatewayConf: {
          id: '569ff47597b69c01001e2300',
          key: 'aKey',
          secret: 'aSecret',
          apiUrl: 'https://foo.bar.com'
        }
      },
      { a: { c: '569ff4bc97b69c01001e2310' } });
    oids.should.deepEqual([[4]]);
    p.should.deepEqual({
      a: {
        c: '569ff4bc97b69c01001e2310',
        b: { result: { hi: 'bye' } }
      }
    });
  });

});
