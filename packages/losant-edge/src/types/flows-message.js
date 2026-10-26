import t from 'tcomb';
import Application from './application.js';
import Device from './device.js';
import RawFlow from './raw-flow.js';
import { ObjectIdStr, ObjectIdOrCustomNodeId } from './lib/refinements.js';

const FlowMessageMode = t.enums.of(['partial', 'complete'], 'FlowMessageMode');
const FlowsDict = t.dict(ObjectIdOrCustomNodeId, t.maybe(RawFlow));
const DebuggingDict = t.dict(ObjectIdStr, t.Boolean);

const FlowsMessage = t.struct({
  time: t.maybe(t.Number),
  application: Application,
  device: t.maybe(Device),
  flows: FlowsDict,
  debugging: DebuggingDict,
  mode: t.maybe(FlowMessageMode)
}, {
  name: 'FlowsMessage',
  strict: true,
  defaultProps: {
    flows: {},
    debugging: {},
    application: {}
  }
});

export default FlowsMessage;
