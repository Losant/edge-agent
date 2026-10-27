import './common.js';
import { noop, sleep, uniq } from 'omnibelt';
import BeckhoffManager from '../src/beckhoff-manager.js';
import { clientCache } from '../src/lib/connections/beckhoff.js';
import BeckhoffWriteNode from '../src/nodes/beckhoff-write-node.js';

const waitForLength = async (array, length) => {
  if (array.length >= length) { return; }
  await sleep(100);
  return waitForLength(array, length);
};
const TOML_CONFIGS = {
  beckhoffExp: {
    type: 'beckhoff',
    name: 'beckhoffExp',
    localAmsNetId: '192.168.5.221.1.2',
    localAdsPort: 32750,
    targetAmsNetId: '5.123.154.18.1.1',
    targetAdsPort: 851,
    routerHost: '127.0.0.1',
    routerTcpPort: 48898,
    cycleTimeMs: 1000,
    subscriptionItems: [ 'GVL_Var.TestDint1' ]
  }
};

describe('Beckhoff Manager Fake', () => {
  let beckhoffManager;
  // otherwise the subscribed client for 127.0.0.1:48898 stays in the shared cache
  afterEach(async () => {
    await beckhoffManager.shutdown();
  });

  it('should make a beckhoff manager', async () => {
    beckhoffManager = BeckhoffManager({
      beckhoffExp: {
        type: 'beckhoff',
        name: 'beckhoffExp',
        localAmsNetId: '192.168.5.221.1.2',
        targetAmsNetId: '5.123.154.18.1.1',
        routerHost: '127.0.0.1',
        subscriptionItems: [ 'GVL_Var.TestDint1' ]
      }
    });
    await beckhoffManager.initialize([
      {
        triggerId: 'triggerId1',
        configName: 'beckhoffExp'
      },
      {
        triggerId: 'triggerId2',
        localAmsNetId: '192.168.5.221.1.2',
        targetAmsNetId: '5.123.154.18.1.1',
        routerHost: '127.0.0.1',
        subscriptionItems: [ { name: 'GVL_Var.TestDint1' } ]
      }
    ], noop).should.be.resolved();
  });
});
// Skipped: requires a real Beckhoff PLC reachable on the local network.
describe.skip('Beckhoff Manager', () => {
  let beckhoffManager, node;
  beforeEach(() => {
    beckhoffManager = BeckhoffManager(TOML_CONFIGS);
    const writeConfig = {
      localAmsNetIdTemplate: '192.168.5.221.1.2',
      localAdsPortTemplate: 32750,
      targetAmsNetIdTemplate: '5.123.154.18.1.1',
      targetAdsPortTemplate: 851,
      routerHostTemplate: '127.0.0.1',
      routerTcpPortTemplate: 48898,
      timeoutTemplate: 30000,
      writeInstructionsType: 'array',
      writeInstructions: [
        { type: 'symbol', nameTemplate: 'GVL_Var.TestDint1', key: 'testdint1', dataMethod: 'payloadPath', dataTemplate: 'value' },
        { type: 'symbol', nameTemplate: 'GVL_Var.TestReal1', key: 'testreal1', dataMethod: 'payloadPath', dataTemplate: 'value' }
      ],
      destinationPath: 'results'
    };
    const outputIds = [['nid1']];
    node = new BeckhoffWriteNode('id', outputIds, writeConfig);
  });

  afterEach(async () => {
    await beckhoffManager.shutdown();
    beckhoffManager = null;
  });

  it('should trigger on cycle times', async () => {
    const config = {
      triggerId: 'triggerId1',
      configName: 'beckhoffExp'
    };
    const config1 = {
      triggerId: 'triggerId2',
      localAmsNetId: '192.168.5.221.1.2',
      localAdsPort: '32750',
      targetAmsNetId: '5.123.154.18.1.1',
      targetAdsPort: '851',
      routerHost: '127.0.0.1',
      routerTcpPort: '48898',
      cycleTimeMs: 500,
      subscriptionItems: [ { name: 'GVL_Var.TestDint1' } ]
    };
    const config2 = {
      triggerId: 'triggerId3',
      localAmsNetId: '192.168.5.221.1.2',
      localAdsPort: '32750',
      targetAmsNetId: '5.123.154.18.1.1',
      targetAdsPort: '851',
      routerHost: '127.0.0.1',
      routerTcpPort: '48898',
      cycleTimeMs: 1000,
      subscriptionItems: [ { name: 'GVL_Var.TestDint1' } ]
    };
    const triggers = [];
    await beckhoffManager.initialize([ config, config1, config2 ], async (triggerFired) => {
      triggers.push(triggerFired);
      await sleep(0);
    });
    await node.run({ externalTimeout: 30000 }, { value: 1 });
    await sleep(1000);
    await node.run({ externalTimeout: 30000 }, { value: 2 });
    await waitForLength(triggers, 4);
    triggers[0].triggerId.should.equal('triggerId2');
    triggers[0].payload.data.should.deepEqual({
      GVL_Var:
      {
        TestDint1: {
          symbol: {
            comment: '',
            indexGroup: 16448,
            indexOffset: 384808,
            name: 'GVL_Var.TestDint1',
            size: 4,
            type: 'DINT'
          },
          timestamp: triggers[0].payload.data.GVL_Var.TestDint1.timestamp,
          value: 1
        }
      }
    });
    triggers[1].triggerId.should.equal('triggerId1');
    triggers[2].triggerId.should.equal('triggerId3');
    triggers[1].payload.should.deepEqual(triggers[2].payload);
    triggers[3].triggerId.should.equal('triggerId2');
  }).timeout(60000);

  it('should remove and change when manager is updated', async () => {
    const config = {
      triggerId: 'triggerId1',
      configName: 'beckhoffExp'
    };
    const config1 = {
      triggerId: 'triggerId2',
      localAmsNetId: '192.168.5.221.1.2',
      localAdsPort: '32750',
      targetAmsNetId: '5.123.154.18.1.1',
      targetAdsPort: '851',
      routerHost: '127.0.0.1',
      routerTcpPort: '48898',
      cycleTimeMs: 500,
      subscriptionItems: [ { name: 'GVL_Var.TestDint1' } ]
    };
    const config2 = {
      triggerId: 'triggerId3',
      localAmsNetId: '192.168.5.221.1.2',
      localAdsPort: '32750',
      targetAmsNetId: '5.123.154.18.1.1',
      targetAdsPort: '851',
      routerHost: '127.0.0.1',
      routerTcpPort: '48898',
      cycleTimeMs: 1000,
      subscriptionItems: [ { name: 'GVL_Var.TestDint1' } ]
    };
    let triggers = [];
    await beckhoffManager.initialize([ config, config1, config2 ], async (triggerFired) => {
      triggers.push(triggerFired);
      await sleep(0);
    });
    await node.run({ externalTimeout: 30000 }, { value: 3 });
    await sleep(1000);
    await node.run({ externalTimeout: 30000 }, { value: 4 });
    await sleep(1000);
    await waitForLength(triggers, 4);
    triggers[0].triggerId.should.equal('triggerId2');
    triggers[0].payload.data.should.deepEqual({
      GVL_Var:
      {
        TestDint1: {
          symbol: {
            comment: '',
            indexGroup: 16448,
            indexOffset: 384808,
            name: 'GVL_Var.TestDint1',
            size: 4,
            type: 'DINT'
          },
          timestamp: triggers[0].payload.data.GVL_Var.TestDint1.timestamp,
          value: triggers[0].payload.data.GVL_Var.TestDint1.value
        }
      }
    });
    let triggerIds = uniq(triggers.map(({ triggerId }) => { return triggerId; })).sort();
    triggerIds.should.deepEqual([ 'triggerId1', 'triggerId2', 'triggerId3' ]);
    config1.subscriptionItems.push({ name: 'GVL_VAR.TestReal1' });
    const config3 = {
      triggerId: 'triggerId4',
      localAmsNetId: '192.168.5.221.1.2',
      localAdsPort: '32750',
      targetAmsNetId: '5.123.154.18.1.1',
      targetAdsPort: '851',
      routerHost: '127.0.0.1',
      routerTcpPort: '48898',
      cycleTimeMs: 1000,
      subscriptionItems: [ { name: 'GVL_VAR.TestReal1' } ]
    };
    triggers = [];
    await beckhoffManager.update([ config1, config2, config3 ]);
    await node.run({ externalTimeout: 30000 }, { value: 1 });
    await sleep(1000);
    await node.run({ externalTimeout: 30000 }, { value: 2 });
    await sleep(1000);
    await node.run({ externalTimeout: 30000 }, { value: 3 });
    await sleep(1000);
    await node.run({ externalTimeout: 30000 }, { value: 4 });
    await sleep(1000);
    await node.run({ externalTimeout: 30000 }, { value: 5 });
    await sleep(1000);
    await waitForLength(triggers, 6);
    triggerIds = uniq(triggers.map(({ triggerId }) => { return triggerId; })).sort();
    triggerIds.should.deepEqual([ 'triggerId2', 'triggerId3', 'triggerId4' ]);
    await beckhoffManager.update([ config3 ]);
    triggers = [];
    await node.run({ externalTimeout: 30000 }, { value: 1 });
    await sleep(1000);
    await waitForLength(triggers, 1);
    triggers[0].triggerId.should.equal('triggerId4');
  }).timeout(60000);

  it('should retry when the client errors', async () => {
    const config = {
      triggerId: 'triggerId1',
      localAmsNetId: '192.168.5.111.1.1',
      localAdsPort: '32750',
      targetAmsNetId: '5.123.154.18.1.1',
      targetAdsPort: '851',
      routerHost: '127.0.0.1',
      routerTcpPort: '48898',
      cycleTimeMs: 1000,
      subscriptionItems: [ { name: 'GVL_Var.TestDint1' } ],
      timeout: 10000
    };
    const triggers = [];
    await beckhoffManager.initialize([ config ], async (triggerFired) => {
      triggers.push(triggerFired);
      await sleep(0);
    });
    clientCache.size.should.equal(1);
    const cacheInfo = clientCache.get('48898-127.0.0.1');
    const originalLastUsedTime = cacheInfo.lastUsedAt;
    cacheInfo.subscriptions.size.should.equal(1);
    cacheInfo.subscriptions.get('GVL_Var.TestDint1').should.deepEqual({
      1000: {
        triggerIds: ['triggerId1']
      }
    });
    await sleep(61000);
    originalLastUsedTime.should.be.lessThan(clientCache.get('48898-127.0.0.1').lastUsedAt);
    clientCache.get('48898-127.0.0.1').subscriptions.get('GVL_Var.TestDint1').should.deepEqual({
      1000: {
        triggerIds: ['triggerId1']
      }
    });
    await beckhoffManager.shutdown();
  }).timeout(1200000);

  it('should retry when the subscription errors', async () => {
    const config = {
      triggerId: 'triggerId1',
      localAmsNetId: '192.168.5.221.1.2',
      localAdsPort: '32750',
      targetAmsNetId: '5.123.154.18.1.1',
      targetAdsPort: '851',
      routerHost: '127.0.0.1',
      routerTcpPort: '48898',
      cycleTimeMs: 1000,
      subscriptionItems: [ { name: 'GVL_Var' } ],
      timeout: 10000
    };
    const triggers = [];
    await beckhoffManager.initialize([ config ], async (triggerFired) => {
      triggers.push(triggerFired);
      await sleep(0);
    });
    clientCache.size.should.equal(1);
    const cacheInfo = clientCache.get('48898-127.0.0.1');
    cacheInfo.subscriptions.size.should.equal(1);
    cacheInfo.subscriptions.get('GVL_Var').should.deepEqual({
      1000: {
        triggerIds: ['triggerId1'],
        notificationHandle: ''
      }
    });
  }).timeout(1200000);
});
