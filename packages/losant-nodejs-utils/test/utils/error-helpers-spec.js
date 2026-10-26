import { shouldRollbarError } from '../../src/utils/error-helpers.js';

describe('#shouldRollbarError (open)', () => {
  it('is true for native JS error names', () => {
    shouldRollbarError({ name: 'TypeError' }).should.equal(true);
  });

  it('is false for Mongo/Redis driver error names', () => {
    // losant-nodes' mongo-node.js/redis-node.js always rename driver errors
    // (cleanMongoErrorWrap/cleanRedisErrorWrap) before they'd reach this predicate,
    // so these names are intentionally not checked here — the full table lives in
    // losant-internal-nodejs/src/utils/error-helpers.js for closed-side reporting.
    shouldRollbarError({ name: 'MongoServerError' }).should.equal(false);
    shouldRollbarError({ name: 'MongoError' }).should.equal(false);
    shouldRollbarError({ name: 'MongoNetworkError' }).should.equal(false);
    shouldRollbarError({ name: 'ReplyError' }).should.equal(false);
  });

  it('is falsy for a nil error', () => {
    // the guard is `err && ...`, so a nil err short-circuits to that same nil value
    (shouldRollbarError(null) === null).should.be.true();
    (shouldRollbarError(undefined) === undefined).should.be.true();
  });
});
