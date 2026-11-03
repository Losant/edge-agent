import './common.js';
import ConditionalNode from '../src/conditional-node.js';

describe('ConditionalNode', () => {
  it('should branch true correctly', () => {
    const node = new ConditionalNode('id', [[5], [4]], { expression: '{{foo}} < {{bar}}' });

    const results = node.run({}, { foo: 1, bar: 2 });
    results[0].should.deepEqual([4]);
    results[1].should.deepEqual({ foo: 1, bar: 2 });
  });

  it('should branch false correctly', () => {
    const node = new ConditionalNode('id', [[5], [4]], { expression: '{{foo}} < {{bar}}' });

    const results = node.run({}, { foo: 2, bar: 1 });
    results[0].should.deepEqual([5]);
    results[1].should.deepEqual({ foo: 2, bar: 1 });
  });

  it('should be fine with missing variables', () => {
    const node = new ConditionalNode('id', [[5], [4]], { expression: '{{foo}} === {{bar}}' });
    let results = node.run({}, { foo: 1 });
    results[0].should.deepEqual([5]);
    results = node.run({}, { foo: undefined });
    results[0].should.deepEqual([4]);
  });

  it('should not correctly', () => {
    const node = new ConditionalNode('id', [[5], [4]], { expression: '!!{{foo}}' });
    let results =  node.run({}, { foo: 1 });
    results[0].should.deepEqual([4]);
    results = node.run({}, { foo: null });
    results[0].should.deepEqual([5]);
  });

  it('should deal with booleans', () => {
    const node = new ConditionalNode('id', [[5], [4]], { expression: '{{foo}} == false' });

    let results = node.run({}, { foo: true });
    results[0].should.deepEqual([5]);
    results = node.run({}, { foo: false });
    results[0].should.deepEqual([4]);
  });

  it('should deal with strings correctly', () => {
    const node = new ConditionalNode('id', [[5], [4]], { expression: '{{foo}} === {{bar}}' });

    let results = node.run({}, { foo: 2, bar: '2' });
    results[0].should.deepEqual([5]);
    results[1].should.deepEqual({ foo: 2, bar: '2' });

    results = node.run({}, { foo: 2, bar: 2 });
    results[0].should.deepEqual([4]);
    results[1].should.deepEqual({ foo: 2, bar: 2 });

    results = node.run({}, { foo: '2', bar: '2' });
    results[0].should.deepEqual([4]);
    results[1].should.deepEqual({ foo: '2', bar: '2' });
  });
});
