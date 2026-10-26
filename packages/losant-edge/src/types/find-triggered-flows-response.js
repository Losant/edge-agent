import t from 'tcomb';

import Application from './application.js';
import Device from './device.js';
import Flows from './flows.js';
import PeripheralDict from './peripheral-dict.js';

const FindTriggeredFlowsResponse = t.struct({
  app: Application,
  device: Device,
  flows: Flows,
  peripherals: PeripheralDict
}, {
  name: 'FindTriggeredFlowsResponse',
  defaultProps: {
    app: {},
    device: {},
    flows: [],
    peripherals: {}
  }
});

export default FindTriggeredFlowsResponse;
