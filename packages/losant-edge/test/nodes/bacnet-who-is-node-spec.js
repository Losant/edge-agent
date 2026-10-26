import '../common.js';
import Bacnet from 'node-bacnet';
import { sleep } from 'omnibelt';
import BacnetWhoIsNode from '../../src/nodes/bacnet-who-is-node.js';
import { cleanBacnetClients } from '../../src/lib/bacnet-utils.js';
import errors from 'losant-nodejs-utils/src/errors.js';

describe('BACnet Who Is Node', async () => {
  afterEach(async () => {
    await cleanBacnetClients();
  });
  it('should validate fields', async () => {
    const config = {
      incomingPortTemplate: '{{a}}',
      hostPortTemplate: '{{b}}',
      scanTimeMsTemplate: '{{c}}',
      scanCountTemplate: '{{d}}',
      lowLimitTemplate: '{{e}}',
      highLimitTemplate: '{{f}}',
      destinationPath: 'g'
    };
    const node = new BacnetWhoIsNode('id', [['nid1']], config);
    await node.run({}, { a: 'a' }).should.be.rejectedWith(errors.Validation({ message: 'Incoming port number (a) is invalid.' }));
    await node.run({}, { a: '5', b: 'a' }).should.be.rejectedWith(errors.Validation({ message: 'Broadcast port number (a) is invalid.' }));
    await node.run({}, { a: '5', b: '5' }).should.be.rejectedWith(errors.Validation({ message: 'Low limit must be a valid integer.' }));
    await node.run({}, { a: '5', b: '5', e: '5' }).should.be.rejectedWith(errors.Validation({ message: 'High limit must be a valid integer.' }));
  });

  it('should properly time out and return nothing', async () => {
    const node = new BacnetWhoIsNode('id', [['nid1']], {
      incomingPortTemplate: 47809,
      destinationPath: 'destination',
      scanTimeMsTemplate: 100
    });

    const result = await node.run({}, {});
    result.should.deepEqual([
      [['nid1']],
      { destination: { } }
    ]);
  });

  it('should properly send a who is call, and receive an i am response', async () => {
    const bacnetDevice1 = new Bacnet({ port: 47807 });
    await new Promise((r) => bacnetDevice1.on('listening', r));

    // since we are letting them bind to 0.0.0.0, the actual source can vary
    // but will be the same for both clients
    let actualIpOfClients;

    bacnetDevice1.on('whoIs', async (content) => {
      await sleep(100);
      actualIpOfClients = content.header.sender.address.split(':')[0];
      bacnetDevice1.iAmResponse(
        content.header.sender,
        4321,
        0,
        5678
      );
    });

    const node = new BacnetWhoIsNode('id', [['nid1']], {
      broadcastAddressTemplate: '255.255.255.255',
      hostPortTemplate: 47807,
      incomingPortTemplate: 47809,
      destinationPath: 'destination',
      scanCountTemplate: 1,
      scanTimeMsTemplate: 1000
    });

    try {
      const result = await node.run({}, {});
      result.should.deepEqual([
        [['nid1']],
        {
          destination: {
            4321: {
              address: actualIpOfClients,
              port: 47807,
              forwardedFrom: null,
              vendorId: 5678
            }
          }
        }
      ]);
    } finally {
      bacnetDevice1.close();
    }
  });

});
