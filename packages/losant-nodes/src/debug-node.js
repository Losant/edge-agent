import * as payloadHelper from 'losant-handlebars';
import DEBUG_LEVEL from 'losant-nodejs-utils/src/constants/debug-level.js';
const MAX_DEBUG_MESSAGE_LENGTH = 1024;

class DebugNode {

  /* Example Config:
  {
    message: <String - Optional: template for the message to output. Default 'Debug Node Output'. Truncated to 1024 characters>,
    property: <String - Optional: payload path to debug a specific portion of the payload. When blank, the whole payload is sent>,
    level: <String - Optional: debug level of the message, one of verbose, info, warn, error, or fatal. Default verbose>
  }
  Notes:
    The message is only published when the run context can publish debug messages. Otherwise the node does nothing.
    The payload is always passed through unchanged to all outputs.
  */

  constructor(id, outputIds, config) {
    this.id = id;
    this.outputIds = outputIds;
    this.message = config.message;
    this.property = config.property;
    this.level = DEBUG_LEVEL[config.level] || DEBUG_LEVEL.default;
  }

  async run(context, payload, prevNodeInfo) {
    if (context.publishDebugMessage) {
      let message = payloadHelper.renderToString(this.message, payload) ||
        'Debug Node Output';
      if (message.length > MAX_DEBUG_MESSAGE_LENGTH) {
        message = message.slice(0, MAX_DEBUG_MESSAGE_LENGTH);
      }

      const debugMsg = {
        message,
        level: this.level,
        payload,
        sourceNode: this.id
      };

      if (this.property) {
        debugMsg.payloadPath = this.property;
        debugMsg.payload = payloadHelper.lookup(this.property, debugMsg.payload);
      }

      await context.publishDebugMessage(debugMsg, prevNodeInfo);
    }

    return [this.outputIds, payload];
  }

}

export default DebugNode;
