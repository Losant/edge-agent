import opcua from 'node-opcua';
import fs from 'fs-extra';
import { tmpdir as makeTmpDir } from 'os';
const tmpdir = makeTmpDir();
import crypto from 'crypto';
import path from 'node:path';
import * as payloadHelper from 'losant-handlebars';
import errors from 'losant-nodejs-utils/src/errors.js';
import { isNil, isNilOrEmpty, curry, forEachSerialP, toLower, noop, defer } from 'omnibelt';
import verifyHosts from 'losant-nodejs-utils/src/utils/verify-hosts.js';
import { validateSSL } from 'losant-nodejs-utils/src/utils/validate-ssl.js';
import { clampPositiveEnv } from '../utils.js';

const IDLE_OPCUA_SESSION_TTL = clampPositiveEnv('IDLE_OPCUA_SESSION_TTL', 30 * 1000);
const IDLE_OPCUA_CLIENT_TTL = Math.max(IDLE_OPCUA_SESSION_TTL, clampPositiveEnv('IDLE_OPCUA_CLIENT_TTL', 60 * 1000));
const IDLE_OPCUA_CLEANUP_INTERVAL = clampPositiveEnv('IDLE_OPCUA_CLEANUP_INTERVAL', 10 * 1000);
const VALID_URI_PROTOCOLS = new Set(['opc.tcp:', 'http:', 'https:']);

const opcuaClientCache = new Map();
const connectOptions = {
  endpointMustExist: false,
  defaultSecureTokenLifetime: 900000, // 15 minutes
  connectionStrategy: {
    maxRetry: 3, // may want to turn this up
    initialDelay: 1000, // and this
    maxDelay: 10*1000
  },
  keepSessionAlive: true
};
const subscriptionOptions = {
  requestedPublishingInterval: 1000,
  requestedLifetimeCount: 120,
  requestedMaxKeepAliveCount: 10,
  maxNotificationsPerPublish: 1,
  publishingEnabled: true,
  priority: 1
};

const terminateMonitoredItem = async (session, itemKey) => {
  const monitoredItem = session.monitoredItems.get(itemKey);
  if (!monitoredItem) { return; }
  session.monitoredItems.delete(itemKey);

  // monitoredItems.terminate has an uncaught exception when an event notification is coming in
  // node_modules/node-opcua-client/dist/private/client_subscription_impl.js:512:33
  const waitForItemDeletion = defer();
  session.opcSession.deleteMonitoredItems({
    monitoredItemIds: [monitoredItem.monitoredItemId],
    subscriptionId: session.subscription.subscriptionId
  }, () => { waitForItemDeletion.resolve(); });
  await waitForItemDeletion.promise;

  monitoredItem.removeAllListeners();
  monitoredItem.emit('terminated');
  delete session.subscription.monitoredItems[monitoredItem.monitoredItemId];
};

const terminateSubscription = async (session) => {
  await forEachSerialP(async ([itemKey]) => {
    await terminateMonitoredItem(session, itemKey);
  }, session.monitoredItems);

  if (session.subscription) {
    const subscription = session.subscription;
    session.subscription = null;

    try { await subscription.terminate(); } catch {}
    subscription.removeAllListeners();
  }
};

const terminateSession = async (opcWrapper, sessionKey) => {
  const sessionPromise = opcWrapper.session.get(sessionKey);
  if (!sessionPromise) { return; }

  opcWrapper.session.delete(sessionKey);

  const session = await sessionPromise.catch(noop);

  await terminateSubscription(session);

  try { await session.opcSession.close(true); } catch { }
};

const terminateClient = async function(cacheKey) {
  const wrapperPromise = opcuaClientCache.get(cacheKey);
  if (!wrapperPromise) { return; }
  opcuaClientCache.delete(cacheKey);

  const opcWrapper = await wrapperPromise;
  await forEachSerialP(async ([sessionKey]) => {
    await terminateSession(opcWrapper, sessionKey);
  }, opcWrapper.session);

  try { await opcWrapper.client.disconnect(); } catch {} // already dead
  opcWrapper.client.removeAllListeners();

  // bad things happen if you delete the default cert, only a unique one is safe
  if (opcWrapper.hash) {
    await fs.unlink(path.join(tmpdir, `client_selfsigned_cert_1024-${opcWrapper.hash}.pem`));
    await fs.unlink(path.join(tmpdir, `private_key-${opcWrapper.hash}.pem`));
  }
};

