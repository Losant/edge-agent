import { contextify } from './common.js';
import abstractCustomNodeExecuteNodeTests from './abstract/custom-node-execute-node-spec.js';

describe('CustomNodeExecuteNode Using Fake NodeRunner', function() {
  abstractCustomNodeExecuteNodeTests(contextify);
});
