import t from 'tcomb';
import Attribute from './attribute.js';
import { DeviceId } from './lib/refinements.js';

const Peripheral = t.struct({
  name: t.String,
  id: DeviceId,
  deviceClass: t.String,
  tags: t.Object,
  attributes: t.list(Attribute),

  // these two are not currently used; they are reserved for forward compatibility
  // (these fields can't be sent to old agents, and there are broadcast peripheral messages)
  parentId: t.maybe(DeviceId),
  creationDate: t.maybe(t.String)
}, {
  name: 'Peripheral',
  strict: true
});

export default Peripheral;
