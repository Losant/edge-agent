import t from 'tcomb';
import PeripheralDict from './peripheral-dict.js';
import { DeviceId } from './lib/refinements.js';

const PeripheralsMessageMode = t.enums.of(['partial', 'complete'], 'PeripheralsMessageMode');

const PeripheralsMessage = t.struct({
  time: t.maybe(t.Number),
  peripherals: PeripheralDict,
  mode: t.maybe(PeripheralsMessageMode),
  ignore: t.maybe(DeviceId)
}, {
  name: 'PeripheralsMessage',
  strict: true,
  defaultProps: {
    peripherals: {}
  }
});

export default PeripheralsMessage;
