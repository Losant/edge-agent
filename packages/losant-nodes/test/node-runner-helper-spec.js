import './common.js';
import { addToPreviousNodeInfo } from '../src/lib/node-runner-helpers.js';
import { clone } from 'omnibelt';

describe('Previous Node Info Helpers', () => {

  it('should properly consolidate long prevNode info', () => {
    const original = {
      ids: Array(205).fill('a'),
      durations: Array(205).fill(1)
    };
    const toHandIn = clone(original);
    addToPreviousNodeInfo('final', 12, false, toHandIn).should.deepEqual({
      ids: [
        '$$MERGED$$',
        ...Array(98).fill('a'),
        'final'
      ],
      durations: [
        107,
        ...Array(98).fill(1),
        12
      ]
    });
    toHandIn.should.deepEqual(original);
  });

  it('should do a simple add, no clone', () => {
    const original = {
      ids: ['1', '2'],
      durations: [5, 6]
    };
    const result = addToPreviousNodeInfo('3', 7, false, original);
    result.should.deepEqual({
      ids: ['1', '2', '3'],
      durations: [5, 6, 7]
    });
    result.should.equal(original);
  });

  it('should do a simple add, with clone', () => {
    const original = {
      ids: ['1', '2'],
      durations: [5, 6]
    };
    const result = addToPreviousNodeInfo('3', 7, true, original);
    result.should.deepEqual({
      ids: ['1', '2', '3'],
      durations: [5, 6, 7]
    });
    original.should.deepEqual({
      ids: ['1', '2'],
      durations: [5, 6]
    });
  });

});
