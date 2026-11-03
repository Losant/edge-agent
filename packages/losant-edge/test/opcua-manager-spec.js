import './common.js';
import { sleep } from 'omnibelt';
import WriteOpcUa from '../src/nodes/opcua-write-node.js';
import OpcUaManager from '../src/opcua-manager.js';
import { getServerInfo } from './lib/opcua-test-server.js';
import { getClientCache } from '../src/lib/opcua-client-utils.js';

const waitForLength = async (array, length) => {
  if (array.length >= length) { return; }
  await sleep(100);
  return waitForLength(array, length);
};

describe('OPC UA Manager', () => {
  let opcuaManager;

  beforeEach(() => {
    opcuaManager = OpcUaManager({
      tomlTrigger1: { // similar to what comes in from toml triggers configuration
        uri: 'opc.tcp://localhost:4335/UA/Server',
        securityPolicy: 'None',
        securityMode: 'None',
        samplingInterval: '10',
        eventFilter: [],
        monitoredItems: [
          {
            nameSpace: '1',
            identifier: 's=MyVar3'
          },
          {
            nameSpace: '1',
            identifier: 's=MyVar4'
          }
        ]
      },
      tomlEventTrigger: {
        uri: 'opc.tcp://localhost:4335/UA/Server',
        securityPolicy: 'None',
        securityMode: 'None',
        samplingInterval: '10',
        eventFilter: [
          'EventType',
          'SourceName',
          'ConditionClassId',
          'ConditionClassName',
          'ConditionName',
          'Retain',
          'EnabledState',
          'Quality',
          'Comment',
          'AckedState',
          'ConfirmedState',
          'ActiveState',
          'InputNode',
          'HighLimit',
          'LowLimit',
          'HighHighLimit'
        ],
        monitoredItems: [
          {
            nameSpace: '0',
            identifier: 'i=2253'
          }
        ]
      }
    });
  });

  afterEach(async function() {
    await opcuaManager.shutdown();
    opcuaManager = null;
  });

  it('should trigger on value change', async () => {
    const opcuaId = 'flow1-trig1';
    const serverConfig = {
      uri: 'opc.tcp://localhost:4335/UA/Server',
      securityPolicy: 'None',
      securityMode: 'None'
    };
    const subInstructions = [{
      nameSpace: '1',
      identifier: 's=MyVar3',
      samplingInterval: '10',
      eventFilter: []
    }];
    const triggers = [];

    await opcuaManager.initialize([ { opcuaId, ...serverConfig, ...subInstructions[0] } ], async (triggerFire) => {
      triggers.push(triggerFire);
      await sleep(0);
    });

    const config = {
      uriTemplate: 'opc.tcp://localhost:4335/UA/Server',
      securityPolicyTemplate: 'None',
      securityModeTemplate: 'None',
      writeInstructions: [
        { nameSpaceTemplate: '1', identifierTemplate: 's=MyVar3', valueTemplate: 'thing1' }
      ],
      destinationPath: 'destination'
    };
    const node = new WriteOpcUa('id', [['nid1']], config );
    const output = await node.run({ flowVersionId: '123' }, {});
    output[1].destination.write.should.equal('success');

    await sleep(50);
    const config2 = {
      uriTemplate: 'opc.tcp://localhost:4335/UA/Server',
      securityPolicyTemplate: 'None',
      securityModeTemplate: 'None',
      writeInstructions: [
        { nameSpaceTemplate: '1', identifierTemplate: 's=MyVar3', valueTemplate: 'thing2' }
      ],
      destinationPath: 'destination'
    };
    const node2 = new WriteOpcUa('id', [['nid1']], config2 );
    const output2 =  await node2.run({ flowVersionId: '123' }, {});
    output2[1].destination.write.should.equal('success');

    await waitForLength(triggers, 3);

    triggers[1].payload.data.should.equal('thing1');
    triggers[2].payload.data.should.equal('thing2');

    let clients = await Promise.all(Array.from(getClientCache().values()));
    clients.length.should.equal(1);
    let sessions = await Promise.all(Array.from(clients[0].session.values()));
    sessions.length.should.equal(2);
    sessions[0].monitoredItems.size.should.equal(1);
    sessions[1].monitoredItems.size.should.equal(0);

    await opcuaManager.update([ ]);

    clients = await Promise.all(Array.from(getClientCache().values()));
    clients.length.should.equal(1);
    sessions = await Promise.all(Array.from(clients[0].session.values()));
    sessions.length.should.equal(1);
    sessions[0].monitoredItems.size.should.equal(0);
  });

  it('should trigger on alarm events w/ multiple filters', async () => {
    getServerInfo().startInterval();
    const fields = [
      'EventType',
      'SourceName',
      'Message',
      'ConditionClassId',
      'ConditionClassName',
      'ConditionName',
      'BranchId',
      'Retain',
      'EnabledState',
      'Quality',
      'LastSeverity',
      'Comment',
      'ClientUserId',
      'AckedState',
      'ConfirmedState',
      'ActiveState',
      'InputNode',
      'SuppressedState',
      'HighLimit',
      'LowLimit',
      'HighHighLimit',
      'LowLowLimit',
      'Value'
    ];
    const opcuaId = 'flow1-trig1';
    const serverConfig = {
      uri: 'opc.tcp://localhost:4335/UA/Server',
      securityPolicy: 'None',
      securityMode: 'None'
    };
    const subInstructions = [{
      nameSpace: '0',
      identifier: 'i=2253',
      samplingInterval: '10',
      eventFilter: fields
    }];
    const triggers = [];
    await opcuaManager.initialize([ { opcuaId, ...serverConfig, ...subInstructions[0] } ], async (triggerFire) => {
      triggers.push(triggerFire);
      await sleep(0);
    });

    await waitForLength(triggers, 1);
    triggers[0].payload.data.should.deepEqual({
      AckedState: 'Unacknowledged',
      ActiveState: 'Active',
      BranchId: 'ns=0;i=0',
      ClientUserId: '',
      Comment: 'locale=null text=null',
      ConditionClassId: 'ns=0;i=11164',
      ConditionClassName:  'ProcessConditionClassType',
      ConditionName: 'Test1',
      ConfirmedState: 'locale=null text=null',
      EnabledState: 'Enabled',
      EventType: 'ns=0;i=9341',
      HighHighLimit: 0.9,
      HighLimit: 0.7,
      InputNode: 'ns=1;i=1003',
      LastSeverity: 0,
      LowLimit: 0.2,
      LowLowLimit: '',
      Message: 'Condition is 0.729 and state is High',
      Quality: 'Good (0x00000000)',
      Retain: true,
      SourceName: '1:TankLevel',
      SuppressedState: '',
      Value: '',
      namespace: '0',
      identifier: 'i=2253'
    });
  });

  it('should handle updates', async () => {
    getServerInfo().startInterval();
    let fields = [
      'SourceName'
    ];
    const opcuaId = 'flow1-trig1';
    const serverConfig = {
      uri: 'opc.tcp://localhost:4335/UA/Server',
      securityPolicy: 'None',
      securityMode: 'None'
    };
    let subInstructions = [{
      nameSpace: '0',
      identifier: 'i=2253',
      samplingInterval: '10',
      eventFilter: fields
    }];
    let triggers = [];
    await opcuaManager.initialize([ { opcuaId, ...serverConfig, ...subInstructions[0] } ], async (triggerFire) => {
      triggers.push(triggerFire);
      await sleep(0);
    });

    let clients = await Promise.all(Array.from(getClientCache().values()));
    clients.length.should.equal(1);
    let sessions = await Promise.all(Array.from(clients[0].session.values()));
    sessions.length.should.equal(1);
    sessions[0].monitoredItems.size.should.equal(1);

    await waitForLength(triggers, 1);
    triggers[0].payload.data.should.deepEqual({
      SourceName: '1:TankLevel',
      namespace: '0',
      identifier: 'i=2253'
    });

    fields = [
      'SourceName',
      'Message'
    ];
    subInstructions = [{
      nameSpace: '0',
      identifier: 'i=2253',
      samplingInterval: '10',
      eventFilter: fields
    }];

    await opcuaManager.update([ { opcuaId, ...serverConfig, ...subInstructions[0] } ]);
    triggers = [];

    clients = await Promise.all(Array.from(getClientCache().values()));
    clients.length.should.equal(1);
    sessions = await Promise.all(Array.from(clients[0].session.values()));
    sessions.length.should.equal(1);
    sessions[0].monitoredItems.size.should.equal(1);

    await waitForLength(triggers, 3);
    triggers[0].payload.data.should.deepEqual({
      SourceName: 'LimitState',
      Message: 'locale=null text=null',
      namespace: '0',
      identifier: 'i=2253'
    });
    triggers[1].payload.data.should.deepEqual({
      SourceName: '1:TankLevel',
      Message: 'Condition is 0.881 and state is High',
      namespace: '0',
      identifier: 'i=2253'
    });
    triggers[2].payload.data.should.deepEqual({
      SourceName: '1:TankLevel',
      Message: 'Condition is 0.881 and state is High',
      namespace: '0',
      identifier: 'i=2253'
    });

    // check deleting
    await opcuaManager.update([ ]);
    triggers = [];

    clients = await Promise.all(Array.from(getClientCache().values()));
    clients.length.should.equal(1);
    sessions = await Promise.all(Array.from(clients[0].session.values()));
    sessions.length.should.equal(0);

    await sleep(1200);
    triggers.length.should.equal(0);
  });

  it('should handle multiple triggers', async () => {
    getServerInfo().startInterval();
    let fields = [
      'SourceName'
    ];
    let opcuaId = 'flow1-trig1';
    const serverConfig = {
      uri: 'opc.tcp://localhost:4335/UA/Server',
      securityPolicy: 'None',
      securityMode: 'None'
    };
    let subInstructions = [{
      nameSpace: '0',
      identifier: 'i=2253',
      samplingInterval: '10',
      eventFilter: fields
    }];
    let triggers = [];
    await opcuaManager.initialize([ { opcuaId, ...serverConfig, ...subInstructions[0] } ], async (triggerFire) => {
      triggers.push(triggerFire);
      await sleep(0);
    });

    let clients = await Promise.all(Array.from(getClientCache().values()));
    clients.length.should.equal(1);
    let sessions = await Promise.all(Array.from(clients[0].session.values()));
    sessions.length.should.equal(1);
    sessions[0].monitoredItems.size.should.equal(1);

    await waitForLength(triggers, 1);
    triggers[0].payload.data.should.deepEqual({
      SourceName: '1:TankLevel',
      namespace: '0',
      identifier: 'i=2253'
    });

    const fields2 = [
      'SourceName',
      'Message'
    ];

    const subInstructions2 = [{
      nameSpace: '0',
      identifier: 'i=2253',
      samplingInterval: '10',
      eventFilter: fields2
    }];

    opcuaId = 'flow1-trig2';
    await opcuaManager.update([
      { opcuaId: 'flow1-trig1', ...serverConfig, ...subInstructions[0] },
      { opcuaId, ...serverConfig, ...subInstructions2[0] }
    ]);
    triggers = [];

    clients = await Promise.all(Array.from(getClientCache().values()));
    clients.length.should.equal(1);
    sessions = await Promise.all(Array.from(clients[0].session.values()));
    sessions.length.should.equal(2);
    sessions[0].monitoredItems.size.should.equal(1);
    sessions[1].monitoredItems.size.should.equal(1);

    await waitForLength(triggers, 2);
    triggers[1].payload.data.should.be.oneOf({
      SourceName: '1:TankLevel',
      namespace: '0',
      identifier: 'i=2253'
    }, {
      SourceName: 'LimitState',
      namespace: '0',
      identifier: 'i=2253'
    }, {
      Message: 'Condition value is 0.8810636784636012 and state is High',
      namespace: '0',
      identifier: 'i=2253'
    }, {
      SourceName: '1:TankLevel',
      Message: 'Condition value is 0.8810636784636012 and state is High',
      namespace: '0',
      identifier: 'i=2253'
    });

    // delete and add new monitor to same session
    fields = [
      'EventType'
    ];
    subInstructions = [{
      nameSpace: '0',
      identifier: 'i=2253',
      samplingInterval: '10',
      eventFilter: fields
    }];

    opcuaId = 'flow1-trig3';
    await opcuaManager.update([ { opcuaId, ...serverConfig, ...subInstructions[0] } ]);
    triggers = [];

    clients = await Promise.all(Array.from(getClientCache().values()));
    clients.length.should.equal(1);
    sessions = await Promise.all(Array.from(clients[0].session.values()));
    sessions.length.should.equal(1);

    await waitForLength(triggers, 1);
    triggers[0].payload.data.should.deepEqual({
      EventType: 'ns=0;i=9341',
      namespace: '0',
      identifier: 'i=2253'
    });
  });

  it('should trigger from toml configurations', async () => {
    getServerInfo().startInterval();
    const triggers = [];
    await opcuaManager.initialize([ { opcuaId: 'flow1-trig1', configName: 'tomlTrigger1' } ], async (triggerFire) => {
      triggers.push(triggerFire);
      await sleep(0);
    });

    const baseConfig = {
      uriTemplate: 'opc.tcp://localhost:4335/UA/Server',
      securityPolicyTemplate: 'None',
      securityModeTemplate: 'None',
      destinationPath: 'destination'
    };

    const config = {
      writeInstructions: [
        { nameSpaceTemplate: '1', identifierTemplate: 's=MyVar3', valueTemplate: 'thing1' }
      ],
      ...baseConfig
    };
    const node = new WriteOpcUa('id', [['nid1']], config );
    const output = await node.run({ flowVersionId: '123' }, {});
    output[1].destination.write.should.equal('success');

    await sleep(50);
    const config2 = {
      writeInstructions: [
        { nameSpaceTemplate: '1', identifierTemplate: 's=MyVar3', valueTemplate: 'thing2' }
      ],
      ...baseConfig
    };
    const node2 = new WriteOpcUa('id', [['nid1']], config2 );
    const output2 =  await node2.run({ flowVersionId: '123' }, {});
    output2[1].destination.write.should.equal('success');

    await sleep(50);
    const config3 = {
      writeInstructions: [
        {
          nameSpaceTemplate: '1',
          identifierTemplate: 's=MyVar4',
          sourceTypeTemplate: 'path',
          valueTemplate: 'arrayVal'
        }
      ],
      ...baseConfig
    };
    const node3 = new WriteOpcUa('id', [['nid1']], config3 );
    const output3 =  await node3.run({ flowVersionId: '123' }, { arrayVal: [1, 2, 3] });
    output3[1].destination.write.should.equal('success');

    await waitForLength(triggers, 5);

    triggers[1].payload.data.sourceTimestamp.should.be.Date();
    triggers[2].payload.data.sourceTimestamp.should.be.Date();
    triggers[4].payload.data.sourceTimestamp.should.be.Date();

    triggers[1].payload.data.should.deepEqual({
      namespace: '1',
      identifier: 's=MyVar3',
      value: 'thing1',
      sourceTimestamp: triggers[1].payload.data.sourceTimestamp,
      dataType: 'String'
    });
    triggers[2].payload.data.should.deepEqual({
      namespace: '1',
      identifier: 's=MyVar3',
      value: 'thing2',
      sourceTimestamp: triggers[2].payload.data.sourceTimestamp,
      dataType: 'String'
    });
    triggers[4].payload.data.should.deepEqual({
      namespace: '1',
      identifier: 's=MyVar4',
      value: ['1', '2', '3'],
      sourceTimestamp: triggers[4].payload.data.sourceTimestamp,
      dataType: 'Double'
    });
  });

  it('should trigger from toml configurations w/ multiple filters', async () => {
    getServerInfo().startInterval();
    const triggers = [];
    await opcuaManager.initialize([ { opcuaId: 'flow1-trig1', configName: 'tomlEventTrigger' } ], async (triggerFire) => {
      triggers.push(triggerFire);
      await sleep(0);
    });

    await waitForLength(triggers, 1);
    triggers[0].payload.data.should.deepEqual({
      AckedState: 'Unacknowledged',
      ActiveState: 'Active',
      Comment: 'locale=null text=null',
      ConditionClassId: 'ns=0;i=11164',
      ConditionClassName:  'ProcessConditionClassType',
      ConditionName: 'Test1',
      ConfirmedState: 'locale=null text=null',
      EnabledState: 'Enabled',
      EventType: 'ns=0;i=9341',
      HighHighLimit: 0.9,
      HighLimit: 0.7,
      InputNode: 'ns=1;i=1003',
      LowLimit: 0.2,
      Quality: 'Good (0x00000000)',
      Retain: true,
      SourceName: '1:TankLevel',
      namespace: '0',
      identifier: 'i=2253'
    });
  });

  it.skip('should handle unexpected close, sim', async () => {
    let fields = [
      'SourceName'
    ];
    const opcuaId = 'flow1-trig1';
    const serverConfig = {
      uri: 'opc.tcp://localhost:48010',
      securityPolicy: 'None',
      securityMode: 'None'
    };
    let subInstructions = [{
      nameSpace: '5',
      identifier: 's=Expression1',
      samplingInterval: '100',
      eventFilter: fields
    }];
    let triggers = [];
    await opcuaManager.initialize([ { opcuaId, ...serverConfig, ...subInstructions[0] } ], async (triggerFire) => {
      triggers.push(triggerFire);
      await sleep(0);
    });

    await sleep(1200);

    fields = [];
    subInstructions = [{
      nameSpace: '5',
      identifier: 's=Expression1',
      samplingInterval: '100',
      eventFilter: fields
    }];

    await opcuaManager.update([ ]);

    await opcuaManager.update([ { opcuaId, ...serverConfig, ...subInstructions[0] } ]);
    triggers = [];

    await sleep(1200);
    triggers.length.should.equal(2);

    // check deleting
    await opcuaManager.update([ ]);
    triggers = [];

    await sleep(1200);
    triggers.length.should.equal(0);
  });

  it('should track each toml-configured trigger by its own id across updates', async () => {
    getServerInfo().startInterval();
    const configs = [
      { opcuaId: 'flow1-trig1', configName: 'tomlTrigger1' },
      { opcuaId: 'flow1-trig2', configName: 'tomlEventTrigger' }
    ];
    await opcuaManager.initialize(configs, async () => { await sleep(0); });

    const tracked = await opcuaManager.update(configs);
    Array.from(tracked.keys()).should.deepEqual(['flow1-trig1', 'flow1-trig2']);

    const trackedAfterRemoval = await opcuaManager.update([ configs[1] ]);
    Array.from(trackedAfterRemoval.keys()).should.deepEqual(['flow1-trig2']);

    const trackedEmpty = await opcuaManager.update([ ]);
    trackedEmpty.size.should.equal(0);
  });
});
