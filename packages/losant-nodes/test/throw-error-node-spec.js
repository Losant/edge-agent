import { contextify } from './common.js';
import ThrowErrorNode from '../src/throw-error-node.js';

describe('ThrowErrorNode', () => {
  it('should throw an error with a custom message', async () => {
    const context = contextify({ applicationId: 'dnAppId2', flowId: 'aflowId2', etag: 'screm' });
    const nodeData = { messageTemplate: 'Error: {{errorMsg}}' };
    const node = new ThrowErrorNode('id', [['nid1']], nodeData);
    const payload = { errorMsg: 'Something is not right!' };
    const error = await node.run(context, payload).catch((e) => { return e; });
    error.type.should.equal('Thrown');
    error.message.should.equal('Error: Something is not right!');
  });

  it('should throw a default message when a custom message is not rendered', async () => {
    const context = contextify({ applicationId: 'dnAppId2', flowId: 'aflowId2', etag: 'screm' });
    const nodeData = { messageTemplate: '{{errorMsg}}' };
    const node = new ThrowErrorNode('id', [['nid1']], nodeData);
    const payload = {};
    const error = await node.run(context, payload).catch((e) => { return e; });
    error.type.should.equal('Thrown');
    error.message.should.equal('Unknown error from ThrowErrorNode');
  });
});
