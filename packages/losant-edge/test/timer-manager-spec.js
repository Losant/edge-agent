import { levelManager, tk } from './common.js';
import { sleep, defer } from 'omnibelt';
import FiredTrigger from '../src/types/fired-trigger.js';
import TimerManager from '../src/timer-manager.js';
import t from 'tcomb';

let timerManager;

const toFiredTrigger = (id, time) => {
  return FiredTrigger({
    triggerId: id,
    triggerType: 'timer',
    payload: { time: new Date(time), data: {} }
  });
};

describe('Edge Timer Manager', function() {
  before(() => {
    timerManager = TimerManager(levelManager.globalStore);
  });

  afterEach(async function() {
    await timerManager.shutdown();
  });

  it('should properly manage timers - no initial values', async function() {
    let deferred = defer();
    const fires = [];
    await timerManager.initialize([], (fire) => {
      fires.push(fire);
      if (fires.length === 3) { deferred.resolve(); }
      if (fires.length === 5) { deferred.resolve(); }
    });

    let now = Date.now();
    while (now % 1000 === 0 || Math.floor(now / 1000) % 2 === 0) {
      await sleep(100); // eslint-disable-line no-await-in-loop
      now = Date.now();
    }

    now = now - now % 1000;

    await timerManager.update([{
      timerId: 'timer1',
      seconds: 1
    }, {
      timerId: 'timer2',
      cron: '*/2 * * * * *',
      tz: 'UTC'
    }]);

    await deferred.promise; // approximately 2 seconds
    deferred = defer();

    fires.should.deepEqual([
      toFiredTrigger('timer1', now + 1000),
      toFiredTrigger('timer2', now + 1000),
      toFiredTrigger('timer1', now + 2000)
    ]);

    await timerManager.update([{
      timerId: 'timer1',
      seconds: 1000
    }, {
      timerId: 'timer2',
      cron: '*/2 * * * * *',
      tz: 'UTC'
    }, {
      timerId: 'timer3',
      cron: '* * * * * *',
      tz: 'UTC'
    }]);

    await deferred.promise; // approximately 1 second
    await timerManager.shutdown();

    fires.should.deepEqual([
      toFiredTrigger('timer1', now + 1000),
      toFiredTrigger('timer2', now + 1000),
      toFiredTrigger('timer1', now + 2000),
      toFiredTrigger('timer2', now + 3000),
      toFiredTrigger('timer3', now + 3000)
    ]);

    const timerInfo = await levelManager.globalStore.get('timersLastChangedAt', t.Object);
    // the last updated values track to the ms, make sure we are approx. close
    (Math.floor(timerInfo.timer1 / 1000)).should.equal((now/1000) + 2);
    (Math.floor(timerInfo.timer2 / 1000)).should.equal(now/1000);
    (Math.floor(timerInfo.timer3 / 1000)).should.equal((now/1000) + 2);
  });

  it('should properly manage timers - with initial values', async function() {
    let now = Date.now();
    now = now - now % 1000;

    await levelManager.globalStore.set('timersLastChangedAt', {
      timerB: now - (24 * 60 * 60 * 1000) + 1000
    });

    const fires = [];
    await timerManager.initialize([{
      timerId: 'timerA',
      seconds: 24 * 60 * 60
    }, {
      timerId: 'timerB',
      seconds: 24 * 60 * 60
    }], (fire) => {
      fires.push(fire);
    });

    await sleep(2000);
    await timerManager.shutdown();

    fires.should.deepEqual([
      toFiredTrigger('timerB', now + 1000)
    ]);

    const timerInfo = await levelManager.globalStore.get('timersLastChangedAt', t.Object);
    // the last updated values track to the ms, make sure we are approx. close
    Math.floor(timerInfo.timerA / 1000).should.within(Math.floor(now/1000), Math.floor(now/1000) + 1);
    timerInfo.timerB.should.equal(now - (24 * 60 * 60 * 1000) + 1000);
  });

  it('should work with fractional second timers', async function() {
    const deferred = defer();
    const fires = [];
    await timerManager.initialize([], (fire) => {
      if (fires.length < 11) {
        fires.push(fire);
        if (fires.length === 11) { deferred.resolve(); }
      }
    });

    await timerManager.update([{
      timerId: 'timer1',
      seconds: 0.25
    }, {
      timerId: 'timer2',
      seconds: 1.1
    }]);

    await deferred.promise; // approximately 1 seconds
    await timerManager.shutdown();

    const timerInfo = await levelManager.globalStore.get('timersLastChangedAt', t.Object);

    fires.should.deepEqual([
      toFiredTrigger('timer1', timerInfo.timer1 + 250),
      toFiredTrigger('timer1', timerInfo.timer1 + 500),
      toFiredTrigger('timer1', timerInfo.timer1 + 750),
      toFiredTrigger('timer1', timerInfo.timer1 + 1000),
      toFiredTrigger('timer2', timerInfo.timer2 + 1100),
      toFiredTrigger('timer1', timerInfo.timer1 + 1250),
      toFiredTrigger('timer1', timerInfo.timer1 + 1500),
      toFiredTrigger('timer1', timerInfo.timer1 + 1750),
      toFiredTrigger('timer1', timerInfo.timer1 + 2000),
      toFiredTrigger('timer2', timerInfo.timer2 + 2200),
      toFiredTrigger('timer1', timerInfo.timer1 + 2250)
    ]);
  });

  it('should detect and deal with clock swings', async function() {
    const initialDate = Number(new Date('2020-05-15T14:51:21.700Z'));
    tk.travel(new Date(initialDate));

    const deferred = defer();
    const fires = [];
    await timerManager.initialize([], (fire) => {
      fires.push(fire);
      if (fires.length === 3) {
        tk.travel(new Date('2020-05-15T14:53:39.320Z'));
      } else if (fires.length === 8) {
        tk.travel(new Date('2020-05-15T14:49:07.750Z'));
      } else if (fires.length === 15) {
        timerManager.shutdown();
        deferred.resolve();
      }
    });

    await timerManager.update([{
      timerId: 'timer1',
      cron: '*/2 * * * * *',
      tz: 'UTC'
    }, {
      timerId: 'timer2',
      seconds: 1.1
    }]);

    await deferred.promise;

    const timerInfo = await levelManager.globalStore.get('timersLastChangedAt', t.Object);

    fires.should.deepEqual([
      toFiredTrigger('timer1', initialDate + 300),                // 2020-05-15T14:51:22.000Z
      toFiredTrigger('timer2', timerInfo.timer2 + 1100),          // ~2020-05-15T14:51:22.801Z
      toFiredTrigger('timer2', timerInfo.timer2 + 2200),          // ~2020-05-15T14:51:23.901Z
      toFiredTrigger('timer1', initialDate + 2300),               // 2020-05-15T14:51:24.000Z, triggers timer reset
      toFiredTrigger('timer2', timerInfo.timer2 + 137620 - 120),  // ~2020-05-15T14:53:39.201Z
      toFiredTrigger('timer1', initialDate + 137620 + 680),       // 2020-05-15T14:53:40.000Z
      toFiredTrigger('timer2', timerInfo.timer2 + 137620 + 980),  // ~2020-05-15T14:53:40.301Z
      toFiredTrigger('timer2', timerInfo.timer2 + 137620 + 2080), // ~2020-05-15T14:53:41.401Z
      toFiredTrigger('timer1', initialDate + 137620 + 2680),      // 2020-05-15T14:53:42.000Z, triggers timer reset
      toFiredTrigger('timer2', timerInfo.timer2 - 133950 + 850),  // ~2020-05-15T14:49:08.601Z
      toFiredTrigger('timer2', timerInfo.timer2 - 133950 + 1950), // ~2020-05-15T14:49:09.701Z
      toFiredTrigger('timer1', initialDate - 133950 + 2250),      // 2020-05-15T14:49:10.000Z
      toFiredTrigger('timer2', timerInfo.timer2 - 133950 + 3050), // ~2020-05-15T14:49:10.801Z
      toFiredTrigger('timer2', timerInfo.timer2 - 133950 + 4150), // ~2020-05-15T14:49:11.901Z
      toFiredTrigger('timer1', initialDate - 133950 + 4250)       // 2020-05-15T14:49:12.000Z
    ]);
  });

});
