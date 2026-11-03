import './common.js';
import BaseLosantApiNode from '../src/lib/base-losant-api-node.js';

const APP_ID = '0123456789abcdef01234567';

describe('BaseLosantApiNode', () => {
  it('should reject every resource when a subclass does not define isResourceValid', async () => {
    class BareNode extends BaseLosantApiNode {}
    const node = new BareNode('id', [[]], { resource: 'device', action: 'get' });
    await node.run({}, {}).should.be.rejectedWith({ message: 'Invalid resource provided' });
  });

  it('should reject provided tokens when a subclass does not define isProvidedTokenValid', async () => {
    class ResourceOnlyNode extends BaseLosantApiNode {
      isResourceValid() { return true; }
    }
    const node = new ResourceOnlyNode('id', [[]], {
      resource: 'device',
      action: 'get',
      apiTokenTemplate: 'token',
      applicationIdTemplate: APP_ID
    });
    await node.run({}, {}).should.be.rejectedWith({ message: 'Invalid API token provided' });
  });
});
