import https from 'node:https';
import { Readable } from 'node:stream';
import { text } from 'node:stream/consumers';
import { loadAll } from 'js-yaml';
import * as payloadHelper from 'losant-handlebars';
import LJSON from 'losant-nodejs-utils/src/ljson.js';
import axios from 'losant-nodejs-utils/src/axios.js';
import errors from 'losant-nodejs-utils/src/errors.js';
import { ONE_MEGABYTE } from 'losant-nodejs-utils/src/constants/size.js';
import ensureValidHttpUri from 'losant-nodejs-utils/src/utils/ensure-valid-uri.js';
import { writeFileToDisk } from 'losant-nodejs-utils/src/utils/storage-helpers.js';
import { isTimeoutError, getTimeoutTemplate } from 'losant-nodes/src/lib/common.js';
import niceBooleanCast from 'losant-nodejs-utils/src/utils/nice-boolean-cast.js';
import { getFlagOption } from 'losant-nodes/src/lib/node-storage-helpers.js';
import { isNil, isNilOrEmpty, isPlainObject, mapSerialP } from 'omnibelt';
import { checkEncoding } from '../utils.js';

export const RESOURCES = {
  pods: { apiGroup: '', version: 'v1', resource: 'pods', namespaced: true },
  deployments: { apiGroup: 'apps', version: 'v1', resource: 'deployments', namespaced: true },
  services: { apiGroup: '', version: 'v1', resource: 'services', namespaced: true },
  configmaps: { apiGroup: '', version: 'v1', resource: 'configmaps', namespaced: true },
  namespaces: { apiGroup: '', version: 'v1', resource: 'namespaces', namespaced: false },
  nodes: { apiGroup: '', version: 'v1', resource: 'nodes', namespaced: false }
};

export const METHODS_WITH_BODY = new Set(['POST', 'PUT', 'PATCH']);

export const KIND_TO_RESOURCE = {
  Pod:                   RESOURCES.pods,
  Deployment:            RESOURCES.deployments,
  Service:               RESOURCES.services,
  ConfigMap:             RESOURCES.configmaps,
  Namespace:             RESOURCES.namespaces,
  Node:                  RESOURCES.nodes,
  StatefulSet:           { apiGroup: 'apps', version: 'v1', resource: 'statefulsets', namespaced: true },
  DaemonSet:             { apiGroup: 'apps', version: 'v1', resource: 'daemonsets', namespaced: true },
  ReplicaSet:            { apiGroup: 'apps', version: 'v1', resource: 'replicasets', namespaced: true },
  Secret:                { apiGroup: '', version: 'v1', resource: 'secrets', namespaced: true },
  ServiceAccount:        { apiGroup: '', version: 'v1', resource: 'serviceaccounts', namespaced: true },
  Job:                   { apiGroup: 'batch', version: 'v1', resource: 'jobs', namespaced: true },
  CronJob:               { apiGroup: 'batch', version: 'v1', resource: 'cronjobs', namespaced: true },
  Ingress:               { apiGroup: 'networking.k8s.io', version: 'v1', resource: 'ingresses', namespaced: true },
  PersistentVolumeClaim: { apiGroup: '', version: 'v1', resource: 'persistentvolumeclaims', namespaced: true },
  Role:                  { apiGroup: 'rbac.authorization.k8s.io', version: 'v1', resource: 'roles', namespaced: true },
  RoleBinding:           { apiGroup: 'rbac.authorization.k8s.io', version: 'v1', resource: 'rolebindings', namespaced: true },
  ClusterRole:           { apiGroup: 'rbac.authorization.k8s.io', version: 'v1', resource: 'clusterroles', namespaced: false },
  ClusterRoleBinding:    { apiGroup: 'rbac.authorization.k8s.io', version: 'v1', resource: 'clusterrolebindings', namespaced: false }
};

export const K8S_NAMESPACE_REGEX = /^[a-z0-9]([-a-z0-9]{0,61}[a-z0-9])?$/;
export const INVALID_RESOURCE_NAME_REGEX = /^\.\.?$|[/%]/;
export const K8S_API_GROUP_REGEX = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?(\.[a-z0-9]([-a-z0-9]*[a-z0-9])?)*$/;
export const K8S_API_VERSION_REGEX = /^v[1-9]\d*((alpha|beta)[1-9]\d*)?$/;

export const validateResourceName = (name) => {
  if (!name) { return; }
  if (INVALID_RESOURCE_NAME_REGEX.test(name)) {
    throw errors.Validation({ message: `Invalid resource name "${name}".` });
  }
};

export const validateNamespace = (namespace) => {
  if (!namespace) { return; }
  if (!K8S_NAMESPACE_REGEX.test(namespace)) {
    throw errors.Validation({ message: `Invalid namespace "${namespace}".` });
  }
};

