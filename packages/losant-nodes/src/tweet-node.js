import DEBUG_LEVEL from 'losant-nodejs-utils/src/constants/debug-level.js';

class TweetNode {

  // Example Config: none. This node is deprecated. It passes the payload through
  // unchanged to all outputs and publishes a warning debug message.

  constructor(id, outputIds) {
    this.id = id;
    this.outputIds = outputIds;
  }

  async run(context, payload, prevNodeInfo) {
    await context.publishDebugMessage?.({
      message: 'Tweet node is deprecated.',
      sourceNode: this.id,
      payload,
      level: DEBUG_LEVEL.warn
    }, prevNodeInfo);
    return [this.outputIds, payload];
  }

}

export default TweetNode;
