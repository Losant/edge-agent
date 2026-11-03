import { hasNonPrintableChars, singleLinePrintable } from '../src/utils/non-printable.js';

const NEL = String.fromCharCode(0x85);
const LS = String.fromCharCode(0x2028);
const PS = String.fromCharCode(0x2029);

describe('#hasNonPrintableChars', () => {
  it('returns false for plain printable ASCII', () => {
    hasNonPrintableChars('hello world').should.be.false();
    hasNonPrintableChars('a-b_c.d 1234!').should.be.false();
  });

  it('returns true for C0 control chars', () => {
    hasNonPrintableChars('foo\x00bar').should.be.true();
    hasNonPrintableChars('foo\tbar').should.be.true();
    hasNonPrintableChars('foo\nbar').should.be.true();
    hasNonPrintableChars('foo\x1Fbar').should.be.true();
  });

  it('returns true for DEL (0x7F)', () => {
    hasNonPrintableChars('foo\x7Fbar').should.be.true();
  });

  it('returns true for NEL (U+0085)', () => {
    hasNonPrintableChars(`foo${NEL}bar`).should.be.true();
  });

  it('returns true for LINE SEPARATOR (U+2028)', () => {
    hasNonPrintableChars(`foo${LS}bar`).should.be.true();
  });

  it('returns true for PARAGRAPH SEPARATOR (U+2029)', () => {
    hasNonPrintableChars(`foo${PS}bar`).should.be.true();
  });

  it('is stateless across calls (no /g flag leak)', () => {
    const s = 'foo\nbar';
    hasNonPrintableChars(s).should.be.true();
    hasNonPrintableChars(s).should.be.true();
    hasNonPrintableChars(s).should.be.true();
  });
});

describe('#singleLinePrintable', () => {
  it('passes through plain printable ASCII unchanged', () => {
    singleLinePrintable('hello world').should.equal('hello world');
  });

  it('replaces ALL non-printable chars (not just the first)', () => {
    singleLinePrintable('a\nb\tc\rd').should.equal('a b c d');
  });

  it('replaces unicode separators', () => {
    singleLinePrintable(`a${NEL}b${LS}c${PS}d`).should.equal('a b c d');
  });

  it('returns an all-space string when input is all non-printable', () => {
    singleLinePrintable('\n\t\r').should.equal('   ');
  });
});
