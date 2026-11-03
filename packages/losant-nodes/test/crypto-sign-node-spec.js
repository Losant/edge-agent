import { contextify } from './common.js';
import GenerateCertificateNode from '../src/certificate-create-node.js';
import CryptoVerifyNode from '../src/crypto-verify-node.js';
import CryptoSignNode from '../src/crypto-sign-node.js';
import { X509Certificate } from 'node:crypto';
import fs from 'fs-extra';
import _pem from 'pem';
const pem = _pem.promisified;

const { clientKey: caKey, certificate: caCert } = await pem.createCertificate({ days: 1, selfSigned: true, commonName: 'My Root CA' });
const devicePrivateKey = (await pem.createPrivateKey(4096)).key;
const deviceCSR = (await pem.createCSR({
  clientKey: devicePrivateKey,
  keyBitsize: 2048,
  hash: 'sha256',
  country: 'US',
  state: 'OH',
  organization: 'SUSE',
  organizationUnit: 'Edge Industrial',
  commonName: 'Losant',
  emailAddress: 'support@losant.com'
})).csr;

describe('Crypto: Sign Node', () => {
  it('should generate a signature', async () => {
    const genCert = new GenerateCertificateNode('id', [[4]], {
      csrTemplate: deviceCSR,
      caKeyTemplate: caKey,
      caCrtTemplate: caCert,
      algorithmTemplate: 'sha256',
      resultPath: 'result'
    });

    const results = await genCert.run({}, { foo: 1, bar: 2 });
    const signNode = new CryptoSignNode('id', [[4]], {
      dataTemplate: 'some data to sign',
      signatureEncodingTemplate: 'hex',
      algorithmTemplate: 'sha256',
      resultPath: 'result',
      keyTemplate: devicePrivateKey
    });
    const signResults = await signNode.run({}, {});
    const verifyNode = new CryptoVerifyNode('id', [[5], [4]], {
      algorithmTemplate: 'SHA256',
      dataTemplate: 'some data to sign',
      signatureTemplate: signResults[1].result.signature,
      signatureEncodingTemplate: 'hex',
      keyTemplate: results[1].result.certificate
    });
    const ran = await verifyNode.run({}, { foo: 1, bar: 2 });
    ran[0].should.deepEqual([4]);
  });
  it('should error when trying to use a public key to sign', async () => {
    const cert = new X509Certificate(caCert);
    const signNode = new CryptoSignNode('id', [[4]], {
      dataTemplate: 'some data to sign',
      signatureEncodingTemplate: 'hex',
      algorithmTemplate: 'sha256',
      resultPath: 'result',
      keyTemplate: cert.publicKey.export({ type: 'pkcs1', format: 'pem' })
    });
    const results = await signNode.run({}, {});
    results[1].should.deepEqual({ result: { error: { message: 'Key is invalid.' } } });
  });
  it('should error when trying to use a certificate to sign', async () => {
    const signNode = new CryptoSignNode('id', [[4]], {
      dataTemplate: 'some data to sign',
      signatureEncodingTemplate: 'hex',
      algorithmTemplate: 'sha256',
      resultPath: 'result',
      keyTemplate: caCert
    });
    const results = await signNode.run({}, {});
    results[1].should.deepEqual({ result: { error: { message: 'Key is invalid.' } } });
  });
  describe('reading from a local path', async () => {
    const diskPath = './foo.txt';
    afterEach(() => {
      fs.rmSync(diskPath, { force: true });
    });
    it('should upload a file from a disk path', async () => {
      await fs.writeFile(diskPath, devicePrivateKey);
      const node = new CryptoSignNode('id', [[5], [4]], {
        algorithmTemplate: 'SHA256',
        dataTemplate: 'some data to sign',
        keyTemplate: '{{ keyPath }}',
        keyTemplateType: 'diskPath',
        resultPath: 'results'
      });

      const results = await node.run(contextify({ diskUtils: { loadGuardedFile: (p) => fs.readFile(p) } }), { foo: 1, bar: 2, keyPath: diskPath });
      (typeof results[1].results.signature).should.equal('string');
    });
  });
});
