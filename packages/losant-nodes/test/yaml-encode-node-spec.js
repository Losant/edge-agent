import './common.js';
import YamlEncodeNode from '../src/yaml-encode-node.js';

describe('YamlEncodeNode', () => {
  it('should correctly encode yaml', async () => {
    const node = new YamlEncodeNode('id', [[4]], {
      source: 'data.in',
      destination: 'data.out'
    });

    await node.run({}, { data: { in: [1, '2'] } }).should.be.resolvedWith([
      [[4]],
      { data: { in: [1, '2'], out: '- 1\n- \'2\'\n' } }
    ]);

    await node.run({}, { data: { } }).should.be.resolvedWith([
      [[4]],
      { data: { out: '' } }
    ]);

    const obj = {
      a: undefined, b: null, c: true, d: false, e: 1, f: NaN, g: Infinity, h: 1.1, i: 'a', j: [], k: {}, l: new Date(1)
    };
    await node.run({}, { data: { in: obj } }).should.be.resolvedWith([
      [[4]],
      { data: { in: obj, out: 'b: null\nc: true\nd: false\ne: 1\nf: .nan\ng: .inf\nh: 1.1\ni: a\nj: []\nk: {}\nl: 1970-01-01T00:00:00.001Z\n' } }
    ]);
  });
});
