import { socat } from '../common.js';
import ModbusWriteNode from '../../src/nodes/modbus-write-node.js';
import ModbusReadNode from '../../src/nodes/modbus-read-node.js';
import { reset as resetConnections } from '../../src/lib/connections/modbus.js';
import ModbusRTU from 'modbus-serial';

const closeServer = async (serverWrapper) => {
  if (!serverWrapper.server) { return; }
  await new Promise((resolve) => serverWrapper.server.close(resolve));
  serverWrapper.server.removeAllListeners();
  serverWrapper.server = null;
};

export default ({
  vector,
  sharedTestGenerator,
  serialOnlyTestGenerator,
  tcpOnlyTestGenerator
}) => {

  beforeEach(() => {
    resetConnections();
  });

  afterEach(async () => {
    await ModbusReadNode.shutdown();
    await ModbusWriteNode.shutdown();
  });

  describe('Modbus TCP', () => {
    const serverWrapper = {
      server: null,
      close: () => closeServer(serverWrapper),
      basicNodeConfig: {
        connectionTypeTemplate: '{{data.connectionType}}',
        hostTemplate: '{{data.host}}',
        portTemplate: '{{data.port}}',
        unitIdTemplate: '{{data.unitID}}'
      },
      basicNodeData: {
        connectionType: 'tcp',
        host: 'localhost',
        port: 8898,
        unitID: 1
      }
    };

    beforeEach(async () => {
      serverWrapper.server = new ModbusRTU.ServerTCP(vector, {
        host: '0.0.0.0',
        port: serverWrapper.basicNodeData.port,
        debug: true,
        unitID: serverWrapper.basicNodeData.unitID
      });
      serverWrapper.server.on('serverError', (err) => {
        console.warn('Modbus TCP Server Error', err);
      });
      serverWrapper.server.on('socketError', (err) => {
        console.warn('Modbus TCP Server Socket Error', err);
      });
      await new Promise((resolve) => {
        serverWrapper.server.on('initialized', resolve);
      });
    });

    afterEach(async () => {
      await closeServer(serverWrapper);
    });

    sharedTestGenerator(serverWrapper);
    if (tcpOnlyTestGenerator) {
      tcpOnlyTestGenerator(serverWrapper);
    }
  });

  describe('Modbus Serial', () => {
    const serverWrapper = {
      server: null,
      close: () => closeServer(serverWrapper),
      basicNodeConfig: {
        connectionTypeTemplate: '{{data.connectionType}}',
        pathTemplate: '{{data.path}}',
        unitIdTemplate: '{{data.unitID}}'
      },
      basicNodeData: {
        connectionType: 'serial',
        unitID: 1
      }
    };

    before(() => {
      serverWrapper.basicNodeData.path = socat.serialPathSideA;
    });

    beforeEach(async function() {
      serverWrapper.server = new ModbusRTU.ServerSerial(vector, {
        path: socat.serialPathSideB,
        debug: true,
        unitID: serverWrapper.basicNodeData.unitID
      }, { autoOpen: false });
      serverWrapper.server.on('error', (err) => {
        console.warn('Modbus Serial Server Error', err);
      });
      await new Promise((resolve) => {
        serverWrapper.server._serverPath.on('open', resolve);
        serverWrapper.server._serverPath.open();
      });
    });

    afterEach(async () => {
      await closeServer(serverWrapper);
    });

    sharedTestGenerator(serverWrapper);
    if (serialOnlyTestGenerator) {
      serialOnlyTestGenerator(serverWrapper);
    }
  });

};
