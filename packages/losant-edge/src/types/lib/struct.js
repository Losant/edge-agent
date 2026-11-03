import { keys, compose, unary } from 'omnibelt';
import t from 'tcomb';

// NOTE: mergeSpec({ keys: compose(keys, path('meta.props')) }),
// ... doesn't work because mergeSpec removes prototype (any ramda method).
const exposeKeys = (x) => {
  x.keys = keys(x.meta.props);
  return x;
};

const exposeUnary = (x) => {
  x.unary = unary(x);
  return x;
};

export default compose(
  exposeUnary,
  exposeKeys,
  t.struct
);
