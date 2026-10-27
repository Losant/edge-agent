import './common.js';
import ObjectNode from '../src/object-node.js';

describe('ObjectNode', () => {
  it('should correctly modify the input object', () => {
    const node = new ObjectNode('id', [[4]], {
      sourcePath: 'objPath',
      destPath: 'newSpot.whoDis',
      operations: [
        { type: 'assign', inputTemplate: '{{assignInput}}' },
        { type: 'entries', outputPath: 'entries' },
        { type: 'keys', outputPath: 'keys' },
        { type: 'mergeDeep', inputTemplate: '{{mergeDeepInput}}', outputPath: 'mergeDeep' },
        { type: 'values', outputPath: 'values' },
        { type: 'omit', inputTemplate: '{{omitInput}}' },
        { type: 'pick', inputTemplate: '{{pickInput}}', outputPath: 'pick' }
      ]
    });
    const results = node.run({}, {
      objPath: {
        a: 1,
        b: 2,
        c: 3,
        d: {
          e: 4
        }
      },
      newSpot: {},
      assignInput: {
        c: 6,
        f: 7
      },
      mergeDeepInput: {
        d: {
          i: 9
        }
      },
      omitInput: ['a', 'b'],
      pickInput: ['d', 'f']
    });
    results[0].should.deepEqual([[4]]);
    results[1].should.deepEqual({
      assignInput: {
        c: 6,
        f: 7
      },
      mergeDeepInput: {
        d: {
          i: 9
        }
      },
      omitInput: ['a', 'b'],
      pickInput: ['d', 'f'],
      objPath: {
        a: 1,
        b: 2,
        c: 3,
        d: {
          e: 4
        }
      },
      newSpot: {
        whoDis: {
          d: {
            e: 4,
            i: 9
          },
          f: 7
        }
      },
      entries: [ ['a', 1], ['b', 2], ['c', 6], ['d', { e: 4 }], ['f', 7] ],
      keys: [ 'a', 'b', 'c', 'd', 'f'],
      values: [ 1, 2, 6, { e: 4, i: 9 }, 7]
    });
  });

  it('should correctly create object from array of pairs', () => {
    const node = new ObjectNode('id', [[4]], {
      sourcePath: 'objPath',
      destPath: 'newSpot',
      operations: [
        { type: 'fromPairs', outputPath: 'shinyNewObj' }
      ]
    });
    const results = node.run({}, {
      objPath: [ ['abc', 123], ['def', 456] ]
    });
    results[0].should.deepEqual([[4]]);
    results[1].should.deepEqual({
      objPath: [ ['abc', 123], ['def', 456] ],
      newSpot: [ ['abc', 123], ['def', 456] ],
      shinyNewObj: {
        abc: 123,
        def: 456
      }
    });
  });

  it('should correctly error when an array is passed in for a non-array-based operation', () => {
    const node = new ObjectNode('id', [[4]], {
      sourcePath: 'objPath',
      destPath: 'newSpot',
      operations: [
        { type: 'omit', outputPath: 'shinyNewObj' }
      ]
    });

    (() => {
      return node.run({}, { objPath: [ ['abc', 123], ['def', 456] ] });
    }).should.throw({
      type: 'Validation',
      message: 'Array input invalid for omit operation.',
      statusCode: 400,
      name: 'ValidationError',
      fullType: 'Validation'
    });
  });

  it('should correctly deal with weird fromPairs input', () => {
    const node = new ObjectNode('id', [[4]], {
      sourcePath: 'source',
      destPath: 'newSpot',
      operations: [
        { type: 'fromPairs', outputPath: 'shinyNewObj' }
      ]
    });

    node.run({}, { source: undefined })[1].shinyNewObj.should.deepEqual({});
    node.run({}, { source: { a: 'b' } })[1].shinyNewObj.should.deepEqual({});
    node.run({}, { source: [] })[1].shinyNewObj.should.deepEqual({});
    node.run({}, { source: [undefined, [], ['a', 'b'], null, ['c'], 'de', 2] })[1]
      .shinyNewObj.should.deepEqual({
        a: 'b',
        undefined: undefined,
        c: undefined,
        d: 'e'
      });
  });

  it('should correctly create a new object', () => {
    const node = new ObjectNode('id', [[4]], {
      sourcePath: 'objPath',
      destPath: 'newSpot',
      operations: [
        { type: 'omit', inputTemplate: '{{hello}}', outputPath: 'shinyNewObj' }
      ]
    });
    const results = node.run({}, {
      hello: [ 1 ]
    });
    results[0].should.deepEqual([[4]]);
    results[1].should.deepEqual({
      hello: [1],
      newSpot: {}
    });
  });

  it('should zipObj', async () => {
    const node = new ObjectNode('id', [[4]], {
      sourcePath: 'objPath',
      destPath: 'newSpot.whoDis',
      operations: [
        { type: 'zipObject', inputTemplate: '{{zipInput}}' }
      ]
    });
    // ezpz same length guys
    let results = node.run({}, {
      zipInput: [1, 2, 3, 4, 5],
      objPath: ['a', 'b', 'c', 'd', 'e']
    });
    results.should.deepEqual([
      [[4]],
      {
        zipInput: [1, 2, 3, 4, 5],
        objPath: ['a', 'b', 'c', 'd', 'e'],
        newSpot: {
          whoDis: {
            a: 1,
            b: 2,
            c: 3,
            d: 4,
            e: 5
          }
        }
      }
    ]);

    // vals longer
    results = node.run({}, {
      zipInput: [1, 2, 3, 4, 5, 6, 7],
      objPath: ['a', 'b', 'c', 'd', 'e']
    });
    results.should.deepEqual([
      [[4]],
      {
        zipInput: [1, 2, 3, 4, 5, 6, 7],
        objPath: ['a', 'b', 'c', 'd', 'e'],
        newSpot: {
          whoDis: {
            a: 1,
            b: 2,
            c: 3,
            d: 4,
            e: 5
          }
        }
      }
    ]);

    // keys longer
    results = node.run({}, {
      zipInput: [1, 2, 3, 4, 5],
      objPath: ['a', 'b', 'c', 'd', 'e', 'f', 'g']
    });
    results.should.deepEqual([
      [[4]],
      {
        zipInput: [1, 2, 3, 4, 5],
        objPath: ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
        newSpot: {
          whoDis: {
            a: 1,
            b: 2,
            c: 3,
            d: 4,
            e: 5
          }
        }
      }
    ]);
  });

  it('should error correctly when zipObj input renders to a not-array', async () => {
    const node = new ObjectNode('id', [[4]], {
      sourcePath: 'objPath',
      destPath: 'newSpot.whoDis',
      operations: [
        { type: 'zipObject', inputTemplate: '{{zipInput}}' }
      ]
    });
    ( () => {
      node.run({}, {
        zipInput: { hello: 'gamers' },
        objPath: ['a', 'b', 'c', 'd', 'e']
      });
    }).should.throw({ message: 'Invalid input of object for zipObject operation.' });

    ( () => {
      node.run({}, {
        zipInput: 123,
        objPath: ['a', 'b', 'c', 'd', 'e']
      });
    }).should.throw({ message: 'Invalid input 123 for zipObject operation.' });
  });
});