export const validateApiGroup = (apiGroup) => {
  if (!apiGroup) { return; }
  if (apiGroup.length > 253 || !K8S_API_GROUP_REGEX.test(apiGroup)) {
    throw errors.Validation({ message: `Invalid apiGroup "${apiGroup}".` });
  }
};

export const validateApiVersion = (version) => {
  if (!version) { return; }
  if (!K8S_API_VERSION_REGEX.test(version)) {
    throw errors.Validation({ message: `Invalid version "${version}".` });
  }
};

export const is2xx = (statusCode) => statusCode >= 200 && statusCode < 300;

// Normalizes a result body into a stream for writeFileToDisk, JSON-stringifying non-string/Buffer values
export const toDiskStream = (body) => {
  if (typeof body?.pipe === 'function') { return body; }
  if (isNil(body)) { return Readable.from(''); }
  const content = typeof body === 'string' || Buffer.isBuffer(body) ? body : (JSON.stringify(body) ?? '');
  return Readable.from(content);
};

export const loadGuardedUtf8File = async (context, filePath) => {
  const content = await context.diskUtils.loadGuardedFile(filePath, {
    encoding: 'utf8',
    maxSize: ONE_MEGABYTE
  });
  return (content || '').trim();
};

export const buildResourcePath = ({
  apiGroup = '',
  version = 'v1',
  resource,
  namespace,
  name,
  subresource
}) => {
  if (apiGroup) {
    validateApiGroup(apiGroup);
  }
  if (version) {
    validateApiVersion(version);
  }
  let path = apiGroup ? `/apis/${apiGroup}/${version}` : `/api/${version}`;
  if (namespace) {
    validateNamespace(namespace);
    path += `/namespaces/${encodeURIComponent(namespace)}`;
  }
  path += `/${resource}`;
  if (name) {
    validateResourceName(name);
    path += `/${encodeURIComponent(name)}`;
  }
  if (subresource) {
    path += `/${subresource}`;
  }
  return path;
};

// Uniformly renders and trims Handlebars template strings
export const renderTrimmed = (template, payload) => {
  if (isNilOrEmpty(template) && template !== 0) { return ''; }
  return payloadHelper.renderToString(String(template), payload).trim();
};

// DRY helper to populate query parameters only when the rendered template is non-empty
export const addParam = (query, key, template, payload) => {
  const val = renderTrimmed(template, payload);
  if (val) { query[key] = val; }
  return val;
};

export const resolveListQueryParams = (node, payload, timeoutMs) => {
  const query = {};
  addParam(query, 'labelSelector', node.labelSelectorTemplate, payload);
  addParam(query, 'fieldSelector', node.fieldSelectorTemplate, payload);
  addParam(query, 'limit', node.limitTemplate, payload);
  addParam(query, 'continue', node.continueTemplate, payload);
  const resourceVersion = addParam(query, 'resourceVersion', node.resourceVersionTemplate, payload);
  // Kubernetes API requires resourceVersionMatch to be omitted unless resourceVersion is also specified
  if (resourceVersion && node.resourceVersionMatch) {
    query.resourceVersionMatch = node.resourceVersionMatch;
  }
  if (timeoutMs) {
    query.timeoutSeconds = Math.max(1, Math.floor(timeoutMs / 1000));
  }
  return query;
};

export const resolveGetQueryParams = (node, payload) => {
  const query = {};
  addParam(query, 'resourceVersion', node.resourceVersionTemplate, payload);
  return query;
};

export const resolveLogQueryParams = (node, payload) => {
  const query = {};
  addParam(query, 'container', node.containerTemplate, payload);
  addParam(query, 'tailLines', node.tailLinesTemplate, payload);
  return query;
};

export const resolveBody = (bodyTemplate, payload) => {
  if (isNilOrEmpty(bodyTemplate)) {
    return {};
  }
  const rendered = renderTrimmed(bodyTemplate, payload);
  if (!rendered) {
    return {};
  }
  try {
    return LJSON.parse(rendered);
  } catch (err) {
    throw errors.InvalidJsonTemplate({ title: 'Body', message: err.message });
  }
};

// Resolves namespace. Non-list namespaced operations require a namespace, while list operations can be cluster-wide
export const renderNamespace = (node, payload, required = false) => {
  const ns = renderTrimmed(node.namespaceTemplate, payload);
  if (required && !ns) {
    throw errors.MissingField({ title: 'Namespace' });
  }
  if (ns) {
    validateNamespace(ns);
  }
  return ns;
};

export const renderName = (node, payload, required = true) => {
  const name = renderTrimmed(node.nameTemplate, payload);
  if (required && !name) {
    throw errors.MissingField({ title: 'Name' });
  }
  if (name) {
    validateResourceName(name);
  }
  return name;
};

export const resolveAndValidateDiskPath = async (node, payload, context = {}) => {
  const rawDiskPath = renderTrimmed(node.resultDiskPathTemplate, payload);
  if (!rawDiskPath) {
    throw errors.Validation({ message: 'Disk path template resolved to an empty value.' });
  }
  const { resolvedPath } = await context.diskUtils.guardPath(rawDiskPath, { checkAncestors: true });
  const encoding = renderTrimmed(node.encodingTemplate, payload) || 'utf8';
  checkEncoding(encoding);
  return { diskPath: resolvedPath, encoding };
};

