import t from 'tcomb';

const BufferType = t.irreducible(
  'BufferType',
  (x) => x instanceof Buffer
);

export default BufferType;
