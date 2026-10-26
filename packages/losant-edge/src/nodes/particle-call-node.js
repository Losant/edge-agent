import BaseParticleCallNode from 'losant-nodes/src/lib/base-particle-call-node.js';

export default class ParticleCallNode extends BaseParticleCallNode {
  async getConfig(context, payload) {
    return this.renderCredentials(payload);
  }
}
