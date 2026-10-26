import { Controller, Tag, TagGroup, Structure, EthernetIP } from 'st-ethernet-ip';
import * as payloadHelper from 'losant-handlebars';
import { forEachSerialP, noop, omit, isUndefined, toString, toNumber, path, isNilOrEmpty } from 'omnibelt';
import { clampPositiveEnv } from '../../utils.js';
import connectionManager from '../connections-manager.js';
import niceBooleanCast from 'losant-nodejs-utils/src/utils/nice-boolean-cast.js';
import errors from 'losant-nodejs-utils/src/errors.js';
import verifyHosts from 'losant-nodejs-utils/src/utils/verify-hosts.js';

const MAX_STR_LENGTH = 65535;

const DISCONNECT_TIMEOUT = clampPositiveEnv('ALLENBRADLEY_DISCONNECT_TIMEOUT', 5000);
const IDLE_ALLENBRADLEY_CLEANUP_INTERVAL = clampPositiveEnv('IDLE_ALLENBRADLEY_CLEANUP_INTERVAL', 900000);
const {
  BOOL, SINT, DINT, LINT, USINT, UINT, UDINT, REAL, LREAL, STRING, BIT_STRING, STRUCT
} = EthernetIP.CIP.DataTypes.Types;

const getCacheKey = ({ host, slot }) => {
  return `${host}-${slot}`;
};

const getTagList = path([ 'state', 'tagList' ]);

const terminateClient = async (cachedConfig, clientP) => {
  clearInterval(cachedConfig.keepAliveInterval);
  const { PLC } = await(clientP || cachedConfig.clientP);
  PLC?.removeAllListeners();
  PLC?.on('error', noop); // if there's an error I couldnt carror less
  if (!PLC || PLC.destroyed) { return; }
  try {
    PLC.timeout_sp = DISCONNECT_TIMEOUT;
    await PLC.disconnect();
  } catch {} finally {
    try { PLC.destroy(); } catch {}
  }
};

const updateKeepAliveInterval = (cachedConfig, resetClient, clientCache, keepRate) => {
  if (cachedConfig.keepAliveInterval) {
    clearInterval(cachedConfig.keepAliveInterval);
  }
  const cacheKey = cachedConfig.cacheKey;
  if (isUndefined(keepRate)) {
    keepRate = cachedConfig.config.keepRate;
  }
  if (keepRate === 0) { return; }
  cachedConfig.keepAliveInterval = setInterval(async () => {
    const currentCached = clientCache.get(cacheKey);
    if (!currentCached) { return; } // should never happen
    if (currentCached.isRunning) { return; } // already sending commands
    const client = await currentCached.clientP;
    if (client.error) {
      // if it's already in an error state either it will get cleaned up at idle time
      // or it will get reset by instructions.
      return;
    }
    try {
      await client.PLC.getControllerTagList(getTagList(client.PLC));
    } catch {
      resetClient(cacheKey);
    }
  }, keepRate * 1000);
};

const getClientPromise = async (cachedConfig, resetClient, clientCache) => {
  const { cacheKey, config } = cachedConfig;
  const { host, slot, timeout } = config;
  let result;
  const PLC = new Controller();
  PLC.timeout_sp = timeout;
  const handler = (error, shouldKick = true) => {
    if (!result) {
      result = { PLC, error };
      return;
    }
    if (!shouldKick || result.error) { return; }
    const currentConfig = clientCache.get(cacheKey);
    if (currentConfig && !currentConfig.isRunning) {
      resetClient(cacheKey);
    }
  };
  PLC.on('error', (error) => {
    handler(error);
  });
  PLC.on('close', (hasError) => {
    handler(errors.Validation({ message: 'Allen Bradley client unexpectedly closed.' }), !hasError);
  });

  try {
    await verifyHosts(host);
    await PLC.connect(host, slot);
    if (!result) {
      result = { PLC };
      updateKeepAliveInterval(cachedConfig, resetClient, clientCache);
    }
  } catch (error) {
    if (!result) { result = { PLC, error }; }
  }

  return result;
};

