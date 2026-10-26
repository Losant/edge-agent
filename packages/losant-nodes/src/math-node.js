import * as payloadHelper from 'losant-handlebars';

class MathNode {

  /* Example Config:
  {
    statements: [
      0 or more of:
      {
        expression: <String - Required: expression to evaluate>,
        resultPath: <String - Required: payload path to place result of evaluated expression>
      }
    ]
  }

  Notes:
    JSON Paths are allowed in expression, wrapped in {{this.is.a.path}}.
    Statements run in order, so a later statement can use an earlier statement's result.
    Zero statements is valid; the payload passes through unchanged.
    Statements without a resultPath are skipped.
  */

  constructor(id, outputIds, config) {
    this.id = id;
    this.outputIds = outputIds;
    this.statements = config.statements || [];
  }

  run(context, payload) {
    this.statements.forEach((statement) => {
      if (!statement || !statement.resultPath) { return; }
      const result = payloadHelper.evaluateExpression(statement.expression, payload);
      payload = payloadHelper.set(statement.resultPath, result, payload);
    });

    return [this.outputIds, payload];
  }

}

export default MathNode;
