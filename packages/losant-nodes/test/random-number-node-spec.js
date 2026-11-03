import './common.js';
import RandomNumberNode from '../src/random-number-node.js';

describe('RandomNumberNode', () => {

  it('should select a random number between the min and max inclusive', () => {
    const node = new RandomNumberNode('id', [[4]], {
      min: '{{data.min}}',
      max: '{{data.max}}',
      resultPath: 'result'
    });

    const results = node.run({}, { data: { min: 0, max: 2 } });
    results[0].should.deepEqual([[4]]);
    results[1].result.should.be.equalOneOf([0, 1, 2]); // {data: {min: 0, max: 2}, result: 2}
  });

  it('should deal with missing variables', () => {
    const node = new RandomNumberNode('id', [[4]], {
      min: '{{data.min}}',
      max: '{{data.max}}',
      resultPath: 'b.[0]'
    });
    const results = node.run({}, {});
    results[0].should.deepEqual([[4]]);
    results[1].should.deepEqual({ b: [NaN] });
  });

  it('should handle negative ranges', () => {
    const node = new RandomNumberNode('id', [[4]], {
      min: '{{data.min}}',
      max: '{{data.max}}',
      resultPath: 'b.[0]'
    });
    const results = node.run({}, { data: { min: -3, max: 1 } });
    results[0].should.deepEqual([[4]]);
    results[1].b[0].should.be.equalOneOf([-3, -2, -1, 0, 1]);
  });

  it('should handle invalid data', () => {
    const node = new RandomNumberNode('id', [[4]], {
      min: '{{data.min}}',
      max: '{{data.max}}',
      resultPath: 'result'
    });
    const results = node.run({}, { data: { min: 'foo', max: 100 } });
    results[0].should.deepEqual([[4]]);
    results[1].should.be.deepEqual({ data: { min: 'foo', max: 100 }, result: NaN });
  });

});
