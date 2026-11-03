import { toInteger, reduce, defer, trim } from 'omnibelt';
import t from 'tcomb';
import { resetTo } from './utils.js';
import logger from './logger/index.js';
import FiredTrigger from './types/fired-trigger.js';
import UdpConfigs from './types/udp-configs.js';
import dgram from 'dgram';
import { addressToUdpSocketType } from 'losant-nodejs-utils/src/utils/ip-helpers.js';
import snmp from 'net-snmp';

const stateDefault = () => ({
  onUdpFire: null,
  serversByPort: new Map(),
  snmpConfigsByPort: new Map()
});

const UdpManager = (udpConf) => {
  let bindAddress = trim(udpConf.address);
  if (!bindAddress || bindAddress === '0.0.0.0') { bindAddress = undefined; }
  const socketType = addressToUdpSocketType(bindAddress);
  const state = stateDefault();

  const buildUdpServer = (port) => {
    const server = dgram.createSocket(socketType);

    server.on('error', (err) => {
      logger.errorNoRollbar(`Unable to open UDP server on port ${port} - ${err.name}: ${err.message}`);
    });

    server.on('message', (msg, rinfo) => {
      const payload = {
        time: new Date(),
        data: {
          message: msg.toString('binary'),
          sourceAddress: rinfo.address,
          sourcePort: rinfo.port
        }
      };

      state.onUdpFire(FiredTrigger({
        triggerId: `${port}`,
        triggerType: 'udp',
        payload
      }));

      if (state.serversByPort.get(port).hasSnmpTrap) {
        // cannot simply spread or assign because will mess up the previous udp trigger thanks
        const snmpPayload = {};
        snmpPayload.time = payload.time;
        snmpPayload.data = { ...payload.data };
        const fakeReceiver = snmp.createReceiver({ port: -1, disableAuthorization: true }, () => {});
        fakeReceiver.close();
        const portTriggers = state.snmpConfigsByPort.get(port);
        Object.entries(portTriggers).forEach(([key, config]) => {
          const authorizer = {
            users: [],
            communities: []
          };
          if (config.snmpTrapConfig.community) {
            authorizer.communities.push(config.snmpTrapConfig.community);
          } else {
            const user = config.snmpTrapConfig.user;
            const snmpifiedUser = {
              name: user.name
            };
            if (user.securityLevel === 'none') {
              snmpifiedUser.level = snmp.SecurityLevel.noAuthNoPriv;
            } else if (user.securityLevel === 'auth') {
              snmpifiedUser.level = snmp.SecurityLevel.authNoPriv;
            } else if (user.securityLevel === 'authAndEncrypt') {
              snmpifiedUser.level = snmp.SecurityLevel.authPriv;
            }
            if (user.securityLevel !== 'none') {
              snmpifiedUser.authProtocol = user.authMethod === 'sha' ? snmp.AuthProtocols.sha : snmp.AuthProtocols.md5;
              snmpifiedUser.authKey = user.authKey;
              if (user.securityLevel === 'authAndEncrypt') {
                snmpifiedUser.privProtocol = user.encryptionMethod === 'des' ? snmp.PrivProtocols.des : snmp.PrivProtocols.aes;
              }
              snmpifiedUser.privKey = user.encryptionKey;
            }
            authorizer.users.push({ ...snmpifiedUser });
          }
          // copy the message to a new buffer juuuuuuuust in case we're hitting this multiple times
          const msgCopy = Buffer.alloc(msg.length);
          msgCopy.set(msg);
          let message;
          try {
            message = fakeReceiver.listener.constructor.processIncoming(msgCopy, authorizer, () => {});
          } catch {
            logger.warn('Unable to parse received message as SNMP.');
          }
          if (message) {
            message.pdu.varbinds.forEach((varbind) => {
              if (varbind.type === 4) {
                varbind.value = varbind.value.toString();
              }
            });
            // ban this library
            let version;
            if (message.version === 0) {
              version = '1';
            } else if (message.version === 1) {
              version = '2c';
            } else if (message.version === 3) {
              version = '3';
            }
            snmpPayload.data.message = {
              version,
              pdu: {
                type: snmp.PduType[message.pdu.type],
                varbinds: message.pdu.varbinds
              }
            };
            if (message.community) {
              snmpPayload.data.message.community = message.community;
            } else {
              snmpPayload.data.message.username = message.user.name;
            }
            if (version !== '1') {
              snmpPayload.data.message.pdu.id = message.pdu.id;
            }
            // send response for inform
            if (message.pdu.type === 166) {
              message.pdu.type = snmp.PduType.GetResponse;
              message.buffer = null;
              message.setReportable(false);
              const buf = message.toBuffer();
              server.send(buf, 0, buf.length, rinfo.port, rinfo.address,
                function(error) {
                  if (error) {
                    logger.errorNoRollbar(`Unable to send SNMP inform acknowledgement: ${error.name}: ${error.message}`);
                  }
                });
            }
            state.onUdpFire(FiredTrigger({
              triggerId: key,
              triggerType: 'snmpTrap',
              payload: snmpPayload
            }));
          }
        });
      }

    });

    server.bind({ port, address: bindAddress }, () => {
      const address = server.address();
      logger.info(`Now listening for UDP messages on ${address.address}:${address.port}`);
    });

    return server;
  };

  const addSnmpConfig = (port, config) => {
    let configs;
    if (state.snmpConfigsByPort.has(port)) {
      configs = state.snmpConfigsByPort.get(port);
    } else {
      configs = {};
    }
    configs[config.key] = config;
    state.snmpConfigsByPort.set(port, configs);
  };

  const toServersByPort = (udpConfigs, oldByPort) => {
    return reduce((newByPort, config) => {
      const udpPort = toInteger(config.udpPort);
      if (udpPort > 0 && udpPort <= 65535) {
        let server = newByPort.get(udpPort);
        if (!server) {
          server = (oldByPort && oldByPort.get(udpPort)) || buildUdpServer(udpPort);
        }
        server.hasSnmpTrap = server.hasSnmpTrap || !!config.snmpTrapConfig;
        if (config.snmpTrapConfig) {
          addSnmpConfig(udpPort, config);
        }
        newByPort.set(udpPort, server);
      } else {
        logger.warn(`Ignoring request to listen for UDP messages on invalid port ${udpPort}`);
      }
      return newByPort;
    }, new Map(), udpConfigs);
  };

  const closeServer = async (server) => {
    if (server.fd === null) { // already closed or errored
      server.removeAllListeners('message');
      server.removeAllListeners('error');
      return;
    }

    const deferred = defer();
    const address = server.address();
    server.close(() => {
      server.removeAllListeners('message');
      server.removeAllListeners('error');
      logger.info(`No longer listening for UDP messages on ${address.address}:${address.port}`);
      deferred.resolve();
    });
    return deferred.promise;
  };

  const initialize = async (udpConfigs, onUdpFire) => {
    if (state.onUdpFire) { throw new Error('Initialize has already been called'); }
    udpConfigs = UdpConfigs(udpConfigs);
    t.Function(onUdpFire);

    state.onUdpFire = onUdpFire;
    state.serversByPort = toServersByPort(udpConfigs);
  };

  const update = async (udpConfigs) => {
    if (!state.onUdpFire) { throw new Error('UDP manager must be initialized first'); }
    udpConfigs = UdpConfigs(udpConfigs);

    const oldByPort = state.serversByPort;
    state.serversByPort = toServersByPort(udpConfigs, oldByPort);

    // close now unused servers
    const closing = [];
    oldByPort.forEach((server, port) => {
      if (state.serversByPort.has(port)) { return; }
      closing.push(closeServer(server));
    });
    return Promise.all(closing);
  };

  const shutdown = () => {
    const closing = [];
    state.serversByPort.forEach((server) => {
      closing.push(closeServer(server));
    });
    resetTo(stateDefault, state);
    return Promise.all(closing);
  };

  return {
    // :: (UdpConfigs, (FiredTrigger -> *)) -> Promise<Nil>
    initialize,

    // :: UdpConfigs -> Promise<Nil>
    update,

    // SE: State is reset to default, manager will need to be reinitialized
    // :: -> Nil
    shutdown
  };

};

// :: (udpConf) -> UdpManager
export default UdpManager;
