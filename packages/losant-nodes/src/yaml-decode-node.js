import { loadAll } from 'js-yaml'; // this is using js-yaml v4, where the default is a safe load
import * as payloadHelper from 'losant-handlebars';
import errors from 'losant-nodejs-utils/src/errors.js';

class YamlDecodeNode {

  /* Example Config:
  { source: <String - Required: payload path to a string containing the YAML to decode>,
    destination: <String - Required: payload path to place the decoded YAML>,
    errorBehavior: <String - Optional: throw|payloadPath. What to do when the source is not a string or is invalid YAML. Default throw>,
    errorPath: <String - Optional: payload path to place the caught error. Only used when errorBehavior is payloadPath. Value is { type: 'YAML_DECODE_NODE_ERROR', message }> }

  Notes: A source containing multiple YAML documents decodes to an array of documents.
  An empty string decodes to undefined, which removes the value at destination.
  With errorBehavior payloadPath and no errorPath, errors are ignored and destination is not set.
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
    const yamlStr = payloadHelper.lookup(this.source, payload);
    try {
      if (typeof yamlStr !== 'string') {
        throw new Error('Source did not resolve to a string'); // error gets replaced below
      }
      let loadedYaml = yamlStr ? loadAll(yamlStr) : [];
      if (loadedYaml.length <= 1) { loadedYaml = loadedYaml[0]; }

      payload = payloadHelper.set(this.destination, loadedYaml, payload);
    } catch {
      if (this.errorBehavior === 'payloadPath') {
        if (this.errorPath) {
          const result = { type: 'YAML_DECODE_NODE_ERROR', message: `Invalid YAML source: ${this.source}` };
          payload = payloadHelper.set(this.errorPath, result, payload);
        }
      } else {
        throw errors.InvalidYamlSource({ title: this.source });
      }
    }

    return [this.outputIds, payload];
  }

}

export default YamlDecodeNode;
