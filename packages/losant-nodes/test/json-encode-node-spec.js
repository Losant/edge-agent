import './common.js';
import JsonEncodeNode from '../src/json-encode-node.js';

describe('JsonEncodeNode', () => {
  it('should correctly decode json', () => {
    const node = new JsonEncodeNode('id', [[4]], {
      source: 'data.in',
      destination: 'data.out'
    });

    const results = node.run({}, { data: { in: [1, '2'] } });
    results[0].should.deepEqual([[4]]);
    results[1].should.deepEqual({ data: { in: [1, '2'], out: '[1,"2"]' } });
  });
});
