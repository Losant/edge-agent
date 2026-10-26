import { T } from 'omnibelt';
import t from 'tcomb';

const GlobalStoreType = t.refinement(t.Any, T, 'GlobalStoreType');

export default GlobalStoreType;
