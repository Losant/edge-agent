import LJSON from '../src/ljson.js';
import { ObjectId } from '../src/bson.js';
import should from 'should';

describe('LJSON', () => {

  it('should correctly work with undefined', () => {
    JSON.parse(LJSON.stringify(undefined)).should.deepEqual({ $undefined: true });
    should(LJSON.parse(LJSON.stringify(undefined))).be.undefined();
    LJSON.parse(LJSON.stringify([undefined, { a: undefined, b: 1 }, undefined, 1]))
      .should.deepEqual([undefined, { a: undefined, b: 1 }, undefined, 1]);
  });

  it('should correctly work with dates', () => {
    const d1 = new Date(1);
    JSON.parse(LJSON.stringify(d1)).should.deepEqual({ $date: '1970-01-01T00:00:00.001Z' });
    LJSON.parse(LJSON.stringify(d1)).should.deepEqual(d1);
    LJSON.parse(LJSON.stringify([d1, { a: d1, b: 1 }, d1, 1]))
      .should.deepEqual([d1, { a: d1, b: 1 }, d1, 1]);

    JSON.parse(LJSON.stringify(new Date(NaN))).should.deepEqual({ $date: 'NaN' });
    const nanDate = LJSON.parse(LJSON.stringify(new Date(NaN)));
    nanDate.toString().should.equal('Invalid Date');
    should(isNaN(nanDate.getTime())).be.true();
  });

  it('should correctly work with NaN', () => {
    JSON.parse(LJSON.stringify(NaN)).should.deepEqual({ $numberDouble: 'NaN' });
    LJSON.parse(LJSON.stringify(NaN)).should.deepEqual(NaN);
    LJSON.parse(LJSON.stringify([NaN, { a: NaN, b: 1 }, NaN, 1]))
      .should.deepEqual([NaN, { a: NaN, b: 1 }, NaN, 1]);
  });

  it('should correctly work with Infinity', () => {
    JSON.parse(LJSON.stringify(Infinity)).should.deepEqual({ $numberDouble: 'Infinity' });
    JSON.parse(LJSON.stringify(-Infinity)).should.deepEqual({ $numberDouble: '-Infinity' });
    LJSON.parse(LJSON.stringify(Infinity)).should.deepEqual(Infinity);
    LJSON.parse(LJSON.stringify(-Infinity)).should.deepEqual(-Infinity);
    LJSON.parse(LJSON.stringify([Infinity, { a: -Infinity, b: 1 }, Infinity, 1]))
      .should.deepEqual([Infinity, { a: -Infinity, b: 1 }, Infinity, 1]);
  });

  it('should correctly work with oids', () => {
    const oid = new ObjectId();

    LJSON.parse(LJSON.stringify(oid, { extraTypes: true }), { extraTypes: true })
      .should.deepEqual(oid);
    LJSON.parse(LJSON.stringify([oid, { a: oid, b: 1 }, oid, 1], { extraTypes: true }), { extraTypes: true })
      .should.deepEqual([oid, { a: oid, b: 1 }, oid, 1]);

    LJSON.parse(LJSON.stringify(oid, { extraTypes: true }))
      .should.deepEqual({ $oid: String(oid) });
    LJSON.parse(LJSON.stringify([oid, { a: oid, b: 1 }, oid, 1], { extraTypes: true }))
      .should.deepEqual([{ $oid: String(oid) }, { a: { $oid: String(oid) }, b: 1 }, { $oid: String(oid) }, 1]);

    LJSON.parse(LJSON.stringify(oid))
      .should.deepEqual(String(oid));
    LJSON.parse(LJSON.stringify([oid, { a: oid, b: 1 }, oid, 1]))
      .should.deepEqual([String(oid), { a: String(oid), b: 1 }, String(oid), 1]);
  });

  it('should correctly work with regular expressions', () => {
    const rx = /abc/i;

    LJSON.parse(LJSON.stringify(rx, { extraTypes: true }), { extraTypes: true })
      .should.deepEqual(rx);
    LJSON.parse(LJSON.stringify([rx, { a: rx, b: 1 }, rx, 1], { extraTypes: true }), { extraTypes: true })
      .should.deepEqual([rx, { a: rx, b: 1 }, rx, 1]);

    const asExJson = { $regex: 'abc', $options: 'i' };
    LJSON.parse(LJSON.stringify(rx, { extraTypes: true }))
      .should.deepEqual(asExJson);
    LJSON.parse(LJSON.stringify([rx, { a: rx, b: 1 }, rx, 1], { extraTypes: true }))
      .should.deepEqual([asExJson, { a: asExJson, b: 1 }, asExJson, 1]);

    LJSON.parse(LJSON.stringify(rx))
      .should.deepEqual({});
    LJSON.parse(LJSON.stringify([rx, { a: rx, b: 1 }, rx, 1]))
      .should.deepEqual([{}, { a: {}, b: 1 }, {}, 1]);
  });

  it('should correctly detect cycles', () => {
    let obj = {};
    obj.obj = obj;
    JSON.parse(LJSON.stringify(obj, { detectCycles: true }))
      .should.deepEqual({ obj: '[Circular]' });

    obj = [];
    obj[0] = obj;
    JSON.parse(LJSON.stringify(obj, { detectCycles: true }))
      .should.deepEqual(['[Circular]']);

    const nonCycle = { b: 1 };
    obj = [nonCycle, { a: nonCycle }];
    JSON.parse(LJSON.stringify(obj, { detectCycles: true }))
      .should.deepEqual([ { b: 1 }, { a: { b: 1 } } ]);

    obj = { a: 1, b: [2, { c: 3, d: 4 }, 5], e: 6 };
    obj.b[1].z = obj;
    JSON.parse(LJSON.stringify(obj, { detectCycles: true }))
      .should.deepEqual({ a: 1, b: [2, { c: 3, z: '[Circular]', d: 4 }, 5], e: 6 });
  });

  it('should correctly enforce max size', () => {
    const examples = [
      {},
      [],
      ['a'],
      { a: 1 },
      undefined,
      new Date(),
      'foo',
      null,
      true,
      false,
      12.456,
      Number.MAX_VALUE,
      Number.MIN_VALUE,
      NaN,
      Infinity,
      '\u0000',
      Buffer.from([1, 2, 3]),
      { hi: true, bye: false, foo: [null, 1, 2.3, 'four', new Date(), {}, [1], []], what: undefined }
    ];

    examples.forEach((value) => {
      const expectedSize = LJSON.stringify(value).length;
      LJSON.stringify(value, { maxAllowedSize: expectedSize }); // should not error
      let error;
      try {
        LJSON.stringify(value, { maxAllowedSize: expectedSize-1 });
      } catch (e) { error = e; }
      error.message.should.equal(`Size of JSON String (${expectedSize}) is greater than maximum allowed (${expectedSize-1})`);
    });
  });

  it('should correctly work with all options together', () => {
    const obj = {
      aDate: new Date(),
      anObjectId: new ObjectId(),
      aRegEx: /a/i,
      anUndefined: undefined,
      aNull: null,
      aFalse: false,
      aTrue: true,
      aString: 'ten',
      aUnicode: '\u0000a\u0001\n\t\r\b"\\hello',
      aBuffer: Buffer.from([1, 2, 3]),
      anNaN: NaN,
      anInfinity: Infinity,
      aLargeNumber: Number.MAX_VALUE,
      aSmallNumber: Number.MIN_VALUE,
      anObject: { a: 'b' },
      anArray: ['a', 'b']
    };

    obj.cycle1 = obj;
    obj.anObject.cycle2 = obj;
    obj.anArray[2] = obj;
    obj.anObject.anArray = obj.anArray;
    obj.anArray[3] = obj.anObject;

    const str = LJSON.stringify(obj, { detectCycles: true, extraTypes: true });
    LJSON.parse(str, { extraTypes: true }).should.deepEqual({
      ...obj,
      anObject: { a: 'b', cycle2: '[Circular]', anArray: ['a', 'b', '[Circular]', '[Circular]' ] },
      anArray: ['a', 'b', '[Circular]', { a: 'b', cycle2: '[Circular]', anArray: '[Circular]' }],
      cycle1: '[Circular]',
      aBuffer: { type: 'Buffer', data: [1, 2, 3] }
    });

    let error;
    try {
      LJSON.stringify(obj, { detectCycles: true, extraTypes: true, maxAllowedSize: str.length-1 });
    } catch (e) { error = e; }
    error.message.should.equal(`Size of JSON String (${str.length}) is greater than maximum allowed (${str.length-1})`);
  });

});
