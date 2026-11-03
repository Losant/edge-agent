import LJSON from '../ljson-lite.js';

const noTimeFallback = Symbol('noTimeFallback');

const enforceTime = (time, fallback) => {
  if (time instanceof Date && isFinite(Number(time))) { return time; }

  let numberTime = Number(time);
  if (isFinite(numberTime) && String(numberTime) === String(time)) {
    if (numberTime > 0) {
      // they handed in seconds since epoch
      // convert it to ms since epoch
      if (numberTime < 1000000000000) { numberTime = numberTime * 1000; }
      return new Date(numberTime);
    } else {
      // numberTime is 0 (= now) or negative (= relative to now). The fallback
      // is for unparsable input, not "now" — so when the caller has opted out
      // of any fallback via noTimeFallback, just use the current time.
      const nowish = fallback === noTimeFallback ? new Date() : enforceTime(fallback);
      if (numberTime === 0) {
        return nowish;
      } else {
        // relative into the past with negative number
        return new Date(Number(nowish) + numberTime);
      }
    }
  }

  if (typeof(time) === 'string') {
    time = new Date(time);
    if (isFinite(Number(time))) { return time; }
  }

  if (time && time.$date) {
    time = LJSON.dateReviver(time);
    if (isFinite(Number(time))) { return time; }
  }

  if (fallback) {
    if (fallback === noTimeFallback) { return; }
    return enforceTime(fallback);
  }
  return new Date();
};

enforceTime.noTimeFallback = noTimeFallback;

export default enforceTime;