export const resolveManifestContent = async (node, payload, context = {}) => {
  const source = node.manifestSource || 'stringTemplate';
  if (source === 'stringTemplate') {
    if (isNilOrEmpty(node.manifestTemplate)) {
      throw errors.MissingField({ title: 'Manifest Template' });
    }
    const rendered = renderTrimmed(node.manifestTemplate, payload);
    if (!rendered) {
      throw errors.Validation({ message: 'Manifest template resolved to an empty value.' });
    }
    return rendered;
  }
  if (source === 'payloadPath') {
    if (isNilOrEmpty(node.manifestPayloadPath)) {
      throw errors.MissingField({ title: 'Manifest Payload Path' });
    }
    const value = payloadHelper.lookup(node.manifestPayloadPath, payload);
    if (isNil(value)) {
      throw errors.Validation({ message: `No manifest found at payload path "${node.manifestPayloadPath}".` });
    }
    if (typeof value === 'object') {
      return LJSON.stringify(value);
    }
    const strValue = String(value).trim();
    if (!strValue) {
      throw errors.Validation({ message: `Manifest at payload path "${node.manifestPayloadPath}" is empty.` });
    }
    return strValue;
  }
  if (source === 'diskPath') {
    const rawDiskPath = renderTrimmed(node.manifestDiskPathTemplate, payload);
    if (!rawDiskPath) {
      throw errors.MissingField({ title: 'Manifest Disk Path' });
    }
    const trimmed = await loadGuardedUtf8File(context, rawDiskPath);
    if (!trimmed) {
      throw errors.Validation({ message: `Manifest file at "${rawDiskPath}" is empty.` });
    }
    return trimmed;
  }
  throw errors.Validation({ message: `Unsupported manifestSource "${source}".` });
};

// Tracks each extracted resource doc's original top-level (---separated) document index, so
// filtered-out empty/comment-only documents don't shift the index reported in error messages
const extractResourceDocs = (items, docIndex) => {
  const result = [];
  (items || []).forEach((item, idx) => {
    const currentIndex = docIndex ?? idx + 1;
    if (Array.isArray(item)) {
      result.push(...extractResourceDocs(item, currentIndex));
    } else if (item?.kind === 'List' && Array.isArray(item.items)) {
      result.push(...extractResourceDocs(item.items, currentIndex));
    } else if (isPlainObject(item)) {
      result.push({ doc: item, docIndex: currentIndex });
    }
  });
  return result;
};

export const resolveApiVersion = (apiVersion, defaultResourceDef = {}, { kind, docIndex } = {}) => {
  if (isNil(apiVersion)) {
    return {
      apiGroup: defaultResourceDef.apiGroup || '',
      version: defaultResourceDef.version
    };
  }

  const throwInvalid = () => {
    const errorPrefix = kind && docIndex ? `Resource "${kind}" at index ${docIndex}` : 'Resource';
    throw errors.Validation({
      message: `${errorPrefix} has an invalid "apiVersion" value "${apiVersion}".`
    });
  };

  if (typeof apiVersion !== 'string') {
    throwInvalid();
  }

  const parts = apiVersion.trim().split('/');
  const isSingle = parts.length === 1 && parts[0];
  const isDouble = parts.length === 2 && parts[0] && parts[1];

  if (!isSingle && !isDouble) {
    throwInvalid();
  }

  const apiGroup = isDouble ? parts[0] : (defaultResourceDef.apiGroup || '');
  const version = isDouble ? parts[1] : parts[0];

  if ((apiGroup && (!K8S_API_GROUP_REGEX.test(apiGroup) || apiGroup.length > 253)) || !K8S_API_VERSION_REGEX.test(version)) {
    throwInvalid();
  }

  return { apiGroup, version };
};

export const resolveManifestDocuments = (rawContent, defaultNamespace = 'default') => {
  let docs;
  try {
    docs = loadAll(rawContent);
  } catch (err) {
    throw errors.Validation({ message: `Invalid YAML manifest: ${err.message}` });
  }

  const validDocs = extractResourceDocs(docs);
  if (validDocs.length === 0) {
    throw errors.Validation({ message: 'Manifest contains no valid Kubernetes resource definitions.' });
  }

  return validDocs.map(({ doc, docIndex }) => {
    if (!doc.kind || typeof doc.kind !== 'string') {
      throw errors.Validation({ message: `Resource at index ${docIndex} is missing "kind".` });
    }
    const resourceDef = KIND_TO_RESOURCE[doc.kind];
    if (!resourceDef) {
      throw errors.Validation({
        message: `Unsupported kind "${doc.kind}" — use the 'custom' operation for CRDs.`
      });
    }

    const name = doc.metadata?.name;
    if (!name || typeof name !== 'string') {
      throw errors.Validation({ message: `Resource "${doc.kind}" at index ${docIndex} is missing "metadata.name".` });
    }

    let namespace;
    if (resourceDef.namespaced) {
      namespace = doc.metadata?.namespace || defaultNamespace || 'default';
    }

    const { apiGroup, version } = resolveApiVersion(doc.apiVersion, resourceDef, {
      kind: doc.kind,
      docIndex
    });

    const path = buildResourcePath({
      apiGroup,
      version,
      resource: resourceDef.resource,
      namespace,
      name
    });

    return {
      doc,
      kind: doc.kind,
      name,
      ...(namespace ? { namespace } : {}),
      path
    };
  });
};

