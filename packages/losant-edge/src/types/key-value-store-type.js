import { T } from 'omnibelt';
import t from 'tcomb';

const KeyValueStoreType = t.refinement(t.Any, T, 'KeyValueStoreType');

export default KeyValueStoreType;
