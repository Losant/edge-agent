import bacnet from 'node-bacnet';
import { curry, capitalize, defer, isNilOrEmpty, forEachSerialP, timeoutP, toString } from 'omnibelt';
import * as payloadHelper from 'losant-handlebars';
import errors from 'losant-nodejs-utils/src/errors.js';
import verifyHosts from 'losant-nodejs-utils/src/utils/verify-hosts.js';
import { renderToNetworkPort } from 'losant-nodes/src/lib/common.js';
import bacnetEnum from 'node-bacnet/lib/enum.js';
const MIN_INSTANCE = 0;
const MAX_INSTANCE = bacnetEnum.ASN1_MAX_INSTANCE;
const VALID_APP_TAGS = Object.values(bacnetEnum.ApplicationTag);
const bacnetClientCache = new Map();
const idleTimes = {};
const idleTimeOut = 60000; // 1min
export const DEFAULT_PORT = 47808;

const removeBacnetClient = async (cacheKey) => {
  const baWrapperPromise = bacnetClientCache.get(cacheKey);

  if (!baWrapperPromise) { return; }
  bacnetClientCache.delete(cacheKey);
  clearTimeout(idleTimes[cacheKey]);
  delete idleTimes[cacheKey];
  const baWrapper = await baWrapperPromise;
  const waitForClose = defer();

  baWrapper.baClient._transport.on('close', waitForClose.resolve);
  baWrapper.baClient.close();
  try {
    await timeoutP(baWrapper.baClient._settings.apduTimeout, waitForClose.promise);
  } catch {}

  baWrapper.baClient._transport.removeAllListeners();
  baWrapper.baClient.removeAllListeners();
};

const resetIdleTimeout = (cacheKey) => {
  if (idleTimes[cacheKey]) {
    clearTimeout(idleTimes[cacheKey]);
  }
  idleTimes[cacheKey] = setTimeout(() => {
    removeBacnetClient(cacheKey);
  }, idleTimeOut);
};

export const getBacnetClient = async (incomingPort, apduTimeout) => {
  const cacheKey = `${incomingPort}`;
  resetIdleTimeout(cacheKey);

  if (bacnetClientCache.has(cacheKey)) {
    const previousClient = bacnetClientCache.get(cacheKey);
    return previousClient;
  }

  const client = new bacnet({ port: incomingPort, apduTimeout });
  const waitForClient = defer();

  client._transport.on('listening', () => {
    waitForClient.resolve();
  });

  const promise = timeoutP(apduTimeout, waitForClient.promise).then(() => {
    client.on('error', () => {
      removeBacnetClient(cacheKey);
    });
    return {
      baClient: client
    };
  }).catch((error) => {
    return {
      baClient: client,
      error: error
    };
  });

  bacnetClientCache.set(cacheKey, promise);
  return promise;
};

export const validateInstanceNumber = (field, instance) => {
  if (!Number.isInteger(instance)) {
    throw errors.Validation({ message: `${field} must be a valid integer.` });
  }
  if (instance < MIN_INSTANCE || instance >= MAX_INSTANCE) {
    throw errors.Validation({ message: `${field} must be between ${MIN_INSTANCE} to ${MAX_INSTANCE-1} inclusively.` });
  }
};

