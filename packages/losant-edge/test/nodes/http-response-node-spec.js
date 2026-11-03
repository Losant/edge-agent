import '../common.js';
import { defer } from 'omnibelt';
import HttpResponseNode from '../../src/nodes/http-response-node.js';

describe('HttpResponseNode', () => {

  it('should correct send reply', async () => {
    const node = new HttpResponseNode('id', [[1]], {
      bodyTemplate: '{{hello}}',
      bodyTemplateType: 'string',
      responseCodeTemplate: '{{goodbye}}',
      headerInfo: [{ keyTemplate: 'one{{foo}}', valueTemplate: 'two{{foo}}' }],
      cookieInfo: [{ nameTemplate: 'one{{foo}}', valueTemplate: 'two{{foo}}', maxAgeTemplate: 1, pathTemplate: 'three{{foo}}' }]
    });

    const deferred = defer();

    const context = {
      flowId: 'myFlowId',
      applicationId: 'myAppId',
      originalPayload: { data: { replyId: 'fakeId' } },
      flowHttpResponse: (replyId, response) => {
        replyId.should.equal('fakeId');
        deferred.resolve(response);
      }
    };

    const [oids, p] = await node.run(context,
      { foo: 'RspId', hello: '1', goodbye: '222' }
    );
    oids.should.deepEqual([[1]]);
    p.should.deepEqual({ foo: 'RspId', hello: '1', goodbye: '222' });

    const response = await deferred.promise;
    response.should.deepEqual({
      body: '1',
      headers: [ { key: 'oneRspId', value: 'twoRspId' } ],
      responseCode: 222,
      cookies: [{ name: 'oneRspId', value: 'twoRspId', ttl: 1, path: 'threeRspId' }]
    });
  });

});
