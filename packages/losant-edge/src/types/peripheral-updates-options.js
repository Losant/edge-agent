import Enums from './lib/enums.js';
import { SUBSCRIBE_TO_PERIPHERAL_UPDATES_DEFAULT } from '../constants.js';
import { stringToBoolean } from 'omnibelt';

const PeripheralUpdatesOptions = Enums(
  [
    true,
    false,
    'floating',
    'peripheral'
  ],
  'PeripheralUpdatesOptions'
);

PeripheralUpdatesOptions.coerce = (value) => {
  if (value === undefined) { return SUBSCRIBE_TO_PERIPHERAL_UPDATES_DEFAULT; }
  if (PeripheralUpdatesOptions.allowed.includes(value)) { return value; }
  return stringToBoolean(value);
};

export default PeripheralUpdatesOptions;
