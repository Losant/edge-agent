import * as payloadHelper from 'losant-handlebars';

class AgentConfigGetNode {

  /* Example Config:
  {
    keyTemplate: <String - Optional: template rendering to the config key (dotted path) to return. Required unless getAll is true>,
    getAll: <Boolean - Optional: if true, return the entire config object and ignore keyTemplate. Default false>,
    resultPath: <String - Required: payload path at which to place { key, value }>
  }
  Notes:
    The result is { key, value }. When getAll is true, key is '.' and value is the
    whole config (without originalCliArgs). Otherwise key is the trimmed rendered
    keyTemplate and value is the config value at that path; value is undefined when
    the key is empty or not found.
  */

  constructor(id, outputIds, config) {
    this.id = id;
    this.outputIds = outputIds;
    this.keyTemplate = config.keyTemplate;
    this.resultPath = config.resultPath;
    this.getAll = config.getAll || false;
  }

  run(context, payload) {
    let value, key;

    // parse/stringify clones the config, strips tcomb class wrappers, and drops nested undefined values
    const currentConfig = JSON.parse(JSON.stringify(context.getCurrentAgentConfig()));
    delete currentConfig.originalCliArgs;

    if (this.getAll) {
      key = '.';
      value = currentConfig;
    } else {
      key = payloadHelper.renderToString(this.keyTemplate, payload).trim();
      if (key) { value = payloadHelper.lookup(key, currentConfig); }
    }

    payload = payloadHelper.set(this.resultPath, { key, value }, payload);
    return [this.outputIds, payload];
  }

}

export default AgentConfigGetNode;