export const makeKubernetesRequest = async ({
  server,
  token,
  caCert,
  disableSSLVerification = false,
  timeoutMs,
  method = 'GET',
  path = '',
  query = {},
  headers: customHeaders = {},
  body = null,
  contentType = 'application/json',
  responseType = 'json'
} = {}) => {
  if (!server) {
    throw errors.MissingField({ title: 'Kubernetes Server URL' });
  }

  ensureValidHttpUri(server);

  const serverUrl = new URL(server);
  const basePath = serverUrl.pathname.replace(/\/+$/, '');
  const cleanPath = path.startsWith('/') ? path : `/${path}`;

  // Separate path and search query to avoid percent-encoding '?' into '%3F' via URL.pathname
  const parsedPath = new URL(cleanPath, 'http://localhost');
  serverUrl.pathname = `${basePath}${parsedPath.pathname}`;
  const fullUrl = serverUrl;

  const headers = {
    accept: responseType === 'text' ? 'text/plain, */*' : 'application/json, */*',
    ...(token ? { authorization: `Bearer ${token}` } : {}),
    ...customHeaders
  };

  const params = { ...query };
  for (const [key, value] of parsedPath.searchParams.entries()) {
    if (params[key] === undefined) {
      params[key] = value;
    }
  }

  const upperMethod = method.toUpperCase();
  const hasBody = METHODS_WITH_BODY.has(upperMethod);
  let payloadData = body;
  if (hasBody && !isNil(body)) {
    if (isPlainObject(body) || Array.isArray(body)) {
      payloadData = JSON.stringify(body);
    }
    if (!headers['content-type']) {
      headers['content-type'] = contentType;
    }
  } else {
    payloadData = undefined;
  }

  const isHttps = fullUrl.protocol === 'https:';
  const axiosConfig = {
    method: method.toUpperCase(),
    url: fullUrl.toString(),
    params,
    headers,
    data: payloadData,
    timeout: timeoutMs,
    responseType
  };

  if (isHttps) {
    if (disableSSLVerification) {
      axiosConfig.httpsAgent = new https.Agent({
        rejectUnauthorized: false,
        keepAlive: false
      });
    } else if (caCert) {
      axiosConfig.httpsAgent = new https.Agent({
        ca: caCert,
        keepAlive: false
      });
    }
  }

  const res = await axios(axiosConfig, {
    blankDefaultHeaders: true,
    allStatusCodesAreValid: true
  });

  return {
    statusCode: res.status,
    headers: res.headers,
    body: res.data
  };
};


export const resolveAuth = async (node, payload, context = {}) => {
  if (node.authMode === 'inline') {
    const rawServerUrl = renderTrimmed(node.kubernetesUrlTemplate, payload);
    if (!rawServerUrl) {
      throw errors.MissingField({ title: 'Kubernetes URL' });
    }
    ensureValidHttpUri(rawServerUrl);
    const server = rawServerUrl.replace(/\/+$/, '');

    let token;
    if (node.tokenSource === 'diskPath') {
      const tokenPath = renderTrimmed(node.tokenDiskPathTemplate, payload);
      if (!tokenPath) {
        throw errors.MissingField({ title: 'Token Path' });
      }
      token = await loadGuardedUtf8File(context, tokenPath);
    } else {
      token = renderTrimmed(node.tokenTemplate, payload);
    }
    if (!token) {
      throw errors.MissingField({ title: 'Token' });
    }

    let caCert = null;
    if (!node.disableSSLVerification) {
      if (node.caCertSource === 'stringTemplate') {
        caCert = renderTrimmed(node.caCertTemplate, payload) || null;
      } else if (node.caCertSource === 'diskPath') {
        const caCertDiskPath = renderTrimmed(node.caCertDiskPathTemplate, payload);
        if (!caCertDiskPath) {
          throw errors.MissingField({ title: 'CA Certificate Path' });
        }
        caCert = (await loadGuardedUtf8File(context, caCertDiskPath)) || null;
      }
    }

    return { server, token, caCert, disableSSLVerification: Boolean(node.disableSSLVerification) };
  }

  // inCluster mode: reads mounted Kubernetes ServiceAccount credentials
  const host = process.env.KUBERNETES_SERVICE_HOST;
  const port = process.env.KUBERNETES_SERVICE_PORT_HTTPS || process.env.KUBERNETES_SERVICE_PORT || '443';
  // Wrap IPv6 addresses in brackets if present (e.g. [2001:db8::1]:443) for valid URI parsing
  const formattedHost = host && host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;
  let server;
  if (formattedHost) {
    server = `https://${formattedHost}:${port}`;
  } else if (port === '443') {
    server = 'https://kubernetes.default.svc';
  } else {
    server = `https://kubernetes.default.svc:${port}`;
  }
  let token;
  try {
    token = await loadGuardedUtf8File(context, '/var/run/secrets/kubernetes.io/serviceaccount/token');
  } catch (err) {
    const authErr = new Error(`Failed to read in-cluster service account token: ${err.message}`);
    authErr.name = 'KubernetesAuthError';
    throw authErr;
  }
  let caCert = null;
  if (!node.disableSSLVerification) {
    try {
      caCert = (await loadGuardedUtf8File(context, '/var/run/secrets/kubernetes.io/serviceaccount/ca.crt')) || null;
    } catch {
      caCert = null;
    }
  }
  return { server, token, caCert, disableSSLVerification: Boolean(node.disableSSLVerification) };
};

