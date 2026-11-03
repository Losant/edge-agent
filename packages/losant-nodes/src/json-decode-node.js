import LJSON from 'losant-nodejs-utils/src/ljson.js';
import * as payloadHelper from 'losant-handlebars';
import errors from 'losant-nodejs-utils/src/errors.js';

class JsonDecodeNode {

  /* Example Config:
  {
    source: <String - Required: Payload path to a string containing JSON to decode>,
    destination: <String - Required: Payload path where the decoded value is written>,
    errorBehavior: <String - Optional: What to do with JSON parse errors. One of throw or payloadPath. Default throw>,
    errorPath: <String - Optional: Only used when errorBehavior is payloadPath. Payload path where caught errors are written>
  }
  Notes:
    Errors: When errorBehavior is payloadPath, { type: 'JSON_DECODE_NODE_ERROR', message } is written to errorPath
      (if set), destination is not written, and the node continues. Otherwise an InvalidJsonSource error is thrown.
  */

  constructor(id, outputIds, config) {
    this.id = id;
    this.outputIds = outputIds;
    this.source = config.source;
    this.destination = config.destination;
    this.errorPath = config.errorPath;
    this.errorBehavior = config.errorBehavior || 'throw';
  }

  async run(context, payload) {
    const json = payloadHelper.lookup(this.source, payload);
    try {
      payload = payloadHelper.set(this.destination, LJSON.parse(json), payload);
    } catch {
      if (this.errorBehavior === 'payloadPath') {
        if (this.errorPath) {
          const result = { type: 'JSON_DECODE_NODE_ERROR', message: `Invalid JSON source: ${this.source}` };
          payload = payloadHelper.set(this.errorPath, result, payload);
        }
      } else {
        throw errors.InvalidJsonSource({ title: this.source });
      }
    }
    return [this.outputIds, payload];
  }

}

export default JsonDecodeNode;
