import unescapeStr from '../src/utils/unescape-str.js';

describe('#unescapeStr', () => {
  it('returns an empty string unchanged', () => {
    unescapeStr('').should.equal('');
  });

  it('returns a string without escapes unchanged', () => {
    unescapeStr('hello world').should.equal('hello world');
  });

  it('unescapes single character escapes', () => {
    unescapeStr('\\n').should.equal('\n');
    unescapeStr('\\t').should.equal('\t');
    unescapeStr('\\r').should.equal('\r');
    unescapeStr('\\b').should.equal('\b');
    unescapeStr('\\f').should.equal('\f');
    unescapeStr('\\v').should.equal('\v');
    unescapeStr('\\0').should.equal('\0');
  });

  it('unescapes hex escapes', () => {
    unescapeStr('\\x41').should.equal('A');
    unescapeStr('\\x7a').should.equal('z');
    unescapeStr('\\x0D\\x0A').should.equal('\r\n');
  });

  it('unescapes unicode escapes', () => {
    unescapeStr('\\u0041').should.equal('A');
    unescapeStr('\\u00e9').should.equal('\u00e9');
  });

  it('unescapes braced unicode escapes', () => {
    unescapeStr('\\u{41}').should.equal('A');
    unescapeStr('\\u{1F600}').should.equal('\u{1F600}');
  });

  it('unescapes octal escapes', () => {
    unescapeStr('\\101').should.equal('A');
    unescapeStr('\\60').should.equal('0');
    unescapeStr('\\7').should.equal('\x07');
  });

  it('passes through unknown escaped characters', () => {
    unescapeStr('\\q').should.equal('q');
    unescapeStr('\\\\').should.equal('\\');
    unescapeStr('\\"').should.equal('"');
  });

  it('unescapes mixed text', () => {
    unescapeStr('AT+CMD\\r\\n').should.equal('AT+CMD\r\n');
    unescapeStr('a\\tb\\x41\\u0042\\103d').should.equal('a\tbABCd');
  });

  it('never returns the string "undefined"', () => {
    ['\\x41', '\\u0041', '\\101', '\\u{41}', '\\n'].forEach((input) => {
      unescapeStr(input).should.not.containEql('undefined');
    });
  });
});
