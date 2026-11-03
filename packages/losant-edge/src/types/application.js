import t from 'tcomb';
import { ObjectIdStr } from './lib/refinements.js';
import { GATEWAY_ID_DEFAULT } from '../constants.js';

const Application = t.struct({
  name: t.String,
  id: ObjectIdStr,
  globals: t.Object
}, {
  name: 'Application',
  strict: true,
  defaultProps: {
    name: 'UNKNOWN_APPLICATION_NAME',
    id: GATEWAY_ID_DEFAULT,
    globals: {}
  }
});
export default Application;