const cleanIdleClientsAndSessions = async () => {
  const now = Date.now();
  const keepSessionAfter = now - IDLE_OPCUA_SESSION_TTL;
  const keepClientAfter = now - IDLE_OPCUA_CLIENT_TTL;
  await forEachSerialP(async ([cacheKey, opcWrapper]) => {
    opcWrapper = await opcWrapper;

    let hasSubscription = false;
    let clientLastUsedAt = opcWrapper.createdAt;
    await forEachSerialP(async ([sessionKey, sessionPromise]) => {
      const ses = await sessionPromise.catch(noop);
      if (!ses) { return; }

      // it is a subscription, we keep it
      if (ses.subscription) {
        hasSubscription = true;
        return;
      }
      clientLastUsedAt = Math.max(ses.lastUsedAt, clientLastUsedAt);
      if (ses.lastUsedAt > keepSessionAfter) { return; }

      await terminateSession(opcWrapper, sessionKey);
    }, opcWrapper.session);

    // if the client is running a subscription, we keep it
    if (hasSubscription) { return; }
    if (clientLastUsedAt > keepClientAfter) { return; }

    await terminateClient(cacheKey);
  }, opcuaClientCache);
};
const cleanClientInterval = setInterval(cleanIdleClientsAndSessions, IDLE_OPCUA_CLEANUP_INTERVAL);

export const removeMonitoredItem = async function({ clientKey, sessionKey, itemKey }) {
  const opcWrapper = await opcuaClientCache.get(clientKey);
  if (!opcWrapper) { return; }
  const session = await opcWrapper.session.get(sessionKey);
  if (!session) { return; }
  await terminateMonitoredItem(session, itemKey);

  if (session.monitoredItems.size) { return; }

  await terminateSession(opcWrapper, sessionKey);
};

const getOpcuaClient = async function(opcuaOptions = {}) {
  // The client cache key is only the endpoint, though it could be a combination of the following options:
  // endpoint, privateKey, cert, securityPolicy, securityMode, username, password
  // It is unlikely that someone is connecting to the same endpoint with different combinations
  // of these options, which is why this is not a critical issue

  const cacheKey = opcuaOptions.endpoint;
  if (opcuaClientCache.has(cacheKey)) {
    return opcuaClientCache.get(cacheKey);
  }

  let clientOptions = { ...connectOptions };
  const hash = opcuaOptions.privateKey ? crypto.hash('md5', opcuaOptions.privateKey, 'hex') : '';

  if (opcuaOptions.securityPolicy) {
    clientOptions = {
      ...clientOptions,
      securityPolicy: opcuaOptions.securityPolicy,
      securityMode: opcuaOptions.securityMode
    };
  }
  if (opcuaOptions.cert && opcuaOptions.privateKey) {
    clientOptions.certificateFile = path.join(tmpdir, `client_selfsigned_cert_1024-${hash}.pem`);
    clientOptions.privateKeyFile = path.join(tmpdir, `private_key-${hash}.pem`);
    await Promise.all([
      fs.writeFile(clientOptions.certificateFile, `${opcuaOptions.cert}\n`),
      fs.writeFile(clientOptions.privateKeyFile, `${opcuaOptions.privateKey}\n`)
    ]);
  }

  const client = opcua.OPCUAClient.create(clientOptions);
  const makeWrapper = (error) => ({
    client,
    hash,
    error,
    session: new Map(),
    createdAt: Date.now()
  });
  const promise = client.connect(opcuaOptions.endpoint)
    .then(makeWrapper)
    .catch(makeWrapper);

  opcuaClientCache.set(cacheKey, promise);

  return promise;
};

