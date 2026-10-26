import { isNil, keys, forEachSerialP } from 'omnibelt';
import errors from 'losant-nodejs-utils/src/errors.js';
import * as losantNodes from 'losant-nodes';
import * as edgeNodes from './nodes/index.js';

export const availableNodes = {
  ...losantNodes,
  ...edgeNodes
};

export const nodeFromConfig = (nodeInfo) => {
  const NodeClass = availableNodes[nodeInfo.type];
  if (isNil(NodeClass)) {
    return {
      run: () => {
        throw errors.UnknownNodeType({ title: nodeInfo.type });
      }
    };
  }
  return new NodeClass(nodeInfo.id, nodeInfo.outputIds, nodeInfo.config);
};

export const shutdown = async () => {
  return forEachSerialP((name) => {
    const klass = availableNodes[name];
    if (klass.shutdown) { return klass.shutdown(); }
  }, keys(availableNodes));
};
