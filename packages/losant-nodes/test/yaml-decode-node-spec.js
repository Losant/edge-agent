import './common.js';
import should from 'should';
import YamlDecodeNode from '../src/yaml-decode-node.js';

describe('YamlDecodeNode', () => {
  it('should correctly decode yaml', async () => {
    const node = new YamlDecodeNode('id', [[4]], {
      source: 'data.in',
      destination: 'data.out'
    });

    await node.run({}, { data: { in: '[1, "2"]' } }).should.be.resolvedWith([
      [[4]],
      { data: { in: '[1, "2"]', out: [1, '2'] } }
    ]);

    await node.run({}, { data: { in: '', out: 'a' } }).should.be.resolvedWith([
      [[4]],
      { data: { in: '' } }
    ]);

    const str = 'b: null\nc: true\nd: false\ne: 1\nf: .nan\ng: .inf\nh: 1.1\ni: a\nj: []\nk: {}\nl: 1970-01-01T00:00:00.001Z\n';
    await node.run({}, { data: { in: str, out: 'a' } }).should.be.resolvedWith([
      [[4]],
      {
        data: {
          in: str,
          out: {
            b: null, c: true, d: false, e: 1, f: NaN, g: Infinity, h: 1.1, i: 'a', j: [], k: {}, l: new Date(1)
          }
        }
      }
    ]);
  });

  it('should correctly decode multi document yaml', async () => {
    const node = new YamlDecodeNode('id', [[4]], {
      source: 'data.in',
      destination: 'data.out'
    });

    await node.run({}, { data: { in: '[1, "2"]\n---\n[3, "4"]' } }).should.be.resolvedWith([
      [[4]],
      { data: { in: '[1, "2"]\n---\n[3, "4"]', out: [[1, '2'], [3, '4']] } }
    ]);
  });

  it('should correctly error by default on bad yaml', async () => {
    const node = new YamlDecodeNode('id', [[4]], {
      source: 'data.in',
      destination: 'data.out'
    });

    await node.run({}, { data: { in: '[1 { "2"]' } }).should.be
      .rejectedWith('Source did not contain valid YAML: data.in');

    await node.run({}, { data: { } }).should.be
      .rejectedWith('Source did not contain valid YAML: data.in');
  });

  it('should correctly write error to payload on bad yaml', async () => {
    const node = new YamlDecodeNode('id', [[4]], {
      source: 'data.in',
      destination: 'data.out',
      errorBehavior: 'payloadPath',
      errorPath: 'spooky'
    });

    const res = await node.run({}, { data: { in: '[1 { "2"]' } });
    should.not.exist(res[1].data.out);
    res[1].spooky.should.deepEqual({ type: 'YAML_DECODE_NODE_ERROR', message: 'Invalid YAML source: data.in' });
  });
});
