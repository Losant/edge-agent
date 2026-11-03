import t from 'tcomb';
import { prop, toNumber } from 'omnibelt';
import Struct from './lib/struct.js';
import Custom from './lib/custom.js';

const PositiveInteger = Custom(
  (value) => {
    const n = toNumber(value);
    return isFinite(n) && n >= 1 && n % 1 === 0;
  },
  'PositiveInteger'
);

const OtelReportingConf = Struct({
  enabled: t.Boolean,
  intervalSeconds: PositiveInteger
}, {
  name: 'OtelReportingConf',
  strict: true,
  defaultProps: {
    enabled: false,
    intervalSeconds: 30
  }
});

OtelReportingConf.fromArgs = prop('otelReporting');

export default OtelReportingConf;