export const createResourceOperation = (resourceDef, action) => {
  return (node, payload, timeoutMs) => {
    // List operations can be cluster-wide (namespace optional); non-list namespaced operations require namespace
    const isList = action === 'list';
    const ns = resourceDef.namespaced ? renderNamespace(node, payload, !isList) : undefined;
    const name = ['get', 'update', 'patch', 'delete'].includes(action)
      ? renderName(node, payload, true)
      : undefined;
    const path = buildResourcePath({ ...resourceDef, namespace: ns, name });

    switch (action) {
      case 'list': {
        const query = resolveListQueryParams(node, payload, timeoutMs);
        return { method: 'GET', path, query };
      }
      case 'get': {
        const query = resolveGetQueryParams(node, payload);
        return { method: 'GET', path, query };
      }
      case 'create': {
        const body = resolveBody(node.bodyTemplate, payload);
        return { method: 'POST', path, body };
      }
      case 'update': {
        const body = resolveBody(node.bodyTemplate, payload);
        return { method: 'PUT', path, body };
      }
      case 'patch': {
        const body = resolveBody(node.bodyTemplate, payload);
        return {
          method: 'PATCH',
          path,
          body,
          contentType: 'application/strategic-merge-patch+json'
        };
      }
      case 'delete': {
        return { method: 'DELETE', path };
      }
      default:
        throw errors.Validation({ message: `Unsupported action "${action}" for resource "${resourceDef.resource}"` });
    }
  };
};

export const prepareApplyManifest = async (node, payload, context) => {
  const defaultNamespace = renderTrimmed(node.namespaceTemplate, payload) || 'default';
  const rawContent = await resolveManifestContent(node, payload, context);
  const docs = resolveManifestDocuments(rawContent, defaultNamespace);

  const fieldManager = renderTrimmed(node.fieldManagerTemplate, payload) || 'gea';
  const query = { fieldManager };
  if (node.forceConflicts) {
    query.force = 'true';
  }

  return { docs, query };
};

const toErrorResult = (err) => {
  const type = isTimeoutError(err) ? 'TIMEOUT' : (err.code || err.type || err.name || 'Error');
  return { type, message: err.message };
};

// Applies each document in order. A non-2xx response from one document does not stop later
// documents from being applied. A thrown error (timeout/network/DNS failure) stops the remaining
// documents, since a transport failure likely affects every later request and manifests are
// ordered (e.g. a Namespace before the resources in it). If earlier documents were already applied,
// they are returned as partial results: { error, body: [...results, { kind, name, namespace, error }] }
// with no statusCode. If the first document fails, the error is rethrown.
export const executeApplyManifest = async (client, { docs, query }) => {
  const results = [];
  let failure;
  await mapSerialP(async (docItem) => {
    if (failure) { return; }
    const identity = {
      kind: docItem.kind,
      name: docItem.name,
      ...(docItem.namespace ? { namespace: docItem.namespace } : {})
    };
    try {
      const response = await client.request({
        method: 'PATCH',
        path: docItem.path,
        query,
        contentType: 'application/apply-patch+yaml',
        body: docItem.doc
      });
      results.push({ ...identity, statusCode: response.statusCode, body: response.body });
    } catch (err) {
      if (results.length === 0) {
        throw err;
      }
      failure = toErrorResult(err);
      results.push({ ...identity, error: failure });
    }
  }, docs);

  if (failure) {
    return { error: failure, body: results };
  }

  const firstError = results.find((r) => !is2xx(r.statusCode));
  const overallStatusCode = firstError ? firstError.statusCode : results[0]?.statusCode;

  const overallBody = results.length === 1 ? results[0] : results;

  return {
    statusCode: overallStatusCode,
    body: overallBody
  };
};

