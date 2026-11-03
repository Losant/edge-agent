import { describeService, stubLogger } from './common.js';
import { sleep } from 'omnibelt';
import RedisManager from '../src/redis-manager.js';
import FiredTrigger from '../src/types/fired-trigger.js';
import { Redis } from 'ioredis';

const host = process.env.REDIS_HOST_CI || 'localhost';

describeService('redis', 'Edge Redis Manager', function() {
  let redisManager, redisClient;

  after(async () => {
    await redisClient.disconnect();
    redisClient = null;
  });

  before(async () => {
    redisClient = new Redis({ host, lazyConnect: true });
    await redisClient.connect();
  });

  afterEach(async () => {
    if (redisManager) {
      await redisManager.shutdown();
      redisManager = null;
    }
  });

  it('should trigger on redis subscribed topics events', async () => {
    const triggers = [];
    redisManager = RedisManager();

    await redisManager.initialize([
      { triggerId: 'anId1', host, topic: 'topic1' },
      { triggerId: 'anId2', host, topic: 'topic2' }
    ], async (triggerFire) => {
      triggers.push(triggerFire);
      await sleep(0);
    });

    await redisClient.publish('topic1', 'hi');
    while (triggers.length < 1) { await sleep(0); } // eslint-disable-line no-await-in-loop
    await redisClient.publish('topic2', 'hi2');
    while (triggers.length < 2) { await sleep(0); } // eslint-disable-line no-await-in-loop

    await redisManager.update([
      { triggerId: 'anId2', host, topic: 'topic2' },
      { triggerId: 'anId3', host, topic: 'topic*' },
      { triggerId: 'anId4', host, topic: 'topic2' },
      { triggerId: 'anId5', host, topic: 'topic3' }
    ]);

    await redisClient.publish('topic1', 'hi3');
    while (triggers.length < 3) { await sleep(0); } // eslint-disable-line no-await-in-loop
    await redisClient.publish('topic2', 'hi4');
    while (triggers.length < 6) { await sleep(0); } // eslint-disable-line no-await-in-loop

    triggers.should.deepEqual([
      FiredTrigger({
        triggerId: 'anId1',
        triggerType: 'redis',
        payload: {
          time: triggers[0].payload.time,
          data: { message: 'hi', channel: 'topic1', pattern: 'topic1' }
        }
      }),
      FiredTrigger({
        triggerId: 'anId2',
        triggerType: 'redis',
        payload: {
          time: triggers[1].payload.time,
          data: { message: 'hi2', channel: 'topic2', pattern: 'topic2' }
        }
      }),
      FiredTrigger({
        triggerId: 'anId3',
        triggerType: 'redis',
        payload: {
          time: triggers[2].payload.time,
          data: { message: 'hi3', channel: 'topic1', pattern: 'topic*' }
        }
      }),
      FiredTrigger({
        triggerId: 'anId2',
        triggerType: 'redis',
        payload: {
          time: triggers[3].payload.time,
          data: { message: 'hi4', channel: 'topic2', pattern: 'topic2' }
        }
      }),
      FiredTrigger({
        triggerId: 'anId4',
        triggerType: 'redis',
        payload: {
          time: triggers[4].payload.time,
          data: { message: 'hi4', channel: 'topic2', pattern: 'topic2' }
        }
      }),
      FiredTrigger({
        triggerId: 'anId3',
        triggerType: 'redis',
        payload: {
          time: triggers[5].payload.time,
          data: { message: 'hi4', channel: 'topic2', pattern: 'topic*' }
        }
      })
    ]);

  });

  it('should ignore configs with an out of range port and keep valid ones', async () => {
    const loggerCalls = stubLogger(['warn']);
    const triggers = [];
    redisManager = RedisManager();

    await redisManager.initialize([
      { triggerId: 'tooHigh', host, port: '65536', topic: 'portTopic' },
      { triggerId: 'negative', host, port: '-1', topic: 'portTopic' },
      { triggerId: 'valid', host, port: '6379', topic: 'portTopic' },
      { triggerId: 'defaultPort', host, topic: 'portTopic' }
    ], async (triggerFire) => {
      triggers.push(triggerFire);
      await sleep(0);
    });

    loggerCalls.should.deepEqual([
      ['warn', 'Ignoring request to connect redis on invalid port 65536'],
      ['warn', 'Ignoring request to connect redis on invalid port -1']
    ]);

    await redisClient.publish('portTopic', 'hi');
    while (triggers.length < 2) { await sleep(0); } // eslint-disable-line no-await-in-loop
    triggers.map((trigger) => trigger.triggerId).sort().should.deepEqual(['defaultPort', 'valid']);
  });
});