const transformError = ({ nodeType }, message, errorsList = [], ins) => {
  const errorObj = {
    type: `Allen-Bradley_${nodeType}_ERROR`,
    message
  };
  if (nodeType === 'READ' && ins?.key) {
    errorObj.key = ins.key;
  }
  if (ins?.tag) {
    errorObj.tag = ins.tag;
  }
  errorsList.push(errorObj);
  return errorsList;
};
// hails from https://github.com/SerafinTech/ST-node-ethernet-ip/blob/master/src/tag-list/index.ts#L251
// but intead of only looking for templates it will return the tag or structure.
const findTag = async (tagList, tagName, isRead, { program, length, value }) => {
  let tagInfo = tagList.getTag(tagName, program);
  if (!tagInfo) {
    const tagArray = tagName.split('.');
    const tag = tagList.tags.find((t) => {
      return t.name.toLowerCase().replace(/\[.*/, '') === tagArray[0].toLowerCase().replace(/\[.*/, '') &&
      String(t.program).toLowerCase() === String(program).toLowerCase();
    });
    if (!tag) { return; }
    tagInfo = tag;
    if (tagInfo.type.structure) {
      let tagArrayPointer = 1;
      while (tagInfo && tagArrayPointer < tagArray.length) {
        const memberName = String(tagArray[tagArrayPointer]).replace(/\[.*/, ''); //removes array indication
        tagArrayPointer++;
        // if it's not last, and if it is last if it's not a number find the next member
        // otherwise assume it's trying to do read a BIT like test_struct.dInt.0
        if (tagArrayPointer < tagArray.length || isNaN(memberName)) {
          tagInfo = (tagList.templates[tagInfo.type.code]?._members || []).find((member) => member.name === memberName);
        }
      }
    } else if (tagArray.length > 2 || (tagArray[1] && isNaN(tagArray[1].replace(/\[.*/, '')))) { // unset tag if the tagName doesnt look like name.num e.g. dInt.0
      tagInfo = null;
    }
    if (!tagInfo) { return; }
  }
  if (isRead && !tagInfo.type.arrayDims && length > 1) {
    throw errors.Validation({ message: `Attempting to read multiple values from tag ${tagName} that is not an array` });
  }
  let arrayDims = tagInfo.type.arrayDims;
  const arraySize = (Array.isArray(value) ? value.length : length) || 1;
  // element of an array not the actual array OR backwards compatiblity to only get first item of the array
  if ((arrayDims >= 1 && arraySize === 1 && tagName.endsWith(']')) || (isRead && !length)) {
    arrayDims = 0;
  }
  if (tagInfo.type.structure) {
    return new Structure(tagName, tagList, program, null, 0, arrayDims, arraySize);
  }
  return new Tag(tagName, program, tagInfo.type.code, 0, arrayDims, arraySize);
};

const validateValue = (value) => {
  if (isNilOrEmpty(value)) {
    throw errors.Validation({ message: 'Value is required.' });
  }
};

const transformValue = (value, tag) => {
  if (Array.isArray(value) || typeof(value) === 'object') {
    return value;
  }
  switch (tag.state.tag.type) {
    case BOOL:
      validateValue(value);
      return niceBooleanCast(value);
    case BIT_STRING:
    case DINT:
    case LINT:
    case SINT:
    case USINT:
    case UINT:
    case UDINT:
    case REAL:
    case LREAL:
      validateValue(value);
      if (!isNaN(value)) {
        value = toNumber(value);
      }
      return value;
    case STRUCT:
    case STRING:
    default:
      value = toString(value);
      if (value.length > MAX_STR_LENGTH) {
        throw errors.Validation({ message: `${tag.name} length cannot exceed ${MAX_STR_LENGTH} characters.` });
      }
      return value;
  }
};

const runInternal = async ({ instructions, nodeType, keepRate, timeout, requestedTime }, clientInfo, clientCache, resetClient) => {
  const client = await clientInfo.clientP;
  if (client.error) {
    resetClient(clientInfo.cacheKey);
    return { errors: transformError({ nodeType }, client.error?.message || 'Allen-Bradley connection failed.') };
  }
  if (keepRate !== clientInfo.config.keepRate) {
    updateKeepAliveInterval(clientInfo, resetClient, clientCache, keepRate);
  }
  const isRead = nodeType === 'READ';
  let result = payloadHelper.set('plcProperties', omit([ 'path' ], client.PLC.properties), {});
  const group = new TagGroup();
  const allErrors = [];
  await forEachSerialP(async (ins) => {
    const tagName = ins.tag;
    let tag;
    try {
      tag = await findTag(getTagList(client.PLC), tagName, isRead, ins);
      if (!tag) {
        return transformError({ nodeType }, 'Tag not found.', allErrors, ins);
      }
      if (!isRead) {
        tag.value = transformValue(ins.value, tag);
      }
    } catch (error) {
      return transformError({ nodeType }, error.message, allErrors, ins);
    }
    if (isRead) {
      tag.key = ins.key;
    }
    group.add(tag);
  }, instructions);

  if (group.length) {
    const timeoutLeft = timeout - (Date.now() - requestedTime);
    if (timeoutLeft <= 0) {
      transformError({ nodeType }, 'Timed out', allErrors);
    } else {
      client.PLC.timeout_sp = timeoutLeft;
      try {
        await client.PLC[isRead ? 'readTagGroup' : 'writeTagGroup'](group);
        if (!isRead) {
          result = payloadHelper.set('write', 'success', result);
        } else {
          group.forEach((tag) => {
            result = payloadHelper.set(tag.key, tag.value, result);
          });
        }
      } catch (err) {
        if (!err.message && err.generalStatusCode) {
          err.message = 'Could not complete Allen-Bradley request.';
        }
        transformError({ nodeType }, err.generalStatusCode ? err : err.message, allErrors);
      } finally {
        // reset timeout to total timeout time.
        client.PLC.timeout_sp = timeout;
      }
    }
  }
  if (allErrors.length) {
    if (!isRead) {
      result = payloadHelper.set('write', 'fail', result);
    }
    result = payloadHelper.set('errors', allErrors, result);
    // reset connection because the readTagGroup keeps the error
    resetClient(clientInfo.cacheKey);
  }
  return result;
};

const abConnectionManager = connectionManager({
  getCacheKey,
  terminateClient,
  getClientPromise,
  runInternal,
  transformError,
  cleanUpInterval: IDLE_ALLENBRADLEY_CLEANUP_INTERVAL
});

export const queueInstructions = (clientConfig, instructions, nodeType) => {
  const timeout = clientConfig.timeout;
  return abConnectionManager.queueInstruction(clientConfig, { instructions, nodeType, timeout, keepRate: clientConfig.keepRate }, timeout);
};

export const cleanClients = abConnectionManager.shutdown;
export const reset = abConnectionManager.reset;
