import validator from 'is-my-json-valid';
import * as payloadHelper from 'losant-handlebars';
import RE2 from 'losant-handlebars/src/get-re2.js';

class ValidatePayloadNode {

  /* Example Config:

  { schema: <String - Required: the JSON schema to validate the payload against, or a payload path to the schema when schemaType is path>,
    schemaType: <String - Optional: json|path. Whether schema is a JSON template or a payload path to the schema. Default json>,
    toValidatePath: <String - Optional: payload path to the part of the payload to validate. If not set, validates the entire payload>,
    errorsPath: <String - Optional: payload path to place error information at. Receives an array of errors, or [] when the payload is valid> }

    Notes: outputIds[1] is the true path, taken if the payload validates. outputIds[0] is the false path,
    taken if it does not validate, if the schema is invalid, or if the validator throws.
    For an invalid schema or a validator failure, errorsPath receives [{ type: 'VALIDATE_SCHEMA', message }].
    When toValidatePath is set, it is prepended to error field names. Otherwise the leading "data" prefix is stripped.
  */

  constructor(id, outputIds, config) {
    this.id = id;
    this.outputIds = outputIds;
    this.schema = config.schema;
    this.schemaType = config.schemaType || 'json';
    this.errorsPath = config.errorsPath;
    this.toValidatePath = config.toValidatePath;
  }

  run(context, payload) {
    let schema;
    if (this.schemaType === 'path') {
      schema = payloadHelper.lookup(this.schema, payload);
    } else {
      schema = payloadHelper.render(this.schema, payload);
    }

    let validate;
    try {
      validate = validator(schema, { greedy: !!this.errorsPath, regexLib: RE2 });
    } catch (e) {
      if (this.errorsPath) {
        payload = payloadHelper.set(this.errorsPath, [{ type: 'VALIDATE_SCHEMA', message: e.message }], payload);
      }
      const resultIds = this.outputIds[0]; // take the false path
      return [ resultIds, payload ];
    }

    let toValidate = payload;
    if (this.toValidatePath) {
      toValidate = payloadHelper.lookup(this.toValidatePath, payload);
    }

    let result;
    try {
      result = validate(toValidate);
    } catch (e) {
      // something is wrong enough with the schema or input
      // that the validator exploded
      if (this.errorsPath) {
        payload = payloadHelper.set(this.errorsPath, [{ type: 'VALIDATE_SCHEMA', message: e.message }], payload);
      }
      const resultIds = this.outputIds[0]; // take the false path
      return [ resultIds, payload ];
    }

    if (this.errorsPath) {
      const schemaErrors = result ? [] : validate.errors;
      this.translateErrorFieldNames(schemaErrors, this.toValidatePath);
      payload = payloadHelper.set(this.errorsPath, schemaErrors, payload);
    }

    const resultIds = this.outputIds[result ? 1 : 0];
    return [ resultIds, payload ];
  }

  translateErrorFieldNames(schemaErrors, prepend) {
    // note: for complex fields, the field names won't match exactly
    // our payload path forms
    if (prepend) {
      schemaErrors.forEach((error) => {
        error.field = error.field.replace(/^data/, prepend);
      });
    } else {
      schemaErrors.forEach((error) => {
        error.field = error.field.replace(/^data.?/, '');
      });
    }
  }

}

export default ValidatePayloadNode;
