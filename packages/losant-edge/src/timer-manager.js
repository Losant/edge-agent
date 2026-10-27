import { isNil, prop, map, keys, clamp, reduce, toNumber } from 'omnibelt';
import t from 'tcomb';
import { CronExpressionParser } from 'cron-parser';
import { resetTo } from './utils.js';
import TimerConfigs from './types/timer-configs.js';
import FiredTrigger from './types/fired-trigger.js';
import { ONE_DAY_MS } from 'losant-nodejs-utils/src/constants/time.js';

// if Date.now() and uptime date calculation ever drift more than
// this amount, we assume an NTP sync happened and reset our timers
const CLOCK_CHANGED_THRESHOLD = toNumber(process.env.CLOCK_CHANGED_THRESHOLD) || 100;

const MAX_TIMEOUT = ONE_DAY_MS;
const MIN_TIMEOUT = 10; // 0.01 seconds
const timeoutDelayClamp = clamp(MIN_TIMEOUT, MAX_TIMEOUT);

const MAX_TIMER_DELAY = 366 * ONE_DAY_MS;
const MIN_TIMER_DELAY = 100; // 0.1 seconds
const timerDelayClamp = clamp(MIN_TIMER_DELAY, MAX_TIMER_DELAY);

const TimersLastChangedAt = t.dict(t.String, t.Number);

const stateDefault = () => ({
  onTimerFire: null,
  timersById: {}, // { config: TimerConfig, runAt, lastChangedAt }
  timeoutId: null
});

let processStartTimestamp = Date.now() - Math.floor(process.uptime() * 1000);
const getNow = (roundUp = false) => {
  const toInt = roundUp ? Math.ceil : Math.floor;
  // instead of just new Date(), we work from process uptime plus
  // the date when the process was started. This avoids issues that occur when
  // the time changes out from underneath the running process
  return processStartTimestamp + toInt(process.uptime() * 1000);
};

const detectClockChange = () => {
  const drift = Math.abs(Date.now() - getNow());
  if (drift < CLOCK_CHANGED_THRESHOLD) { return false; }

  // reset our baseline start timestamp
  processStartTimestamp = Date.now() - Math.floor(process.uptime() * 1000);
  return true;
};

const clearMilliseconds = (timestamp) => {
  return Math.floor(Number(timestamp) / 1000) * 1000;
};

const toIntWithDefault = (num, theDefault) => {
  num = parseInt(num, 10);
  return isFinite(num) ? num : theDefault;
};

const configMatches = (oldConfig, newConfig) => {
  return oldConfig && newConfig &&
    oldConfig.timerId === newConfig.timerId &&
    oldConfig.tz === newConfig.tz &&
    oldConfig.seconds === newConfig.seconds &&
    oldConfig.cron === newConfig.cron;
};

const computeCronNextRunAt = ({ now, lastRunAt, cron, tz }) => {
  // compute from last run at if we have it, otherwise compute from now
  let runTime = toIntWithDefault(lastRunAt, now);

  // cron is always calculated from whole seconds
  runTime = clearMilliseconds(runTime);

  try {
    const parsed = CronExpressionParser.parse(cron, {
      currentDate: runTime,
      endDate:     runTime + MAX_TIMER_DELAY,
      tz:          tz || 'UTC'
    });
    let nextRunAt = parsed.next().getTime();
    // in theory, cronParser no longer ever returns the currentDate as
    // the 'next' date, but just in case....
    if (nextRunAt === runTime) {
      nextRunAt = parsed.next().getTime();
    }
    return clearMilliseconds(nextRunAt);
  } catch {
    // NOTE: bad cron or time zone strings just end
    // up being timers that will never fire
    return null;
  }
};

const computeSecondsNextRunAt = ({ now, lastRunAt, lastChangedAt, seconds }) => {
  const millis = timerDelayClamp(toIntWithDefault(seconds * 1000, 60 * 1000));
  const shouldAlignSeconds = millis % 1000 === 0;

  let nextRunAt;
  if (lastRunAt) {
    const runTime = toIntWithDefault(lastRunAt, now);
    nextRunAt = runTime + millis;
  } else {
    // if we don't have a lastRunAt
    // (either the timer has never run, or the agent has restarted)
    // use lastChangedAt to compute next run at
    // that way we will keep getting the same time after restarts.

    lastChangedAt = toIntWithDefault(lastChangedAt, now);
    let moveBy = Math.floor(Math.abs(now - lastChangedAt) / millis);
    // always move forward by at least 1 - i.e., don't just return 'lastChangedAt'
    if (moveBy < 1) { moveBy = 1; }

    // takes care of the case where a clock sync actually
    // moved time *backwards*.
    if (lastChangedAt > now) { moveBy = -moveBy; }

    nextRunAt = lastChangedAt + (millis * moveBy);
  }

  // if the timer is set up to run in whole second increments
  // wipe out milliseconds (matching cron method)
  if (shouldAlignSeconds) {
    nextRunAt = clearMilliseconds(nextRunAt);
  }

  return nextRunAt;
};

