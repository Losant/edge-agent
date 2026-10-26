import LJSON from 'losant-nodejs-utils/src/ljson.js';
import * as payloadHelper from 'losant-handlebars';

class JsonEncodeNode {

  /* Example Config:
  {
    source: <String - Required: Payload path to the object/value to encode>,
    destination: <String - Required: Payload path where the encoded JSON string is written>
  }
  */

  constructor(id, outputIds, config) {
    this.id = id;
    this.outputIds = outputIds;
    this.source = config.source;
    this.destination = config.destination;
  }

  run(context, payload) {
    const data = payloadHelper.lookup(this.source, payload);
    const json = LJSON.stringify(data);
    payload = payloadHelper.set(this.destination, json, payload);
    return [this.outputIds, payload];
  }

}

export default JsonEncodeNode;
