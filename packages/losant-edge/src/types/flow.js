import t from 'tcomb';
import { ObjectIdStr, ObjectIdOrCustomNodeId } from './lib/refinements.js';
import FlowClass from './flow-class.js';

const Flow = t.struct({
  id: ObjectIdOrCustomNodeId,
  name: t.String,
  fileName: t.maybe(t.String),
  globals: t.Object, // these are now the merged app and raw flow globals
  triggers: t.Array,
  nodes: t.Object, // these are actual node classes
  version: t.String,
  versionId: t.maybe(ObjectIdStr),
  debuggingEnabled: t.Boolean,
  customNodeDebug: t.maybe(t.Boolean),
  minimumAgentVersion: t.String,
  etag: t.maybe(t.String),
  flowClass: t.maybe(FlowClass),
  customNodeConfig: t.maybe(t.Object),
  startTrigger: t.maybe(t.Object)
}, {
  name: 'Flow',
  strict: true
});

export default Flow;