export const OPERATIONS = {
  // Pods
  listPods: createResourceOperation(RESOURCES.pods, 'list'),
  getPod: createResourceOperation(RESOURCES.pods, 'get'),
  createPod: createResourceOperation(RESOURCES.pods, 'create'),
  deletePod: createResourceOperation(RESOURCES.pods, 'delete'),
  getPodLogs: (node, payload) => {
    const ns = renderNamespace(node, payload, true);
    const name = renderName(node, payload, true);
    const path = buildResourcePath({ ...RESOURCES.pods, namespace: ns, name, subresource: 'log' });
    const query = resolveLogQueryParams(node, payload);
    return {
      method: 'GET',
      path,
      query,
      responseType: 'text',
      headers: {
        accept: 'text/plain, */*'
      }
    };
  },

  // Deployments
  listDeployments: createResourceOperation(RESOURCES.deployments, 'list'),
  getDeployment: createResourceOperation(RESOURCES.deployments, 'get'),
  createDeployment: createResourceOperation(RESOURCES.deployments, 'create'),
  updateDeployment: createResourceOperation(RESOURCES.deployments, 'update'),
  patchDeployment: createResourceOperation(RESOURCES.deployments, 'patch'),
  deleteDeployment: createResourceOperation(RESOURCES.deployments, 'delete'),

  // Services
  listServices: createResourceOperation(RESOURCES.services, 'list'),
  getService: createResourceOperation(RESOURCES.services, 'get'),
  createService: createResourceOperation(RESOURCES.services, 'create'),
  updateService: createResourceOperation(RESOURCES.services, 'update'),
  patchService: createResourceOperation(RESOURCES.services, 'patch'),
  deleteService: createResourceOperation(RESOURCES.services, 'delete'),

  // ConfigMaps
  listConfigMaps: createResourceOperation(RESOURCES.configmaps, 'list'),
  getConfigMap: createResourceOperation(RESOURCES.configmaps, 'get'),
  createConfigMap: createResourceOperation(RESOURCES.configmaps, 'create'),
  updateConfigMap: createResourceOperation(RESOURCES.configmaps, 'update'),
  patchConfigMap: createResourceOperation(RESOURCES.configmaps, 'patch'),
  deleteConfigMap: createResourceOperation(RESOURCES.configmaps, 'delete'),

  // Namespaces
  listNamespaces: createResourceOperation(RESOURCES.namespaces, 'list'),
  getNamespace: createResourceOperation(RESOURCES.namespaces, 'get'),

  // Nodes
  listNodes: createResourceOperation(RESOURCES.nodes, 'list'),
  getNode: createResourceOperation(RESOURCES.nodes, 'get'),

  // Custom escape hatch
  custom: (node, payload) => {
    const method = renderTrimmed(node.customMethodTemplate, payload).toUpperCase() || 'GET';
    const path = renderTrimmed(node.customPathTemplate, payload);
    if (!path) {
      throw errors.MissingField({ title: 'Custom Path' });
    }
    const body = METHODS_WITH_BODY.has(method)
      ? resolveBody(node.customBodyTemplate, payload)
      : null;
    return { method, path, body };
  }
};

export const CUSTOM_OPERATIONS = new Map();

export const registerOperation = (name, handler) => {
  CUSTOM_OPERATIONS.set(name, handler);
};

export const unregisterOperation = (name) => {
  CUSTOM_OPERATIONS.delete(name);
};

