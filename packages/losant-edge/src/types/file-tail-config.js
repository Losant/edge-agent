import t from 'tcomb';
import FilePath from './file-path.js';
import { ENCODINGS } from '../constants.js';

const FileTailConfig = t.struct({
  tailId: t.String, // tail ids are globally uniq, they contain the flow ID
  path: FilePath,
  encoding: t.maybe(ENCODINGS),
  delimiter: t.maybe(t.String),
  byteLength: t.maybe(t.String)
}, {
  name: 'FileTailConfig',
  strict: true
});

export default FileTailConfig;
