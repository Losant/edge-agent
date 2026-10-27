import should from 'should';
import RE2 from '../src/get-re2.js';

describe('get-re2', () => {
  // get-re2.js falls back to RegExp, without an error, when the native addon
  // can't load (e.g. built for another OS or architecture). This fails instead.
  it('loads the native re2 addon', () => {
    should(RE2).not.equal(RegExp);
  });
});
