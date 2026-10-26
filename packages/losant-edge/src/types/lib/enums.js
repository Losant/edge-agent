import { join, equalsAny } from 'omnibelt';
import t from 'tcomb';
import Custom from './custom.js';

const Enums = t.func([t.Array, t.union([ t.Object, t.String ])], t.Any).of(
  (values, name) => {
    const enums = Custom(equalsAny(values), name);
    enums.allowed = join(', ', values);
    return enums;
  }
);

export default Enums;
