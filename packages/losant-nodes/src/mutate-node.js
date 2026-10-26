import * as payloadHelper from 'losant-handlebars';
import ljsonRender from './lib/ljson-render.js';

class MutateNode {

  /* Example Config:
  {
    rules: [
      0 or more of:
      {
        type: <String - Required: one of set|remove|move|copy>,
        destination: <String - Required (except for type remove): payload path to place result>,
        source: <String - Required (except for type set): payload path of source value>,
        valueTemplate: <String - Required for type set: template for value to set>,
        valueTemplateType: <String - Optional: how valueTemplate is rendered (string|json). Default string>
      }
    ]
  }

  Notes:
    Rules run in order, each against the payload produced by the previous rule.
    Zero rules is valid; the payload passes through unchanged.
    A rule with an unrecognized type is skipped.
    A valueTemplateType of string can still produce a non-string value: a template that is
    only a payload reference (like {{foo}}) sets the referenced value as is.
    A move removes the source and then sets the destination; a copy leaves the source in place.
  */

  constructor(id, outputIds, config) {
    this.id = id;
    this.outputIds = outputIds;
    this.rules = config.rules || [];
  }

  run(context, payload) {
    this.rules.forEach((rule, ruleIndex) => {
      let value;
      if (rule.type === 'set') {
        if (rule.valueTemplateType === 'json') {
          value = ljsonRender(rule.valueTemplate, payload, `Rule ${ruleIndex + 1}: Set Value`);
        } else {
          // technically 'string' template type is not always a string
          // due to legacy behavior - the fact that a basic no-op
          // render reference (like {{foo}}) returns the object directly
          // since we weren't casting to a string originally
          // so we are not using "renderToString" here intentionally
          value = payloadHelper.render(rule.valueTemplate, payload);
        }
        payload = payloadHelper.set(rule.destination, value, payload);
      } else if (rule.type === 'remove') {
        payload = payloadHelper.remove(rule.source, payload);
      } else if (rule.type === 'move') {
        value = payloadHelper.lookup(rule.source, payload);
        payload = payloadHelper.remove(rule.source, payload);
        payload = payloadHelper.set(rule.destination, value, payload);
      } else if (rule.type === 'copy') {
        value = payloadHelper.lookup(rule.source, payload);
        payload = payloadHelper.set(rule.destination, value, payload);
      }
    });
    return [this.outputIds, payload];
  }

}

export default MutateNode;