const browseObject = (nodes) => {
  const uniqueIds = new Set();
  const results = [];
  let nodeId;
  let identifier;
  let identifierType;

  nodes.forEach((node) => {
    nodeId = node.nodeId.toString().replace(`;namespaceUri:${node.nodeId.namespaceUri}`, '');

    // duplicates are allowed within a server, but are not useful for browsing
    if (uniqueIds.has(nodeId)) { return; }
    uniqueIds.add(nodeId);

    identifier = nodeId.substring(nodeId.lastIndexOf('=')+1);
    identifierType = nodeId.charAt(nodeId.lastIndexOf('=')-1);
    switch (identifierType) {
      case 'b':
        identifierType = 'Byte String';
        break;
      case 'g':
        identifierType = 'GUID';
        break;
      case 'i':
        identifierType = 'Numeric';
        break;
      default:
        identifierType = 'String';
    }
    if (identifierType === 'Numeric') {
      identifier = parseInt(identifier, 10);
    }
    results.push({
      browseName: node.browseName ? node.browseName.toString() : 'null',
      displayName: node.displayName ? node.displayName.toString() : 'null',
      nodeId,
      namespace: node.nodeId.namespace ? node.nodeId.namespace : 0,
      identifier,
      identifierType,
      namespaceUri: node.nodeId.namespaceUri ? node.nodeId.namespaceUri : 'null',
      isForward: node.isForward || false,
      nodeClass: node.nodeClass ? `${opcua.NodeClass[node.nodeClass]} (${node.nodeClass})` : 'null'
    });
  });

  return results;
};

export const dataToType = (dType, rawVal, encode) => {
  dType = opcua.DataType[dType];
  dType = toLower(dType);
  if (dType.includes('bool')) {
    dType = 'bool';
  } else if (dType.includes('int') || dType.includes('double') || dType.includes('float') || dType.includes('number') ||
       dType.includes('duration') || (dType.includes('byte') && !dType.includes('string'))) {
    dType = 'num';
  }
  // else this is most likely a string variant, generic types will default to string
  const typedVals = (Array.isArray(rawVal) ? rawVal : [ rawVal ]).map((typedVal) => {
    if (ArrayBuffer.isView(typedVal)) {
      if (dType === 'bytestring') {
        return typedVal.toString('hex');
      }
      typedVal = Array.from(typedVal);
    }
    if (Array.isArray(typedVal)) {
      return dataToType(dType, typedVal);
    }
    if (encode && dType === 'datetime') {
      typedVal = new Date(typedVal);
      if (!(typedVal instanceof Date) || isNaN(typedVal)) {
        throw errors.Validation({ message: 'Value is not a valid DateTime.' });
      }
    } else if (encode && dType === 'NodeId') {
      try {
        typedVal = opcua.resolveNodeId(typedVal);
      } catch {
        throw errors.Validation({ message: 'Value is not a valid NodeId.' });
      }
    } else if (dType === 'bool') {
      // null/undefined, false, and 0 are false, everything else is true
      typedVal = !isNilOrEmpty(typedVal) && typedVal.toString() !== 'false' && typedVal.toString() !== '0';
    } else if (dType === 'num') {
      typedVal = Number(typedVal);
      if (isNaN(typedVal)) { typedVal = 0; }
    } else if (dType === 'localizedtext' && typedVal.text) {
      typedVal = typedVal.text.toString();
    } else if (!typedVal) {
      typedVal = '';
    } else {
      typedVal = typedVal.toString();
    }
    return typedVal;
  });

  return typedVals.length > 1 ? typedVals : typedVals[0];
};

const addMonitoredItem = async (session, nodes) => {
  const itemsId = `${nodes[0].groupName}${nodes[0].nodeId}`;
  let eventFilter = null;
  let attributeId = opcua.AttributeIds.Value;

  // make sure old is cleared first
  await terminateMonitoredItem(session, itemsId);

  if (nodes[0].value?.length) {
    // event alarms and conditions, we may want to implement filter operators later
    eventFilter = opcua.constructEventFilter(nodes[0].value);
    attributeId = opcua.AttributeIds.EventNotifier;
  }

  const items = nodes.map((node) => {
    return {
      nodeId: node.nodeId,
      attributeId: attributeId
    };
  });

  const monitoredItems = opcua.ClientMonitoredItemGroup.create(session.subscription, items, {
    samplingInterval: nodes[0].key,
    queueSize: 10000,
    discardOldest: true,
    filter: eventFilter
  }, opcua.TimestampsToReturn.Both);

  session.monitoredItems.set(itemsId, monitoredItems);

  return monitoredItems;
};

