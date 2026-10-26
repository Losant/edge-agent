import { contextify } from './common.js';
import CryptoVerifyNode from '../src/crypto-verify-node.js';
import { generateKeyPairSync, createSign } from 'node:crypto';
import fs from 'fs-extra';

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 4096,
  publicKeyEncoding: {
    type: 'spki',
    format: 'pem'
  },
  privateKeyEncoding: {
    type: 'pkcs8',
    format: 'pem'
  }
});

describe('CryptoVerifyNode', () => {
  it('should branch true correctly', async () => {
    const sign = createSign('SHA256');
    sign.update('some data to sign');
    const signature = sign.sign(privateKey, 'hex');
    const node = new CryptoVerifyNode('id', [[5], [4]], {
      algorithmTemplate: 'SHA256',
      dataTemplate: 'some data to sign',
      signatureTemplate: '{{ sign }}',
      signatureEncodingTemplate: 'hex',
      keyTemplate: publicKey
    });

    const results = await node.run({}, { foo: 1, bar: 2, sign: signature });
    results[0].should.deepEqual([4]);
    results[1].should.deepEqual({ foo: 1, bar: 2, sign: signature });
  });
  it('should branch false correctly', async () => {
    const sign = createSign('SHA256');
    sign.update('some data to sign');
    const signature = sign.sign(privateKey, 'hex');
    const node = new CryptoVerifyNode('id', [[5], [4]], {
      algorithmTemplate: 'SHA256',
      dataTemplate: 'some data to sign',
      signatureTemplate: '{{ sign }}',
      keyTemplate: publicKey
    });

    const results = await node.run({}, { foo: 1, bar: 2, sign: signature });
    results[0].should.deepEqual([5]);
    results[1].should.deepEqual({ foo: 1, bar: 2, sign: signature });
  });
  it('should error is dsaEncoding is invalid', async () => {
    const sign = createSign('SHA256');
    sign.update('some data to sign');
    const signature = sign.sign(privateKey, 'hex');
    const node = new CryptoVerifyNode('id', [[5], [4]], {
      algorithmTemplate: 'SHA256',
      dataTemplate: 'some data to sign',
      signatureTemplate: '{{ sign }}',
      keyTemplate: publicKey,
      dsaEncodingTemplate: 'booooo'
    });

    await node.run({}, { foo: 1, bar: 2, sign: signature })
      .should.be.rejectedWith({ message: 'DSA Encoding booooo is invalid.' });
  });
  it('should error is paddingTemplate is invalid', async () => {
    const sign = createSign('SHA256');
    sign.update('some data to sign');
    const signature = sign.sign(privateKey, 'hex');
    const node = new CryptoVerifyNode('id', [[5], [4]], {
      algorithmTemplate: 'SHA256',
      dataTemplate: 'some data to sign',
      signatureTemplate: '{{ sign }}',
      keyTemplate: publicKey,
      paddingTemplate: 'booooo'
    });

    await node.run({}, { foo: 1, bar: 2, sign: signature })
      .should.be.rejectedWith({ message: 'Padding booooo is invalid.' });
  });
  describe('reading from a local path', async () => {
    const diskPath = './foo.txt';
    afterEach(() => {
      fs.rmSync(diskPath, { force: true });
    });
    it('should upload a file from a disk path', async () => {
      await fs.writeFile(diskPath, publicKey);
      const sign = createSign('SHA256');
      sign.update('some data to sign');
      const signature = sign.sign(privateKey, 'hex');
      const node = new CryptoVerifyNode('id', [[5], [4]], {
        algorithmTemplate: 'SHA256',
        dataTemplate: 'some data to sign',
        signatureTemplate: '{{ sign }}',
        keyTemplate: '{{ keyPath }}',
        keyTemplateType: 'diskPath'
      });

      const results = await node.run(contextify({ diskUtils: { loadGuardedFile: (p) => fs.readFile(p) } }), { foo: 1, bar: 2, sign: signature, keyPath: diskPath });
      results[0].should.deepEqual([5]);
      results[1].should.deepEqual({ foo: 1, bar: 2, sign: signature, keyPath: diskPath });
    });
  });
});
