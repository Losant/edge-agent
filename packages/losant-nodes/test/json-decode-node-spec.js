import './common.js';
import should from 'should';
import JsonDecodeNode from '../src/json-decode-node.js';

describe('JsonDecodeNode', () => {
  it('should correctly decode json', async () => {
    const node = new JsonDecodeNode('id', [[4]], {
      source: 'data.in',
      destination: 'data.out'
    });

    const [ oids, payload ] = await node.run({}, { data: { in: '[1, "2"]' } });
    oids.should.deepEqual([[4]]);
    payload.should.deepEqual({ data: { in: '[1, "2"]', out: [1, '2'] } });
  });

  it('should correctly error by default on bad json', () => {
    const node = new JsonDecodeNode('id', [[4]], {
      source: 'data.in',
      destination: 'data.out'
    });

    return node.run({}, { data: { in: '[1 "2"]' } }).should.be
      .rejectedWith('Source did not contain valid JSON: data.in');
  });

  it('should correctly write error to payload on bad json', async () => {
    const node = new JsonDecodeNode('id', [[4]], {
      source: 'data.in',
      destination: 'data.out',
      errorBehavior: 'payloadPath',
      errorPath: 'spooky'
    });

    const res = await node.run({}, { data: { in: '[1 "2"]' } });
    should.not.exist(res[1].data.out);
    res[1].spooky.should.deepEqual({ type: 'JSON_DECODE_NODE_ERROR', message: 'Invalid JSON source: data.in' });
  });
});
