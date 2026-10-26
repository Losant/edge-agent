import { createClient as createLosantClient } from 'losant-rest';
import BaseLosantApiNode from 'losant-nodes/src/lib/base-losant-api-node.js';

const validResources = new Set([
  'data',
  'device',
  'devices'
]);

class LosantApiNode extends BaseLosantApiNode {

  isResourceValid(resource) {
    return validResources.has(resource);
  }

  async generateToken(context) {
    if (this._apiToken) { return this._apiToken; }

    const authClient = createLosantClient({
      acceptVersion: '*',
      timeout: context.externalTimeout,
      url: this.losantApiUrl(context)
    });

    const result = await authClient.auth.authenticateDevice({
      credentials: {
        deviceId: context.gatewayConf.id,
        key: context.gatewayConf.key,
        secret: context.gatewayConf.secret
      }
    });

    this._apiToken = result.token;

    return this._apiToken;
  }

  losantApiUrl(context) {
    return context.gatewayConf.apiUrl;
  }

  shutdown() {
    this._apiToken = undefined;
  }

}

export default LosantApiNode;
