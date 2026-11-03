import { contextify } from './common.js';
import should from 'should';
import CertificateReadNode from '../src/certificate-read-node.js';
import _pem from 'pem';
import { fakeClientSslCert } from 'losant-nodejs-utils/test/utils/fake-ssl.js';
import fs from 'fs-extra';
const pem = _pem.promisified;

const { clientKey: caKey, certificate: caCert } = await pem.createCertificate({ days: 1, selfSigned: true, commonName: 'My Root CA' });
const { certificate } = await pem.createCertificate({ days: 1, serviceKey: caKey, serviceCertificate: caCert, commonName: 'Losant' });

describe('CertificateReadNode', () => {
  it('should get a certificate info', async () => {
    const node = new CertificateReadNode('id', [[4]], {
      crtTemplate: caCert,
      resultPath: 'result'
    });
    const results = await node.run({}, {});
    should.exist(results[1].result.publicKey);
    (typeof results[1].result.publicKey).should.equal('string');
    results[1].result.info.commonName.should.equal('My Root CA');
    [ 'fingerprint', 'issuerName', 'serial', 'country', 'state', 'locality', 'organization',
      'organizationUnit', 'commonName', 'emailAddress' ].forEach((field) => {
      (typeof results[1].result.info[field]).should.equal('string');
    });
  });
  it('should get multiple certificates infos', async () => {
    const node = new CertificateReadNode('id', [[4]], {
      crtTemplate: `${caCert}\n${certificate}`,
      resultPath: 'result'
    });
    const results = await node.run({}, {});
    results[1].result.length.should.equal(2);
    results[1].result[0].info.commonName.should.equal('My Root CA');
    results[1].result[1].info.commonName.should.equal('Losant');
  });
  it('should get multiple certificates infos with a bad certificate', async () => {
    const node = new CertificateReadNode('id', [[4]], {
      crtTemplate: `${caCert}\n-----BEGIN CERTIFICATE-----${caKey}-----END CERTIFICATE-----\n${certificate}`,
      resultPath: 'result'
    });
    const results = await node.run({}, {});
    results[1].result.length.should.equal(3);
    results[1].result[0].info.commonName.should.equal('My Root CA');
    results[1].result[1].error.message.should.equal('Invalid certificate in bundle.');
    results[1].result[2].info.commonName.should.equal('Losant');
  });

  it('should get a certificate info from the payload path', async () => {
    const node = new CertificateReadNode('id', [[4]], {
      crtTemplate: 'crt',
      crtTemplateType: 'payloadPath',
      resultPath: 'result'
    });
    const results = await node.run({}, { crt: fakeClientSslCert });
    results[1].result.info.commonName.should.equal('clientCert.com');
  });

  it('should error if certificate is invalid', async () => {
    const node = new CertificateReadNode('id', [[4]], {
      crtTemplate: caKey,
      resultPath: 'result'
    });
    await node.run({}, {}).should.be.rejectedWith({ message: 'Certificate is in an invalid format.' });
  });
  describe('reading from a local path', async () => {
    const diskPath = './foo.txt';
    afterEach(() => {
      fs.rmSync(diskPath, { force: true });
    });
    it('should upload a file from a disk path', async () => {
      await fs.writeFile(diskPath, caCert);
      const node = new CertificateReadNode('id', [[4]], {
        crtTemplate: '{{crtPath}}',
        crtTemplateType: 'diskPath',
        resultPath: 'result'
      });

      const results = await node.run(contextify({ diskUtils: { loadGuardedFile: (p) => fs.readFile(p) } }), { crtPath: diskPath });
      results[1].result.info.commonName.should.equal('My Root CA');
    });
  });
});
