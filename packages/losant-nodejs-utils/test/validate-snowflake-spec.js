import { isValidSnowflakeString } from '../src/utils/validate-snowflake.js';

describe('#isValidSnowflakeString', () => {
  it('accepts unquoted identifiers', () => {
    ['foo', 'Foo_Bar', '_foo', 'a1', 'a$b', 'FOO_BAR_123'].forEach((str) => {
      isValidSnowflakeString(str).should.equal(true, str);
    });
  });

  it('accepts quoted identifiers', () => {
    ['"foo"', '"foo bar"', '"foo-bar"', '"a""b"', '"1abc"', '"a;b"'].forEach((str) => {
      isValidSnowflakeString(str).should.equal(true, str);
    });
  });

  it('rejects unquoted identifiers with invalid characters', () => {
    ['foo-bar', 'foo bar', 'foo;bar', '1foo', '$foo', 'foo.bar', 'a"b'].forEach((str) => {
      isValidSnowflakeString(str).should.equal(false, str);
    });
  });

  it('rejects quoted identifiers with trailing or leading content', () => {
    ['"a"; drop', '"a"; DROP TABLE x', 'x "a"', '"a" "b"', '"a"b', 'x; "a"'].forEach((str) => {
      isValidSnowflakeString(str).should.equal(false, str);
    });
  });

  it('rejects empty and malformed quoted identifiers', () => {
    ['', '""', '"', '"abc', 'abc"', '"a"b"'].forEach((str) => {
      isValidSnowflakeString(str).should.equal(false, str);
    });
  });
});
