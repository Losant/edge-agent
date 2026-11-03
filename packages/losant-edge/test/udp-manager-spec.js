import './common.js';
import { sleep, defer } from 'omnibelt';
import UdpManager from '../src/udp-manager.js';
import FiredTrigger from '../src/types/fired-trigger.js';
import snmp from 'net-snmp';

import dgram from 'dgram';

const sendToPort = async (port, msg) => {
  const deferred = defer();
  const message = Buffer.from(msg);
  const client = dgram.createSocket('udp4');
  client.send(message, port, 'localhost', () => {
    client.close();
    deferred.resolve();
  });
  await deferred.promise;
  await sleep(0);
};

const sendTrap = async (address='localhost', version='2c', community='public') => {
  const session = snmp.createSession(address, community, {
    version: version === '2c' ? snmp.Version2c : snmp.Version1,
    trapPort: 54323
  });
  const varbinds = [
    {
      oid: '1.3.6.1.2.1.1.5.0',
      type: snmp.ObjectType.OctetString,
      value: 'host1'
    }
  ];
  const deferred = defer();
  session.trap('1.3.6.1.2.1.43.18.2.0.2', varbinds, (err) => {
    if (err) {
      deferred.reject(err);
    } else {
      deferred.resolve();
    }
  });
  await deferred.promise;
  await sleep(0);
  session.close();
  await sleep(0);
};

// const basicUserConfig = {
//   name: 'myGuy',
//   securityLevel: 'none'
// };

// const userConfigWithAuthNoPriv = {
//   name: 'authGorl',
//   securityLevel: snmp.SecurityLevel.authNoPriv,
//   authMethod: snmp.AuthProtocols.sha,
//   authKey: 'something something'
// };

const userConfigWithAuthAndPriv = {
  name: 'blinkybill',
  level: snmp.SecurityLevel.authPriv,
  authProtocol: snmp.AuthProtocols.sha,
  authKey: 'madeahash',
  privProtocol: snmp.PrivProtocols.des,
  privKey: 'privycouncil'
};

const sendV3Trap = async (user=userConfigWithAuthAndPriv, address='localhost', options={ trapPort: 54323 }) => {
  const session = snmp.createV3Session(address, user, options);
  const varbinds = [
    {
      oid: '1.3.6.1.2.1.1.5.0',
      type: snmp.ObjectType.OctetString,
      value: 'host1'
    }
  ];
  const deferred = defer();
  session.trap('1.3.6.1.2.1.43.18.2.0.2', varbinds, (err) => {
    if (err) {
      deferred.reject(err);
    } else {
      deferred.resolve();
    }
  });
  await deferred.promise;
  await sleep(0);
  session.close();
  await sleep(0);
};


