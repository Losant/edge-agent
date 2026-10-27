import './common.js';
import SwitchNode from '../src/switch-node.js';

describe('SwitchNode', () => {
  it('should run switch correctly', () => {
    const node = new SwitchNode('id', [[10, 9], [8, 7], [6, 5], [4, 3]], {
      switchTemplate: '{{a}}',
      cases: [
        { caseTemplate: 'one' },
        { caseTemplate: 'two' },
        { caseTemplate: 'three' }
      ]
    });

    let results = node.run({}, { a: 'one' });
    results[0].should.deepEqual([8, 7]);
    results[1].should.deepEqual({ a: 'one' });

    results = node.run({}, { a: 'two' });
    results[0].should.deepEqual([6, 5]);
    results[1].should.deepEqual({ a: 'two' });

    results = node.run({}, { a: 'three' });
    results[0].should.deepEqual([4, 3]);
    results[1].should.deepEqual({ a: 'three' });

    results = node.run({}, { a: 'four' });
    results[0].should.deepEqual([10, 9]);
    results[1].should.deepEqual({ a: 'four' });
  });

  it('should allow direct obj equality', () => {
    const node = new SwitchNode('id', [[10, 9], [8, 7], [6, 5], [4, 3]], {
      switchTemplate: '{{b}}',
      cases: [
        { caseTemplate: '{{a}}' },
        { caseTemplate: '{{b}}' },
        { caseTemplate: '{{c}}' }
      ]
    });

    const results = node.run({}, { a: { a: 1 }, b: { a: 1 } });
    results[0].should.deepEqual([6, 5]);
    results[1].should.deepEqual({ a: { a: 1 }, b: { a: 1 } });
  });
});
