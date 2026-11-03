import t from 'tcomb';
import FilePath from './file-path.js';
import { ENCODINGS, DEFAULT_SERIAL_CONFIG } from '../constants.js';

const SerialConfig = t.struct({
  serialId: t.String,
  path: FilePath,
  delimiter: t.maybe(t.String),
  delimiterEncoding: t.maybe(ENCODINGS),
  encoding: ENCODINGS,
  byteLength: t.maybe(t.String),
  baudRate: t.Number,
  dataBits: t.Number,
  parity: t.String,
  rtscts: t.Boolean,
  stopBits: t.Number,
  writeOnOpen: t.maybe(t.String),
  writeOnOpenEncoding: t.maybe(ENCODINGS)
}, {
  name: 'SerialConfig',
  strict: true,
  defaultProps: DEFAULT_SERIAL_CONFIG
});

export default SerialConfig;
