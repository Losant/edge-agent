import t from 'tcomb';
import { Namespace } from './lib/refinements.js';

const OpcuaItemConfig = t.struct({
  nameSpace: Namespace,
  identifier: t.String
}, {
  name: 'OpcuaItemConfig',
  strict: true,
  defaultProps: {
    nameSpace: '0',
    identifier: 'i=2253'
  }
});

export default OpcuaItemConfig;
