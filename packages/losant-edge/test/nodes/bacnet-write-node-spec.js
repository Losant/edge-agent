import '../common.js';
import bacnetWriteNode from '../../src/nodes/bacnet-write-node.js';
import errors from 'losant-nodejs-utils/src/errors.js';
import bacnet from 'node-bacnet';
import { cleanBacnetClients } from '../../src/lib/bacnet-utils.js';
const outputIds = [['nid1']];
import { defer } from 'omnibelt';
let bacnetClient;
const BUFFER_VALUE = '810a0039010030000e0c000000001e29554e44428fcccd4f1f0c008000001e29554e44428a00004f1f0c008000121e29554e44440000004f1f';

describe('BACnet write node', () => {
  beforeEach(() => {
    bacnetClient = new bacnet({ apduTimeout: 3000, interface: '0.0.0.0' });
  });

  afterEach(async () => {
    if (bacnetClient) {
      bacnetClient.close();
    }
    await cleanBacnetClients();
  });

  it('should throw an error if host is empty', async () => {
    const config = {
      apduTimeout: 6000,
      hostPortTemplate: 47808,
      writeInstructions: [
        {
          typeTemplate: 2,
          instanceTemplate: 3,
          propertyIdTemplate: 85,
          propertyIndexTemplate: 4294967295,
          writeValueTypeTemplate: bacnet.enum.ApplicationTag.REAL,
          writeValueTemplate: 60,
          writePriorityTemplate: 1
        }
      ],
      destinationPath: 'destination'
    };
    const node = new bacnetWriteNode('id', [['nid1']], config);
    return node.run({}, {}).should.be.rejectedWith(errors.Validation({ message: 'Host is required.' }));
  });

  it('should throw an error if it cant connect', async () => {
    const config = {
      hostTemplate: '127.0.0.2',
      apduTimeout: 1,
      hostPortTemplate: 12456,
      writeInstructions: [
        {
          typeTemplate: 2,
          instanceTemplate: 3,
          propertyIdTemplate: 85,
          propertyIndexTemplate: 4294967295,
          writeValueTypeTemplate: bacnet.enum.ApplicationTag.REAL,
          writeValueTemplate: 60,
          writePriorityTemplate: 1
        }
      ],
      destinationPath: 'destination'
    };
    const node = new bacnetWriteNode('id', [['nid1']], config);
    const results = await node.run({}, {});
    results[1].destination.should.deepEqual({
      error: {
        type: 'BACNET_WRITE_ERROR',
        message: 'ERR_TIMEOUT'
      },
      write: 'fail'
    });
  });

  it('should throw an error if host is invalid', async () => {
    const config = {
      hostTemplate: '0.0.1231.12131', // invalid host address
      hostPortTemplate: 47809,
      writeInstructions: [
        {
          typeTemplate: 2,
          instanceTemplate: 3,
          propertyIdTemplate: 85,
          propertyIndexTemplate: 4294967295,
          writeValueTypeTemplate: bacnet.enum.ApplicationTag.REAL,
          writeValueTemplate: 60,
          writePriorityTemplate: 1
        }
      ],
      destinationPath: 'destination'
    };
    const node = new bacnetWriteNode('id', [['nid1']], config);
    return node.run({}, {}).should.be.rejectedWith(errors.Validation({ message: `Cannot resolve host: ${config.hostTemplate}` }));
  });

  it('should throw an error if port is invalid', async () => {
    const config = {
      hostTemplate: '127.0.0.1',
      incomingPortTemplate: '47809',
      hostPortTemplate: '{{ data.port }}',
      writeInstructions: [
        {
          typeTemplate: 2,
          instanceTemplate: 3,
          propertyIdTemplate: 85,
          propertyIndexTemplate: 4294967295,
          writeValueTypeTemplate: bacnet.enum.ApplicationTag.REAL,
          writeValueTemplate: 60,
          writePriorityTemplate: 1
        }
      ],
      destinationPath: 'destination'
    };
    const node = new bacnetWriteNode('id', [['nid1']], config);
    return node.run({}, { data: { port: 'abc' } }).should.be.rejectedWith(errors.Validation({ message: 'Host port number (abc) is invalid.' }));
  });

  it('should throw an error if host port number is invalid', async () => {
    const config = {
      hostTemplate: '127.0.0.1',
      apduTimeout: 6000,
      hostPortTemplate: 12131311, // invalid port
      incomingPortTemplate: 47809,
      writeInstructions: [
        {
          typeTemplate: 2,
          instanceTemplate: 3,
          propertyIdTemplate: 85,
          propertyIndexTemplate: 4294967295,
          writeValueTypeTemplate: bacnet.enum.ApplicationTag.REAL,
          writeValueTemplate: 60,
          writePriorityTemplate: 1
        }
      ],
      destinationPath: 'destination'
    };
    const node = new bacnetWriteNode('id', [['nid1']], config);
    return node.run({}, {}).should.be.rejectedWith(errors.Validation({ message: 'Host port number (12131311) is invalid.' }));
  });

  it('should throw an error if incoming port number is invalid', async () => {
    const config = {
      hostTemplate: '127.0.0.1',
      apduTimeout: 6000,
      incomingPortTemplate: 4780112,
      writeInstructions: [
        {
          typeTemplate: 2,
          instanceTemplate: 3,
          propertyIdTemplate: 85,
          propertyIndexTemplate: 4294967295,
          writeValueTypeTemplate: bacnet.enum.ApplicationTag.REAL,
          writeValueTemplate: 60,
          writePriorityTemplate: 1
        }
      ],
      destinationPath: 'destination'
    };
    const node = new bacnetWriteNode('id', [['nid1']], config);
    return node.run({}, {}).should.be.rejectedWith(errors.Validation({ message: 'Incoming port number (4780112) is invalid.' }));
  });

  it('should throw an error if write instructions are empty', async () => {
    const node = new bacnetWriteNode('id', outputIds, {});
    return node.run({}, {}).should.be.rejectedWith(errors.Validation({ message: 'Write instructions must be an array.' }));
  });

  it('should throw an error if type is empty', async () => {
    const config = {
      hostTemplate: '0.0.0.0',
      apduTimeout: 6000,
      hostPortTemplate: 47809,
      writeInstructions: [
        {
          // typeTemplate: 3,
          instanceTemplate: 3,
          propertyIdTemplate: 85,
          propertyIndexTemplate: 4294967295,
          writeValueTypeTemplate: bacnet.enum.ApplicationTag.REAL,
          writeValueTemplate: 60,
          writePriorityTemplate: 1
        }
      ],
      destinationPath: 'destination'
    };
    const node = new bacnetWriteNode('id', [['nid1']], config);
    return node.run({}, {}).should.be.rejectedWith(errors.Validation({ message: 'Type is required.' }));
  });

  it('should throw an error if type is not an integer', async () => {
    const config = {
      hostTemplate: '0.0.0.0',
      apduTimeout: 6000,
      hostPortTemplate: 47809,
      writeInstructions: [
        {
          typeTemplate: 2.4, // invalid int
          instanceTemplate: 3,
          propertyIdTemplate: 85,
          propertyIndexTemplate: 4294967295,
          writeValueTypeTemplate: bacnet.enum.ApplicationTag.REAL,
          writeValueTemplate: 60,
          writePriorityTemplate: 1
        }
      ],
      destinationPath: 'destination'
    };
    const node = new bacnetWriteNode('id', [['nid1']], config);
    return node.run({}, {}).should.be.rejectedWith(errors.Validation({ message: 'Type must be a valid integer.' }));
  });

  it('should throw an error if type is out of range', async () => {
    const config = {
      hostTemplate: '0.0.0.0',
      apduTimeout: 6000,
      hostPortTemplate: 47809,
      writeInstructions: [
        {
          typeTemplate: 99,
          instanceTemplate: 3,
          propertyIdTemplate: 85,
          propertyIndexTemplate: 4294967295,
          writeValueTypeTemplate: bacnet.enum.ApplicationTag.REAL,
          writeValueTemplate: 60,
          writePriorityTemplate: 1
        }
      ],
      destinationPath: 'destination'
    };
    const node = new bacnetWriteNode('id', [['nid1']], config);
    return node.run({}, {}).should.be.rejectedWith(errors.Validation({ message: 'Type must be between 0 to 59 inclusively.' }));
  });

  it('should throw an error if instance is empty', async () => {
    const config = {
      hostTemplate: '0.0.0.0',
      apduTimeout: 6000,
      hostPortTemplate: 47809,
      writeInstructions: [
        {
          typeTemplate: 2,
          instanceTemplate: 3.2, // invalid int
          propertyIdTemplate: 85,
          propertyIndexTemplate: 4294967295,
          writeValueTypeTemplate: bacnet.enum.ApplicationTag.REAL,
          writeValueTemplate: 60,
          writePriorityTemplate: 1
        }
      ],
      destinationPath: 'destination'
    };
    const node = new bacnetWriteNode('id', [['nid1']], config);
    return node.run({}, {}).should.be.rejectedWith(errors.Validation({ message: 'Instance must be a valid integer.' }));
  });

  it('should throw an error if instance is out of range', async () => {
    const config = {
      hostTemplate: '0.0.0.0',
      apduTimeout: 6000,
      hostPortTemplate: 47809,
      writeInstructions: [
        {
          typeTemplate: 2,
          instanceTemplate: 4194399,
          propertyIdTemplate: 85,
          propertyIndexTemplate: 4294967295,
          writeValueTypeTemplate: bacnet.enum.ApplicationTag.REAL,
          writeValueTemplate: 60,
          writePriorityTemplate: 1
        }
      ],
      destinationPath: 'destination'
    };
    const node = new bacnetWriteNode('id', [['nid1']], config);
    return node.run({}, {}).should.be.rejectedWith(errors.Validation({ message: 'Instance must be between 0 to 4194302 inclusively.' }));
  });

  it('should throw an error if property id is empty', async () => {
    const config = {
      hostTemplate: '0.0.0.0',
      apduTimeout: 6000,
      hostPortTemplate: 47809,
      writeInstructions: [
        {
          typeTemplate: 2,
          instanceTemplate: 3,
          propertyIdTemplate: 85.1, // invalid int
          propertyIndexTemplate: 4294967295,
          writeValueTypeTemplate: bacnet.enum.ApplicationTag.REAL,
          writeValueTemplate: 60,
          writePriorityTemplate: 1
        }
      ],
      destinationPath: 'destination'
    };
    const node = new bacnetWriteNode('id', [['nid1']], config);
    return node.run({}, {}).should.be.rejectedWith(errors.Validation({ message: 'ID must be a valid integer.' }));
  });

  it('should throw an error if property id is out of range', async () => {
    const config = {
      hostTemplate: '0.0.0.0',
      apduTimeout: 6000,
      hostPortTemplate: 47809,
      writeInstructions: [
        {
          typeTemplate: 2,
          instanceTemplate: 3,
          propertyIdTemplate: 751,
          propertyIndexTemplate: 4294967295,
          writeValueTypeTemplate: bacnet.enum.ApplicationTag.REAL,
          writeValueTemplate: 60,
          writePriorityTemplate: 1
        }
      ],
      destinationPath: 'destination'
    };
    const node = new bacnetWriteNode('id', [['nid1']], config);
    return node.run({}, {}).should.be.rejectedWith(errors.Validation({ message: 'ID must be between 0 to 491 inclusively.' }));
  });

  it('should throw an error if property index is less than 1', async () => {
    const config = {
      hostTemplate: '0.0.0.0',
      apduTimeout: 6000,
      hostPortTemplate: 47809,
      writeInstructions: [
        {
          typeTemplate: 2,
          instanceTemplate: 3,
          propertyIdTemplate: 85,
          propertyIndexTemplate: -10,
          writeValueTypeTemplate: bacnet.enum.ApplicationTag.REAL,
          writeValueTemplate: 60,
          writePriorityTemplate: 1
        }
      ],
      destinationPath: 'destination'
    };
    const node = new bacnetWriteNode('id', [['nid1']], config);
    return node.run({}, {}).should.be.rejectedWith(errors.Validation({ message: 'Index value must be greater than 0.' }));
  });

  it('should throw an error if value type is empty', async () => {
    const config = {
      hostTemplate: '0.0.0.0',
      apduTimeout: 6000,
      hostPortTemplate: 47809,
      writeInstructions: [
        {
          typeTemplate: 2,
          instanceTemplate: 3,
          propertyIdTemplate: 85,
          propertyIndexTemplate: 4294967295,
          writeValueTypeTemplate: '', // empty application tag field
          writeValueTemplate: 60,
          writePriorityTemplate: 1
        }
      ],
      destinationPath: 'destination'
    };
    const node = new bacnetWriteNode('id', [['nid1']], config);
    return node.run({}, {}).should.be.rejectedWith(errors.Validation({ message: 'Value type is required.' }));
  });

  it('should throw an error if value type is invalid', async () => {
    const config = {
      hostTemplate: '0.0.0.0',
      apduTimeout: 6000,
      hostPortTemplate: 47809,
      writeInstructions: [
        {
          typeTemplate: 2,
          instanceTemplate: 3,
          propertyIdTemplate: 85,
          propertyIndexTemplate: 4294967295,
          writeValueTypeTemplate: 150, // invalid application tag number
          writeValueTemplate: 60,
          writePriorityTemplate: 1
        }
      ],
      destinationPath: 'destination'
    };
    const node = new bacnetWriteNode('id', [['nid1']], config);
    return node.run({}, {}).should.be.rejectedWith(errors.Validation({ message: 'Value type is invalid.' }));
  });

  it('should throw an error if new value is empty', async () => {
    const config = {
      hostTemplate: '0.0.0.0',
      apduTimeout: 6000,
      hostPortTemplate: 47809,
      writeInstructions: [
        {
          typeTemplate: 2,
          instanceTemplate: 3,
          propertyIdTemplate: 85,
          propertyIndexTemplate: 4294967295,
          writeValueTypeTemplate: bacnet.enum.ApplicationTag.REAL,
          // writeValueTemplate: 60,
          writePriorityTemplate: 1
        }
      ],
      destinationPath: 'destination'
    };
    const node = new bacnetWriteNode('id', [['nid1']], config);
    return node.run({}, {}).should.be.rejectedWith(errors.Validation({ message: 'New value is required.' }));
  });

  it('should throw an error if priority is empty', async () => {
    const config = {
      hostTemplate: '0.0.0.0',
      apduTimeout: 6000,
      hostPortTemplate: 47809,
      writeInstructions: [
        {
          typeTemplate: 2,
          instanceTemplate: 3,
          propertyIdTemplate: 85,
          propertyIndexTemplate: 4294967295,
          writeValueTypeTemplate: bacnet.enum.ApplicationTag.REAL,
          writeValueTemplate: 60,
          writePriorityTemplate: 1.6 // invalid int
        }
      ],
      destinationPath: 'destination'
    };
    const node = new bacnetWriteNode('id', [['nid1']], config);
    return node.run({}, {}).should.be.rejectedWith(errors.Validation({ message: 'Write priority must be a valid integer.' }));
  });

  it('should throw an error if priority is out of range', async () => {
    const config = {
      hostTemplate: '0.0.0.0',
      apduTimeout: 6000,
      hostPortTemplate: 47809,
      writeInstructions: [
        {
          typeTemplate: 2,
          instanceTemplate: 3,
          propertyIdTemplate: 85,
          propertyIndexTemplate: 4294967295,
          writeValueTypeTemplate: bacnet.enum.ApplicationTag.REAL,
          writeValueTemplate: 60,
          writePriorityTemplate: 55
        }
      ],
      destinationPath: 'destination'
    };
    const node = new bacnetWriteNode('id', [['nid1']], config);
    return node.run({}, {}).should.be.rejectedWith(errors.Validation({ message: 'The write priority must be between 1 to 16 inclusively.' }));
  });

  it('should throw an error if the timeout template is greater than the externalTimeout', async () => {
    const config = {
      hostTemplate: '0.0.0.0',
      apduTimeout: 90000,
      hostPortTemplate: 47809,
      writeInstructions: [
        {
          typeTemplate: 3,
          instanceTemplate: 3,
          propertyIdTemplate: 85,
          propertyIndexTemplate: 4294967295,
          writeValueTypeTemplate: bacnet.enum.ApplicationTag.REAL,
          writeValueTemplate: 60,
          writePriorityTemplate: 1
        }
      ],
      destinationPath: 'destination'
    };
    const node = new bacnetWriteNode('id', [['nid1']], config);
    return node.run({ externalTimeout: 30000 }, {}).should.be.rejectedWith(errors.Validation({ message: 'apduTimeout cannot be greater than 30 seconds.' }));
  });

  it('should write values', async () => {
    let waitForServer = defer();
    const writeData = Buffer.from(BUFFER_VALUE, 'hex');
    bacnetClient.on('unhandledEvent', () => {
      bacnetClient._transport._server.send(writeData, 47800, '127.0.0.1');
    });
    bacnetClient.on('error', (err) => {
      waitForServer.reject(err);
      waitForServer = null;
    });
    bacnetClient.on('listening', () => {
      waitForServer.resolve();
      waitForServer = null;
    });
    await waitForServer.promise;

    const config = {
      hostTemplate: '127.0.0.1',
      incomingPortTemplate: 47800,
      apduTimeout: 6000,
      writeInstructions: [
        {
          typeTemplate: 2,
          instanceTemplate: 18,
          propertyIdTemplate: 85,
          propertyIndexTemplate: 4294967295,
          writeValueTypeTemplate: bacnet.enum.ApplicationTag.REAL,
          writeValueTemplate: 512,
          writePriorityTemplate: 1
        }
      ],
      destinationPath: 'result'
    };
    const client = new bacnetWriteNode('id', outputIds, config );
    const output = await client.run({}, {});
    output[1].should.deepEqual({ result: { write: 'success' } });
  });
  it.skip('real world test for office thermostat', async () => {
    // requires a real BACnet device on the local network

    const config = {
      // hostTemplate: '<IP address of your BACnet device>',
      // hostTemplate: '192.168.200.147',
      apduTimeout: 6000,
      destinationPath: 'destination',
      writeInstructions: [
        {
          typeTemplate: 2,
          instanceTemplate: 0,
          propertyIdTemplate: 85,
          propertyIndexTemplate: 4294967295,
          writeValueTypeTemplate: bacnet.enum.ApplicationTag.REAL,
          writeValueTemplate: 69,
          writePriorityTemplate: 1
        }
      ]
    };
    const client = new bacnetWriteNode('id', outputIds, config );
    const output = await client.run({}, {});
    // console.log('WRITE OUTPUT', output);
    output[1].destination.should.deepEqual({
      write: 'success'
    });
    return output;
  });
});