const validateRenderCallInstructionsCurry = curry((nodeType, instructions, payload, instructionType) => {
  if (isNilOrEmpty(instructions)) {
    throw errors.Validation({ message: 'Call Instructions are required for OPC UA Call Node.' });
  }

  const payloadPath = instructionType === 'payloadPath';
  if (payloadPath) {
    instructions = payloadHelper.lookup(instructions, payload);
    if (!instructions || typeof instructions !== 'object' || isNil(instructions)) {
      throw errors.Validation({ message: `Each ${nodeType} instruction must be an object.` });
    }
  }

  let oNs = payloadPath ? instructions.nameSpace : payloadHelper.renderToString(instructions.nameSpaceTemplate, payload);
  const oId = payloadPath ? instructions.identifier : payloadHelper.renderToString(instructions.identifierTemplate, payload);
  let mNs = payloadPath ? instructions.methodNs : payloadHelper.renderToString(instructions.methodNsTemplate, payload);
  const mId = payloadPath ? instructions.methodId : payloadHelper.renderToString(instructions.methodIdTemplate, payload);

  if (isNilOrEmpty(oNs)) {
    throw errors.Validation({ message: 'Object Namespace Index is required.' });
  }
  oNs = parseInt(oNs, 10);
  if (oNs < 0 || oNs > 255) {
    throw errors.Validation({ message: 'Object Namespace must be an integer between 0 and 255.' });
  }
  if (isNaN(oNs)) {
    throw errors.Validation({ message: 'Object Namespace Index must be a valid integer.' });
  }
  if (isNilOrEmpty(oId)) {
    throw errors.Validation({ message: 'Object Identifier is required.' });
  }
  if (typeof oId !== 'string') {
    throw errors.Validation({ message: 'Object Identifier must be a string.' });
  }
  const objectId = opcua.coerceNodeId(`ns=${oNs};${oId}`);

  if (isNilOrEmpty(mNs)) {
    throw errors.Validation({ message: 'Method Namespace Index is required.' });
  }
  mNs = parseInt(mNs, 10);
  if (mNs < 0 || mNs > 255) {
    throw errors.Validation({ message: 'Method Namespace must be an integer between 0 and 255.' });
  }
  if (isNaN(mNs)) {
    throw errors.Validation({ message: 'Method Namespace Index must be a valid integer.' });
  }
  if (isNilOrEmpty(mId)) {
    throw errors.Validation({ message: 'Method Identifier is required.' });
  }
  if (typeof mId !== 'string') {
    throw errors.Validation({ message: 'Method Identifier must be a string.' });
  }
  const methodId = opcua.coerceNodeId(`ns=${mNs};${mId}`);

  if (!Array.isArray(instructions.methodArguments)) {
    throw errors.Validation({ message: 'Method Arguments must be an array.' });
  }

  const inputArguments = instructions.methodArguments.map((arg) => {
    const dType = payloadPath ? arg.dataType : payloadHelper.renderToString(arg.dataTypeTemplate, payload);
    const aType = payloadPath ? arg.arrayType : payloadHelper.renderToString(arg.arrayTypeTemplate, payload);
    let value;
    if (payloadPath) {
      value = arg.value;
    } else {
      const sourceType = payloadHelper.renderToString(arg.sourceTypeTemplate, payload);
      if (sourceType === 'path') {
        value = payloadHelper.lookup(arg.valueTemplate || arg.value, payload);
      } else {
        value = payloadHelper.renderToString(arg.valueTemplate || arg.value, payload);
      }
    }

    if (isNilOrEmpty(dType)) {
      throw errors.Validation({ message: 'Data Type is required.' });
    }
    const dataType = opcua.DataType[dType];
    if (dataType === undefined) {
      throw errors.Validation({ message: `"${dType}" is not a valid/supported OPC UA data type.` });
    }

    // clean up data types
    value = dataToType(dataType, value, true);

    if (isNilOrEmpty(aType)) {
      return { dataType, value };
    }

    const arrayType = opcua.VariantArrayType[aType];
    if (arrayType === undefined) {
      throw errors.Validation({ message: `"${aType}" is not a valid/supported OPC UA array type.` });
    }
    return { dataType, arrayType, value };
  });

  return { objectId, methodId, inputArguments };
});

