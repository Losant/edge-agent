import { tk } from './common.js';
import FiredTrigger from '../src/types/fired-trigger.js';
import OnEventManager from '../src/on-event-manager.js';

const eventManager = OnEventManager();

let fires = [];

const fakeFires = (fireData) => {
  fires.push(fireData);
};

const resetFires = () => {
  fires = [];
};

describe('Edge On Event Manager', function() {

  afterEach(async function() {
    await eventManager.shutdown();
  });

  it('should properly fire triggers appropriately', async function() {
    const time = Date.now();
    tk.freeze(time);
    const eventConfigs = [
      { event: 'onBoot', eventId: '1' },
      { event: 'onDisconnect', eventId: '2' },
      { event: 'onConnect', eventId: '3' },
      { event: 'onSync', eventId: '4', syncTypes: ['application'] }
    ];
    await eventManager.initialize(eventConfigs, fakeFires);

    fires.length.should.equal(1);
    fires[0].should.deepEqual(FiredTrigger({ triggerId: '1', triggerType: 'onBoot', payload: { time: new Date(), data: {} } }));

    resetFires();
    fires.length.should.equal(0);
    const connectTime = time + (5 * 60 * 60 * 1000);
    tk.travel(connectTime);
    await eventManager.fireOnConnect({ lastDisconnectTime: null });

    fires.length.should.equal(1);
    fires[0].should.deepEqual(FiredTrigger({
      triggerId: '3',
      triggerType: 'onConnect',
      payload: { time: new Date(), data: { lastDisconnectTime: null } }
    }));

    resetFires();

    await eventManager.fireOnSync({ syncType: 'device' });
    await eventManager.fireOnSync({ syncType: 'application' });
    fires.should.deepEqual([
      FiredTrigger({ triggerId: '4', triggerType: 'onSync', payload: { time: new Date(), data: { syncType: 'application' } } })
    ]);

    resetFires();

    eventConfigs.push(
      { event: 'onDisconnect', eventId: '5' },
      { event: 'onSync', eventId: '6', syncTypes: ['application', 'device'] }
    );
    await eventManager.update(eventConfigs);
    const disconnectTime = connectTime + (5 * 60 * 60 * 1000);
    tk.travel(disconnectTime);
    const disconnectData = { reason: 'Connection to  closed due to keepalive timeout.', lastConnectionTime: new Date(connectTime) };
    await eventManager.fireOnDisconnect(disconnectData);
    await eventManager.fireOnSync({ syncType: 'device' });
    await eventManager.fireOnSync({ syncType: 'application' });

    fires.should.deepEqual([
      FiredTrigger({ triggerId: '2', triggerType: 'onDisconnect', payload: { time: new Date(), data: disconnectData } }),
      FiredTrigger({ triggerId: '5', triggerType: 'onDisconnect', payload: { time: new Date(), data: disconnectData } }),
      FiredTrigger({ triggerId: '6', triggerType: 'onSync', payload: { time: new Date(), data: { syncType: 'device' } } }),
      FiredTrigger({ triggerId: '4', triggerType: 'onSync', payload: { time: new Date(), data: { syncType: 'application' } } }),
      FiredTrigger({ triggerId: '6', triggerType: 'onSync', payload: { time: new Date(), data: { syncType: 'application' } } })
    ]);
  });
});