let udpManager;
describe('Edge UDP Manager', function() {

  afterEach(async () => {
    if (udpManager) {
      await udpManager.shutdown();
      udpManager = null;
    }
  });

  it('should trigger on ports', async () => {
    let triggers = [];
    udpManager = UdpManager({ address: '0.0.0.0' });
    await udpManager.initialize([
      { udpPort: '54321' },
      { udpPort: '54321' },
      { udpPort: '54322' }
    ], async (triggerFire) => {
      triggers.push(triggerFire);
      await sleep(0);
    });

    await sleep(0);
    await sendToPort(54321, 'Some 54321 bytes');
    await sendToPort(54322, 'Some 54322 bytes');
    await sendToPort(54323, 'Some 54323 bytes');
    while (triggers.length < 2) { await sleep(0); } // eslint-disable-line no-await-in-loop

    triggers.should.deepEqual([FiredTrigger({
      triggerId: '54321',
      triggerType: 'udp',
      payload: {
        time: triggers[0].payload.time,
        data: {
          message: 'Some 54321 bytes',
          sourceAddress: '127.0.0.1',
          sourcePort: triggers[0].payload.data.sourcePort
        }
      }
    }),
    FiredTrigger({
      triggerId: '54322',
      triggerType: 'udp',
      payload: {
        time: triggers[1].payload.time,
        data: {
          message: 'Some 54322 bytes',
          sourceAddress: '127.0.0.1',
          sourcePort: triggers[1].payload.data.sourcePort
        }
      }
    })]);

    await udpManager.update([
      { udpPort: '54322' },
      { udpPort: '54323' },
      { udpPort: '-10' },
      { udpPort: '22' }
    ]);
    triggers = [];

    await sendToPort(54321, 'Some 54321 bytes (2)');
    await sendToPort(54322, 'Some 54322 bytes (2)');
    await sendToPort(54323, 'Some 54323 bytes (2)');
    while (triggers.length < 2) { await sleep(0); } // eslint-disable-line no-await-in-loop

    triggers.should.deepEqual([FiredTrigger({
      triggerId: '54322',
      triggerType: 'udp',
      payload: {
        time: triggers[0].payload.time,
        data: {
          message: 'Some 54322 bytes (2)',
          sourceAddress: '127.0.0.1',
          sourcePort: triggers[0].payload.data.sourcePort
        }
      }
    }),
    FiredTrigger({
      triggerId: '54323',
      triggerType: 'udp',
      payload: {
        time: triggers[1].payload.time,
        data: {
          message: 'Some 54323 bytes (2)',
          sourceAddress: '127.0.0.1',
          sourcePort: triggers[1].payload.data.sourcePort
        }
      }
    })]);
  });

  it('should do the thing for snmp traps v1 and v2c', async () => {
    let triggers = [];
    udpManager = UdpManager({ address: '0.0.0.0' });
    await udpManager.initialize([
      { udpPort: '162' },
      { udpPort: '54323', key: 'triggerA', snmpTrapConfig: { community: 'public' } },
      { udpPort: '54322', key: 'triggerB', snmpTrapConfig: { community: 'public' } },
      { udpPort: '54323', key: 'triggerC', snmpTrapConfig: { community: 'public' } }
    ], async (triggerFire) => {
      triggers.push(triggerFire);
      await sleep(0);
    });
    await sendTrap();
    while (triggers.length < 3) { await sleep(0); } // eslint-disable-line no-await-in-loop
    (typeof(triggers[0].payload.data.message)).should.equal('string');
    triggers.should.deepEqual([
      FiredTrigger({
        triggerId: '54323',
        triggerType: 'udp',
        payload: {
          time: triggers[0].payload.time,
          data: {
            message: triggers[0].payload.data.message,
            sourceAddress: '127.0.0.1',
            sourcePort: triggers[0].payload.data.sourcePort
          }
        }
      }),
      FiredTrigger({
        triggerId: 'triggerA',
        triggerType: 'snmpTrap',
        payload: {
          time: triggers[1].payload.time,
          data: {
            sourcePort: triggers[1].payload.data.sourcePort,
            sourceAddress: '127.0.0.1',
            message: {
              community: 'public',
              version: '2c',
              pdu: {
                id: triggers[1].payload.data.message.pdu.id,
                type: 'TrapV2',
                varbinds: [
                  {
                    oid: '1.3.6.1.2.1.1.3.0',
                    type: 67,
                    value: triggers[1].payload.data.message.pdu.varbinds[0].value
                  },
                  {
                    oid: '1.3.6.1.6.3.1.1.4.1.0',
                    type: 6,
                    value: '1.3.6.1.2.1.43.18.2.0.2'
                  },
                  {
                    oid: '1.3.6.1.2.1.1.5.0',
                    value: 'host1',
                    type: 4
                  }
                ]
              }
            }
          }
        }
      }),
      FiredTrigger({
        triggerId: 'triggerC',
        triggerType: 'snmpTrap',
        payload: {
          time: triggers[2].payload.time,
          data: {
            sourcePort: triggers[2].payload.data.sourcePort,
            sourceAddress: '127.0.0.1',
            message: {
              community: 'public',
              version: '2c',
              pdu: {
                id: triggers[2].payload.data.message.pdu.id,
                type: 'TrapV2',
                varbinds: [
                  {
                    oid: '1.3.6.1.2.1.1.3.0',
                    type: 67,
                    value: triggers[2].payload.data.message.pdu.varbinds[0].value
                  },
                  {
                    oid: '1.3.6.1.6.3.1.1.4.1.0',
                    type: 6,
                    value: '1.3.6.1.2.1.43.18.2.0.2'
                  },
                  {
                    oid: '1.3.6.1.2.1.1.5.0',
                    value: 'host1',
                    type: 4
                  }
                ]
              }
            }
          }
        }
      })
    ]);
    triggers = [];
    await sendTrap('localhost', '1', 'public');
    while (triggers.length < 3) { await sleep(0); } // eslint-disable-line no-await-in-loop
    (typeof(triggers[0].payload.data.message)).should.equal('string');
    triggers.should.deepEqual([
      FiredTrigger({
        triggerId: '54323',
        triggerType: 'udp',
        payload: {
          time: triggers[0].payload.time,
          data: {
            message: triggers[0].payload.data.message,
            sourceAddress: '127.0.0.1',
            sourcePort: triggers[0].payload.data.sourcePort
          }
        }
      }),
      FiredTrigger({
        triggerId: 'triggerA',
        triggerType: 'snmpTrap',
        payload: {
          time: triggers[1].payload.time,
          data: {
            sourcePort: triggers[1].payload.data.sourcePort,
            sourceAddress: '127.0.0.1',
            message: {
              community: 'public',
              version: '1',
              pdu: {
                type: 'Trap',
                varbinds: [
                  {
                    oid: '1.3.6.1.2.1.1.5.0',
                    value: 'host1',
                    type: 4
                  }
                ]
              }
            }
          }
        }
      }),
      FiredTrigger({
        triggerId: 'triggerC',
        triggerType: 'snmpTrap',
        payload: {
          time: triggers[2].payload.time,
          data: {
            sourcePort: triggers[2].payload.data.sourcePort,
            sourceAddress: '127.0.0.1',
            message: {
              community: 'public',
              version: '1',
              pdu: {
                type: 'Trap',
                varbinds: [
                  {
                    oid: '1.3.6.1.2.1.1.5.0',
                    value: 'host1',
                    type: 4
                  }
                ]
              }
            }
          }
        }
      })
    ]);
  });

  it('should do the thing for snmp v3', async () => {
    const triggers = [];
    udpManager = UdpManager({ address: '0.0.0.0' });
    const user = {
      name: 'blinkybill',
      securityLevel: 'authAndEncrypt',
      authMethod: 'sha',
      authKey: 'madeahash',
      encryptionMethod: 'des',
      encryptionKey: 'privycouncil'
    };
    await udpManager.initialize([
      { udpPort: '54323', key: 'triggerA', snmpTrapConfig: { community: 'public' } },
      { udpPort: '54323', key: 'triggerB', snmpTrapConfig: { user } },
      { udpPort: '54322', key: 'triggerC', snmpTrapConfig: { community: 'public' } }
    ], async (triggerFire) => {
      triggers.push(triggerFire);
      await sleep(0);
    },
    async (triggerFire) => {
      triggers.push(triggerFire);
      await sleep(0);
    });
    await sendV3Trap();
    while (triggers.length < 2) { await sleep(0); } // eslint-disable-line no-await-in-loop
    (typeof(triggers[0].payload.data.message)).should.equal('string');
    triggers.should.deepEqual([
      FiredTrigger({
        payload: {
          time: triggers[0].payload.time,
          data: {
            message: triggers[0].payload.data.message,
            sourceAddress: '127.0.0.1',
            sourcePort: triggers[0].payload.data.sourcePort
          }
        },
        triggerId: '54323',
        triggerType: 'udp'
      }),
      FiredTrigger({
        payload: {
          data: {
            message: {
              version: '3',
              username: 'blinkybill',
              pdu: {
                id: triggers[1].payload.data.message.pdu.id,
                type: 'TrapV2',
                varbinds: [
                  {
                    oid: '1.3.6.1.2.1.1.3.0',
                    type: 67,
                    value: triggers[1].payload.data.message.pdu.varbinds[0].value
                  },
                  {
                    oid: '1.3.6.1.6.3.1.1.4.1.0',
                    type: 6,
                    value: '1.3.6.1.2.1.43.18.2.0.2'
                  },
                  {
                    oid: '1.3.6.1.2.1.1.5.0',
                    type: 4,
                    value: 'host1'
                  }
                ]
              }
            },
            sourceAddress: '127.0.0.1',
            sourcePort: triggers[1].payload.data.sourcePort
          },
          time: triggers[1].payload.time
        },
        triggerId: 'triggerB',
        triggerType: 'snmpTrap'
      })
    ]);
  });

  it('should receive and acknowledge inform requests', async () => {
    const triggers = [];
    udpManager = UdpManager({ address: '0.0.0.0' });
    await udpManager.initialize([
      { udpPort: '162' },
      { udpPort: '54323', key: 'triggerA', snmpTrapConfig: { community: 'public' } },
      { udpPort: '54322', key: 'triggerB', snmpTrapConfig: { community: 'public' } },
      { udpPort: '54323', key: 'triggerC', snmpTrapConfig: { community: 'public' } }
    ], async (triggerFire) => {
      triggers.push(triggerFire);
      await sleep(0);
    });
    const informOid = '1.3.6.1.4.1.2000.1';
    const varbinds = [
      {
        oid: '1.3.6.1.4.1.2000.2',
        type: snmp.ObjectType.OctetString,
        value: 'Periodic hardware self-check'
      },
      {
        oid: '1.3.6.1.4.1.2000.3',
        type: snmp.ObjectType.OctetString,
        value: 'hardware-ok'
      }
    ];

    const options = { upTime: 1000 };
    const deferred = defer();
    const session = snmp.createSession('localhost', 'public', { version: snmp.Version2c, trapPort: 54323 });
    session.inform(informOid, varbinds, options, (err) => {
      if (err) {
        deferred.reject(err);
      } else {
        deferred.resolve();
      }
    });
    await deferred.promise;
    await sleep(0);
    session.close();
    await sleep(0);


    while (triggers.length < 3) { await sleep(0); } // eslint-disable-line no-await-in-loop
    (typeof(triggers[0].payload.data.message)).should.equal('string');
    triggers.should.deepEqual([
      FiredTrigger({
        triggerId: '54323',
        triggerType: 'udp',
        payload: {
          time: triggers[0].payload.time,
          data: {
            message: triggers[0].payload.data.message,
            sourceAddress: '127.0.0.1',
            sourcePort: triggers[0].payload.data.sourcePort
          }
        }
      }),
      FiredTrigger({
        triggerId: 'triggerA',
        triggerType: 'snmpTrap',
        payload: {
          time: triggers[1].payload.time,
          data: {
            sourcePort: triggers[1].payload.data.sourcePort,
            sourceAddress: '127.0.0.1',
            message: {
              community: 'public',
              version: '2c',
              pdu: {
                id: triggers[1].payload.data.message.pdu.id,
                type: 'InformRequest',
                varbinds: [
                  {
                    oid: '1.3.6.1.2.1.1.3.0',
                    type: 67,
                    value: triggers[1].payload.data.message.pdu.varbinds[0].value
                  },
                  {
                    oid: '1.3.6.1.6.3.1.1.4.1.0',
                    type: 6,
                    value: '1.3.6.1.4.1.2000.1'
                  },
                  {
                    oid: '1.3.6.1.4.1.2000.2',
                    value: 'Periodic hardware self-check',
                    type: 4
                  },
                  {
                    oid: '1.3.6.1.4.1.2000.3',
                    type: 4,
                    value: 'hardware-ok'
                  }
                ]
              }
            }
          }
        }
      }),
      FiredTrigger({
        triggerId: 'triggerC',
        triggerType: 'snmpTrap',
        payload: {
          time: triggers[2].payload.time,
          data: {
            sourcePort: triggers[2].payload.data.sourcePort,
            sourceAddress: '127.0.0.1',
            message: {
              community: 'public',
              version: '2c',
              pdu: {
                id: triggers[2].payload.data.message.pdu.id,
                type: 'InformRequest',
                varbinds: [
                  {
                    oid: '1.3.6.1.2.1.1.3.0',
                    type: 67,
                    value: triggers[2].payload.data.message.pdu.varbinds[0].value
                  },
                  {
                    oid: '1.3.6.1.6.3.1.1.4.1.0',
                    type: 6,
                    value: '1.3.6.1.4.1.2000.1'
                  },
                  {
                    oid: '1.3.6.1.4.1.2000.2',
                    value: 'Periodic hardware self-check',
                    type: 4
                  },
                  {
                    oid: '1.3.6.1.4.1.2000.3',
                    type: 4,
                    value: 'hardware-ok'
                  }
                ]
              }
            }
          }
        }
      })
    ]);
  });

  it('should not error on receipt of a plain udp message when an snmp trap trigger is present', async () => {
    const triggers = [];
    udpManager = UdpManager({ address: '0.0.0.0' });
    await udpManager.initialize([
      { udpPort: '54321' },
      { udpPort: '54321', key: 'triggerA', snmpTrapConfig: { community: 'public' } },
      { udpPort: '54322', key: 'triggerB', snmpTrapConfig: { community: 'public' } },
      { udpPort: '54323', key: 'triggerC', snmpTrapConfig: { community: 'public' } }
    ], async (triggerFire) => {
      triggers.push(triggerFire);
      await sleep(0);
    });
    await sleep(0);
    await sendToPort(54321, 'Some 54321 bytes');
    await sendToPort(54322, 'Some 54322 bytes');

    while (triggers.length < 2) { await sleep(0); } // eslint-disable-line no-await-in-loop
    triggers.should.deepEqual([
      FiredTrigger({
        triggerId: '54321',
        triggerType: 'udp',
        payload: {
          time: triggers[0].payload.time,
          data: {
            message: 'Some 54321 bytes',
            sourceAddress: '127.0.0.1',
            sourcePort: triggers[0].payload.data.sourcePort
          }
        }
      }),
      FiredTrigger({
        triggerId: '54322',
        triggerType: 'udp',
        payload: {
          time: triggers[1].payload.time,
          data: {
            message: 'Some 54322 bytes',
            sourceAddress: '127.0.0.1',
            sourcePort: triggers[1].payload.data.sourcePort
          }
        }
      })
    ]);
  });
});
