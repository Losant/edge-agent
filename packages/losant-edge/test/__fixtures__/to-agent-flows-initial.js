export default {
  application: {
    name: 'TestApp',
    id: 'aaaa1111bbbb2222cccc3333',
    globals: {}
  },
  device: {
    name: 'TestDevice',
    id: '5a72186e811b0700075df66e',
    tags: {}
  },
  mode: 'complete',
  flows: {
    '111111111111111111111111': {
      name: 'workflow-one-name',
      globals: {},
      triggers: [{
        type: 'request',
        key: '1111',
        meta: { uiId: '1111' },
        outputIds: [['test-node']]
      }],
      nodes: [{
        id: 'test-node',
        type: 'DebugNode',
        config: { message: 'hi mom' }
      }],
      version: 'workflow-one-version',
      etag: '5a6b58e2fa016b90d970c97z',
      versionId: '111111111111111111111112',
      minimumAgentVersion: '1.0.0'
    },
    '222222222222222222222222': {
      name: 'workflow-two-name',
      globals: {},
      triggers: [],
      nodes: [],
      version: 'workflow-two-version',
      etag: '5a6b58e2fa016b90d970c97y',
      versionId: '222222222222222222222223',
      minimumAgentVersion: '1.0.0'
    },
    '333333333333333333333333': {
      name: 'workflow-two-name',
      globals: {},
      triggers: [],
      nodes: [],
      version: 'workflow-two-version',
      versionId: '333333333333333333333334',
      etag: '5a6b58e2fa016b90d970c97x',
      minimumAgentVersion: '1.0.0'
    }
  }
};
