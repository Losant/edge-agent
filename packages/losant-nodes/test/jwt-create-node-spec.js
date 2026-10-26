import { sinon } from './common.js';
import JWTCreateNode from '../src/jwt-create-node.js';
import jwt from 'jsonwebtoken';

describe('JWTCreateNode', () => {
  it('should not allow creating a jwt with data that is an invalid size', async () => {
    const node = new JWTCreateNode('id', [[4]], {
      dataTemplate: '{ "foo": "{{data.in}}" }',
      dataTemplateType: 'json',
      secretTemplate: '{{data.key}}',
      algorithmTemplate: '{{data.alg}}',
      issuerTemplate: '{{data.issuer}}',
      destinationPath: 'data.out'
    });
    const data = {
      in: 'bar',
      key: `-----BEGIN RSA PRIVATE KEY-----
MIIBOgIBAAJBAKj34GkxFhD90vcNLYLInFEX6Ppy1tPf9Cnzj4p4WGeKLs1Pt8Qu
KUpRKfFLfRYC9AIKjbJTWit+CqvjWYzvQwECAwEAAQJAIJLixBy2qpFoS4DSmoEm
o3qGy0t6z09AIJtH+5OeRV1be+N4cDYJKffGzDa88vQENZiRm0GRq6a+HPGQMd2k
TQIhAKMSvzIBnni7ot/OSie2TmJLY4SwTQAevXysE2RbFDYdAiEBCUEaRQnMnbp7
9mxDXDf6AU0cN/RPBjb9qSHDcWZHGzUCIG2Es59z8ugGrDY+pxLQnwfotadxd+Uy
v/Ow5T0q5gIJAiEAyS4RaI9YG8EWx/2w0T67ZUVAw8eOMB6BIUg0Xcu+3okCIBOs
/5OiPgoTdSy7bcF9IGpSE8ZgGKzgYQVZeN97YE00
-----END RSA PRIVATE KEY-----`,
      alg: 'RS256',
      issuer: 'anIssuer'
    };
    let error;
    try {
      await node.run({}, { data });
    } catch (e) {
      error = e;
    }
    error.type.should.equal('JWTSign');
    error.message.should.equal('secretOrPrivateKey has a minimum key size of 2048 bits for RS256');
  });
  it('should create a jwt with a dataTemplate for dataTemplateType of json', async () => {
    const node = new JWTCreateNode('id', [[4]], {
      dataTemplate: '{ "foo": "{{data.in}}" }',
      dataTemplateType: 'json',
      secretTemplate: '{{data.key}}',
      algorithmTemplate: '{{data.alg}}',
      issuerTemplate: '{{data.issuer}}',
      destinationPath: 'data.out'
    });
    const data = {
      in: 'bar',
      key: 'shhSecret',
      alg: 'HS256',
      issuer: 'anIssuer'
    };
    const results = await node.run({}, { data });
    jwt.decode(results[1].data.out, { json: true }).foo.should.equal('bar');
  });
  it('should create a jwt with an object', async () => {
    const node = new JWTCreateNode('id', [[4]], {
      dataTemplate: JSON.stringify({ foo: 'bar', iss: 'anIssuer', exp: (24*60*60) }),
      dataTemplateType: 'json',
      secretTemplate: 'shhSecret',
      algorithmTemplate: 'HS256',
      destinationPath: 'data.out'
    });
    const data = {};
    const results = await node.run({}, { data });
    jwt.decode(results[1].data.out, { json: true }).foo.should.equal('bar');
  });
  it('should return an error if the algorithm is invalid', async () => {
    const node = new JWTCreateNode('id', [[4]], {
      dataTemplate: 'data.in',
      dataTemplateType: 'path',
      secretTemplate: '{{data.key}}',
      algorithmTemplate: '{{data.alg}}',
      expiresIn: 24*60*60,
      issuerTemplate: '{{data.issuer}}',
      destinationPath: 'data.out'
    });
    const data = {
      in: { foo: 'bar' },
      key: 'shhSecret',
      alg: 'aFakeAlgorithm',
      issuer: 'anIssuer'
    };
    const results = await node.run({}, { data });
    results[1].data.out.should.deepEqual({
      error: {
        type: 'INVALID_ALGORITHM',
        message: `The algorithm ${data.alg} is not supported`
      }
    });
  });
  it('should return the correct jwt for dataTemplateType of path', async () => {
    const node = new JWTCreateNode('id', [[4]], {
      dataTemplate: 'data.in',
      dataTemplateType: 'path',
      secretTemplate: 'aSecret',
      algorithmTemplate: 'HS256',
      expiresIn: 24*60*60,
      issuerTemplate: 'anIssuer',
      destinationPath: 'data.out'
    });
    const results = await node.run({}, { data: { in: { foo: 'bar' } } });
    jwt.decode(results[1].data.out).foo.should.equal('bar');
  });
  it('should throw a JWTSign error when jwt.sign errors', async () => {
    const message = 'error:0906D06C:PEM routines:PEM_read_bio:no start line';
    const jwtStub = sinon.stub(jwt, 'sign').callsFake((data, secret, options) => {
      data.should.deepEqual({ foo: 'bar' });
      secret.should.equal('aSecret');
      options.should.deepEqual({ header: {}, algorithm: 'HS256', expiresIn: 86400, issuer: 'anIssuer' });
      throw Error(message);
    });
    const node = new JWTCreateNode('id', [[4]], {
      dataTemplate: 'data.in',
      dataTemplateType: 'path',
      secretTemplate: 'aSecret',
      algorithmTemplate: 'HS256',
      expiresIn: 24*60*60,
      issuerTemplate: 'anIssuer',
      destinationPath: 'data.out'
    });
    await node.run({}, { data: { in: { foo: 'bar' } } }).should.be.rejectedWith({ message });
    jwtStub.restore();
  });

  it('should create a jwt with path for the headers', async () => {
    const node = new JWTCreateNode('id', [[4]], {
      dataTemplate: '{ "foo": "{{data.in}}" }',
      dataTemplateType: 'json',
      headerTemplateType: 'path',
      headerTemplate: 'data.headersHere',
      secretTemplate: '{{data.key}}',
      algorithmTemplate: '{{data.alg}}',
      issuerTemplate: '{{data.issuer}}',
      destinationPath: 'data.out'
    });
    const data = {
      in: 'bar',
      key: 'shhSecret',
      alg: 'HS256',
      issuer: 'anIssuer',
      headersHere: { random: 'yup' }
    };
    const results = await node.run({}, { data });
    jwt.decode(results[1].data.out, { complete: true }).header.should.deepEqual({
      alg: 'HS256', typ: 'JWT', random: 'yup'
    });
  });

  it('should create a jwt with template for the headers', async () => {
    const node = new JWTCreateNode('id', [[4]], {
      dataTemplate: '{ "foo": "{{data.in}}" }',
      dataTemplateType: 'json',
      headerTemplateType: 'json',
      headerTemplate: '{{data.headersHere}}',
      secretTemplate: '{{data.key}}',
      algorithmTemplate: '{{data.alg}}',
      issuerTemplate: '{{data.issuer}}',
      destinationPath: 'data.out'
    });
    const data = {
      in: 'bar',
      key: 'shhSecret',
      alg: 'HS256',
      issuer: 'anIssuer',
      headersHere: JSON.stringify({ random: 'woo', alg: 'none' })
    };
    const results = await node.run({}, { data });
    jwt.decode(results[1].data.out, { complete: true }).header.should.deepEqual({
      alg: 'none', typ: 'JWT', random: 'woo'
    });
  });
});
