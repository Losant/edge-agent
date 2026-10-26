import { getTimeoutTemplate, renderToNetworkPort } from 'losant-nodes/src/lib/common.js';
import { trim } from 'omnibelt';
import errors from 'losant-nodejs-utils/src/errors.js';
import { renderToString } from 'losant-handlebars';

const validateAmsNetId = (netId, type) => {
  if (!netId) {
    throw errors.Validation({ message: `${type}AmsNetId is required.` });
  }
  const netParts = netId.split('.');
  if (netParts.length !== 6) {
    throw errors.Validation({ message: `${type}AmsNetId must be exactly 6 octets.` });
  }
  netParts.forEach((part) => {
    const partNum = Number(part);
    if (`${partNum}` !== part || !isFinite(partNum) || partNum < 0 || partNum > 255) {
      throw errors.Validation({ message: `${type}AmsNetId must contain numbers from 0 to 255.` });
    }
  });
};

export const validateClientConfig = async ({
  localAmsNetId,
  localAdsPort,
  targetAmsNetId,
  targetAdsPort,
  routerHost,
  routerTcpPort,
  timeout
}) => {
  validateAmsNetId(localAmsNetId, 'local');
  validateAmsNetId(targetAmsNetId, 'target');
  if (!routerHost) {
    throw errors.Validation({ message: 'routerHost is required.' });
  }
  return {
    localAmsNetId,
    localAdsPort,
    targetAmsNetId,
    targetAdsPort,
    routerAddress: routerHost,
    routerTcpPort,
    timeoutDelay: timeout
  };
};

export const renderAndValidateClientConfig = async (node, context, payload) => {
  const localAmsNetId = trim(renderToString(node.localAmsNetIdTemplate, payload));
  const localAdsPort = renderToNetworkPort({ template: node.localAdsPortTemplate, fieldName: 'localAdsPortTemplate', payload, defaultValue: '' });
  const targetAmsNetId = trim(renderToString(node.targetAmsNetIdTemplate, payload));
  const targetAdsPort = renderToNetworkPort({ template: node.targetAdsPortTemplate, fieldName: 'targetAdsPortTemplate', payload, defaultValue: 851 });
  const routerHost = trim(renderToString(node.routerHostTemplate, payload));
  const routerTcpPort = renderToNetworkPort({ template: node.routerTcpPortTemplate, fieldName: 'routerTcpPortTemplate', payload, defaultValue: 48898 });
  const timeout = getTimeoutTemplate(node, payload, context.externalTimeout);
  return validateClientConfig({
    localAmsNetId,
    localAdsPort,
    targetAmsNetId,
    targetAdsPort,
    routerHost,
    routerTcpPort,
    timeout
  });
};

