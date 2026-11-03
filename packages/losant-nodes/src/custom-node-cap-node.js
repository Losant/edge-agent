import * as payloadHelper from 'losant-handlebars';

class CustomNodeCapNode {

  /* Example Config:
  {
    resultSourcePath: <String - Optional: payload path of the value to return as the custom node result. Ignored when the custom node's result mode is none>,
    branchIndexTemplate: <String|Boolean|Number - Optional: template rendered and converted to a number that selects the output branch of the custom node>
  }
  Notes:
    This node has no outputs of its own. It ends its path and records the result on the context for the custom node execute node to read.
    The first cap node to run wins. If another cap node runs later in the same custom node run, it is ignored and the original result is kept.
    The execute node throws if the branch index is not a finite number within the custom node's output count (only checked when it has more than one output).
  */

  constructor(id, outputIds, config) {
    this.resultSourcePath = config.resultSourcePath;
    this.branchIndexTemplate = config.branchIndexTemplate;
  }

  async run(context, payload) {
    if (!context.customNodeResult) {
      const branchIndex = Number(payloadHelper.render(this.branchIndexTemplate, payload));
      let result;
      if (context.customNodeResultMode !== 'none' && this.resultSourcePath) {
        result = payloadHelper.lookup(this.resultSourcePath, payload);
      }
      context.customNodeResult = { branchIndex, result };
    }
    // Only the first cap node result is kept; later cap nodes are ignored.

    return [[], payload];
  }

}

export default CustomNodeCapNode;
