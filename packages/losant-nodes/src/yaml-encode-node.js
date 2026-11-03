import { dump } from 'js-yaml';
import * as payloadHelper from 'losant-handlebars';

class YamlEncodeNode {

  /* Example Config:
  { source: <String - Required: payload path for the object/value to encode>,
    destination: <String - Required: payload path for where to place the encoded YAML string> }

  Notes: Errors from the YAML encoder (for example, a value that cannot be represented in YAML) throw.
  */

  constructor(id, outputIds, config) {
    this.id = id;
    this.outputIds = outputIds;
    this.source = config.source;
    this.destination = config.destination;
  }

  async run(context, payload) {
    const data = payloadHelper.lookup(this.source, payload);
    const yaml = dump(data);
    payload = payloadHelper.set(this.destination, yaml, payload);
    return [this.outputIds, payload];
  }

}

export default YamlEncodeNode;
