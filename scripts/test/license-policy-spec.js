import should from 'should';
import { evaluate, loadPolicy } from '../license-policy.js';

const policy = loadPolicy({
  allowed: ['MIT', 'Apache-2.0', 'Public Domain'],
  overrides: { precond: { license: 'MIT', reason: 'no license field' } }
});

const statusOf = (license, name = 'pkg') => evaluate(name, license, policy).status;

describe('license policy', () => {
  it('allows a single allowed license', () => {
    statusOf('MIT').should.equal('ok');
  });

  it('denies a license that is not allowed', () => {
    statusOf('GPL-3.0').should.equal('denied');
  });

  it('allows an OR expression when any side is allowed', () => {
    statusOf('(MIT OR GPL-3.0)').should.equal('ok');
  });

  it('denies an OR expression when no side is allowed', () => {
    statusOf('GPL-3.0 OR AGPL-3.0').should.equal('denied');
  });

  it('denies an AND expression when any side is not allowed', () => {
    statusOf('MIT AND GPL-3.0').should.equal('denied');
  });

  it('allows an AND expression when every side is allowed', () => {
    statusOf('(MIT AND Apache-2.0)').should.equal('ok');
  });

  it('evaluates nested expressions', () => {
    statusOf('(MIT OR GPL-3.0) AND Apache-2.0').should.equal('ok');
    statusOf('(MIT OR GPL-3.0) AND GPL-2.0').should.equal('denied');
  });

  it('treats an array of licenses as OR', () => {
    statusOf(['GPL-3.0', 'MIT']).should.equal('ok');
    statusOf(['GPL-3.0', 'AGPL-3.0']).should.equal('denied');
  });

  it('allows non-SPDX names listed in the allowlist', () => {
    statusOf('Public Domain').should.equal('ok');
  });

  it('flags a license license-checker guessed', () => {
    statusOf('MIT*').should.equal('guessed');
  });

  it('flags text that is not a license expression', () => {
    statusOf('SEE LICENSE IN LICENSE.md').should.equal('unparseable');
    statusOf('UNKNOWN').should.equal('unparseable');
  });

  it('uses an override instead of the detected license', () => {
    statusOf('MIT*', 'precond').should.equal('ok');
    evaluate('precond', 'UNKNOWN', policy).license.should.equal('MIT');
  });

  it('rejects an override without a reason', () => {
    should.throws(() => loadPolicy({ allowed: [], overrides: { x: { license: 'MIT' } } }), /needs both/);
  });
});