const computeNextRunAt = ({ now, lastRunAt, lastChangedAt, timerConfig }) => {
  let nextRunAt = null;
  if (isNil(timerConfig.cron)) {
    nextRunAt = computeSecondsNextRunAt({
      now,
      lastRunAt,
      lastChangedAt,
      seconds: timerConfig.seconds
    });
  } else {
    nextRunAt = computeCronNextRunAt({
      now,
      lastRunAt,
      cron: timerConfig.cron,
      tz: timerConfig.tz
    });
  }

  if (nextRunAt && lastRunAt && lastRunAt > now && lastRunAt < nextRunAt) {
    // use the previous runAt if it was after now but before nextRunAt
    nextRunAt = lastRunAt;
  }

  return nextRunAt;
};

const TimerManager = (globalStore) => {
  const state = stateDefault();

  const timerLoop = async () => {
    if (state.timeoutId) {
      clearTimeout(state.timeoutId);
      state.timeoutId = null;
    }

    const nowForDetectingTrigger = getNow(true);
    const toFire = [];
    let nextLoopAt = Infinity;

    const resetTimers = detectClockChange();
    const nowForNextCalc = resetTimers ? getNow(true) : nowForDetectingTrigger;

    keys(state.timersById).forEach((timerId) => {
      const timer = state.timersById[timerId];

      if (timer.runAt && timer.runAt <= nowForDetectingTrigger) {
        toFire.push(FiredTrigger({
          triggerId: timerId,
          triggerType: 'timer',
          payload: { time: new Date(timer.runAt), data: {} }
        }));
      }

      if (resetTimers) {
        timer.runAt = null;
      }

      if (!timer.runAt || timer.runAt <= nowForDetectingTrigger) {
        timer.runAt = computeNextRunAt({
          now: nowForNextCalc,
          lastChangedAt: timer.lastChangedAt,
          lastRunAt: timer.runAt,
          timerConfig: timer.config
        });
      }

      if (timer.runAt && timer.runAt < nextLoopAt) {
        nextLoopAt = timer.runAt;
      }
    });

    const timeout = timeoutDelayClamp(nextLoopAt - getNow());
    state.timeoutId = setTimeout(timerLoop, timeout);

    if (toFire.length) {
      await Promise.all(toFire.map(async (firedTrigger) => {
        await state.onTimerFire(firedTrigger);
      }));
    }
  };

  const storeLastChangedAt = async () => {
    const info = map(prop('lastChangedAt'), state.timersById);
    await globalStore.set('timersLastChangedAt', info);
  };

  const initialize = async (timerConfigs, onTimerFire) => {
    if (state.onTimerFire) { throw new Error('Initialize has already been called'); }

    timerConfigs = TimerConfigs(timerConfigs);
    t.Function(onTimerFire);

    state.onTimerFire = onTimerFire;

    const timersLastChangedAt =
      await globalStore.get('timersLastChangedAt', TimersLastChangedAt);

    const now = getNow();
    state.timersById = reduce((newTimersById, config) => {
      const lastChangedAt = timersLastChangedAt[config.timerId] || now;

      newTimersById[config.timerId] = {
        lastChangedAt,
        config
      };

      return newTimersById;
    }, {}, timerConfigs);

    await storeLastChangedAt();
    await timerLoop();
  };

  const update = async (timerConfigs) => {
    if (!state.onTimerFire) { throw new Error('Timer manager must be initialized first'); }

    timerConfigs = TimerConfigs(timerConfigs);

    const now = getNow();
    state.timersById = reduce((newTimersById, config) => {
      const existing = state.timersById[config.timerId];
      if (existing && configMatches(existing.config, config)) {
        newTimersById[config.timerId] = existing;
      } else {
        newTimersById[config.timerId] = {
          lastChangedAt: now,
          config
        };
      }
      return newTimersById;
    }, {}, timerConfigs);

    await storeLastChangedAt();
    await timerLoop();
  };

  const shutdown = () => {
    clearTimeout(state.timeoutId);
    resetTo(stateDefault, state);
  };

  return {
    // :: (TimerConfigs, (FiredTrigger -> *)) -> Promise<Nil>
    initialize,

    // :: TimerConfigs -> Promise<Nil>
    update,

    // SE: State is reset to default, manager will need to be reinitialized
    // :: -> Nil
    shutdown
  };

};

// :: (GlobalStore) -> TimerManager
export default TimerManager;