const validateRenderInstructions = curry((nodeType, instructions, payload, instructionType) => {
  const payloadPath = instructionType === 'payloadPath';
  if (payloadPath) {
    instructions = payloadHelper.lookup(instructions, payload);
    if (!Array.isArray(instructions)) {
      if (nodeType === 'browse') {
        instructions = [];
      } else {
        throw errors.Validation({ message: `${nodeType} instructions must be an array.` });
      }
    }
    instructions = instructions.map((instruction) => {
      if (!instruction || typeof instruction !== 'object' || isNil(instruction)) {
        throw errors.Validation({ message: `Each ${nodeType} instruction must be an object.` });
      }
      return {
        nameSpaceTemplate: instruction.nameSpace,
        identifierTemplate: instruction.identifier,
        key: instruction.key,
        valueTemplate: instruction.value
      };
    });
  }

  if (isNilOrEmpty(instructions)) {
    if (nodeType === 'browse') {
      instructions = [{}]; // will default to root folder (similar to workflow node behavior)
    } else {
      throw errors.Validation({ message: `${nodeType}Instructions are required for OPC UA ${nodeType}.` });
    }
  }

  return instructions.map(({
    nameSpaceTemplate, identifierTemplate, key, sourceTypeTemplate, valueTemplate, samplingInterval, eventFilter
  } = {}, index) => {
    let ns = payloadPath ? nameSpaceTemplate : payloadHelper.renderToString(nameSpaceTemplate, payload);
    const id = payloadPath ? identifierTemplate : payloadHelper.renderToString(identifierTemplate, payload);
    let value;
    let nodeId;

    if (nodeType === 'browse') {
      if (isNilOrEmpty(ns) && isNilOrEmpty(id)) {
        nodeId = 'RootFolder';
      } else if (isNilOrEmpty(id)) {
        throw errors.Validation({ message: 'Identifier is required.' });
      } else if (typeof id !== 'string') {
        throw errors.Validation({ message: 'Identifier must be a string.' });
      } else if (isNilOrEmpty(ns)) {
        ns = 'RootFolder';
        try {
          nodeId = [opcua.makeBrowsePath(ns, id)];
          key = id.substring(id.lastIndexOf('/')+1);
        } catch {
          throw errors.Validation({ message: 'Identifier path is in the wrong format.' });
        }
      } else {
        ns = parseInt(ns, 10);
        if (ns < 0 || ns > 255) {
          throw errors.Validation({ message: 'Namespace must be an integer between 0 and 255.' });
        }
        if (isNaN(ns)) {
          throw errors.Validation({ message: 'Namespace Index must be a valid integer.' });
        }
        nodeId = `ns=${ns};${id}`;
      }
    } else {
      if (isNilOrEmpty(ns)) {
        throw errors.Validation({ message: 'Namespace Index is required.' });
      }
      ns = parseInt(ns, 10);
      if (ns < 0 || ns > 255) {
        throw errors.Validation({ message: 'Namespace must be an integer between 0 and 255.' });
      }
      if (isNaN(ns)) {
        throw errors.Validation({ message: 'Namespace Index must be a valid integer.' });
      }
      if (isNilOrEmpty(id)) {
        throw errors.Validation({ message: 'Identifier is required.' });
      }
      if (typeof id !== 'string') {
        throw errors.Validation({ message: 'Identifier must be a string.' });
      }
      nodeId = `ns=${ns};${id}`;
    }
    switch (nodeType) {
      case 'read':
        if (isNilOrEmpty(key)) {
          // try to default key to identifier name if it does not exist
          let idPoint = id.lastIndexOf('.');
          if (idPoint < 0) {
            idPoint += 2;
          }
          key = id.substring(idPoint+1);
          if (key.match(/^\d/)) { key = `[${key}]`; }
        }
        if (isNilOrEmpty(key)) {
          throw errors.Validation({ message: 'Key is required.' });
        }
        if (typeof key !== 'string') {
          throw errors.Validation({ message: 'Key must be a string.' });
        }
        if (key === 'errors' || key.startsWith('errors.')) {
          throw errors.Validation({ message: 'Keys cannot contain the special path errors.' });
        }
        break;
      case 'write':
        if (payloadPath) {
          value = valueTemplate;
        } else {
          const sourceType = payloadHelper.renderToString(sourceTypeTemplate, payload);
          if (sourceType === 'path') {
            value = payloadHelper.lookup(valueTemplate, payload);
          } else {
            value = payloadHelper.renderToString(valueTemplate, payload);
          }
        }
        break;
      case 'subscribe':
        if (index) { return { nodeId }; } // interval and filters only for the first item
        key = payloadHelper.renderToString(samplingInterval, payload);
        key = parseInt(key, 10);
        if (key < 1) {
          throw errors.Validation({ message: 'Sampling Interval must be equal or greater than 1(millisecond).' });
        }
        if (isNaN(key)) {
          throw errors.Validation({ message: 'Sampling Interval must be a valid integer.' });
        }
        value = eventFilter;
        break;
      default:
        break;
    }

    return { nodeId, key, value };
  });
});

