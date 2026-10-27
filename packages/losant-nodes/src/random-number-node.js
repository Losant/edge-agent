import * as payloadHelper from 'losant-handlebars';

class RandomNumberNode {

  /* Example Config:
    {
      min: <String or Number - Required: lowest possible value. If a string, it is a template. Rounded up to an integer. Must be <= max>,
      max: <String or Number - Required: highest possible value. If a string, it is a template. Rounded down to an integer. Must be >= min>,
      resultPath: <String - Required: payload path to place the random integer, or NaN>
    }
    Notes:
      The result is an integer between min and max, inclusive.
      If min or max is not a finite number, or min is greater than max, the result is NaN. The node does not throw.
  */

  constructor(id, outputIds, config) {
    this.id = id;
    this.outputIds = outputIds;
    this.min = config.min;
    this.max = config.max;
    this.resultPath = config.resultPath;
  }

  run(context, payload) {
    // since we're only returning integers, ceil the min and floor the max.
    let result;
    const min = Math.ceil(Number(payloadHelper.render(this.min, payload)));
    const max = Math.floor(Number(payloadHelper.render(this.max, payload)));
    if (isFinite(min) && isFinite(max) && min <= max) {
      result = Math.floor(Math.random()*(max-min+1)+min);
    } else {
      result = NaN;
    }

    payload = payloadHelper.set(this.resultPath, result, payload);

    return [this.outputIds, payload];
  }

}

export default RandomNumberNode;
