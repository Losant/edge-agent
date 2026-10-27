import t from 'tcomb';
import { DeviceId } from './lib/refinements.js';
import { GATEWAY_ID_DEFAULT } from '../constants.js';
import Attribute from './attribute.js';

const Device = t.struct({
  name: t.String,
  id: DeviceId,
  tags: t.Object,

  // these three are only sent and set for GEA >= 1.33.0
  parentId: t.maybe(DeviceId),
  creationDate: t.maybe(t.String),
  attributes: t.maybe(t.list(Attribute))
}, {
  name: 'Device',
  strict: true,
  defaultProps: {
    name: 'UNKNOWN_DEVICE_NAME',
    id: GATEWAY_ID_DEFAULT,
    tags: {}
  }
});

export default Device;