class KubernetesNode {
  /* Example Config:
  Interacts with the Kubernetes API.
  {
    authMode: <String - Optional: how to authenticate (inCluster|inline). Default inCluster. inCluster uses KUBERNETES_SERVICE_HOST and KUBERNETES_SERVICE_PORT_HTTPS (or KUBERNETES_SERVICE_PORT) to find the API server, falling back to https://kubernetes.default.svc, and reads the mounted service account token and, unless disableSSLVerification is true, the CA certificate. inline uses the settings below>,
    kubernetesUrlTemplate: <String - Required when authMode is inline, otherwise ignored: template for the Kubernetes API server URL, e.g. https://kubernetes.example.com:6443>,
    tokenSource: <String - Optional: where the bearer token comes from when authMode is inline (stringTemplate|diskPath). Default stringTemplate>,
    tokenTemplate: <String - Required when authMode is inline and tokenSource is stringTemplate: template for the bearer token>,
    tokenDiskPathTemplate: <String - Required when authMode is inline and tokenSource is diskPath: template for the path to the bearer token file on disk>,
    caCertSource: <String - Optional: where a custom CA certificate comes from when authMode is inline (none|stringTemplate|diskPath). Default none>,
    caCertTemplate: <String - Required when caCertSource is stringTemplate: template for the custom CA certificate in PEM format. Ignored when disableSSLVerification is true>,
    caCertDiskPathTemplate: <String - Required when caCertSource is diskPath: template for the path to the CA certificate file on disk. Ignored when disableSSLVerification is true>,
    disableSSLVerification: <Boolean - Optional: when true, skips verification of the server certificate and does not load any CA certificate, in both inCluster and inline modes. Default false>,
    timeoutTemplate: <String - Optional: template for the request timeout in milliseconds. Defaults to the external call timeout, which is also the maximum allowed value>,
    operationTemplate: <String - Required: template for the operation to run. Built-in operations are listPods, getPod, createPod, deletePod, getPodLogs,
      listDeployments, getDeployment, createDeployment, updateDeployment, patchDeployment, deleteDeployment,
      listServices, getService, createService, updateService, patchService, deleteService,
      listConfigMaps, getConfigMap, createConfigMap, updateConfigMap, patchConfigMap, deleteConfigMap,
      listNamespaces, getNamespace, listNodes, getNode, applyManifest (alias: apply), and custom. Operations added with registerOperation are also accepted>,
    namespaceTemplate: <String - Optional: template for the Kubernetes namespace. Required for namespaced operations other than list, where it is optional and omitting it lists cluster-wide>,
    nameTemplate: <String - Required for get, update, patch, and delete operations and getPodLogs: template for the resource name>,
    labelSelectorTemplate: <String - Optional: label selector query for list operations>,
    fieldSelectorTemplate: <String - Optional: field selector query for list operations>,
    limitTemplate: <String - Optional: maximum number of items to return from list operations>,
    continueTemplate: <String - Optional: continue token for paginating list operations>,
    resourceVersionTemplate: <String - Optional: resource version for list and get operations>,
    resourceVersionMatch: <String - Optional: resource version match strategy for list operations (e.g. Exact, NotOlderThan). Only sent when resourceVersionTemplate is set>,
    bodyTemplate: <String - Optional: JSON body template for create, update, and patch operations. Patches are sent as application/strategic-merge-patch+json>,
    containerTemplate: <String - Optional: container name for getPodLogs>,
    tailLinesTemplate: <String - Optional: number of trailing log lines for getPodLogs>,
    manifestSource: <String - stringTemplate|payloadPath|diskPath (default stringTemplate)>,
    manifestTemplate: <String - Multi-document YAML/JSON template when manifestSource is stringTemplate>,
    manifestPayloadPath: <String - Payload path to YAML/JSON string or object when manifestSource is payloadPath>,
    manifestDiskPathTemplate: <String - Path to YAML/JSON file on disk when manifestSource is diskPath>,
    fieldManagerTemplate: <String - Field manager query parameter for server-side apply (default gea)>,
    forceConflicts: <Boolean[false] - if true, force ownership conflicts during server-side apply>,
    customMethodTemplate: <String - Optional: HTTP method for the custom operation. Default GET>,
    customPathTemplate: <String - Required for the custom operation: API path>,
    customBodyTemplate: <String - Optional: JSON body template for the custom operation. Only sent for POST, PUT, and PATCH>,
    resultDiskPathTemplate: <String - Optional: template for a path on disk to write the response body to. Supported for any operation. When set and the response is 2xx with a body, the response body is written to the file (a string, Buffer, or object body from a custom operation handler is written as is, with objects JSON stringified) and the result body becomes the resolved disk path>,
    shouldAppend: <Boolean - Optional: append to the file instead of overwriting it. Default false>,
    errorIfFileExists: <Boolean - Optional: when true, cancel and error if the file already exists. Default false>,
    encodingTemplate: <String - Optional: template for the encoding to use when writing to disk. Default utf8>,
    resultPath: <String - Optional: payload path for { statusCode, body } or { error: { type, message } }. If omitted, nothing is written to the payload>
  }
  Notes:
    A non-2xx response is not an error: it is written as { statusCode, body } like any other response. An { error: { type, message } } result is written only for
    transport failures (socket, DNS, TIMEOUT) and for failures while writing to disk or inside a custom operation handler. type is TIMEOUT for timeouts,
    otherwise the error code, type, or name.
    An in-cluster failure to read the service account token is written to resultPath as { error: { type: 'KubernetesAuthError', message } } instead of throwing.
    Configuration errors (MissingField, Validation, InvalidJsonTemplate) throw.
  */

