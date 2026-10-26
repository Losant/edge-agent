import './common.js';
import resolveValueByLookupType from '../src/lib/resolve-value-by-lookup-type.js';

describe('resolveValueByLookupType', () => {
  const payload = { a: 'A', b: { c: 1 } };

  it('resolves each known lookup type', () => {
    resolveValueByLookupType({ lookupType: 'string', inputValue: '{{a}}-x', payload }).should.equal('A-x');
    resolveValueByLookupType({ lookupType: 'template', inputValue: '{{a}}', payload }).should.equal('A');
    resolveValueByLookupType({ lookupType: 'path', inputValue: 'b.c', payload }).should.equal(1);
    resolveValueByLookupType({ lookupType: 'payloadPath', inputValue: 'a', payload }).should.equal('A');
    resolveValueByLookupType({ lookupType: 'payload', payload }).should.equal(payload);
    resolveValueByLookupType({ lookupType: 'none', payload }).should.deepEqual({});
  });

  it('falls back to the default lookup for unknown types', () => {
    resolveValueByLookupType({ lookupType: 'nope', inputValue: '{{a}}', payload }).should.equal('A');
    resolveValueByLookupType({ lookupType: undefined, inputValue: '{{a}}', payload }).should.equal('A');
    resolveValueByLookupType({ lookupType: 'nope', inputValue: 'a', payload, defaultLookup: 'path' }).should.equal('A');
  });

  it('falls back to the default lookup for prototype keys', () => {
    ['toString', 'constructor', 'hasOwnProperty', 'valueOf', '__proto__'].forEach((lookupType) => {
      resolveValueByLookupType({ lookupType, inputValue: '{{a}}', payload }).should.equal('A', lookupType);
    });
  });

  it('errors on a missing value for lookup types that require one', () => {
    (() => {
      resolveValueByLookupType({ lookupType: 'string', payload, errorOnMissing: true, title: 'Thing' });
    }).should.throw({ name: 'MissingFieldError' });
    (() => {
      resolveValueByLookupType({ lookupType: 'toString', payload, errorOnMissing: true, title: 'Thing' });
    }).should.throw({ name: 'MissingFieldError' });
    resolveValueByLookupType({ lookupType: 'none', payload, errorOnMissing: true }).should.deepEqual({});
  });
});
