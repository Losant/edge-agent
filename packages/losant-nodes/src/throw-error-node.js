import * as payloadHelper from 'losant-handlebars';
import errors from 'losant-nodejs-utils/src/errors.js';
const MAX_MESSAGE_LENGTH = 256;

class ThrowErrorNode {

  /* Example Config:
  {
    messageTemplate: <String - Required: template for the error message. Truncated to 256 characters>
  }
  Notes: This node always throws a Thrown error with the rendered message and has no outputs.
  */

  constructor(id, outputIds, config) {
    this.id = id;
    this.outputIds = outputIds;
    this.messageTemplate = config.messageTemplate;
  }

  async run(context, payload) {
    let message = payloadHelper.renderToString(this.messageTemplate, payload);
    if (message.length > MAX_MESSAGE_LENGTH) {
      message = message.slice(0, MAX_MESSAGE_LENGTH);
    }
    throw errors.Thrown({ message });
  }

}

export default ThrowErrorNode;
