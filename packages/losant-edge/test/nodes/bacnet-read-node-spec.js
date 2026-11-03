import '../common.js';
import bacnet from 'node-bacnet';
import { sleep } from 'omnibelt';
import bacnetReadNode from '../../src/nodes/bacnet-read-node.js';
import { cleanBacnetClients } from '../../src/lib/bacnet-utils.js';
import errors from 'losant-nodejs-utils/src/errors.js';
const outputIds = [['nid1']];
let bacnetDevice1;
let bacnetDevice2;
describe('BACnet Read Node', async () => {
  afterEach(async () => {
    await cleanBacnetClients();
  });
  it('should throw an error on invalid read instructions', async () => {
    const node1 = new bacnetReadNode( 'id', outputIds, {} );
    await node1.run({}, {}).should.be.rejectedWith(errors.Validation({ message: 'Read instructions must be an array.' }));

    const node2 = new bacnetReadNode( 'id', outputIds, {
      hostTemplate: '127.0.0.1',
      hostPortTemplate: 33333,
      incomingPortTemplate: 47809,
      destinationPath: 'destination',
      readInstructions: [
        { typeTemplate: 0, instanceTemplate: 0, propertyIdTemplate: 85, key: 'key1' },
        { typeTemplate: 0, instanceTemplate: 0, propertyIdTemplate: 86 }
      ]
    } );
    await node2.run({}, {}).should.be.rejectedWith(errors.Validation({ message: 'Key is required for read.' }));
  });
  it('should throw an error if port is invalid', async () => {
    const config = {
      hostTemplate: '127.0.0.1',
      incomingPortTemplate: '47809',
      hostPortTemplate: '{{ data.port }}',
      destinationPath: 'destination',
      readInstructions: [
        { typeTemplate: 0, instanceTemplate: 0, propertyIdTemplate: 85, key: 'key1' },
        { typeTemplate: 0, instanceTemplate: 0, propertyIdTemplate: 86, key: 'key2' }
      ]
    };
    const node = new bacnetReadNode('id', [['nid1']], config);
    return node.run({}, { data: { port: 'abc' } }).should.be.rejectedWith(errors.Validation({ message: 'Host port number (abc) is invalid.' }));
  });
  it('should throw an error if the client times out before connecting', async () => {
    const config = {
      hostTemplate: '127.0.0.1',
      incomingPortTemplate: '47809',
      hostPortTemplate: '3456',
      destinationPath: 'destination',
      apduTimeout: 1,
      readInstructions: [
        { typeTemplate: 0, instanceTemplate: 0, propertyIdTemplate: 85, key: 'key1' },
        { typeTemplate: 0, instanceTemplate: 0, propertyIdTemplate: 86, key: 'key2' }
      ]
    };
    const node = new bacnetReadNode('id', [['nid1']], config);
    const results = await node.run({}, {});
    results[1].destination.should.deepEqual({
      error: {
        type: 'BACNET_READ_ERROR',
        message: 'ERR_TIMEOUT'
      }
    });
  });
  it('should return correct values for same receiving ports', async () => {
    bacnetDevice1 = new bacnet({ port: 33333, interface: '0.0.0.0' });
    await new Promise((r) => bacnetDevice1.on('listening', r));
    bacnetDevice1.on('readPropertyMultiple', async (content) => {
      await sleep(100);
      // content.payload has all the info about the specific properties requested
      bacnetDevice1.readPropertyMultipleResponse(
        content.header.sender,
        content.invokeId,
        [{
          objectId: { type: 0, instance: 0 },
          values: [
            {
              property: { id: 85, index: 4294967295 },
              value: [
                { type: 3, value: 1234 }
              ]
            }
          ]
        },
        {
          objectId: { type: 0, instance: 0 },
          values: [
            {
              property: { id: 86, index: 4294967295 },
              value: [
                { type: 3, value: 4321 }
              ]
            }
          ]
        }]
      );
    });
    bacnetDevice2 = new bacnet({ port: 33334, interface: '0.0.0.0' });
    await new Promise((r) => bacnetDevice2.on('listening', r));
    bacnetDevice2.on('readPropertyMultiple', async (content) => {
      await sleep(50);
      // content.payload has all the info about the specific properties requested
      bacnetDevice2.readPropertyMultipleResponse(
        content.header.sender,
        content.invokeId,
        [{
          objectId: { type: 0, instance: 0 },
          values: [
            {
              property: { id: 87, index: 4294967295 },
              value: [
                { type: 3, value: 5678 }
              ]
            }
          ]
        }]
      );
    });
    const config1 = {
      hostTemplate: '127.0.0.1',
      hostPortTemplate: 33333,
      incomingPortTemplate: 47809,
      destinationPath: 'destination',
      readInstructions: [
        { typeTemplate: 0, instanceTemplate: 0, propertyIdTemplate: 85, key: 'key1' },
        { typeTemplate: 0, instanceTemplate: 0, propertyIdTemplate: 86, key: 'key2' }
      ]
    };
    const config2 = {
      hostTemplate: '127.0.0.1',
      hostPortTemplate: 33334,
      incomingPortTemplate: 47809, // same port number as device #1
      destinationPath: 'destination',
      readInstructions: [
        { typeTemplate: 0, instanceTemplate: 0, propertyIdTemplate: 87, key: 3 }
      ]
    };
    const node1 = new bacnetReadNode('id', outputIds, config1);
    const node2 = new bacnetReadNode('id', [['nid2']], config2);
    const [val1, val2] = await Promise.all([
      node1.run({}, {}),
      node2.run({}, {})
    ]);
    val1.should.deepEqual([
      [['nid1']],
      {
        destination: {
          key1: [{
            id: 85,
            index: 4294967295,
            value: [{ value: 1234, type: 3 }]
          }],
          key2: [{
            id: 86,
            index: 4294967295,
            value: [{ value: 4321, type: 3 }]
          }]
        }
      }
    ]);
    val2.should.deepEqual([
      [[ 'nid2']],
      {
        destination: {
          3: [{
            id: 87,
            index: 4294967295,
            value: [{ value: 5678, type: 3 }]
          }]
        }
      }
    ]);
    bacnetDevice1.close();
    bacnetDevice2.close();
  });
  it('should return correct values', async () => {
    bacnetDevice1 = new bacnet({ port: 33333, interface: '0.0.0.0' });
    await new Promise((r) => bacnetDevice1.on('listening', r));
    bacnetDevice1.on('readPropertyMultiple', async (content) => {
      await sleep(100);
      // content.payload has all the info about the specific properties requested
      bacnetDevice1.readPropertyMultipleResponse(
        content.header.sender,
        content.invokeId,
        [{
          objectId: { type: 0, instance: 0 },
          values: [
            {
              property: { id: 85, index: 4294967295 },
              value: [
                { type: 3, value: 1234 }
              ]
            }
          ]
        },
        {
          objectId: { type: 0, instance: 0 },
          values: [
            {
              property: { id: 86, index: 4294967295 },
              value: [
                { type: 3, value: 4321 }
              ]
            }
          ]
        }]
      );
    });
    const config1 = {
      hostTemplate: '127.0.0.1',
      hostPortTemplate: 33333,
      incomingPortTemplate: 47809,
      destinationPath: 'destination',
      readInstructions: [
        { typeTemplate: 0, instanceTemplate: 0, propertyIdTemplate: 85, key: 'key1' },
        { typeTemplate: 0, instanceTemplate: 0, propertyIdTemplate: 86, key: 'key2' }
      ]
    };
    const node1 = new bacnetReadNode('id', outputIds, config1);
    const val1 = await node1.run({}, {});
    val1.should.deepEqual([
      [['nid1']],
      {
        destination: {
          key1: [{
            id: 85,
            index: 4294967295,
            value: [{ value: 1234, type: 3 }]
          }],
          key2: [{
            id: 86,
            index: 4294967295,
            value: [{ value: 4321, type: 3 }]
          }]
        }
      }
    ]);
    bacnetDevice1.close();
  });
  it.skip('real world test for office thermostat', async () => {
    // requires a real BACnet device on the local network
    const config = {
      // hostTemplate: '<IP address of your BACnet device>',
      hostPortTemplate: 47800,
      apduTimeout: 6000,
      destinationPath: 'destination',
      readInstructions: [
        { typeTemplate: 0, instanceTemplate: 0, propertyIdTemplate: 8, key: 'key1' },
        { typeTemplate: 0, instanceTemplate: 2, propertyIdTemplate: 85, key: 'key2' },
        { typeTemplate: 2, instanceTemplate: 3, propertyIdTemplate: 117, key: 'key3' }
      ]
    };
    const client = new bacnetReadNode('id', outputIds, config );
    const output = await client.run({}, {});
    // console.log('OUTPUT', output);
    // console.log('Thermostat output: ', JSON.stringify(output, null, 2));
    return output;
  });
});
