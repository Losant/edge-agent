import * as payloadHelper from 'losant-handlebars';

class ConditionalNode {

  /* Example Config:
  {
    expression: <String - Required: expression to evaluate against the payload>
  }
  Notes:
    Payload paths are allowed in the expression, wrapped in {{this.is.a.path}}.
    Outputs: outputIds[1] runs when the expression evaluates truthy, outputIds[0] otherwise.
    The payload is passed through unchanged. Evaluation errors are not caught and will throw.
  */

  constructor(id, outputIds, config) {
    this.id = id;
    this.outputIds = outputIds;
    this.expression = config.expression;
  }

  run(context, payload) {
    const result = payloadHelper.evaluateExpression(this.expression, payload);
    const resultIds = this.outputIds[result ? 1 : 0];
    return [resultIds, payload];
  }

}

export default ConditionalNode;
