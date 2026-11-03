import './common.js';
import JWTDecodeNode from '../src/jwt-decode-node.js';
import jwt from 'jsonwebtoken';

describe('JWTDecodeNode', () => {

  it('should trim whitespace where appropriate and parse the json', () => {
    const expiresIn = 24 * 60 * 60;
    const key = '  shhSecret  ';
    const token = jwt.sign({ foo: 'bar' }, key, { issuer: '  a  ', expiresIn });

    const node = new JWTDecodeNode('id', [[4]], {
      tokenTemplate: '  {{data.in}}  ',
      complete: true,
      destinationPath: 'data.out'
    });
    const data = {
      in: token
    };
    const results = node.run({}, { data });
    results[1].data.out.payload.foo.should.deepEqual('bar');
    results[1].data.out.payload.iss.should.deepEqual('  a  ');
    results[1].data.out.header.alg.should.equal('HS256');
    results[1].data.out.signature.should.be.an.instanceof(String);
  });

  it('should properly deal with a corrupted token', () => {
    // example code to create a corrupted token that says it is a JSON payload when it is not
    // import jws from 'jws';
    // jws.sign({ header: { alg: 'none', typ: 'JWT' }, payload: 'not-json', encoding: 'utf8' });
    const corruptedToken = 'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.bm90LWpzb24.';
    const node = new JWTDecodeNode('id', [[4]], {
      tokenTemplate: '{{data.in}}',
      complete: true,
      destinationPath: 'data.out'
    });
    const data = { in: corruptedToken };
    const results = node.run({}, { data });
    results[1].data.should.deepEqual({ ...data, out: null });
  });

  it('should deal with random input', () => {
    const token = 'totally not a token, yo';

    const node = new JWTDecodeNode('id', [[4]], {
      tokenTemplate: '{{data.in}}',
      destinationPath: 'data.out'
    });
    const data = { in: token };
    const results = node.run({}, { data });
    results[1].data.should.deepEqual({ ...data, out: null });
  });

  it('should decode a jwt and parse the json', () => {
    const expiresIn = 24 * 60 * 60;
    const key = 'shhSecret';
    const token = jwt.sign({ foo: 'bar' }, key, { expiresIn });

    const node = new JWTDecodeNode('id', [[4]], {
      tokenTemplate: '{{data.in}}',
      destinationPath: 'data.out'
    });
    const data = {
      in: token
    };
    const results = node.run({}, { data });
    results[1].data.out.foo.should.equal('bar');
  });

  it('should decode a jwt and return the headers and signature', () => {
    const key = 'shhSecret';
    const token = jwt.sign('bar', key);

    const node = new JWTDecodeNode('id', [[4]], {
      tokenTemplate: '{{data.in}}',
      complete: true,
      destinationPath: 'data.out'
    });
    const data = {
      in: token
    };
    const results = node.run({}, { data });
    results[1].data.out.payload.should.equal('bar');
    results[1].data.out.header.alg.should.equal('HS256');
    results[1].data.out.signature.should.be.an.instanceof(String);
  });
});