  constructor(id, outputIds, config = {}) {
    this.id = id;
    this.outputIds = outputIds;

    this.authMode = config.authMode || 'inCluster';
    this.kubernetesUrlTemplate = config.kubernetesUrlTemplate;
    this.tokenSource = config.tokenSource || 'stringTemplate';
    this.tokenTemplate = config.tokenTemplate;
    this.tokenDiskPathTemplate = config.tokenDiskPathTemplate;
    this.caCertSource = config.caCertSource || 'none';
    this.caCertTemplate = config.caCertTemplate;
    this.caCertDiskPathTemplate = config.caCertDiskPathTemplate;
    this.disableSSLVerification = niceBooleanCast(config.disableSSLVerification);
    this.timeoutTemplate = config.timeoutTemplate;

    this.operationTemplate = config.operationTemplate;
    this.namespaceTemplate = config.namespaceTemplate;
    this.nameTemplate = config.nameTemplate;

    this.labelSelectorTemplate = config.labelSelectorTemplate;
    this.fieldSelectorTemplate = config.fieldSelectorTemplate;
    this.limitTemplate = config.limitTemplate;
    this.continueTemplate = config.continueTemplate;
    this.resourceVersionTemplate = config.resourceVersionTemplate;
    this.resourceVersionMatch = config.resourceVersionMatch;

    this.bodyTemplate = config.bodyTemplate;
    this.containerTemplate = config.containerTemplate;
    this.tailLinesTemplate = config.tailLinesTemplate;

    this.manifestSource = config.manifestSource || 'stringTemplate';
    this.manifestTemplate = config.manifestTemplate;
    this.manifestPayloadPath = config.manifestPayloadPath;
    this.manifestDiskPathTemplate = config.manifestDiskPathTemplate;
    this.fieldManagerTemplate = config.fieldManagerTemplate;
    this.forceConflicts = niceBooleanCast(config.forceConflicts);

    this.customMethodTemplate = config.customMethodTemplate;
    this.customPathTemplate = config.customPathTemplate;
    this.customBodyTemplate = config.customBodyTemplate;

    this.resultDiskPathTemplate = config.resultDiskPathTemplate;
    this.shouldAppend = niceBooleanCast(config.shouldAppend);
    this.errorIfFileExists = niceBooleanCast(config.errorIfFileExists);
    this.encodingTemplate = config.encodingTemplate || 'utf8';

    this.resultPath = config.resultPath;
  }

  async run(context, payload) {
    const operationName = renderTrimmed(this.operationTemplate, payload);
    if (!operationName) {
      throw errors.MissingField({ title: 'Operation' });
    }

    const customHandler = CUSTOM_OPERATIONS.get(operationName);
    const standardHandler = OPERATIONS[operationName];
    const isApplyOperation = operationName === 'applyManifest' || operationName === 'apply';
    if (!customHandler && !standardHandler && !isApplyOperation) {
      throw errors.Validation({ message: `Unsupported Kubernetes operation "${operationName}"` });
    }

    // 1. Validation & request preparation (OUTSIDE try/catch)
    // Synchronous config/authoring errors (MissingField, Validation, InvalidJsonTemplate) throw immediately.
    // A KubernetesAuthError is written to resultPath instead of throwing.
    let auth;
    try {
      auth = await resolveAuth(this, payload, context);
    } catch (err) {
      if (err.name === 'KubernetesAuthError') {
        let p = payload;
        if (this.resultPath) {
          p = payloadHelper.set(this.resultPath, {
            error: { type: err.name, message: err.message }
          }, payload);
        }
        return [this.outputIds, p];
      }
      throw err;
    }

    const timeoutMs = getTimeoutTemplate(this, payload, context.externalTimeout);

    let plan;
    let request = null;
    if (isApplyOperation) {
      plan = await prepareApplyManifest(this, payload, context);
    } else if (standardHandler) {
      request = standardHandler(this, payload, timeoutMs);
    }

    let diskTarget;
    if (this.resultDiskPathTemplate) {
      diskTarget = await resolveAndValidateDiskPath(this, payload, context);
    }

    const client = {
      request: (options) => makeKubernetesRequest({
        ...auth,
        timeoutMs,
        ...options
      })
    };

    // 2. Network execution (INSIDE try/catch)
    // Transport/socket/DNS/timeout errors, disk write failures, and custom handler errors land in catch
    let result;
    try {
      if (isApplyOperation) {
        result = await executeApplyManifest(client, plan);
      } else if (customHandler) {
        result = await customHandler(client, this, payload);
      } else {
        const requestOptions = diskTarget
          ? { ...request, responseType: 'stream' }
          : request;

        const response = await client.request(requestOptions);
        let body = response.body;

        // A non-2xx streamed response is read into memory so the error body is returned, not written.
        if (diskTarget && body && !is2xx(response.statusCode) && typeof body.pipe === 'function') {
          const raw = await text(body);
          try {
            body = LJSON.parse(raw);
          } catch {
            body = raw;
          }
        }

        result = {
          statusCode: response.statusCode,
          body
        };
      }

      // Shared by every operation type: write a successful body to disk and return the path instead.
      if (diskTarget && is2xx(result?.statusCode) && !isNil(result.body)) {
        await writeFileToDisk(toDiskStream(result.body), diskTarget.diskPath, {
          flags: getFlagOption(this),
          encoding: diskTarget.encoding
        });
        result = { statusCode: result.statusCode, body: diskTarget.diskPath };
      }
    } catch (err) {
      result = { error: toErrorResult(err) };
    }

    if (this.resultPath) {
      payload = payloadHelper.set(this.resultPath, result, payload);
    }
    return [this.outputIds, payload];
  }
}

export default KubernetesNode;
