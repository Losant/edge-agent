import t from 'tcomb';
import { ObjectIdStr } from './lib/refinements.js';
import FlowClass from './flow-class.js';

const RawFlow = t.struct({
  name: t.String,
  fileName: t.maybe(t.String),
  globals: t.Object,
  triggers: t.Array,
  nodes: t.Array,
  version: t.String,
  versionId: t.maybe(ObjectIdStr),
  etag: t.maybe(t.String),
  flowClass: t.maybe(FlowClass),
  customNodeConfig: t.maybe(t.Object),
  minimumAgentVersion: t.String
}, {
  name: 'RawFlow',
  strict: true
});

export default RawFlow;
