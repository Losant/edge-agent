import t from 'tcomb';

const Attribute = t.struct({
  name: t.String,
  dataType: t.enums.of(['string', 'number', 'gps', 'boolean', 'blob']),
  attributeTags: t.Object,
  // contentType is never sent for a Peripheral, since this field was not always in this definition
  // and peripheral messages are broadcast (and so can hit older edge agents)
  contentType: t.maybe(t.String)
}, {
  name: 'Attribute',
  strict: true
});
export default Attribute;
