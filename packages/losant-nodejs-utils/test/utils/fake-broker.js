import { Aedes } from 'aedes'; // eslint-disable-line import/no-unresolved
import net from 'net';
import { defer, sleep } from 'omnibelt';
import LJSON from '../../src/ljson.js';

const FakeBroker = async (port) => {
  const aedesInstance = await Aedes.createBroker({ heartbeatInterval: 24*60*60*1000 });
  let server;
  let publishedPackets = {
    initial: [],
    dynamic: []
  };
  let subscribedTo = {
    initial: [],
    dynamic: []
  };
  let waiting;

  aedesInstance.authorizeSubscribe = function(client, sub, callback) {
    if (sub.topic === 'notAllowed') {
      return callback(null, null);
    }
    callback(null, sub);
  };

  aedesInstance.on('publish', (packet, client) => {
    if (packet.topic.endsWith('/new/clients') || packet.topic.endsWith('/disconnect/clients')) { return; }
    if (client) {
      publishedPackets.initial.push(packet);
    } else {
      publishedPackets.dynamic.push(packet);
    }
    if (waiting) { waiting(); }
  });

  aedesInstance.on('subscribe', (subscriptions, client) => {
    if (client) {
      subscribedTo.initial.push(...subscriptions);
    } else {
      subscribedTo.dynamic.push(...subscriptions);
    }
    if (waiting) { waiting(); }
  });

  const waitTill = async (type, count, isStartup = false) => {
    if (waiting) { throw new Error('already waiting'); }
    let arry = type === 'subscribe' ? subscribedTo : publishedPackets;
    arry = isStartup ? arry.initial : [arry.initial, arry.dynamic];
    const length = () => { return isStartup ? arry.length : arry[0].length+arry[1].length; };

    if (length() >= count) { return; }
    const deferred = defer();
    waiting = () => {
      if (length() >= count) {
        deferred.resolve();
        waiting = null;
      }
    };
    return deferred.promise;
  };

  const initialize = async () => {
    server = net.createServer(aedesInstance.handle);
    const deferred = defer();
    server.listen(port, (e) => {
      return e ? deferred.reject(e) : deferred.resolve();
    });
    return deferred.promise;
  };

  const shutdown = async () => {
    const deferred = defer();
    aedesInstance.close(() => {
      server.close(() => {
        deferred.resolve();
      });
    });
    await deferred.promise;
    server = null;
  };

  const disconnectClient = async (clientId) => {
    const client = aedesInstance.clients[clientId];
    if (!client) { return; }
    const p = new Promise((resolve) => client.close(resolve));
    await p;
    // the client sometimes still hangs around even after close is called
    return sleep(5);
  };

  const reset = async () => {
    const clientIds = Object.keys(aedesInstance.clients);
    await Promise.all(clientIds.map((id) => {
      return disconnectClient(id);
    }));
    publishedPackets = {
      initial: [],
      dynamic: []
    };
    subscribedTo = {
      initial: [],
      dynamic: []
    };
    waiting = null;
  };

  const publish = async (topic, payload) => {
    const deferred = defer();
    aedesInstance.publish({ topic, payload }, deferred.resolve);
    return deferred.promise;
  };

  const subscribe = async (topic) => {
    const deferred = defer();
    aedesInstance.subscribe(topic, (packet, cb) => { return cb(); }, deferred.resolve);
    return deferred.promise;
  };

  const initFlows = async (topic, flowData = {}) => {
    await waitTill('subscribe', 3, true);
    await publish(topic('flows'), await LJSON.deflate(flowData));
    await waitTill('publish', 2, true);
  };

  return {
    initialize,
    shutdown,
    reset,
    publish,
    subscribe,
    waitTill,
    initFlows,
    disconnectClient,
    get clients() { return aedesInstance.clients; },
    get subscribedTo() { return subscribedTo; },
    get publishedPackets() { return publishedPackets; },
    get publishedPacketCount() { return publishedPackets.initial.length + publishedPackets.dynamic.length; },
    get subscribePacketCount() { return subscribedTo.initial.length + subscribedTo.dynamic.length; }
  };
};

export default FakeBroker;
