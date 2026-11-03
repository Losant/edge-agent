import './common.js';
import { clampPositiveEnv } from '../src/utils.js';

describe('clampPositiveEnv', () => {
  const ENV_NAME = 'CLAMP_POSITIVE_ENV_TEST_VALUE';

  afterEach(() => {
    delete process.env[ENV_NAME];
  });

  it('should return the default when the variable is not set', () => {
    clampPositiveEnv(ENV_NAME, 60000).should.equal(60000);
  });

  it('should return the value of the named variable', () => {
    process.env[ENV_NAME] = '7777';
    clampPositiveEnv(ENV_NAME, 60000).should.equal(7777);
  });

  it('should throw when given a value instead of a variable name', () => {
    // the shape of the mistake: clampPositiveEnv(process.env.X, default) with X unset
    (() => { clampPositiveEnv(process.env[ENV_NAME], 60000); }).should.throw(TypeError);
    process.env[ENV_NAME] = '7777';
    (() => { clampPositiveEnv(7777, 60000); }).should.throw(TypeError);
  });
});
