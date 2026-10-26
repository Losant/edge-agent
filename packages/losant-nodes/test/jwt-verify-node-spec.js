import './common.js';
import JWTVerifyNode from '../src/jwt-verify-node.js';
import jwt from 'jsonwebtoken';

describe('JWTVerifyNode', () => {
  it('should verify a jwt', async () => {
    // this token was created from this test "should allow creating a jwt with data that is an invalid size" on jwt-create-node
    const token = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJmb28iOiJiYXIiLCJpYXQiOjE2Nzk2Njk1NTIsImlzcyI6ImFuSXNzdWVyIn0.A8CnAog9IqleoFcCu4Qhzf166z7Y3hyHcV_l2w8B4z1l38PTcYzzkMNFyGqmlv9NjRMMPP4N6NhiHzw6TolVEA';

    const node = new JWTVerifyNode('id', [[4], [5]], {
      tokenTemplate: '{{data.token}}',
      secretTemplate: '{{data.key}}',
      issuerTemplate: '{{data.issuer}}'
    });
    const data = {
      token,
      key:  `-----BEGIN RSA PRIVATE KEY-----
MIIBOgIBAAJBAKj34GkxFhD90vcNLYLInFEX6Ppy1tPf9Cnzj4p4WGeKLs1Pt8Qu
KUpRKfFLfRYC9AIKjbJTWit+CqvjWYzvQwECAwEAAQJAIJLixBy2qpFoS4DSmoEm
o3qGy0t6z09AIJtH+5OeRV1be+N4cDYJKffGzDa88vQENZiRm0GRq6a+HPGQMd2k
TQIhAKMSvzIBnni7ot/OSie2TmJLY4SwTQAevXysE2RbFDYdAiEBCUEaRQnMnbp7
9mxDXDf6AU0cN/RPBjb9qSHDcWZHGzUCIG2Es59z8ugGrDY+pxLQnwfotadxd+Uy
v/Ow5T0q5gIJAiEAyS4RaI9YG8EWx/2w0T67ZUVAw8eOMB6BIUg0Xcu+3okCIBOs
/5OiPgoTdSy7bcF9IGpSE8ZgGKzgYQVZeN97YE00
-----END RSA PRIVATE KEY-----`,
      issuer: 'anIssuer'
    };
    const results = await node.run({}, { data });
    results[0].should.deepEqual([5]);
  });

  it('should trim whitespace where appropriate', async () => {
    const expiresIn = 24 * 60 * 60;
    const issuer = '  anIssuer  ';
    const key = '  shhSecret  ';
    const token = jwt.sign({ foo: 'bar' }, key, { expiresIn, issuer });

    const node = new JWTVerifyNode('id', [[4], [5]], {
      tokenTemplate: '  {{data.token}}  ',
      secretTemplate: '{{data.key}}',
      issuerTemplate: '{{data.issuer}}'
    });
    const data = {
      token,
      key,
      issuer
    };
    const results = await node.run({}, { data });
    results[0].should.deepEqual([5]);
  });

  it('should verify a jwt', async () => {
    const expiresIn = 24 * 60 * 60;
    const issuer = 'anIssuer';
    const key = 'shhSecret';
    const token = jwt.sign({ foo: 'bar' }, key, { expiresIn, issuer });

    const node = new JWTVerifyNode('id', [[4], [5]], {
      tokenTemplate: '{{data.token}}',
      secretTemplate: '{{data.key}}',
      issuerTemplate: '{{data.issuer}}'
    });
    const data = {
      token,
      key,
      issuer
    };
    const results = await node.run({}, { data });
    results[0].should.deepEqual([5]);
  });

  it('should return false when the jwt is not verifiable', async () => {
    const token = 'aFakeJWT';
    const issuer = 'anIssuer';
    const key = 'shhSecret';
    const node = new JWTVerifyNode('id', [[4], [5]], {
      tokenTemplate: '{{data.token}}',
      secretTemplate: '{{data.key}}',
      issuerTemplate: '{{data.issuer}}',
      errorPath: 'data.err'
    });
    const data = {
      token,
      key,
      issuer
    };
    const results = await node.run({}, { data });
    results[0].should.deepEqual([4]);
    results[1].data.err.should.deepEqual({
      type: 'JsonWebTokenError',
      message: 'jwt malformed'
    });
  });

  it('should properly deal with a corrupted token', async () => {
    // example code to create a corrupted token that says it is a JSON payload when it is not
    // import jws from 'jws';
    // jws.sign({ header: { alg: 'none', typ: 'JWT' }, payload: 'not-json', encoding: 'utf8' });
    const corruptedToken = 'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.bm90LWpzb24.';

    const node = new JWTVerifyNode('id', [[4]], {
      tokenTemplate: corruptedToken,
      secretTemplate: '',
      issuerTemplate: '',
      errorPath: 'data.err'
    });
    const results = await node.run({}, { });
    results[1].data.should.deepEqual({
      err: {
        type: 'SyntaxError',
        message: 'Unexpected token \'o\', "not-json" is not valid JSON'
      }
    });
  });

  it('should return an error for an incorrect issuer value', async () => {
    //create token
    const issuer = 'anIssuer';
    const key = 'secretSectet';
    const token = jwt.sign({ foo: 'bar' }, key, { issuer });

    //verify token
    const node = new JWTVerifyNode('id', [[4], [5]], {
      tokenTemplate: token,
      secretTemplate: key,
      issuerTemplate: 'anIncorrectIssuer',
      errorPath: 'data.err'
    });
    const data = {
      token,
      key,
      issuer
    };
    const results = await node.run({}, { data });
    results[0].should.deepEqual([4]);
    results[1].data.err.should.deepEqual({
      type: 'JsonWebTokenError',
      message: 'jwt issuer invalid'
    });
  });
});
