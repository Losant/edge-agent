import './common.js';
import ArrayNode from '../src/array-node.js';

describe('ArrayNode', () => {
  it('should correctly manipulate the array', () => {
    const node = new ArrayNode('id', [[4]], {
      sourceArrayPath: 'arrayPath',
      destArrayPath: 'arrayPath2',
      rules: [
        { type: 'compact' },
        { type: 'flatten' },
        { type: 'indexOf', inputTemplate: '{{indexOfInput}}', outputPath: 'indexOfOutput' },
        { type: 'insertAt', inputTemplate: '{{insertAtInput}}', indexTemplate: '{{insertAtIndex}}' },
        { type: 'length', outputPath: 'lengthOutput' },
        { type: 'lookupAt', indexTemplate: '{{lookupAtIndex}}', outputPath: 'lookupAtOutput' },
        { type: 'pop', outputPath: 'popOutput' },
        { type: 'push', inputTemplate: '{{pushInput}}' },
        { type: 'removeAt', indexTemplate: '{{removeAtIndex}}', outputPath: 'removeAtOutput' },
        { type: 'replaceAt', inputTemplate: '{{replaceAtInput}}', indexTemplate: '{{replaceAtIndex}}', outputPath: 'replaceAtOutput' },
        { type: 'reverse' },
        { type: 'shift', outputPath: 'shiftOutput' },
        { type: 'unshift', inputTemplate: '{{unshiftInput}}' },
        { type: 'concat', inputTemplate: '{{concatInput}}' },
        { type: 'sum', outputPath: 'sumOutput' }
      ]
    });

    const results = node.run({}, {
      arrayPath: ['a', 'b', null, ['c', ['d']], 'e', 'f', 'g', 'h'],
      indexOfInput: 'd',
      insertAtInput: 'theInsertAt',
      insertAtIndex: '-2',
      lookupAtIndex: '-2',
      pushInput: 'thePush',
      removeAtIndex: '3',
      replaceAtInput: 'theReplaceAt',
      replaceAtIndex: '3',
      unshiftInput: 'theUnshift',
      concatInput: ['a', 'b', 'c']
    });
    results[0].should.deepEqual([[4]]);
    results[1].should.deepEqual({
      arrayPath: ['a', 'b', null, ['c', ['d']], 'e', 'f', 'g', 'h'],
      indexOfInput: 'd',
      insertAtInput: 'theInsertAt',
      insertAtIndex: '-2',
      lookupAtIndex: '-2',
      pushInput: 'thePush',
      removeAtIndex: '3',
      replaceAtInput: 'theReplaceAt',
      replaceAtIndex: '3',
      unshiftInput: 'theUnshift',
      concatInput: ['a', 'b', 'c'],

      indexOfOutput: 3,
      lengthOutput: 9,
      lookupAtOutput: 'g',
      popOutput: 'h',
      removeAtOutput: 'd',
      replaceAtOutput: 'e',
      shiftOutput: 'thePush',
      sumOutput: 0,

      arrayPath2: [
        'theUnshift', 'g', 'theInsertAt', 'f', 'theReplaceAt', 'c', 'b', 'a', 'a', 'b', 'c'
      ]
    });
  });

  it('should create array when blank', () => {
    const node = new ArrayNode('id', [[4]], {
      destArrayPath: 'arrayPath2'
    });

    const results = node.run({}, {});
    results[0].should.deepEqual([[4]]);
    results[1].should.deepEqual({ arrayPath2: [] });
  });

  it('does strings right', () => {
    const node = new ArrayNode('id', [[4]], {
      sourceArrayPath: 'arrayPath',
      destArrayPath: 'arrayPath2',
      rules: [
        { type: 'replaceAt', inputTemplate: '{{replaceAtInput}}', indexTemplate: '{{replaceAtIndex}}', outputPath: 'replaceAtOutput' }
      ]
    });

    const results = node.run({}, {
      arrayPath: 'hello',
      replaceAtInput: [' ', ['let', 'ters'], ' '],
      replaceAtIndex: '3'
    });
    results[0].should.deepEqual([[4]]);
    results[1].should.deepEqual({
      arrayPath: 'hello',
      replaceAtInput: [' ', ['let', 'ters'], ' '],
      replaceAtIndex: '3',
      arrayPath2: 'hel letters o',
      replaceAtOutput: 'l'
    });
  });

  it('should sum values correctly', () => {
    const node = new ArrayNode('id', [[4]], {
      sourceArrayPath: 'arrayPath',
      rules: [
        { type: 'sum', outputPath: 'sumOutput' }
      ]
    });

    const result = node.run({}, {
      arrayPath: [ 'hi', false, true, 3, '4', 1.5, null, 'what', '3.25', undefined, [2, 4, 6], [] ]
    });

    result[0].should.deepEqual([[4]]);
    result[1].should.deepEqual({
      sumOutput: 12.75,
      arrayPath: [ 'hi', false, true, 3, '4', 1.5, null, 'what', '3.25', undefined, [2, 4, 6], [] ]
    });
  });

  it('should group objects properly', () => {
    const node = new ArrayNode('id', [[4]], {
      sourceArrayPath: 'arrayPath',
      inputKey: 'inputKey',
      rules: [
        { type: 'groupBy', inputTemplate: 'name', outputPath: 'groupByOutput' },
        { type: 'groupBy', inputTemplate: 'tags.zip.[0]', outputPath: 'groupByOutput2' }
      ]
    });
    const results = node.run({}, {
      arrayPath: [
        { name: 'Device 1', tags: { zip: [ '45202'] } },
        { name: 'Device 2', tags: { zip: ['45202'] } },
        { name: 'Device 3', tags: { zip: ['45101'] } },
        { name: 'Device 4', tags: { zip: ['45101'] } },
        { name: 'Device 5', tags: { zip: ['45300'] } },
        { name: 'Device 6', tags: { notAZip: ['45300'] } }
      ]
    });
    results[0].should.deepEqual([[4]]);
    results[1].should.deepEqual({
      arrayPath: [
        { name: 'Device 1', tags: { zip: [ '45202'] } },
        { name: 'Device 2', tags: { zip: ['45202'] } },
        { name: 'Device 3', tags: { zip: ['45101'] } },
        { name: 'Device 4', tags: { zip: ['45101'] } },
        { name: 'Device 5', tags: { zip: ['45300'] } },
        { name: 'Device 6', tags: { notAZip: ['45300'] } }
      ],
      groupByOutput: {
        'Device 1': [ { name: 'Device 1', tags: { zip: [ '45202'] } } ],
        'Device 2': [ { name: 'Device 2', tags: { zip: ['45202'] } } ],
        'Device 3': [ { name: 'Device 3', tags: { zip: ['45101'] } } ],
        'Device 4': [ { name: 'Device 4', tags: { zip: ['45101'] } } ],
        'Device 5': [ { name: 'Device 5', tags: { zip: ['45300'] } } ],
        'Device 6': [ { name: 'Device 6', tags: { notAZip: ['45300'] } } ]
      },
      groupByOutput2: {
        45202: [ { name: 'Device 1', tags: { zip: [ '45202'] } }, { name: 'Device 2', tags: { zip: ['45202'] } } ],
        45101: [ { name: 'Device 3', tags: { zip: ['45101'] } }, { name: 'Device 4', tags: { zip: ['45101'] } } ],
        45300: [ { name: 'Device 5', tags: { zip: ['45300'] } } ],
        undefined: [ { name: 'Device 6', tags: { notAZip: ['45300'] } } ]
      }
    });

  });

  it('should key objects properly', () => {
    const node = new ArrayNode('id', [[4]], {
      sourceArrayPath: 'arrayPath',
      inputKey: 'inputKey',
      rules: [
        { type: 'keyBy', inputTemplate: 'name', outputPath: 'keyByOutput' },
        { type: 'keyBy', inputTemplate: 'tags.zip.[0]', outputPath: 'keyByOutput2' }
      ]
    });
    const results = node.run({}, {
      arrayPath: [
        { name: 'Device 1', tags: { zip: ['45202'] } },
        { name: 'Device 2', tags: { zip: ['45202'] } },
        { name: 'Device 3', tags: { zip: ['45101'] } },
        { name: 'Device 4', tags: { zip: ['45101'] } },
        { name: 'Device 5', tags: { zip: ['45300'] } },
        { name: 'Device 6', tags: { notAZip: ['45300'] } }
      ]
    });
    results[0].should.deepEqual([[4]]);
    results[1].should.deepEqual({
      arrayPath: [
        { name: 'Device 1', tags: { zip: [ '45202'] } },
        { name: 'Device 2', tags: { zip: ['45202'] } },
        { name: 'Device 3', tags: { zip: ['45101'] } },
        { name: 'Device 4', tags: { zip: ['45101'] } },
        { name: 'Device 5', tags: { zip: ['45300'] } },
        { name: 'Device 6', tags: { notAZip: ['45300'] } }
      ],
      keyByOutput: {
        'Device 1': { name: 'Device 1', tags: { zip: [ '45202'] } },
        'Device 2': { name: 'Device 2', tags: { zip: ['45202'] } },
        'Device 3': { name: 'Device 3', tags: { zip: ['45101'] } },
        'Device 4': { name: 'Device 4', tags: { zip: ['45101'] } },
        'Device 5': { name: 'Device 5', tags: { zip: ['45300'] } },
        'Device 6': { name: 'Device 6', tags: { notAZip: ['45300'] } }
      },
      keyByOutput2: {
        45202: { name: 'Device 2', tags: { zip: ['45202'] } },
        45101: { name: 'Device 4', tags: { zip: ['45101'] } },
        45300: { name: 'Device 5', tags: { zip: ['45300'] } },
        undefined: { name: 'Device 6', tags: { notAZip: ['45300'] } }
      }
    });
  });

  it('should sort elements array properly', () => {
    const node = new ArrayNode('id', [[4]], {
      sourceArrayPath: 'arrayPath',
      inputKey: 'inputKey',
      rules: [
        { type: 'sort', order: 'descending', outputPath: 'sortOutput' }
      ]
    });
    const results = node.run({}, {
      arrayPath: [100, 99, 1, 2, 22, 104, 45]
    });
    results[0].should.deepEqual([[4]]);
    results[1].should.deepEqual({
      arrayPath: [100, 99, 1, 2, 22, 104, 45],
      sortOutput: [104, 100, 99, 45, 22, 2, 1]
    });
  });

  it('should sort objects properly', () => {
    const node = new ArrayNode('id', [[4]], {
      sourceArrayPath: 'arrayPath',
      inputKey: 'inputKey',
      rules: [
        { type: 'sortBy', inputTemplate: 'age', order: 'descending', outputPath: 'sortByOutput' }
      ]
    });
    const results = node.run({}, {
      arrayPath: [
        { name: 'clara', age: 30 },
        { name: 'alice', age: 10 },
        { name: 'bob', age: 20 }
      ]
    });
    results[0].should.deepEqual([[4]]);
    results[1].should.deepEqual({
      arrayPath: [
        { name: 'clara', age: 30 },
        { name: 'alice', age: 10 },
        { name: 'bob', age: 20 }
      ],
      sortByOutput: [
        { name: 'clara', age: 30 },
        { name: 'bob', age: 20 },
        { name: 'alice', age: 10 }
      ]
    });
  });

  it('should group other data types and null values as undefined', () => {
    const node = new ArrayNode('id', [[4]], {
      sourceArrayPath: 'arrayPath',
      inputKey: 'inputKey',
      rules: [
        { type: 'groupBy', inputTemplate: '[1]', outputPath: 'groupByOutput' }
      ]
    });
    const results = node.run({}, {
      arrayPath: [true, null, '12', 12, undefined, [], {}]
    });
    results[0].should.deepEqual([[4]]);
    results[1].should.deepEqual({
      arrayPath: [true, null, '12', 12, undefined, [], {}],
      groupByOutput: { 2: ['12'], undefined: [true, null, 12, undefined, [], {}] }
    });
  });

  it('should slice arrays properly with input and index', () => {
    const node = new ArrayNode('id', [[4]], {
      sourceArrayPath: 'arrayPath',
      inputKey: 'inputKey',
      destArrayPath: 'arrayPath2',
      rules: [
        { type: 'slice', inputTemplate: '2', indexTemplate: '4', outputPath: 'sliceOutput' }
      ]
    });
    const results = node.run({}, {
      arrayPath: [true, null, '12', 12, undefined, [], {}]
    });
    results[0].should.deepEqual([[4]]);
    results[1].should.deepEqual({
      arrayPath: [true, null, '12', 12, undefined, [], {}],
      arrayPath2: ['12', 12]
    });
  });

  it('should slice arrays properly with only input provided', () => {
    const node = new ArrayNode('id', [[4]], {
      sourceArrayPath: 'arrayPath',
      inputKey: 'inputKey',
      destArrayPath: 'arrayPath2',
      rules: [
        { type: 'slice', inputTemplate: '2' }
      ]
    });
    const results = node.run({}, {
      arrayPath: [true, null, '12', 12, undefined, [], {}]
    });
    results[0].should.deepEqual([[4]]);
    results[1].should.deepEqual({
      arrayPath: [true, null, '12', 12, undefined, [], {}],
      arrayPath2: ['12', 12, undefined, [], {}]
    });
  });

  it('should slice arrays properly with only index provided', () => {
    const node = new ArrayNode('id', [[4]], {
      sourceArrayPath: 'arrayPath',
      inputKey: 'inputKey',
      destArrayPath: 'arrayPath2',
      rules: [
        { type: 'slice', indexTemplate: '4' }
      ]
    });
    const results = node.run({}, {
      arrayPath: [true, null, '12', 12, undefined, [], {}]
    });
    results[0].should.deepEqual([[4]]);
    results[1].should.deepEqual({
      arrayPath: [true, null, '12', 12, undefined, [], {}],
      arrayPath2: [true, null, '12', 12]
    });
  });

  it('should deduplicate arrays properly', () => {
    const node = new ArrayNode('id', [[4]], {
      sourceArrayPath: 'arrayPath',
      destArrayPath: 'arrayPath2',
      rules: [
        { type: 'deduplicate' }
      ]
    });
    const results = node.run({}, {
      arrayPath: [true, 'true', 1, '1', 'a', 'b', 'a']
    });
    results[0].should.deepEqual([[4]]);
    results[1].should.deepEqual({
      arrayPath: [true, 'true', 1, '1', 'a', 'b', 'a'],
      arrayPath2: [true, 'true', 1, '1', 'a', 'b']
    });
  });
  it('should deduplicateBy an array of objects properly', () => {
    const node = new ArrayNode('id', [[4]], {
      sourceArrayPath: 'arrayPath',
      rules: [
        { type: 'deduplicateBy', inputTemplate: 'foo', outputPath: 'arrayPath2' }
      ]
    });
    const results = node.run({}, {
      arrayPath: [{ foo: 'one' }, { foo: 'two' }, { foo: 'one' }, { foo: 'two' }, { foo: 'one' }, { foo: 'two' }, { foo: 'three' } ]
    });
    results[0].should.deepEqual([[4]]);
    results[1].should.deepEqual({
      arrayPath: [{ foo: 'one' }, { foo: 'two' }, { foo: 'one' }, { foo: 'two' }, { foo: 'one' }, { foo: 'two' }, { foo: 'three' } ],
      arrayPath2: [{ foo: 'one' }, { foo: 'two' }, { foo: 'three' }]
    });
  });

  it('should deduplicateBy an array of strings properly', () => {
    const node = new ArrayNode('id', [[4]], {
      sourceArrayPath: 'arrayPath',
      rules: [
        { type: 'deduplicateBy', inputTemplate: '.', outputPath: 'arrayPath2' }
      ]
    });
    const results = node.run({}, {
      arrayPath: [ 'one', 'two', 'two', 'one', 'three', 'two', 'one' ]
    });
    results[0].should.deepEqual([[4]]);
    results[1].should.deepEqual({
      arrayPath: [ 'one', 'two', 'two', 'one', 'three', 'two', 'one' ],
      arrayPath2: [ 'one', 'two', 'three' ]
    });
  });

  it('should filter array of objects properly', () => {
    const node = new ArrayNode('id', [[4]], {
      sourceArrayPath: 'arrayPath',
      rules: [
        { type: 'filter', inputTemplate: '({{ value.value }} % 2) === 0', outputPath: 'arrayPath2' }
      ]
    });
    const results = node.run({}, {
      arrayPath: [ { value: 1 }, { value: 2 }, { value: 3 }, { value: 4 }, { value: 5 }, { value: 6 }, { value: 7 }, { value: 8 }, { value: 9 }, { value: 10 } ]
    });
    results[0].should.deepEqual([[4]]);
    results[1].should.deepEqual({
      arrayPath: [ { value: 1 }, { value: 2 }, { value: 3 }, { value: 4 }, { value: 5 }, { value: 6 }, { value: 7 }, { value: 8 }, { value: 9 }, { value: 10 } ],
      arrayPath2: [ { value: 2 }, { value: 4 }, { value: 6 }, { value: 8 }, { value: 10 } ]
    });
  });
  it('should filter array of numbers properly', () => {
    const node = new ArrayNode('id', [[4]], {
      sourceArrayPath: 'arrayPath',
      rules: [
        { type: 'filter', inputTemplate: '({{ value }} % 2) === {{ payload.zero }}', outputPath: 'arrayPath2' }
      ]
    });
    const results = node.run({}, {
      zero: 0,
      arrayPath: [ 1, 2, 3, 4, 5, 6, 7, 8, 9, 10 ]
    });
    results[0].should.deepEqual([[4]]);
    results[1].should.deepEqual({
      zero: 0,
      arrayPath: [ 1, 2, 3, 4, 5, 6, 7, 8, 9, 10 ],
      arrayPath2: [2, 4, 6, 8, 10 ]
    });
  });

  it('should find the index of a number in a list of numbers', () => {
    const node = new ArrayNode('id', [[4]], {
      sourceArrayPath: 'arrayPath',
      rules: [
        { type: 'indexOf', inputTemplate: '{{indexOfInput}}', outputPath: 'indexOfOutput' }
      ]
    });
    const results = node.run({}, {
      arrayPath: [1, 2, 3, 4],
      indexOfInput: 3
    });
    results[0].should.deepEqual([[4]]);
    results[1].should.deepEqual({
      arrayPath: [1, 2, 3, 4],
      indexOfInput: 3,
      indexOfOutput: 2
    });
  });
  it('should find the index of a string in a list of strings', () => {
    const node = new ArrayNode('id', [[4]], {
      sourceArrayPath: 'arrayPath',
      rules: [
        { type: 'indexOf', inputTemplate: '{{indexOfInput}}', outputPath: 'indexOfOutput' }
      ]
    });
    const results = node.run({}, {
      arrayPath: ['1', '2', '3', '4'],
      indexOfInput: '3'
    });
    results[0].should.deepEqual([[4]]);
    results[1].should.deepEqual({
      arrayPath: ['1', '2', '3', '4'],
      indexOfInput: '3',
      indexOfOutput: 2
    });
  });
  it('should not find the index of a number in a list of strings', () => {
    const node = new ArrayNode('id', [[4]], {
      sourceArrayPath: 'arrayPath',
      rules: [
        { type: 'indexOf', inputTemplate: '{{indexOfInput}}', outputPath: 'indexOfOutput' }
      ]
    });
    const results = node.run({}, {
      arrayPath: ['1', '2', '3', '4'],
      indexOfInput: 3
    });
    results[0].should.deepEqual([[4]]);
    results[1].should.deepEqual({
      arrayPath: ['1', '2', '3', '4'],
      indexOfInput: 3,
      indexOfOutput: -1
    });
  });
  it('should not find the index of a string in a list of numbers', () => {
    const node = new ArrayNode('id', [[4]], {
      sourceArrayPath: 'arrayPath',
      rules: [
        { type: 'indexOf', inputTemplate: '{{indexOfInput}}', outputPath: 'indexOfOutput' }
      ]
    });
    const results = node.run({}, {
      arrayPath: [1, 2, 3, 4],
      indexOfInput: '3'
    });
    results[0].should.deepEqual([[4]]);
    results[1].should.deepEqual({
      arrayPath: [1, 2, 3, 4],
      indexOfInput: '3',
      indexOfOutput: -1
    });
  });
});
