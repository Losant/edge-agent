import {
  isNilOrEmpty, compose, complement, curry, cond, always,
  startCase, T, equals, has
} from 'omnibelt';
import t from 'tcomb';

// :: Predicate -> String -> Any -> String|Nil
const validationMessage = curry((validator, name, value) => {
  const niceName = startCase(name);
  return cond([
    [isNilOrEmpty, always(`${niceName} is required`)],
    [complement(validator), always(`The provided ${niceName} (${value}) is invalid`)],
    [T, T]
  ])(value);
});

// Custom :: (Predicate, t.String | t.Object) -> TcombRefinement
// NOTE: https://github.com/gcanti/tcomb-validation#customise-error-messages
// NOTE: Have to use `t.Any` on these guys, so `tcomb` will use our messages
export default (validator, name) => {
  const subTypeValidationMessage = validationMessage(validator, name);

  // allows passing in { name: 'foo' } like other types
  if (has('name', name)) { name = name.name; }

  const Subtype = t.refinement(
    t.Any,
    compose(equals(true), subTypeValidationMessage),
    name
  );

  Subtype.getValidationErrorMessage = subTypeValidationMessage;

  return Subtype;
};
