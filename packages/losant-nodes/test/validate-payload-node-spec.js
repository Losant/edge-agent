import './common.js';
import ValidatePayloadNode from '../src/validate-payload-node.js';

describe('ValidatePayloadNode', () => {
  it('should branch true correctly', () => {
    const schema = {
      required: true,
      type: 'object',
      properties: {
        bar: { required: true, type: 'integer' },
        foo: { required: true, type: 'integer' }
      }
    };

    const node = new ValidatePayloadNode('id', [[5], [4]], { schema: JSON.stringify(schema), schemaType: 'json' });

    const results = node.run({}, { foo: 1, bar: 2 });
    results[0].should.deepEqual([4]);
    results[1].should.deepEqual({ foo: 1, bar: 2 });
  });

  it('should branch true correctly, when resolving a path', () => {
    const schema = {
      required: true,
      type: 'object',
      properties: {
        bar: { required: true, type: 'integer' },
        foo: { required: true, type: 'integer' }
      }
    };

    const node = new ValidatePayloadNode('id', [[5], [4]], { schema: 'schema', schemaType: 'path', toValidatePath: 'toValidate' });
    const payload = { toValidate: { foo: 1, bar: 2 }, schema };
    const results = node.run({}, payload);
    results[0].should.deepEqual([4]);
    results[1].should.deepEqual(payload);
  });

  it('should error when json schema is invalid', () => {
    const schema = '{"invalid"';
    const node = new ValidatePayloadNode('id', [[5], [4]], { errorsPath: 'err', schema, schemaType: 'json', toValidatePath: 'toValidate' });
    const payload = { toValidate: { foo: 1, bar: 2 } };
    const results = node.run({}, payload);
    results[0].should.deepEqual([5]);
    results[1].err.should.deepEqual([ { type: 'VALIDATE_SCHEMA', message: 'Expected \':\' after property name in JSON at position 10 (line 1 column 11)' } ]);
  });

  it('should error when path to json schema is invalid', () => {
    const schema = '{"invalid"';
    const node = new ValidatePayloadNode('id', [[5], [4]], { errorsPath: 'err', schema: 'schema', schemaType: 'path', toValidatePath: 'toValidate' });
    const payload = { toValidate: { foo: 1, bar: 2 }, schema };
    const results = node.run({}, payload);
    results[0].should.deepEqual([5]);
    results[1].err.should.deepEqual([ { type: 'VALIDATE_SCHEMA', message: 'Expected \':\' after property name in JSON at position 10 (line 1 column 11)' } ]);
  });

  it('should error when path to json schema does not exist', () => {
    const node = new ValidatePayloadNode('id', [[5], [4]], { errorsPath: 'err', schema: 'dne', schemaType: 'path', toValidatePath: 'toValidate' });
    const payload = { toValidate: { foo: 1, bar: 2 } };
    const results = node.run({}, payload);
    results[0].should.deepEqual([5]);
    results[1].err.should.deepEqual([ { type: 'VALIDATE_SCHEMA', message: 'Cannot read properties of undefined (reading \'properties\')' } ]);
  });

  it('should error when path to validate not exist', () => {
    const schema = '{ "properties": { "offset": { "type": "string", "pattern": "^\\\\d+$" }, "rowsPerPage": { "type": "string", "pattern": "^\\\\d+$" }, "unitIds": { "type": "string" }, "sortColumn": { "type": "string", "enum": ["name", "id", "creationDate", "lastUpdated"] } } }';

    const node = new ValidatePayloadNode('id', [[5], [4]], { errorsPath: 'err', schema, schemaType: 'json', toValidatePath: 'data.query' });
    const payload = { data: {} };
    const results = node.run({ }, payload);
    results[0].should.deepEqual([5]);
    results[1].err.should.deepEqual([ { type: 'VALIDATE_SCHEMA', message: 'Cannot read properties of null (reading \'offset\')' } ]);
  });

  it('should branch true correctly, with errors path set', () => {
    const schema = {
      required: true,
      type: 'object',
      properties: {
        bar: { required: true, type: 'integer' },
        foo: { required: true, type: 'integer' }
      }
    };

    const node = new ValidatePayloadNode('id', [[5], [4]], {
      schema: JSON.stringify(schema),
      errorsPath: 'myErr'
    });

    const results = node.run({}, { foo: 1, bar: 2 });
    results[0].should.deepEqual([4]);
    results[1].should.deepEqual({ foo: 1, bar: 2, myErr: [] });
  });

  it('should branch true correctly, with path, with errors path set', () => {
    const schema = {
      required: true,
      type: 'object',
      properties: {
        bar: { required: true, type: 'integer' },
        foo: { required: true, type: 'integer' }
      }
    };

    const node = new ValidatePayloadNode('id', [[5], [4]], {
      schema: JSON.stringify(schema),
      errorsPath: 'myErr',
      toValidatePath: 'myBody.what'
    });

    const results = node.run({}, { myBody: { what: { foo: 1, bar: 2 } } });
    results[0].should.deepEqual([4]);
    results[1].should.deepEqual({ myBody: { what: { foo: 1, bar: 2 } }, myErr: [] });
  });

  it('should branch false correctly', () => {
    const schema = {
      required: true,
      type: 'object',
      properties: {
        bar: { required: true, type: 'string' },
        foo: { required: true, type: 'integer' }
      }
    };

    const node = new ValidatePayloadNode('id', [[5], [4]], { schema: JSON.stringify(schema) });

    const results = node.run({}, { foo: 1, bar: 2 });
    results[0].should.deepEqual([5]);
    results[1].should.deepEqual({ foo: 1, bar: 2 });
  });

  it('should branch false correctly, with errors path set', () => {
    const schema = {
      required: true,
      type: 'object',
      properties: {
        bar: { required: true, type: 'string' },
        foo: { required: true, type: 'integer' }
      }
    };

    const node = new ValidatePayloadNode('id', [[5], [4]], {
      schema: JSON.stringify(schema),
      errorsPath: 'myErr'
    });

    const results = node.run({}, { foo: 1, bar: 2 });
    results[0].should.deepEqual([5]);
    results[1].should.deepEqual({
      foo: 1,
      bar: 2,
      myErr: [ { field: 'bar', message: 'is the wrong type' } ]
    });
  });

  it('should branch false correctly, with errors path set, with multiple errors', () => {
    const schema = {
      type: 'object',
      properties: {
        a: { type: 'string' },
        b: { type: 'integer' },
        c: { type: 'boolean' }
      },
      additionalProperties: false,
      required: ['c']
    };

    const node = new ValidatePayloadNode('id', [[5], [4]], {
      schema: JSON.stringify(schema),
      errorsPath: 'myErr'
    });

    const results = node.run({}, { a: 1, b: 2, d: 3 });
    results[0].should.deepEqual([5]);
    results[1].should.deepEqual({
      a: 1,
      b: 2,
      d: 3,
      myErr: [
        {
          field: 'c',
          message: 'is required'
        },
        {
          field: '',
          message: 'has additional properties'
        },
        {
          field: 'a',
          message: 'is the wrong type'
        }
      ]
    });
  });

  it('should branch false correctly, with path, with errors path set', () => {
    const schema = {
      required: true,
      type: 'object',
      properties: {
        bar: { required: true, type: 'string' },
        foo: { required: true, type: 'integer' }
      }
    };

    const node = new ValidatePayloadNode('id', [[5], [4]], {
      schema: JSON.stringify(schema),
      toValidatePath: 'myBody.what',
      errorsPath: 'myErr'
    });

    const results = node.run({}, { myBody: { what: { foo: 1, bar: 2 } } });
    results[0].should.deepEqual([5]);
    results[1].should.deepEqual({
      myBody: { what: { foo: 1, bar: 2 } },
      myErr: [ { field: 'myBody.what.bar', message: 'is the wrong type' } ]
    });
  });

  it('should catch regex patterns that are vulnerable to redos attacks', async () => {
    const schema = {
      type: 'string',
      pattern: '^(a+)+$'
    };

    const node = new ValidatePayloadNode('id', [[5], [4]], {
      schema: JSON.stringify(schema),
      toValidatePath: 'myBody.what',
      errorsPath: 'myErr'
    });

    const results = node.run({}, { myBody: { what: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa!' } });
    results[0].should.deepEqual([5]);
    results[1].should.deepEqual({
      myBody: { what: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa!' },
      myErr: [{ field: 'myBody.what', message: 'pattern mismatch' }]
    });
  });
});
