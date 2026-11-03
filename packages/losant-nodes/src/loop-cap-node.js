class LoopCapNode {

  /* Example Config:
  {
    loopNodeId: <String - Required: id of loop node this cap node is for>,
    shouldBreak: <Boolean - Optional: true if this cap node should break out of the loop. Default false>,
    mapValuePath: <String - Optional: if set, source of value for map result (overrides parent loop node mapValuePath)>
  }
  Notes:
    This node has no outputs. The first cap node reached in an iteration records its payload as the iteration's result; later ones are ignored.
  */

  constructor(id, outputIds, config) {
    this.id = id;
    this.loopNodeId = config.loopNodeId;
    this.shouldBreak = config.shouldBreak || false;
    this.mapValuePath = config.mapValuePath;
  }

  run(context, payload) {
    const loopResult = context[`loopResult-${this.loopNodeId}`];

    if (loopResult && !loopResult.payload) {
      loopResult.payload = payload;
      loopResult.break = this.shouldBreak;
      loopResult.mapValuePath = this.mapValuePath;
    }

    return [[], payload];
  }

}

export default LoopCapNode;
