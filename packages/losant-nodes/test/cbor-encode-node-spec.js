import './common.js';
import CborEncodeNode from '../src/cbor-encode-node.js';

describe('CborEncodeNode', () => {
  it('should correctly encode cbor', async () => {
    const node = new CborEncodeNode('id', [[4]], {
      sourcePath: 'a',
      resultPath: 'b'
    });

    let result = await node.run({}, {});
    result[1].b.should.equal('f7'); //encoded undefined

    result = await node.run({}, { a: true });
    result[1].b.should.equal('f5');

    result = await node.run({}, { a: { a: 'b' } } );
    result[1].b.should.equal('a161616162');

    result = await node.run({}, { a: { a: { a: { b: { b: { c: 'd' } } } } } } );
    result[1].b.should.equal('a16161a16161a16162a16162a161636164');

    result = await node.run({}, { a: { a: { a: { b: { b: { c: 'd' }, f: 5 }, e: 4 }, d: 3 }, c: 2 }, b: 1 } );
    result[1].b.should.equal('a26161a26161a26162a26162a161636164616605616504616403616302');

    result = await node.run(
      {},
      {
        a: {
          set: new Set([1, 2, 3, 4, 'one', {}, Buffer.from('buffer')]),
          map: new Map([['a', 'b'], [undefined, 'undefined']]),
          array: [1, [], [-2], [-2.784316], 2.5, -1],
          date: new Date(0)
        }
      }
    );
    result[1].b.should.equal('a463736574d901028701020304636f6e65a046627566666572636d6170a261616162f769756e646566696e6564656172726179860180812181fbc0064647778dd617fb4004000000000000206464617465c11a00000000');

    const b64Node = new CborEncodeNode('id', [[4]], {
      sourcePath: 'a',
      resultPath: 'b',
      encodingTemplate: '{{c}}'
    });
    result = await b64Node.run({}, { a: { a: 'b' }, c: 'base64' } );
    result[1].b.should.equal('oWFhYWI=');
  });

  it('should correctly write error to payload on bad encoding', async () => {
    const node = new CborEncodeNode('id', [[4]], {
      sourcePath: 'a',
      resultPath: 'b',
      encodingTemplate: 'bad!',
      errorPath: 'error'
    });

    const result = await node.run({}, { a: true });
    result[1].error.should.deepEqual({
      type: 'CBOR_ENCODE_NODE_ERROR',
      message: 'Encoding must be one of the following: base64, binary, hex.'
    });
  });
});
