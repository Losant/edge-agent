import t from 'tcomb';

const PromiseType = t.irreducible(
  'PromiseType',
  (x) => x instanceof Promise
);

export default PromiseType;
