import * as payloadHelper from 'losant-handlebars';

class ThrottleNode {

  /* Example Config:
  {
    timeSincePath: <String - Optional (legacy): payload path to store the time, in milliseconds, since the last payload that was not throttled>,
    ratePerMinute: <Number - Required: Number of payloads to allow per minute. May be a template. A value of 0 or an invalid number throttles every payload>,
    throttleIdTemplate: <String - Optional: template for throttle key identifier. Payloads that render the same identifier share one throttle, otherwise the throttle is per node>
  }

  Notes:
    outputIds[0] (false path) is taken if a payload is throttled, outputIds[1] (true path) if not throttled.
    The time of the last payload that was not throttled is stored per node (and per rendered
    throttleIdTemplate). The first payload for a key is never throttled, and the value written to
    timeSincePath for it is the time since the epoch.
  */

  constructor(id, outputIds, config) {
    this.id = id;
    this.outputIds = outputIds;
    this.timeSincePath = config.timeSincePath;
    this.ratePerMinute = config.ratePerMinute;
    this.throttleIdTemplate = config.throttleIdTemplate;
  }

  async run(context, payload) {
    let storeKey = `throttle/${this.id}`;
    if (this.throttleIdTemplate) {
      // A null or undefined render interpolates literally into the key ("null"/"undefined").
      // This is kept for compatibility with existing stored keys.
      storeKey = `${storeKey}/${payloadHelper.render(this.throttleIdTemplate, payload)}`;
    }

    let ratePerMinute = Number(payloadHelper.render(this.ratePerMinute, payload));
    if (!ratePerMinute) { ratePerMinute = 0; }
    const millisecondsToWait = Math.abs(60000 / ratePerMinute);

    let result = false;
    let diff   = null;
    await context.kvStore.lock(context.applicationId, context.flowId, storeKey, async () => {
      const storeVal = await context.kvStore.get(context.applicationId, context.flowId, storeKey);
      const now = Date.now();
      diff = now - Number(storeVal);
      if (diff >= millisecondsToWait) {
        result = true;
        await context.kvStore.set(context.applicationId, context.flowId, storeKey, now);
      }
    });

    if (this.timeSincePath) { payload = payloadHelper.set(this.timeSincePath, diff, payload); }
    const resultIds = this.outputIds[Number(result)];
    return [resultIds, payload];
  }
}

export default ThrottleNode;
