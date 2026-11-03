import t from 'tcomb';
import Peripheral from './peripheral.js';
import { ObjectIdStr } from './lib/refinements.js';

const PeripheralDict = t.dict(ObjectIdStr, t.maybe(Peripheral));

export default PeripheralDict;
