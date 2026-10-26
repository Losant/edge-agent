import t from 'tcomb';
import { resetTo } from './utils.js';
import logger from './logger/index.js';
import FiredTrigger from './types/fired-trigger.js';
import OpcuaConfigs from './types/opcua-configs.js';
import { forEachSerialP } from 'omnibelt';
import {
  validateRenderSubscribeInstructions,
  runOpcuaSubscribeInstructions,
  dataToType,
  removeMonitoredItem,
  cleanOpcuaClients
} from './lib/opcua-client-utils.js';
import opcua from 'node-opcua';

const stateDefault = () => ({
  onOpcuaFire: null,
  opcuaById: new Map()
});

const namespaceAndId = (item) => {
  const namespaceId = item.itemToMonitor.nodeId.toString(); // ns=0;i=2253
  const dividedIndex = namespaceId.indexOf(';');
  return {
    namespace: namespaceId.substring(3, dividedIndex),
    identifier: namespaceId.substring(dividedIndex + 1)
  };
};

const OpcUaManager = (tomlConfigs = {}) => {
  const state = stateDefault();

  const parseEvents = ({ filters, events, item, groupName }) => {
    if (Array.isArray(events)) {
      const eventVals = events.map((event) => dataToType(event.dataType, event.value));
      const payload = filters.reduce((acc, key, i) => ({ ...acc, [key]: eventVals[i] }), {});
      return {
        ...payload,
        ...namespaceAndId(item)
      };
    } else {
      if (groupName) {
        const payloadData = {
          ...namespaceAndId(item),
          dataType: opcua.DataType[events.value.dataType],
          value: dataToType(events.value.dataType, events.value.value)
        };
        if (events.sourceTimestamp) {
          payloadData.sourceTimestamp = new Date(events.sourceTimestamp);
        }
        return payloadData;
      }
      return dataToType(events.value.dataType, events.value.value);
    }
  };

  const addSubMonitor = async (opcuaConfigs) => {
    const newById = new Map();
    await forEachSerialP(async (config) => {
      const runId = config.opcuaId;
      const groupName = config.configName || '';
      let monitoredItems;
      let subs = [];

      if (groupName) {
        config = tomlConfigs[groupName];
        if (!config) {
          logger.errorNoRollbar(`OPC UA trigger config, ${groupName}, was not found.`);
          return;
        }

        if (!config.monitoredItems?.length) { return; }

        config.monitoredItems.forEach((item, index) => {
          const sub = {
            nameSpaceTemplate: item.nameSpace,
            identifierTemplate: item.identifier
          };
          if (!index) { // only first index needed
            sub.samplingInterval = config.samplingInterval;
            sub.eventFilter = config.eventFilter;
          }

          subs.push(sub);
        });
      } else {
        subs.push({
          nameSpaceTemplate: config.nameSpace,
          identifierTemplate: config.identifier,
          samplingInterval: config.samplingInterval,
          eventFilter: config.eventFilter
        });
      }
      try {
        subs = validateRenderSubscribeInstructions(subs, {}, 'array');
        subs[0].groupName = groupName;

        monitoredItems = await runOpcuaSubscribeInstructions(runId, {}, subs, {
          uriTemplate: config.uri,
          usernameTemplate: config.username,
          passwordTemplate: config.password,
          securityPolicyTemplate: config.securityPolicy,
          securityModeTemplate: config.securityMode,
          certTemplate: config.cert,
          privateKeyTemplate: config.privateKey
        });
      } catch (err) {
        logger.errorNoRollbar(`OPC UA trigger - ${err.name}: ${err.message}`);
        return;
      }
      monitoredItems.on('changed', (item, events) => {
        const payload = {
          time: new Date(),
          data: parseEvents({ filters: config.eventFilter, events, item, groupName })
        };

        state.onOpcuaFire(FiredTrigger({
          triggerId: runId,
          triggerType: 'opcua',
          payload
        }));
      });

      monitoredItems.on('error', (err) => {
        logger.errorNoRollbar(`OPC UA trigger - ${err.name}: ${err.message}`);
      });

      newById.set(runId, {
        clientKey: config.uri,
        sessionKey: runId,
        itemKey: `${groupName}${subs[0].nodeId}`,
        monitoredItems
      });
    }, opcuaConfigs);

    return newById;
  };

  const initialize = async (opcuaConfigs, onOpcuaFire) => {
    if (state.onOpcuaFire) { throw new Error('Initialize has already been called'); }
    opcuaConfigs = OpcuaConfigs(opcuaConfigs);
    t.Function(onOpcuaFire);

    state.onOpcuaFire = onOpcuaFire;
    state.opcuaById = await addSubMonitor(opcuaConfigs);
  };

  const update = async (opcuaConfigs) => {
    if (!state.onOpcuaFire) { throw new Error('OPC UA manager must be initialized first'); }
    opcuaConfigs = OpcuaConfigs(opcuaConfigs);
    await forEachSerialP(async ([, wrapper]) => {
      await removeMonitoredItem(wrapper);
    }, state.opcuaById);

    state.opcuaById = await addSubMonitor(opcuaConfigs);
    return state.opcuaById;
  };

  const shutdown = async () => {
    resetTo(stateDefault, state);
    // technically we should be doing this
    // as part of node shutdown, but those hooks
    // aren't connected right now?
    await cleanOpcuaClients();
  };

  return {
    // :: (OpcuaConfigs, (FiredTrigger -> *)) -> Promise<Nil>
    initialize,

    // :: OpcuaConfigs -> Promise<Map<String, { clientKey, sessionKey, itemKey, monitoredItems }>>
    update,

    // SE: State is reset to default, manager will need to be reinitialized
    // :: -> Nil
    shutdown
  };

};

// :: ({ [name]: OpcuaTriggerConfig }) -> OpcUaManager
export default OpcUaManager;
