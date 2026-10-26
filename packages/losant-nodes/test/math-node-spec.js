import './common.js';
import MathNode from '../src/math-node.js';

describe('MathNode', () => {
  it('should apply math', () => {
    const node = new MathNode('id', [[4]], {
      statements: [
        { expression: '{{a.foo}} + {{a.bar}}', resultPath: 'b.[0]' },
        { expression: 'abs({{a.foo}} - {{a.bar}})', resultPath: 'b.[1]' },
        { expression: 'abs({{b.[0]}} - {{a.foo}} - {{a.bar}})', resultPath: 'b.[2]' },
        { expression: 'abs({{b.[0]}} - {{a.foo}} + {{a.bar}})', resultPath: 'b.[3]' }
      ]
    });

    const results = node.run({}, { a: { foo: 15, bar: 20 } });
    results[0].should.deepEqual([[4]]);
    results[1].should.deepEqual({ a: { foo: 15, bar: 20 }, b: [35, 5, 0, 40] });
  });

  it('should deal with missing variables', () => {
    const node = new MathNode('id', [[4]], {
      statements: [ { expression: '{{a.foo}} + {{a.bar}}', resultPath: 'b.[0]' } ]
    });

    const results = node.run({}, {});
    results[1].should.deepEqual({ b: [NaN] });
  });
});