const validateRenderInstructions = curry((nodeType, instructions, payload, instructionsType) => {

  const isRead = nodeType === 'read';
  const isWrite = !isRead;
  if (instructionsType === 'payloadPath') {
    instructions = payloadHelper.lookup(instructions, payload) || [];
    if (!Array.isArray(instructions)) {
      throw errors.Validation({ message: `${capitalize(nodeType)} instructions must be an array.` });
    }
    instructions = instructions.map((instruct) => {
      if (!instruct || typeof instruct !== 'object') {
        throw errors.Validation({ message: `Each ${nodeType} instruction must be an object.` });
      }
      return instruct;
    });
  } else {
    if (!Array.isArray(instructions)) {
      throw errors.Validation({ message: `${capitalize(nodeType)} instructions must be an array.` });
    }
    instructions = instructions.map((instruct) => {
      if (!instruct || typeof instruct !== 'object') {
        throw errors.Validation({ message: `Each ${nodeType} instruction must be an object.` });
      }

      let priorityTemplate = instruct.writePriorityTemplate;
      const valueTypeTemplate = instruct.writeValueTypeTemplate;

      if (isNilOrEmpty(instruct.typeTemplate)) {
        throw errors.Validation({ message: 'Type is required.' });
      }
      if (isNilOrEmpty(instruct.instanceTemplate)) {
        throw errors.Validation({ message: 'Instance is required.' });
      }
      if (isNilOrEmpty(instruct.propertyIdTemplate)) {
        throw errors.Validation({ message: 'PropertyId is required.' });
      }
      if (isWrite && isNilOrEmpty(priorityTemplate)) {
        priorityTemplate = 16; // default write priority value
      }
      if (isWrite && isNilOrEmpty(valueTypeTemplate)) {
        throw errors.Validation({ message: 'Value type is required.' });
      }
      const type = Number(payloadHelper.render(instruct.typeTemplate, payload));
      const instance = Number(payloadHelper.render(instruct.instanceTemplate, payload));
      const propertyId = Number(payloadHelper.render(instruct.propertyIdTemplate, payload));

      if (isRead) {
        return { key: toString(instruct.key), type, instance, propertyId };
      }

      const propertyIndex = Number(payloadHelper.render(instruct.propertyIndexTemplate, payload));
      const writeValueType = Number(payloadHelper.render(valueTypeTemplate, payload));
      const writeValue = payloadHelper.renderToString(instruct.writeValueTemplate, payload);
      const writePriority = Number(payloadHelper.render(priorityTemplate, payload));

      return {
        type, instance, propertyId, propertyIndex, writeValueType, writeValue, writePriority
      };
    });
  }

  return instructions.map(({
    key,
    type,
    instance,
    propertyId,
    propertyIndex,
    writeValueType,
    writeValue,
    writePriority
  } = {}) => {

    if (!Number.isInteger(type)) {
      throw errors.Validation({ message: 'Type must be a valid integer.' });
    }
    if (type < 0 || type > 59) {
      throw errors.Validation({ message: 'Type must be between 0 to 59 inclusively.' });
    }
    validateInstanceNumber('Instance', instance);
    if (!Number.isInteger(propertyId)) {
      throw errors.Validation({ message: 'ID must be a valid integer.' });
    }
    if (propertyId < 0 || propertyId > 491) {
      throw errors.Validation({ message: 'ID must be between 0 to 491 inclusively.' });
    }
    if (isRead) {
      if (!key) {
        throw errors.Validation({ message: 'Key is required for read.' });
      }
      if (key === 'errors' || key.startsWith('errors.')) {
        throw errors.Validation({ message: 'Keys cannot contain the special path errors.' });
      }
      return { // Read
        objectId: { type, instance },
        properties: [{ id: propertyId }],
        key: key
      };
    }

    if (propertyIndex < 1) {
      throw errors.Validation({ message: 'Index value must be greater than 0.' });
    }
    if (!VALID_APP_TAGS.includes(writeValueType)) {
      throw errors.Validation({ message: 'Value type is invalid.' });
    }
    if (!writeValue) {
      throw errors.Validation({ message: 'New value is required.' });
    }
    if (!Number.isInteger(writePriority)) {
      throw errors.Validation({ message: 'Write priority must be a valid integer.' });
    }
    if (writePriority < 1 || writePriority > 16) {
      throw errors.Validation({ message: 'The write priority must be between 1 to 16 inclusively.' });
    }

    return { // Write
      objectId: { type, instance },
      values: [
        {
          property: { id: propertyId, index: propertyIndex },
          value: [{ type: writeValueType, value: writeValue }],
          priority: writePriority
        }
      ]
    };
  });
});

// validating bacnet config
const validateBacnetConfig = async (payload, hostTemplate, incomingPortTemplate, hostPortTemplate) => {
  const host = payloadHelper.render(hostTemplate, payload);

  if (!host) {
    throw errors.Validation({ message: 'Host is required.' });
  }

  await verifyHosts(host);

  const incomingPort = renderToNetworkPort({ template: incomingPortTemplate, payload, fieldName: 'Incoming port', defaultValue: DEFAULT_PORT });
  const hostPort = renderToNetworkPort({ template: hostPortTemplate, payload, fieldName: 'Host port', defaultValue: DEFAULT_PORT });

  return { host, incomingPort, hostPort };
};

const runBacnetInstructions = curry(async (nodeType, payload, instructions, nodeInst, timeout) => {
  const isRead = nodeType === 'READ';
  const isWrite = !isRead;
  const { host, incomingPort, hostPort } = await validateBacnetConfig(payload, nodeInst.hostTemplate, nodeInst.incomingPortTemplate, nodeInst.hostPortTemplate);
  const bacnetHost = `${host}:${hostPort}`;
  let valueObj = {};
  let result = {};
  const getClient = await getBacnetClient(incomingPort, timeout);
  const client = getClient.baClient;
  let waitForResult = defer();
  if (getClient.error) {
    result.error = { type: `BACNET_${nodeType}_ERROR`, message: getClient.error.message };
    return waitForResult.resolve(result);
  } else {
    const funcName = isRead ? 'readPropertyMultiple' : 'writePropertyMultiple';
    client[funcName](bacnetHost, instructions, (err, value) => {
      if (err) {
        result.error = { type: `BACNET_${nodeType}_ERROR`, message: err.message };
        if (isWrite) { result.write = 'fail'; }
      } else {
        if (isRead) {
          result = value;
        } else {
          result.write = 'success';
        }
      }
      return waitForResult.resolve(result);
    });
  }

  const resultObj = await waitForResult.promise;
  if (resultObj.values) {
    instructions.forEach((item, index) => {
      valueObj[item.key] = resultObj.values[index].values;
    });
  } else {
    valueObj = resultObj;
  }

  waitForResult = null;
  if (nodeInst.destinationPath) {
    payload = payloadHelper.set(nodeInst.destinationPath, valueObj, payload);
  }

  return payload;
});

export const validateRenderReadInstructions = validateRenderInstructions('read');
export const validateRenderWriteInstructions = validateRenderInstructions('write');
export const runBacnetReadInstructions = runBacnetInstructions('READ');
export const runBacnetWriteInstructions = runBacnetInstructions('WRITE');
export const cleanBacnetClients = async () => {
  return forEachSerialP(([cacheKey]) => {
    return removeBacnetClient(cacheKey);
  }, bacnetClientCache);
};
