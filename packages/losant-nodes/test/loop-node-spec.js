import { contextify } from './common.js';
import abstractLoopNodeTests from './abstract/loop-node-spec.js';
import LoopNode from '../src/loop-node.js';
import should from 'should';

describe('LoopNode Using Fake NodeRunner', function() {
  abstractLoopNodeTests(contextify);

  const goodSourceExamples = [
    [null, []],
    [undefined, []],
    [false, []],
    [true, []],
    [new Date(), []],
    [[], []],
    ['', []],
    [{}, []],
    [Infinity, []],
    [NaN, []],
    [1, [{ value: 0, index: 0, first: true, last: true }]],
    [3, [{ value: 0, index: 0, first: true }, { value: 1, index: 1 }, { value: 2, index: 2, last: true }]],
    [-3.2, [{ value: 0, index: 0, first: true }, { value: 1, index: 1 }, { value: 2, index: 2, last: true }]],
    [[true, false, undefined], [{ value: true, index: 0, first: true }, { value: false, index: 1 }, { value: undefined, index: 2, last: true }]],
    ['abc', [{ value: 'a', index: 0, first: true }, { value: 'b', index: 1 }, { value: 'c', index: 2, last: true }]],
    [{ a: 1, b: 2, c: 3 }, [{ key: 'a', value: 1, index: 0, first: true }, { key: 'b', value: 2, index: 1 }, { key: 'c', value: 3, index: 2, last: true }]],
    // NOTE: Array(1) produces [ <1 empty item> ], which is different than [undefined]
    [Array(1), [{ value: undefined, index: 0, first: true, last: true }]]
  ];

  goodSourceExamples.forEach(([input, output], index) => {
    it(`should correctly transform good sourceexample ${index}`, async () => {
      (new LoopNode('', [], {})).sourceToLoopItems(input).should.deepEqual(output);
    });
  });

  it('should throw an error on a source of too large a number', () => {
    should(() => {
      (new LoopNode('', [], {})).sourceToLoopItems(2**18 + 1);
    }).throw({ name: 'TooLargeError', message: 'Size of loop source (262145) is greater than maximum allowed (262144)' });
  });

  it('should throw an error on a source of too large an array', () => {
    should(() => {
      (new LoopNode('', [], {})).sourceToLoopItems(Array(2**18 + 1));
    }).throw({ name: 'TooLargeError', message: 'Size of loop source (262145) is greater than maximum allowed (262144)' });
  });

  it('should throw an error on a source of too large a string', () => {
    const string = Array(2**18 + 1).fill('a').join('');
    should(() => {
      (new LoopNode('', [], {})).sourceToLoopItems(string);
    }).throw({ name: 'TooLargeError', message: 'Size of loop source (262145) is greater than maximum allowed (262144)' });
  });

  it('should throw an error on a source of too large an object', () => {
    const obj = Object.fromEntries(Array.from(Array(2**18 + 1), (_, index) => [index, index]));
    should(() => {
      (new LoopNode('', [], {})).sourceToLoopItems(obj);
    }).throw({ name: 'TooLargeError', message: 'Size of loop source (262145) is greater than maximum allowed (262144)' });
  });
});