const validateOpcuaOptions = async (payload, options = {}) => {
  const endpoint = payloadHelper.renderToString(options.uriTemplate, payload);
  let securityPolicy = payloadHelper.renderToString(options.securityPolicyTemplate, payload);
  let securityMode = payloadHelper.renderToString(options.securityModeTemplate, payload);
  const cert = payloadHelper.renderToString(options.certTemplate, payload).trim();
  const privateKey = payloadHelper.renderToString(options.privateKeyTemplate, payload).trim();
  const sslOptions = { skipDateValidation: true, key: privateKey };

  // handle older all caps security modes
  securityMode = Object.keys(opcua.MessageSecurityMode).find((key) => toLower(key) === toLower(securityMode));

  securityPolicy = opcua.SecurityPolicy[securityPolicy] || opcua.SecurityPolicy.None;
  securityMode = opcua.MessageSecurityMode[securityMode] || opcua.MessageSecurityMode.None;

  if (securityPolicy.endsWith('#Basic128Rsa15')) {
    throw errors.Validation({ message: 'Security Policy Basic128Rsa15 is deprecated.' });
  }

  if (securityPolicy.endsWith('#None') && securityMode !== 1) {
    throw errors.Validation({ message: 'Security policy must be provided if security mode is provided.' });
  }

  if (!securityPolicy.endsWith('#None') && securityMode === 1) {
    throw errors.Validation({ message: 'Security mode must be provided if security policy is provided.' });
  }

  if (!securityPolicy.endsWith('#None') && (isNilOrEmpty(cert) || isNilOrEmpty(privateKey))) {
    throw errors.Validation({ message: 'Certificate and private key must be provided if security is set.' });
  }

  if (!isNilOrEmpty(privateKey) && isNilOrEmpty(cert)) {
    throw errors.Validation({ message: 'Certificate must be provided if key is provided.' });
  }

  if (!isNilOrEmpty(cert) && isNilOrEmpty(privateKey)) {
    throw errors.Validation({ message: 'Private key must be provided if certificate is provided.' });
  }

  if (!isNilOrEmpty(cert) && !isNilOrEmpty(privateKey)) {
    await validateSSL(cert, sslOptions);
  }

  if (isNilOrEmpty(endpoint)) {
    throw errors.Validation({ message: 'OPC UA URI endpoint is required.' });
  }

  // OPC UA, or at least our implementation, requires a full URI with a valid protocol

  let endpointParsed;
  try {
    endpointParsed = new URL(endpoint);
  } catch {
    throw errors.Validation({ message: `OPC UA URI endpoint "${endpoint}" is invalid.` });
  }

  if (!VALID_URI_PROTOCOLS.has(`${endpointParsed.protocol}`)) {
    throw errors.Validation({ message: `OPC UA URI endpoint "${endpoint}" is invalid.` });
  }

  await verifyHosts(endpointParsed.hostname);

  return { endpoint, cert, privateKey, securityPolicy, securityMode };
};

