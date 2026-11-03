import './common.js';
import HashNode from '../src/hash-node.js';
import errors from 'losant-nodejs-utils/src/errors.js';
import should from 'should';

describe('HashNode', () => {

  it('should make an HMAC', async () => {
    const payload = { secret: 'aSecretShh', algorithm: 'md5', data: 'hello world' };
    const outputIds = [['nid1']];
    const config = {
      secretTemplate: '{{secret}}',
      algorithmTemplate: '{{algorithm}}',
      dataTemplate: '{{data}}',
      destinationPath: 'output'
    };
    const node = new HashNode('id', outputIds, config);
    const output = await node.run({}, payload);
    output.should.deepEqual([
      [ [ 'nid1' ] ],
      {
        secret: payload.secret,
        algorithm: payload.algorithm,
        data: payload.data,
        output: 'e0482c9ace2140942960ddde1c25eb76'
      }
    ]);
  });

  it('should make a hash when a secret is not given', async () => {
    const payload = { data: 'hello world', encoding: 'base64' };
    const outputIds = [['nid1']];
    const config = {
      algorithmTemplate: 'md5',
      dataTemplate: '{{data}}',
      destinationPath: 'output',
      encodingTemplate: '{{encoding}}'
    };
    const node = new HashNode('id', outputIds, config);
    const output = await node.run({}, payload);
    output.should.deepEqual([
      [ [ 'nid1' ] ],
      {
        data: payload.data,
        encoding: payload.encoding,
        output: 'XrY7u+Ae7tCTyyK7j1rNww=='
      }
    ]);
  });

  it('should pay attention to data encoding', async () => {
    const input = 'hello world';
    const expectedOutput = '5eb63bbbe01eeed093cb22bb8f5acdc3';
    const config = {
      algorithmTemplate: 'md5',
      dataTemplate: '{{data}}',
      destinationPath: 'output',
      dataEncodingTemplate: '{{encoding}}'
    };
    const node = new HashNode('id', [[]], config);
    let output = await node.run({}, { data: input, encoding: 'utf8' });
    output.should.deepEqual([
      [ [] ],
      {
        data: 'hello world',
        encoding: 'utf8',
        output: expectedOutput
      }
    ]);

    output = await node.run({}, { data: Buffer.from(input).toString('hex'), encoding: 'hex' });
    output.should.deepEqual([
      [ [] ],
      {
        data: '68656c6c6f20776f726c64',
        encoding: 'hex',
        output: expectedOutput
      }
    ]);
  });

  it('should pay attention to secret encoding', async () => {
    const secret = 'i am a key';
    const expectedOutput = 'e6bef26d2546847bd93dd5b867562ed2115c7f3ec03cd7a3d8b19441263e7c1d';
    const config = {
      algorithmTemplate: 'sha256',
      dataTemplate: 'hello world',
      destinationPath: 'output',
      secretEncodingTemplate: '{{encoding}}',
      secretTemplate: '{{secret}}'
    };
    const node = new HashNode('id', [[]], config);
    let output = await node.run({}, { secret, encoding: 'utf8' });
    output.should.deepEqual([
      [ [] ],
      {
        secret: 'i am a key',
        encoding: 'utf8',
        output: expectedOutput
      }
    ]);

    output = await node.run({}, { secret: Buffer.from(secret).toString('hex'), encoding: 'hex' });
    output.should.deepEqual([
      [ [] ],
      {
        secret: '6920616d2061206b6579',
        encoding: 'hex',
        output: expectedOutput
      }
    ]);
  });

  it('should be able to make the aws auth hash', async () => {
    const config = {
      algorithmTemplate: 'sha256',
      encodingTemplate: 'hex',
      destinationPath: 'output',
      secretTemplate: '{{secret}}',
      secretEncodingTemplate: '{{secretEncoding}}',
      dataTemplate: '{{data}}'
    };
    const node = new HashNode('id', [[]], config);

    let output = await node.run({}, {
      secretEncoding: 'utf8',
      secret: 'AWS4wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
      data: '20120215'
    });
    output.should.deepEqual([
      [[]],
      {
        secretEncoding: 'utf8',
        secret: 'AWS4wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
        data: '20120215',
        output: '969fbb94feb542b71ede6f87fe4d5fa29c789342b0f407474670f0c2489e0a0d'
      }
    ]);

    output = await node.run({}, {
      secretEncoding: 'hex',
      secret: output[1].output,
      data: 'us-east-1'
    });
    output.should.deepEqual([
      [[]],
      {
        secretEncoding: 'hex',
        secret: '969fbb94feb542b71ede6f87fe4d5fa29c789342b0f407474670f0c2489e0a0d',
        data: 'us-east-1',
        output: '69daa0209cd9c5ff5c8ced464a696fd4252e981430b10e3d3fd8e2f197d7a70c'
      }
    ]);

    output = await node.run({}, {
      secretEncoding: 'hex',
      secret: output[1].output,
      data: 'iam'
    });
    output.should.deepEqual([
      [[]],
      {
        secretEncoding: 'hex',
        secret: '69daa0209cd9c5ff5c8ced464a696fd4252e981430b10e3d3fd8e2f197d7a70c',
        data: 'iam',
        output: 'f72cfd46f26bc4643f06a11eabb6c0ba18780c19a8da0c31ace671265e3c87fa'
      }
    ]);

    output = await node.run({}, {
      secretEncoding: 'hex',
      secret: output[1].output,
      data: 'aws4_request'
    });
    output.should.deepEqual([
      [[]],
      {
        secretEncoding: 'hex',
        secret: 'f72cfd46f26bc4643f06a11eabb6c0ba18780c19a8da0c31ace671265e3c87fa',
        data: 'aws4_request',
        output: 'f4780e2d9f65fa895f9c67b32ce1baf0b0d8a43505a000a1a9e090d414db404d'
      }
    ]);
  });

  it('should error if the algorithm is not valid', async () => {
    const payload = { data: 'hello world' };
    const outputIds = [['nid1']];
    const config = {
      algorithmTemplate: 'A TERRIBLE HORRIBLE ALGORITHM',
      dataTemplate: '{{data}}',
      destinationPath: 'output'
    };
    const node = new HashNode('id', outputIds, config);
    let err;
    try {
      await node.run({}, payload);
    } catch (e) {
      err = e;
    }
    err.should.deepEqual(errors.Validation({ message: 'Algorithm must be one of the following md5, sha1, sha256, sha512, whirlpool, ripemd, not \'a terrible horrible algorithm\'.' }));
  });

  it('should error if the encoding is not valid', async () => {
    const payload = { data: 'hello world' };
    const outputIds = [['nid1']];
    const config = {
      algorithmTemplate: 'md5',
      dataTemplate: '{{data}}',
      destinationPath: 'output',
      encodingTemplate: 'Not an encoding'
    };
    const node = new HashNode('id', outputIds, config);
    let err;
    try {
      await node.run({}, payload);
    } catch (e) {
      err = e;
    }
    err.should.deepEqual(errors.Validation({ message: 'Encoding must be one of the following: ascii, utf8, utf16le, ucs2, base64, latin1, binary, hex.' }));
  });

  it('should error if the data is not valid for the encoding', async () => {
    const payload = { data: 'hello world' };
    const outputIds = [['nid1']];
    const config = {
      algorithmTemplate: 'md5',
      dataTemplate: '{{data}}',
      dataEncodingTemplate: 'hex',
      destinationPath: 'output'
    };
    const node = new HashNode('id', outputIds, config);
    let err;
    try {
      await node.run({}, payload);
    } catch (e) {
      err = e;
    }
    err.should.deepEqual(errors.Validation({ message: 'Invalid hexadecimal string.' }));
  });

  describe('Giving the node odd inputs', async () => {
    const inputs = [
      { secretTemplate: undefined, dataTemplate: undefined },
      { secretTemplate: 'shh', dataTemplate: '' },
      { secretTemplate: '', dataTemplate: '' },
      { secretTemplate: 1234, dataTemplate: null },
      { secretTemplate: null, dataTemplate: '' },
      { secretTemplate: 1234, dataTemplate: 5678 }
    ];
    inputs.forEach(({ secretTemplate, dataTemplate }) => {
      it(`get a hash when secretTemplate is "${secretTemplate}" and dataTemplate is "${dataTemplate}"`, async () => {
        const outputIds = [['nid1']];
        const config = {
          algorithmTemplate: 'md5',
          dataTemplate,
          secretTemplate,
          destinationPath: 'output',
          encodingTemplate: 'hex'
        };
        const node = new HashNode('id', outputIds, config);
        let err, output;
        try {
          output = await node.run({}, {});
        } catch (e) {
          err = e;
        }
        (err === undefined).should.be.true();
        should.exist(output);
      });
    });
  });

});
