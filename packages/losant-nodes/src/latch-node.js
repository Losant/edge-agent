import * as payloadHelper from 'losant-handlebars';

class LatchNode {

  /* Example Config:
  {
    latchExpression: <String - Required: expression for triggering the latch. Evaluated as a boolean>,
    resetExpression: <String - Required: expression for resetting the latch. Evaluated as a boolean>,
    latchIdTemplate: <String - Optional: template appended to the node's latch key, so one node can keep separate latches per rendered value>,
    latchResultPath: <String - Optional: payload path for the boolean result of latchExpression>,
    resetResultPath: <String - Optional: payload path for the boolean result of resetExpression>,
    branchPath: <String - Optional: payload path for the branch taken out of the node>,
    wasLatchedPath: <String - Optional: payload path for whether the latch was set before this run>,
    isLatchedPath: <String - Optional: payload path for whether the latch is set after this run>
  }
  Notes:
    Outputs: outputIds[0] is taken when the returned branch is falsy, outputIds[1] when it is truthy.
    The reset expression is applied first. The truthy output is taken when latchExpression is true
    and the node is not latched after that reset. Everything else takes the falsy output. The latch
    is cleared when resetExpression is true, so if both are true the node resets and latches again,
    taking the truthy output.
    Latch state is stored in context.kvStore, scoped to the application, workflow, and key.
  */

  constructor(id, outputIds, config) {
    this.id = id;
    this.outputIds = outputIds;
    this.latchExpression = config.latchExpression;
    this.resetExpression = config.resetExpression;
    this.latchIdTemplate = config.latchIdTemplate;
    this.latchResultPath = config.latchResultPath;
    this.resetResultPath = config.resetResultPath;
    this.wasLatchedPath = config.wasLatchedPath;
    this.isLatchedPath = config.isLatchedPath;
    this.branchPath = config.branchPath;
  }

  async run(context, payload) {
    const shouldLatch = !!payloadHelper.evaluateExpression(this.latchExpression, payload);
    const shouldReset = !!payloadHelper.evaluateExpression(this.resetExpression, payload);

    let storeKey = `latch-${this.id}`;
    if (this.latchIdTemplate) {
      // explicitly leaving castAsString false, and 'String' below, to maintain legacy undefined/null behavior
      storeKey = `${storeKey}-${String(payloadHelper.render(this.latchIdTemplate, payload))}`;
    }

    const { wasLatched, isLatched, branch } = await context.kvStore.latch(
      context.applicationId, context.flowId, storeKey, shouldLatch, shouldReset);

    if (this.latchResultPath) { payload = payloadHelper.set(this.latchResultPath, shouldLatch, payload); }
    if (this.resetResultPath) { payload = payloadHelper.set(this.resetResultPath, shouldReset, payload); }
    if (this.wasLatchedPath) { payload = payloadHelper.set(this.wasLatchedPath, wasLatched, payload); }
    if (this.isLatchedPath) { payload = payloadHelper.set(this.isLatchedPath, isLatched, payload); }
    if (this.branchPath) { payload = payloadHelper.set(this.branchPath, branch, payload); }

    const resultIds = this.outputIds[branch ? 1 : 0];
    return [resultIds, payload];
  }

}

export default LatchNode;