const runOpcuaInstructions = curry(async (nodeType, runId, payload, instructions, nodeInst) => {
  const opcuaOptions = await validateOpcuaOptions(payload, nodeInst);
  const cred = {
    userName: payloadHelper.renderToString(nodeInst.usernameTemplate, payload),
    password: payloadHelper.renderToString(nodeInst.passwordTemplate, payload)
  };
  const errorsList = [];
  let resultObj = {};

  const client = await getOpcuaClient(opcuaOptions);
  if (client.error) {
    terminateClient(opcuaOptions.endpoint);
    throw errors.NotFound({ title: 'OPC UA Connection Error', message: client.error.message });
  }

  const hash = opcuaOptions.privateKey ? crypto.createHash('md5').update(opcuaOptions.privateKey).digest('hex') : '';
  let session;
  if (client.session.has(runId)) {
    session = await client.session.get(runId);
  }

  // somehow session died, clean it out
  if (session && session.opcSession._closeEventHasBeenEmitted) {
    await terminateSession(client, runId);
    session = null;
  }

  if (session) {
    if (hash !== session.hash) {
      throw errors.Unauthorized({ title: 'OPC UA Session Error', message: 'Security credentials do not match current session.' });
    }
    session.lastUsedAt = Date.now();
  } else {
    if (!client.client._secureChannel) { // known improper err catching in the node_opcua lib
      throw errors.Unauthorized({ title: 'OPC UA Session Error', message: 'Invalid secure channel.' });
    }

    const promise = client.client.createSession(cred.userName && cred).then((opcSession) => {
      return {
        opcSession,
        hash,
        subscription: null,
        monitoredItems: new Map(),
        lastUsedAt: Date.now()
      };
    }).catch((err) => {
      client.session.delete(runId); // we don't want to keep a dead session
      throw errors.Unauthorized({ title: 'OPC UA Session Error', message: err.message });
    });

    client.session.set(runId, promise);

    session = await promise;
  }

  const opcSession = session.opcSession;
  let subscription = session.subscription;

  // BROWSE, READ, WRITE, CALL, or SUBSCRIBE
  let node;
  let browseId;
  let result;
  let dataType;
  switch (nodeType) {
    case 'BROWSE':
      node = instructions[0];
      browseId = node.nodeId;
      if (node.nodeId !== 'RootFolder' && !node.nodeId.includes('ns=')) {
        try {
          browseId = await opcSession.translateBrowsePath(browseId);
          browseId = browseId[0].targets[0].targetId;
        } catch (err) {
          // fallback to root if failed lookup
          browseId = 'RootFolder';
          node.key = 'RootFolder';
          errorsList.push({ type: `OPC-UA_${nodeType}_ERROR`, message: err.message });
        }
      }
      node.key = node.key || browseId.substring(browseId.lastIndexOf('=')+1);
      node.key = node.key.substring(node.key.lastIndexOf('.')+1);
      node.key = node.key.match(/^\d/) ? `i_${node.key}` : node.key;
      try {
        result = await opcSession.browse(browseId);
        resultObj = payloadHelper.set(node.key, browseObject(result.references), resultObj);
      } catch (err) {
        errorsList.push({ type: `OPC-UA_${nodeType}_ERROR`, message: err.message });
      }
      break;
    case 'READ':
      await forEachSerialP(async (rNode) => {
        try {
          result = await opcSession.readVariableValue(rNode.nodeId);
        } catch (err) {
          errorsList.push({ type: `OPC-UA_${nodeType}_ERROR`, message: err.message });
          return;
        }
        if (result.statusCode.name !== 'Good') {
          errorsList.push({ type: `OPC-UA_${nodeType}_ERROR`, message: result.statusCode.description });
        } else {
          if (ArrayBuffer.isView(result.value.value)) {
            result.value.value = Array.from(result.value.value);
          }
          result = dataToType(result.value.dataType, result.value.value);
          resultObj = payloadHelper.set(rNode.key, result, resultObj);
        }
      }, instructions);
      break;
    case 'WRITE':
      await forEachSerialP(async (wNode) => {
        try {
          dataType = await opcSession.readVariableValue(wNode.nodeId);
        } catch (err) {
          errorsList.push({ type: `OPC-UA_${nodeType}_ERROR`, message: err.message });
          return;
        }
        if (dataType.statusCode.name !== 'Good') {
          errorsList.push({ type: `OPC-UA_${nodeType}_ERROR`, message: dataType.statusCode.description });
          return;
        }
        if (dataType.value.arrayType && opcua.VariantArrayType[dataType.value.arrayType] === 'Array' && !Array.isArray(wNode.value)) {
          errorsList.push({ type: `OPC-UA_${nodeType}_ERROR`, message: 'Value must also be an array when writing to an array node.' });
          return;
        }
        if (dataType.value.arrayType && opcua.VariantArrayType[dataType.value.arrayType] === 'Array' && !Array.isArray(wNode.value)) {
          errorsList.push({ type: `OPC-UA_${nodeType}_ERROR`, message: 'Value must also be an array when writing to an array node.' });
          return;
        }
        dataType = dataType.value.dataType;
        wNode.value = dataToType(dataType, wNode.value);
        try {
          result = await opcSession.writeSingleNode(wNode.nodeId, {
            dataType: opcua.DataType[dataType],
            value: wNode.value
          });
        } catch (err) {
          errorsList.push({ type: `OPC-UA_${nodeType}_ERROR`, message: err.message });
          return;
        }
        if (result.name !== 'Good') {
          errorsList.push({ type: `OPC-UA_${nodeType}_ERROR`, message: result.description });
          return;
        }
        resultObj = payloadHelper.set('write', 'success', resultObj);
      }, instructions);
      break;
    case 'CALL':
      try {
        result = await opcSession.call({ ...instructions });
      } catch (err) {
        errorsList.push({ type: `OPC-UA_${nodeType}_ERROR`, message: err.message || 'Unknown call failure.' });
        break;
      }
      if (result.statusCode.name !== 'Good') {
        errorsList.push({ type: `OPC-UA_${nodeType}_ERROR`, message: result.statusCode.description });
      } else {
        if (ArrayBuffer.isView(result.outputArguments.value)) {
          result.value.value = Array.from(result.value.value);
        }
        result = result.outputArguments.map((outputArg) => {
          return dataToType(outputArg.dataType, outputArg.value);
        });
        resultObj = payloadHelper.set('result', result, resultObj);
      }
      break;
    case 'SUBSCRIBE':
      if (!subscription) { // one subscription per session
        subscription = opcua.ClientSubscription.create(opcSession, subscriptionOptions);
        session.subscription = subscription;

        try {
          await new Promise((resolve, reject) => {
            subscription.once('started', resolve);
            subscription.on('error', reject);
          });
        } catch (e) {
          await terminateSubscription(session);
          throw e;
        }
      }

      try {
        return await addMonitoredItem(session, instructions);
      } catch (e) {
        await terminateSubscription(session);
        throw e;
      }
    default:
      // nothing
  }

  if (errorsList.length) {
    resultObj = payloadHelper.set('errors', errorsList, resultObj);
  }

  payload = payloadHelper.set(nodeInst.destinationPath, resultObj, payload);

  return payload;
});

export const validateRenderBrowseInstructions = validateRenderInstructions('browse');
export const validateRenderReadInstructions = validateRenderInstructions('read');
export const validateRenderWriteInstructions = validateRenderInstructions('write');
export const validateRenderSubscribeInstructions = validateRenderInstructions('subscribe');
export const validateRenderCallInstructions = validateRenderCallInstructionsCurry('call');
export const runOpcuaBrowseInstructions = runOpcuaInstructions('BROWSE');
export const runOpcuaReadInstructions = runOpcuaInstructions('READ');
export const runOpcuaWriteInstructions = runOpcuaInstructions('WRITE');
export const runOpcuaSubscribeInstructions = runOpcuaInstructions('SUBSCRIBE');
export const runOpcuaCallInstructions = runOpcuaInstructions('CALL');

export const cleanOpcuaClients = async function() {
  clearInterval(cleanClientInterval);
  return forEachSerialP(([cacheKey]) => {
    return terminateClient(cacheKey);
  }, opcuaClientCache);
};
export const getClientCache = () => {
  return opcuaClientCache;
};
