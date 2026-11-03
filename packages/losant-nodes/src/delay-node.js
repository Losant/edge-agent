import { sleep, flatten } from 'omnibelt';
import * as payloadHelper from 'losant-handlebars';
import errors from 'losant-nodejs-utils/src/errors.js';

class DelayNode {

  /* Example Config:
  {
    delay: <String|Number - Required: seconds to delay. Templatable. Fractional seconds are allowed>
  }
  Notes:
    A value that is negative or does not render to a finite number is treated as 0.
    The maximum workflow run time is 60 seconds, so a delay of 60 seconds or more fails validation and throws.
    If the node has no downstream nodes connected, it returns immediately without delaying or validating.
    The payload is passed through unchanged.
  */

  constructor(id, outputIds, config) {
    this.id = id;
    this.outputIds = outputIds;
    this.delay = config.delay;
  }

  async run(context, payload) {
    if (!flatten(this.outputIds).length) {
      return [ this.outputIds, payload ];
    }
    let delay = payloadHelper.render(this.delay, payload);
    delay = Number(delay);

    if (!isFinite(delay) || delay < 0) { delay = 0; }

    if (delay >= 60) { throw errors.Validation({ message: 'Requested delay is longer than max workflow runtime.' }); }
    await sleep(delay * 1000);
    return [this.outputIds, payload];
  }

}

export default DelayNode;
