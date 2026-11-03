import './common.js';
import should from 'should';
import CborDecodeNode from '../src/cbor-decode-node.js';

describe('CborDecodeNode', () => {
  it('should correctly decode cbor', async () => {
    const node = new CborDecodeNode('id', [[4]], {
      sourcePath: 'a',
      resultPath: 'b'
    });

    let result = await node.run({}, { a: 'f7' });
    should(result[1].b).be.undefined();

    result = await node.run({}, { a: 'f5' });
    result[1].b.should.equal(true);

    result = await node.run({}, { a: 'a161616162' } );
    result[1].b.should.deepEqual({ a: 'b' });

    result = await node.run({}, { a: 'a16161a16161a16162a16162a161636164' } );
    result[1].b.should.deepEqual({ a: { a: { b: { b: { c: 'd' } } } } });

    result = await node.run({}, { a: 'a26161a26161a26162a26162a161636164616605616504616403616302' });
    result[1].b.should.deepEqual({ a: { a: { b: { b: { c: 'd' }, f: 5 }, e: 4 }, d: 3 }, c: 2 });

    result = await node.run({}, { a: 'af63736574d901028701020304636f6e65a046627566666572636d6170a261616162f769756e646566696e6564656172726179860180812181fbc0064647778dd617fa40200000206464617465c1006a55696e74384172726179d84042151f7155696e7438436c616d7065644172726179d84442151f6b55696e7431364172726179d8454415001f006b55696e7433324172726179d84648150000001f0000006e42696755696e7436344172726179d8475015000000000000001f0000000000000069496e74384172726179d84842151f6a496e7431364172726179d84d4415001f006a496e7433324172726179d84e48150000001f0000006d426967496e7436344172726179d84f5015000000000000001f000000000000006c466c6f617433324172726179d855480000a8410000f8416c466c6f617436344172726179d8565000000000000035400000000000003f40' });
    result[1].b.should.deepEqual({
      Float32Array: { data: [21, 31], type: 'Buffer' },
      Float64Array: { data: [21, 31], type: 'Buffer' },
      Int16Array: { data: [21, 31], type: 'Buffer' },
      Int32Array: { data: [ 21, 31 ], type: 'Buffer' },
      BigInt64Array: null,
      Int8Array: { data: [21, 31], type: 'Buffer' },
      Uint16Array: { data: [21, 31], type: 'Buffer' },
      Uint32Array: { data: [21, 31], type: 'Buffer' },
      BigUint64Array: null,
      Uint8Array: { data: [21, 31], type: 'Buffer' },
      Uint8ClampedArray: { data: [21, 31], type: 'Buffer' },
      array: [1, [], [ -2 ], [ -2.784316 ], 2.5, -1],
      date: new Date(0),
      map: { a: 'b', undefined: 'undefined' },
      set: [ 1, 2, 3, 4, 'one', {}, { data: [98, 117, 102, 102, 101, 114], type: 'Buffer' } ]
    });

    result = await node.run({}, { a: { data: [0xa1, 0x61, 0x61, 0x61, 0x62], type: 'Buffer' } });
    result[1].b.should.deepEqual({ a: 'b' });

    result = await node.run({}, { a: { data: [161, 97, 97, 97, 98], type: 'Buffer' } });
    result[1].b.should.deepEqual({ a: 'b' });

    result = await node.run({}, { a: [161, 97, 97, 97, 98] });
    result[1].b.should.deepEqual({ a: 'b' });

    const b64Node = new CborDecodeNode('id', [[4]], {
      sourcePath: 'a',
      resultPath: 'b',
      encodingTemplate: '{{c}}'
    });
    result = await b64Node.run({}, { a: 'oWFhYWI=', c: 'base64' } );
    result[1].b.should.deepEqual({ a: 'b' });
  });

  it('should correctly write error to payload on bad cbor', async () => {
    const node = new CborDecodeNode('id', [[4]], {
      sourcePath: 'a',
      resultPath: 'b',
      errorPath: 'error'
    });

    let result = await node.run({}, { a: 'garbage' });
    should.not.exist(result[1].b);
    result[1].error.should.deepEqual({ type: 'CBOR_DECODE_NODE_ERROR', message: 'Invalid hexadecimal string.' });

    result = await node.run({}, { a: 'beepe' });
    result[1].error.should.deepEqual({ type: 'CBOR_DECODE_NODE_ERROR', message: 'Invalid hexadecimal string.' });

    result = await node.run({}, { a: 'A2' });
    result[1].error.should.deepEqual({ type: 'CBOR_DECODE_NODE_ERROR', message: 'Unexpected end of CBOR data' });

    result = await node.run({}, { a: new Date() });
    result[1].error.should.deepEqual({ type: 'CBOR_DECODE_NODE_ERROR', message: 'Unexpected end of CBOR data' });

    result = await node.run({}, {});
    result[1].error.should.deepEqual({ type: 'CBOR_DECODE_NODE_ERROR', message: 'Source Path resolved to empty value' });

    const bufferError = 'The first argument must be of type string or an instance of Buffer, ArrayBuffer, or Array or an Array-like Object. Received';

    result = await node.run({}, { a: true });
    result[1].error.should.deepEqual({ type: 'CBOR_DECODE_NODE_ERROR', message: `${bufferError} type boolean (true)` });

    result = await node.run({}, { a: { test: 'obj' } });
    result[1].error.should.deepEqual({ type: 'CBOR_DECODE_NODE_ERROR', message: `${bufferError} an instance of Object` });

    result = await node.run({}, { a: 1 });
    result[1].error.should.deepEqual({ type: 'CBOR_DECODE_NODE_ERROR', message: `${bufferError} type number (1)` });
  });
});
