import enforceTime from '../src/utils/enforce-time.js';

describe('#enforceTime', () => {
  it('returns a Date for a positive epoch number (seconds)', () => {
    const result = enforceTime(1700000000);
    result.should.be.instanceOf(Date);
    result.getTime().should.equal(1700000000000);
  });

  it('returns a Date for a positive epoch number (milliseconds)', () => {
    const result = enforceTime(1700000000000);
    result.should.be.instanceOf(Date);
    result.getTime().should.equal(1700000000000);
  });

  it('returns a Date for a parseable ISO string', () => {
    const result = enforceTime('2026-01-01T00:00:00Z');
    result.should.be.instanceOf(Date);
    result.toISOString().should.equal('2026-01-01T00:00:00.000Z');
  });

  it('returns the existing Date instance when given one', () => {
    const date = new Date('2026-01-01T00:00:00Z');
    enforceTime(date).should.equal(date);
  });

  it('treats 0 as "now" when no fallback is set', () => {
    const before = Date.now();
    const result = enforceTime(0);
    result.should.be.instanceOf(Date);
    result.getTime().should.be.aboveOrEqual(before);
  });

  it('treats negative numbers as "now + offset" when no fallback is set', () => {
    const before = Date.now();
    const result = enforceTime(-1000);
    result.should.be.instanceOf(Date);
    result.getTime().should.be.belowOrEqual(before);
  });

  it('returns Date.now()-ish for unparsable input when no fallback is supplied', () => {
    const before = Date.now();
    const result = enforceTime('not-a-date');
    result.should.be.instanceOf(Date);
    result.getTime().should.be.aboveOrEqual(before);
  });

  describe('with a Date fallback', () => {
    it('returns the fallback for unparsable input', () => {
      const fallback = new Date('2020-01-01T00:00:00Z');
      enforceTime('not-a-date', fallback).should.equal(fallback);
    });

    it('parses the fallback if it is a numeric epoch', () => {
      const result = enforceTime('not-a-date', 1700000000000);
      result.should.be.instanceOf(Date);
      result.getTime().should.equal(1700000000000);
    });
  });

  describe('with noTimeFallback', () => {
    it('returns undefined for unparsable input', () => {
      (enforceTime('not-a-date', enforceTime.noTimeFallback) === undefined).should.be.true();
    });

    it('returns a Date for 0 (uses current time, not the sentinel)', () => {
      const before = Date.now();
      const result = enforceTime(0, enforceTime.noTimeFallback);
      result.should.be.instanceOf(Date);
      result.getTime().should.be.aboveOrEqual(before);
    });

    it('returns a Date for negative numbers (relative to now, not the sentinel)', () => {
      const before = Date.now();
      const result = enforceTime(-1000, enforceTime.noTimeFallback);
      result.should.be.instanceOf(Date);
      result.getTime().should.be.belowOrEqual(before);
    });
  });
});
