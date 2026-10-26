import opcua from 'node-opcua';
import { cleanOpcuaClients } from '../../src/lib/opcua-client-utils.js';

let timeValueSource = 1;

const constructAddressSpace = (server) => {
  const addressSpace = server.engine.addressSpace;
  const namespace = addressSpace.getOwnNamespace();

  const device = namespace.addObject({
    organizedBy: addressSpace.rootFolder.objects,
    browseName: 'MyDevice'
  });

  namespace.addVariable({
    componentOf: device,
    browseName: 'MyVar1',
    dataType: 'Double',
    value: { dataType: opcua.DataType.Double, value: 1.2 },
    minimumSamplingInterval: 10
  });

  let variable2 = 10.0;

  namespace.addVariable({
    componentOf: device,
    nodeId: 'ns=1;b=1020FFAA',
    browseName: 'MyVar2',
    dataType: 'Double',
    minimumSamplingInterval: 10,
    value: {
      get: () => {
        return new opcua.Variant({ dataType: opcua.DataType.Double, value: variable2 });
      },
      set: (variant) => {
        variable2 = parseFloat(variant.value);
        return opcua.StatusCodes.Good;
      }
    }
  });

  let variable3 = 'winter of our discontent';

  namespace.addVariable({
    componentOf: device,
    nodeId: 'ns=1;s=MyVar3',
    browseName: 'MyVar3',
    dataType: 'String',
    minimumSamplingInterval: 10,
    value: {
      get: () => {
        return new opcua.Variant({ dataType: opcua.DataType.String, value: variable3 });
      },
      set: (variant) => {
        variable3 = variant.value.toString();
        return opcua.StatusCodes.Good;
      }
    }
  });

  let varArray = [0.0, 1.1, 2.2, 3.3];

  namespace.addVariable({
    componentOf: device,
    nodeId: 'ns=1;s=MyVar4',
    browseName: 'MyVar4',
    dataType: 'Double',
    minimumSamplingInterval: 10,
    value: {
      get: () => {
        return new opcua.Variant({
          dataType: opcua.DataType.Double,
          arrayType: opcua.VariantArrayType.Array,
          value: varArray
        });
      },
      set: (variant) => {
        varArray = variant.value;
        return opcua.StatusCodes.Good;
      }
    }
  });

  let variable5 = 'my key is a number, thats silly';
  namespace.addVariable({
    componentOf: device,
    nodeId: 'ns=1;s=1234',
    browseName: '1234',
    dataType: 'String',
    minimumSamplingInterval: 10,
    value: {
      get: () => {
        return new opcua.Variant({ dataType: opcua.DataType.String, value: variable5 });
      },
      set: (variant) => {
        variable5 = variant.value.toString();
        return opcua.StatusCodes.Good;
      }
    }
  });

  // simulate alarm event
  const tank = namespace.addObject({
    browseName: 'Tank',
    description: 'The Object representing the Tank',
    organizedBy: addressSpace.rootFolder.objects,
    notifierOf:  addressSpace.rootFolder.objects.server
  });

  const tankLevel = namespace.addVariable({
    browseName: 'TankLevel',
    description: 'Fill level in percentage (0% to 100%) of the water tank',
    propertyOf: tank,
    dataType: 'Double',
    eventSourceOf: tank,
    minimumSamplingInterval: 10
  });

  const exclusiveLimitAlarmType = addressSpace.findEventType('ExclusiveLimitAlarmType');

  const tankLevelCondition = namespace.instantiateExclusiveLimitAlarm(exclusiveLimitAlarmType, {
    componentOf: tank,
    conditionSource: tankLevel,
    browseName: 'TankLevelCondition',
    conditionName: 'Test1',
    optionals: [
      'ConfirmedState', 'Confirm' // confirm state and confirm Method
    ],
    inputNode: tankLevel,   // the variable that will be monitored for change
    highHighLimit: 0.9,
    highLimit: 0.7,
    lowLimit: 0.2
  });

  const data = { tankLevel, tankLevelCondition };

  // create method for call node
  const method = namespace.addMethod(device, {
    browseName: 'Bark',

    inputArguments:  [
      {
        name: 'nbBarks',
        description: { text: 'specifies the number of time I should bark' },
        dataType: opcua.DataType.UInt32
      }, {
        name: 'volume',
        description: { text: 'specifies the sound volume [0 = quiet ,100 = loud]' },
        dataType: opcua.DataType.UInt32
      }
    ],

    outputArguments: [{
      name: 'Barks',
      description: { text: 'the generated barks' },
      dataType: opcua.DataType.String,
      valueRank: 1
    }]
  });

  method.bindMethod(function(inputArguments, context, callback) {

    const nbBarks = inputArguments[0].value;
    const volume =  inputArguments[1].value;

    const soundVolume = Array(volume).join('!');
    const barks = [];

    for (let i=0; i<nbBarks; i++) { barks.push(`Woof${soundVolume}`); }

    const callMethodResult = {
      statusCode: opcua.StatusCodes.Good,
      outputArguments: [{
        dataType: opcua.DataType.String,
        arrayType: opcua.VariantArrayType.Array,
        value: barks
      }]
    };
    callback(null, callMethodResult);
  });

  return () => {
    const value = (1.0 + Math.sin(timeValueSource/360*3))/2.0;
    data.tankLevel.setValueFromSource({ dataType: 'Double', value: value });
    timeValueSource += 8;
  };
};

const serverInfo = {
  startInterval: (interval = 50) => {
    clearInterval(serverInfo.intervalId);
    timeValueSource = 1;
    serverInfo.intervalId = setInterval(serverInfo.changeData, interval);
  },
  stopInterval: () => {
    clearInterval(serverInfo.intervalId);
  },
  certsTrusted: [],
  usersAuthed: [],
  server: null,
  changeData: null
};

const before = async () => {
  const certManager = new opcua.OPCUACertificateManager({});
  certManager.checkCertificate = (cert, cb) => {
    serverInfo.certsTrusted.push(cert);
    if (cb) {
      return cb(opcua.StatusCodes.Good);
    }
    return opcua.StatusCodes.Good;
  };
  const oServer = new opcua.OPCUAServer({
    port: 4335,
    resourcePath: '/UA/Server',
    serverCertificateManager: certManager,
    userManager: {
      isValidUser: (username, password) => {
        serverInfo.usersAuthed.push({ username, password });
        return username === 'Bob' && password === 'passIt';
      }
    }
  });

  return new Promise((r, f) => {
    oServer.initialize(() => {
      serverInfo.changeData = constructAddressSpace(oServer);
      oServer.start((err) => {
        serverInfo.server = oServer;
        return err ? f(err) : r();
      });
    });
  });
};

const after = async () => {
  if (serverInfo.server) {
    await new Promise((r) => serverInfo.server.shutdown(r));
  }
};

const beforeEach = () => {
  serverInfo.certsTrusted = [];
  serverInfo.usersAuthed = [];
};

const afterEach = async () => {
  serverInfo.stopInterval();
  await cleanOpcuaClients();
};

export const getServerInfo = () => {
  return serverInfo;
};

export default {
  getServerInfo,
  before,
  after,
  beforeEach,
  afterEach
};
