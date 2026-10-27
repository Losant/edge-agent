import { contextify } from './common.js';
import CertificateCreateNode from '../src/certificate-create-node.js';
import CryptoVerifyNode from '../src/crypto-verify-node.js';
import { createPublicKey, createSign, generateKeyPairSync } from 'node:crypto';
import _pem from 'pem';
import * as x509 from '@peculiar/x509';
import fs from 'fs-extra';
import { fakeSslKey } from 'losant-nodejs-utils/test/utils/fake-ssl.js';
import { fakeEcdsaCert, fakeEcdsaKey } from 'losant-nodejs-utils/test/utils/fake-ssl-alt-names.js';
const pem = _pem.promisified;

const { clientKey: caKey, certificate: caCert } =
  await pem.createCertificate({ days: 1, selfSigned: true, commonName: 'My Root CA' });
const devicePrivateKey = (await pem.createPrivateKey(4096)).key;
const devicePublicKey = createPublicKey(devicePrivateKey).export({ type: 'spki', format: 'pem' });
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
const deviceCSRWithSan = (await pem.createCSR({
  clientKey: devicePrivateKey,
  keyBitsize: 2048,
  hash: 'sha256',
  commonName: 'CSR with SAN',
  altNames: [ 'original.example.com', 'second.example.com' ]
})).csr;
const { privateKey: deviceECPrivateKey, publicKey: deviceECPublicKey } = generateKeyPairSync('ec', {
  namedCurve: 'prime256v1',
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' }
});
const deviceECCSR = (await pem.createCSR({
  clientKey: deviceECPrivateKey,
  hash: 'sha256',
  commonName: 'EC CSR'
})).csr;

const buildEd25519Ca = async () => {
  const keys = await globalThis.crypto.subtle.generateKey({ name: 'Ed25519' }, true, [ 'sign', 'verify' ]);
  const cert = await x509.X509CertificateGenerator.createSelfSigned({
    serialNumber: '01',
    name: 'CN=Ed25519 Test CA',
    notBefore: new Date('2025-01-01T00:00:00Z'),
    notAfter: new Date('2030-01-01T00:00:00Z'),
    signingAlgorithm: { name: 'Ed25519' },
    keys,
    extensions: [ new x509.BasicConstraintsExtension(true, undefined, true) ]
  });
  const pkcs8 = await globalThis.crypto.subtle.exportKey('pkcs8', keys.privateKey);
  return {
    caCertPem: cert.toString('pem'),
    caKeyPem: x509.PemConverter.encode(pkcs8, 'PRIVATE KEY')
  };
};
const { caCertPem: ed25519CaCert, caKeyPem: ed25519CaKey } = await buildEd25519Ca();

// Ed25519 leaf fixtures (CSR + pubkey + privkey, all from one keypair).
const ed25519LeafKeys = await globalThis.crypto.subtle.generateKey({ name: 'Ed25519' }, true, [ 'sign', 'verify' ]);
const ed25519LeafCsr = (await x509.Pkcs10CertificateRequestGenerator.create({
  name: 'CN=Ed25519 device',
  keys: ed25519LeafKeys,
  signingAlgorithm: { name: 'Ed25519' }
})).toString('pem');
const ed25519LeafPublicKey = x509.PemConverter.encode(
  await globalThis.crypto.subtle.exportKey('spki', ed25519LeafKeys.publicKey), 'PUBLIC KEY');
const ed25519LeafPrivateKey = x509.PemConverter.encode(
  await globalThis.crypto.subtle.exportKey('pkcs8', ed25519LeafKeys.privateKey), 'PRIVATE KEY');

// Ed448 fixtures: pre-generated via openssl since peculiar 2.0 cannot sign
// with Ed448 (the algorithm-spread bug). Leaf inputs (CSR/pubkey/privkey)
// work end-to-end because peculiar parses them fine and signing happens with
// the RSA/EC/Ed25519 CA. Ed448 *as a CA key* is rejected by importSigningKey
// — the ed448Ca* fixtures below exist solely for the rejection-path test.
//
// Leaf:
//   openssl genpkey -algorithm Ed448 -out priv.pem
//   openssl pkey -in priv.pem -pubout -out pub.pem
//   openssl req -new -key priv.pem -subj "/CN=Ed448 device" -out csr.pem
// CA:
//   openssl genpkey -algorithm Ed448 -out ca-priv.pem
//   openssl req -x509 -new -key ca-priv.pem -days 1825 -subj "/CN=Ed448 Test CA" -out ca.pem
const ed448CaKey = `-----BEGIN PRIVATE KEY-----
MEcCAQAwBQYDK2VxBDsEOWKqJ0BV4u5bmbK1pg3tErueT7EWzrwHKuh4IgcBaY54
UArt6NRh3pTQhB7c+WZhUx9wL8WrrnVjEA==
-----END PRIVATE KEY-----`;
const ed448CaCert = `-----BEGIN CERTIFICATE-----
MIIBkDCCARCgAwIBAgIUV/NFFe16+buV67T5NCR8ktEdBEgwBQYDK2VxMBgxFjAU
BgNVBAMMDUVkNDQ4IFRlc3QgQ0EwHhcNMjYwNTA2MDA0MjA0WhcNMzEwNTA1MDA0
MjA0WjAYMRYwFAYDVQQDDA1FZDQ0OCBUZXN0IENBMEMwBQYDK2VxAzoAt7R0Xvci
EdJelZyGKuxOyuMfOwZZrXq+1Z1+p3LtaAxXSBDSvel7QhWlWO7hl6fMXo9KUK5j
VW+Ao1MwUTAdBgNVHQ4EFgQUGviXk9ahKgj0sXIHmTcHfCzxz5AwHwYDVR0jBBgw
FoAUGviXk9ahKgj0sXIHmTcHfCzxz5AwDwYDVR0TAQH/BAUwAwEB/zAFBgMrZXED
cwBRYMCQRux6GIceurdtR7GqiqXr+COInRzbZ8eiMCrzF8jwBsGbBSyJchMhIrAL
fDj4QugMJZS95oAIP5pFxyxrOcDFXL+qerTrQMBNrPF54W8xepGp4bOX0WG4uYVH
DsygVkLFc9NSpmJhLn5Kl9bsHwA=
-----END CERTIFICATE-----`;
const ed448LeafPrivateKey = `-----BEGIN PRIVATE KEY-----
MEcCAQAwBQYDK2VxBDsEORhVRoTauLfZaIDTHTFTCEEBNkO0YYvYgrz5juGAJQcI
C3pN8NlKG1HdvdmSFFAivg1sR2fjPtOyrA==
-----END PRIVATE KEY-----`;
const ed448LeafPublicKey = `-----BEGIN PUBLIC KEY-----
MEMwBQYDK2VxAzoA//KiDSviHOBaDnlKo5LJ3V/fFH9VfrCpTKbJgeBAO8WmPlYL
DJ5N91CwQYNLvXoOu3G6eukA2ZGA
-----END PUBLIC KEY-----`;
const ed448LeafCsr = `-----BEGIN CERTIFICATE REQUEST-----
MIHhMGMCAQAwFzEVMBMGA1UEAwwMRWQ0NDggZGV2aWNlMEMwBQYDK2VxAzoA//Ki
DSviHOBaDnlKo5LJ3V/fFH9VfrCpTKbJgeBAO8WmPlYLDJ5N91CwQYNLvXoOu3G6
eukA2ZGAoAAwBQYDK2VxA3MAyp8/7e/lI9zD3RYjefwp1dXalpwk6SO+7xF+neU8
u/ZrpW++1KcdXLP2LLq0uVtZdw4KdAx/GdmAesHJnVuMh4paGbA9S5GZCTgBkELV
mkZKkNoIqA7of5+kGu9EmbkPlqHXt0s1FoUhMbPIUYtA5BkA
-----END CERTIFICATE REQUEST-----`;

// Encrypted private-key fixtures (used by the detectPemType rejection tests).
const { privateKey: pkcs8EncryptedKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem', cipher: 'aes-256-cbc', passphrase: 'pw' }
});
const { privateKey: legacyEncryptedKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs1', format: 'pem', cipher: 'aes-256-cbc', passphrase: 'pw' }
});

// Empty-subject CSR (built via peculiar — pem.createCSR forces a CN default).
const emptySubjectKeys = await globalThis.crypto.subtle.generateKey(
  { name: 'ECDSA', namedCurve: 'P-256' }, true, [ 'sign', 'verify' ]
);
const emptySubjectCSR = (await x509.Pkcs10CertificateRequestGenerator.create({
  name: '', // truly empty subject
  keys: emptySubjectKeys,
  signingAlgorithm: { name: 'ECDSA', hash: 'SHA-256' }
})).toString('pem');

// Helper: parse a generated cert PEM and return its extensions in a compact
// { name -> peculiar-instance } shape for assertions.
const extensionsByName = (certPem) => {
  const cert = new x509.X509Certificate(certPem);
  return {
    basicConstraints: cert.getExtension(x509.BasicConstraintsExtension),
    keyUsage: cert.getExtension(x509.KeyUsagesExtension),
    extKeyUsage: cert.getExtension(x509.ExtendedKeyUsageExtension),
    subjectKeyIdentifier: cert.getExtension(x509.SubjectKeyIdentifierExtension),
    authorityKeyIdentifier: cert.getExtension(x509.AuthorityKeyIdentifierExtension),
    subjectAltName: cert.getExtension(x509.SubjectAlternativeNameExtension)
  };
};

// peculiar's SAN GeneralNames use string types (e.g. 'dns', 'ip', 'url',
// 'email'). Note that what we call 'uri' is 'url' in peculiar's vocabulary.
const sanEntries = (sanExtension) => sanExtension?.names.toJSON() || [];

describe('CertificateCreateNode', () => {
  // Default config used by most tests. Spread (`{...baseConfig, X}`) and
  // override individual fields per test.
  const baseConfig = {
    csrTemplate: deviceCSR,
    caKeyTemplate: caKey,
    caCrtTemplate: caCert,
    algorithmTemplate: 'sha256',
    resultPath: 'result'
  };

  it('should generate a certificate', async () => {
    const node = new CertificateCreateNode('id', [[4]], baseConfig);

    const results = await node.run({}, { foo: 1, bar: 2 });
    (typeof results[1].result.publicKey).should.equal('string');
    results[1].result.info.commonName.should.equal('Losant');
    results[1].result.info.issuerName.should.equal('My Root CA');
    [ 'fingerprint', 'issuerName', 'serial', 'country', 'state', 'locality', 'organization',
      'organizationUnit', 'commonName', 'emailAddress' ].forEach((field) => {
      (typeof results[1].result.info[field]).should.equal('string');
    });
    const sign = createSign('sha256');
    sign.update('some data to sign');
    sign.end();
    const signature = sign.sign(devicePrivateKey, 'hex');
    const verifyNode = new CryptoVerifyNode('id', [[5], [4]], {
      algorithmTemplate: 'SHA256',
      dataTemplate: 'some data to sign',
      signatureTemplate: '{{ sign }}',
      signatureEncodingTemplate: 'hex',
      keyTemplate: results[1].result.certificate
    });
    const ran = await verifyNode.run({}, { foo: 1, bar: 2, sign: signature });
    ran[0].should.deepEqual([4]);
  });

  it('should throw an error if csr is not given', async () => {
    const node = new CertificateCreateNode('id', [[4]], {
      algorithmTemplate: 'SHA256',
      resultPath: 'result'
    });

    await node.run({}, { foo: 1, bar: 2 }).should.be.rejectedWith({
      message: 'Missing csrTemplate'
    });
  });

  // 'blah' covers the generic-bad-name path; 'md5' covers the deliberate
  // exclusion of md5 from the cert-signing allowlist (it's accepted by the
  // sibling crypto-sign/verify nodes).
  for (const algo of [ 'blah', 'md5' ]) {
    it(`rejects unsupported algorithm '${algo}'`, async () => {
      const node = new CertificateCreateNode('id', [[4]], { ...baseConfig, algorithmTemplate: algo });
      await node.run({}, {}).should.be.rejectedWith({
        message: `Algorithm must be one of the following sha1, sha256, sha384, sha512, not '${algo}'.`
      });
    });
  }

  for (const omittedField of [ 'caKeyTemplate', 'caCrtTemplate' ]) {
    it(`throws when ${omittedField} is missing`, async () => {
      const config = { ...baseConfig };
      delete config[omittedField];
      const node = new CertificateCreateNode('id', [[4]], config);
      await node.run({}, {}).should.be.rejectedWith({ message: 'Both CA Key and Certificate must be given.' });
    });
  }

  it('should throw an error if ca key and cert do not match', async () => {
    const node = new CertificateCreateNode('id', [[4]], { ...baseConfig, caKeyTemplate: fakeSslKey });
    const result = await node.run({}, {});
    result[1].result.error.message.should.equal('CA Key and Certificate do not match.');
  });

  it('always adds BasicConstraints, SKI, and AKI but omits KeyUsage/ExtendedKeyUsage by default', async () => {
    const node = new CertificateCreateNode('id', [[4]], baseConfig);
    const results = await node.run({}, {});
    const exts = extensionsByName(results[1].result.certificate);
    exts.basicConstraints.ca.should.equal(false);
    exts.basicConstraints.critical.should.equal(true);
    exts.subjectKeyIdentifier.should.be.ok();
    exts.authorityKeyIdentifier.should.be.ok();
    (exts.keyUsage === null).should.be.true();
    (exts.extKeyUsage === null).should.be.true();
  });

  describe('keyUsages / extendedKeyUsages config', () => {
    it('emits a critical KeyUsage extension when keyUsages is non-empty', async () => {
      const node = new CertificateCreateNode('id', [[4]], {
        ...baseConfig,
        keyUsages: [ 'digitalSignature', 'keyEncipherment' ]
      });
      const results = await node.run({}, {});
      const exts = extensionsByName(results[1].result.certificate);
      exts.keyUsage.should.be.ok();
      exts.keyUsage.critical.should.equal(true);
      /* eslint-disable no-bitwise */
      (exts.keyUsage.usages & x509.KeyUsageFlags.digitalSignature).should.not.equal(0);
      (exts.keyUsage.usages & x509.KeyUsageFlags.keyEncipherment).should.not.equal(0);
      /* eslint-enable no-bitwise */
    });

    it('emits an ExtendedKeyUsage extension when extendedKeyUsages is non-empty', async () => {
      const node = new CertificateCreateNode('id', [[4]], {
        ...baseConfig,
        extendedKeyUsages: [ 'serverAuth', 'clientAuth' ]
      });
      const results = await node.run({}, {});
      const exts = extensionsByName(results[1].result.certificate);
      exts.extKeyUsage.usages.should.containEql(x509.ExtendedKeyUsage.serverAuth);
      exts.extKeyUsage.usages.should.containEql(x509.ExtendedKeyUsage.clientAuth);
    });

    it('omits both extensions when arrays are empty (matches production behavior)', async () => {
      const node = new CertificateCreateNode('id', [[4]], {
        ...baseConfig,
        keyUsages: [],
        extendedKeyUsages: []
      });
      const results = await node.run({}, {});
      const exts = extensionsByName(results[1].result.certificate);
      (exts.keyUsage === null).should.be.true();
      (exts.extKeyUsage === null).should.be.true();
    });

    it('rejects an invalid key-usage name', async () => {
      const node = new CertificateCreateNode('id', [[4]], {
        ...baseConfig,
        keyUsages: [ 'digitalSignature', 'bogus' ]
      });
      await node.run({}, {}).should.be.rejectedWith({ message: /Key usage 'bogus' is invalid/ });
    });

    it('rejects an invalid extended-key-usage name', async () => {
      const node = new CertificateCreateNode('id', [[4]], {
        ...baseConfig,
        extendedKeyUsages: [ 'serverAuth', 'bogus' ]
      });
      await node.run({}, {}).should.be.rejectedWith({ message: /Extended key usage 'bogus' is invalid/ });
    });
  });

  describe('subject and SAN overrides', () => {
    // pem.createCSR can't express multi-OU subjects (its `organizationUnit`
    // option is single-valued); use peculiar to build these fixtures.
    const buildMultiOuCsr = async (cn) => {
      const keys = await globalThis.crypto.subtle.generateKey(
        { name: 'ECDSA', namedCurve: 'P-256' }, true, [ 'sign', 'verify' ]
      );
      return (await x509.Pkcs10CertificateRequestGenerator.create({
        name: `CN=${cn},O=Acme,OU=Engineering,OU=Platform`,
        keys,
        signingAlgorithm: { name: 'ECDSA', hash: 'SHA-256' }
      })).toString('pem');
    };

    it('should override the common name only and let other subject fields fall through', async () => {
      const node = new CertificateCreateNode('id', [[4]], {
        ...baseConfig,
        commonNameTemplate: 'overridden.example.com'
      });
      const results = await node.run({}, {});
      results[1].result.info.commonName.should.equal('overridden.example.com');
      results[1].result.info.organization.should.equal('SUSE');
      results[1].result.info.organizationUnit.should.equal('Edge Industrial');
      results[1].result.info.country.should.equal('US');
    });

    it('should override multiple subject fields together', async () => {
      const node = new CertificateCreateNode('id', [[4]], {
        ...baseConfig,
        commonNameTemplate: 'cn.example',
        countryTemplate: 'CA',
        organizationTemplate: 'NewOrg'
      });
      const results = await node.run({}, {});
      results[1].result.info.commonName.should.equal('cn.example');
      results[1].result.info.country.should.equal('CA');
      results[1].result.info.organization.should.equal('NewOrg');
      results[1].result.info.state.should.equal('OH');
    });

    it('should override emailAddress', async () => {
      const node = new CertificateCreateNode('id', [[4]], {
        ...baseConfig,
        emailTemplate: 'override@example.com'
      });
      const results = await node.run({}, {});
      results[1].result.info.emailAddress.should.equal('override@example.com');
      results[1].result.info.commonName.should.equal('Losant');
    });

    it('should replace SAN with mixed dns + uri entries', async () => {
      const node = new CertificateCreateNode('id', [[4]], {
        ...baseConfig,
        subjectAltNames: [
          { type: 'dns', valueTemplate: 'a.example.com' },
          { type: 'uri', valueTemplate: 'spiffe://example.com/device/1' }
        ]
      });
      const results = await node.run({}, {});
      const san = extensionsByName(results[1].result.certificate).subjectAltName;
      san.should.be.ok();
      const altValues = sanEntries(san).map((a) => a.value);
      altValues.should.containEql('a.example.com');
      altValues.should.containEql('spiffe://example.com/device/1');
    });

    it('should accept SAN ip and email entries end-to-end', async () => {
      const node = new CertificateCreateNode('id', [[4]], {
        ...baseConfig,
        subjectAltNames: [
          { type: 'ip', valueTemplate: '192.168.1.42' },
          { type: 'email', valueTemplate: 'device@example.com' }
        ]
      });
      const results = await node.run({}, {});
      const entries = sanEntries(extensionsByName(results[1].result.certificate).subjectAltName);
      const ipEntry = entries.find((a) => a.type === 'ip');
      const emailEntry = entries.find((a) => a.type === 'email');
      ipEntry.should.be.ok();
      ipEntry.value.should.equal('192.168.1.42');
      emailEntry.should.be.ok();
      emailEntry.value.should.equal('device@example.com');
    });

    it('should preserve the CSR SAN when no override is configured', async () => {
      const node = new CertificateCreateNode('id', [[4]], {
        ...baseConfig,
        csrTemplate: deviceCSRWithSan
      });
      const results = await node.run({}, {});
      const altValues = sanEntries(extensionsByName(results[1].result.certificate).subjectAltName).map((a) => a.value);
      altValues.should.containEql('original.example.com');
      altValues.should.containEql('second.example.com');
    });

    it('preserves the CSR SAN even when the CN is overridden', async () => {
      const node = new CertificateCreateNode('id', [[4]], {
        ...baseConfig,
        csrTemplate: deviceCSRWithSan,
        commonNameTemplate: 'overridden.example.com'
      });
      const results = await node.run({}, {});
      results[1].result.info.commonName.should.equal('overridden.example.com');
      const altValues = sanEntries(extensionsByName(results[1].result.certificate).subjectAltName).map((a) => a.value);
      altValues.should.containEql('original.example.com');
      altValues.should.containEql('second.example.com');
    });

    it('preserves multiple OU values from the CSR when no subject override is given', async () => {
      const node = new CertificateCreateNode('id', [[4]], {
        ...baseConfig,
        csrTemplate: await buildMultiOuCsr('multi-ou.example.com')
      });
      const results = await node.run({}, {});
      results[1].result.certificate.should.be.a.String();
      const cert = new x509.X509Certificate(results[1].result.certificate);
      const ous = cert.subjectName.getField('OU');
      ous.length.should.equal(2);
      ous.should.containEql('Engineering');
      ous.should.containEql('Platform');
    });

    it('preserves multi-OU when overriding a different field (CN)', async () => {
      const node = new CertificateCreateNode('id', [[4]], {
        ...baseConfig,
        csrTemplate: await buildMultiOuCsr('original.example.com'),
        commonNameTemplate: 'overridden.example.com'
      });
      const results = await node.run({}, {});
      const cert = new x509.X509Certificate(results[1].result.certificate);
      cert.subjectName.getField('CN').should.deepEqual([ 'overridden.example.com' ]);
      const ous = cert.subjectName.getField('OU');
      ous.length.should.equal(2);
      ous.should.containEql('Engineering');
      ous.should.containEql('Platform');
    });

    it('fully replaces (not merges) CSR SANs when SAN override is provided', async () => {
      const node = new CertificateCreateNode('id', [[4]], {
        ...baseConfig,
        csrTemplate: deviceCSRWithSan,
        subjectAltNames: [ { type: 'dns', valueTemplate: 'replacement.example.com' } ]
      });
      const results = await node.run({}, {});
      const altValues = sanEntries(extensionsByName(results[1].result.certificate).subjectAltName).map((a) => a.value);
      altValues.should.deepEqual([ 'replacement.example.com' ]);
      altValues.should.not.containEql('original.example.com');
      altValues.should.not.containEql('second.example.com');
    });

    it('rejects an empty-subject CSR with no override CN or SAN', async () => {
      const node = new CertificateCreateNode('id', [[4]], { ...baseConfig, csrTemplate: emptySubjectCSR });
      const result = await node.run({}, {});
      result[1].result.error.message.should.match(/Certificate must have a subject or at least one Subject Alternative Name/);
    });

    it('accepts an empty-subject CSR if a CN override is provided', async () => {
      const node = new CertificateCreateNode('id', [[4]], {
        ...baseConfig,
        csrTemplate: emptySubjectCSR,
        commonNameTemplate: 'rescued.example.com'
      });
      const results = await node.run({}, {});
      results[1].result.info.commonName.should.equal('rescued.example.com');
    });

    it('accepts an empty-subject CSR if a SAN override is provided', async () => {
      const node = new CertificateCreateNode('id', [[4]], {
        ...baseConfig,
        csrTemplate: emptySubjectCSR,
        subjectAltNames: [ { type: 'dns', valueTemplate: 'rescued.example.com' } ]
      });
      const results = await node.run({}, {});
      results[1].result.certificate.should.be.a.String();
    });

    it('should resolve override fields from payload templates', async () => {
      const node = new CertificateCreateNode('id', [[4]], {
        ...baseConfig,
        commonNameTemplate: '{{ deviceCN }}',
        subjectAltNames: [ { type: 'dns', valueTemplate: '{{ deviceCN }}' } ]
      });
      const results = await node.run({}, { deviceCN: 'tpl.example.com' });
      results[1].result.info.commonName.should.equal('tpl.example.com');
      const entries = sanEntries(extensionsByName(results[1].result.certificate).subjectAltName);
      entries[0].value.should.equal('tpl.example.com');
    });
  });

  describe('leaf algorithm coverage (RSA CA, all input forms)', () => {
    // For each leaf-key algorithm, test the three accepted input forms
    // (CSR / public key / private key). All sign against the default RSA CA.
    // CSR path keeps the CSR's CN; pubkey/privkey paths supply a CN override.
    const leafAlgorithms = [
      { name: 'RSA', csr: deviceCSR, publicKey: devicePublicKey, privateKey: devicePrivateKey, csrCN: 'Losant' },
      { name: 'EC', csr: deviceECCSR, publicKey: deviceECPublicKey, privateKey: deviceECPrivateKey, csrCN: 'EC CSR' },
      { name: 'Ed25519', csr: ed25519LeafCsr, publicKey: ed25519LeafPublicKey, privateKey: ed25519LeafPrivateKey, csrCN: 'Ed25519 device' },
      { name: 'Ed448', csr: ed448LeafCsr, publicKey: ed448LeafPublicKey, privateKey: ed448LeafPrivateKey, csrCN: 'Ed448 device' }
    ];

    for (const algo of leafAlgorithms) {
      describe(`${algo.name} leaf`, () => {
        it('signs from a CSR (preserves the CSR subject)', async () => {
          const node = new CertificateCreateNode('id', [[4]], { ...baseConfig, csrTemplate: algo.csr });
          const result = await node.run({}, {});
          result[1].result.certificate.should.be.a.String();
          result[1].result.info.commonName.should.equal(algo.csrCN);
        });

        it('signs from a public key with a CN override', async () => {
          const overrideCN = `${algo.name.toLowerCase()}.example.com`;
          const node = new CertificateCreateNode('id', [[4]], {
            ...baseConfig, csrTemplate: algo.publicKey, commonNameTemplate: overrideCN
          });
          const result = await node.run({}, {});
          result[1].result.info.commonName.should.equal(overrideCN);
        });

        it('signs from a private key with a CN override', async () => {
          const overrideCN = `${algo.name.toLowerCase()}.example.com`;
          const node = new CertificateCreateNode('id', [[4]], {
            ...baseConfig, csrTemplate: algo.privateKey, commonNameTemplate: overrideCN
          });
          const result = await node.run({}, {});
          result[1].result.info.commonName.should.equal(overrideCN);
        });
      });
    }
  });

  describe('CA algorithm coverage', () => {
    // Sign the default RSA CSR with each supported CA key type. Asserts the
    // resulting cert's signatureAlgorithm matches expectations. Ed448 is the
    // only currently-rejected case (peculiar 2.0 algorithm-spread bug).
    const caAlgorithms = [
      { name: 'RSA', caKeyTemplate: caKey, caCrtTemplate: caCert, sigAlg: 'RSASSA-PKCS1-v1_5' },
      { name: 'EC', caKeyTemplate: fakeEcdsaKey, caCrtTemplate: fakeEcdsaCert, sigAlg: 'ECDSA' },
      { name: 'Ed25519', caKeyTemplate: ed25519CaKey, caCrtTemplate: ed25519CaCert, sigAlg: 'Ed25519' },
      { name: 'Ed448', caKeyTemplate: ed448CaKey, caCrtTemplate: ed448CaCert, rejects: /CA key type 'OKP \(Ed448\)' is not supported.*Only RSA, ECDSA, and Ed25519/ }
    ];

    for (const ca of caAlgorithms) {
      const { name, rejects, sigAlg, caKeyTemplate, caCrtTemplate } = ca;
      it(rejects ? `rejects ${name} CA with a clear error` : `signs with ${name} CA (signature algorithm: ${sigAlg})`, async () => {
        const node = new CertificateCreateNode('id', [[4]], {
          ...baseConfig, caKeyTemplate, caCrtTemplate
        });
        const result = await node.run({}, {});
        if (rejects) {
          result[1].result.error.message.should.match(rejects);
        } else {
          result[1].result.certificate.should.be.a.String();
          const cert = new x509.X509Certificate(result[1].result.certificate);
          cert.signatureAlgorithm.name.should.equal(sigAlg);
        }
      });
    }

    it('signs an EC leaf with an EC CA (cross-algo smoke)', async () => {
      const node = new CertificateCreateNode('id', [[4]], {
        ...baseConfig,
        csrTemplate: deviceECCSR,
        caKeyTemplate: fakeEcdsaKey,
        caCrtTemplate: fakeEcdsaCert
      });
      const result = await node.run({}, {});
      result[1].result.certificate.should.be.a.String();
      result[1].result.info.commonName.should.equal('EC CSR');
    });
  });

  describe('key-only input behavior (beyond algorithm coverage)', () => {
    it('signs a cert from a public key with both CN and DNS SAN overrides', async () => {
      const node = new CertificateCreateNode('id', [[4]], {
        ...baseConfig,
        csrTemplate: devicePublicKey,
        commonNameTemplate: 'pubkey.example.com',
        subjectAltNames: [ { type: 'dns', valueTemplate: 'pubkey.example.com' } ]
      });
      const results = await node.run({}, {});
      results[1].result.info.commonName.should.equal('pubkey.example.com');
      const entries = sanEntries(extensionsByName(results[1].result.certificate).subjectAltName);
      entries[0].value.should.equal('pubkey.example.com');
    });

    it('issues a cert whose embedded public key matches the input private key (verify roundtrip)', async () => {
      const node = new CertificateCreateNode('id', [[4]], {
        ...baseConfig,
        csrTemplate: devicePrivateKey,
        commonNameTemplate: 'privkey.example.com'
      });
      const results = await node.run({}, {});
      results[1].result.info.commonName.should.equal('privkey.example.com');
      const sign = createSign('sha256');
      sign.update('hello');
      sign.end();
      const signature = sign.sign(devicePrivateKey, 'hex');
      const verifyNode = new CryptoVerifyNode('id', [[5], [4]], {
        algorithmTemplate: 'SHA256',
        dataTemplate: 'hello',
        signatureTemplate: '{{ sign }}',
        signatureEncodingTemplate: 'hex',
        keyTemplate: results[1].result.certificate
      });
      const ran = await verifyNode.run({}, { sign: signature });
      ran[0].should.deepEqual([4]);
    });

    it('applies multiple subject overrides on a private-key input', async () => {
      const node = new CertificateCreateNode('id', [[4]], {
        ...baseConfig,
        csrTemplate: devicePrivateKey,
        commonNameTemplate: 'multi.example.com',
        organizationTemplate: 'KeyOnlyOrg',
        countryTemplate: 'GB'
      });
      const results = await node.run({}, {});
      results[1].result.info.commonName.should.equal('multi.example.com');
      results[1].result.info.organization.should.equal('KeyOnlyOrg');
      results[1].result.info.country.should.equal('GB');
    });

    it('rejects a key input with no subject overrides AND no SAN (would produce an empty cert)', async () => {
      const node = new CertificateCreateNode('id', [[4]], {
        ...baseConfig,
        csrTemplate: devicePublicKey
      });
      const result = await node.run({}, {});
      result[1].result.error.message.should.match(/Certificate must have a subject or at least one Subject Alternative Name/);
    });
  });

  describe('input and override validation', () => {
    it('rejects a country override that is not 2 characters', async () => {
      const node = new CertificateCreateNode('id', [[4]], { ...baseConfig, countryTemplate: 'USA' });
      await node.run({}, {}).should.be.rejectedWith({ message: 'countryTemplate must be a 2-letter ISO 3166 country code.' });
    });

    it('rejects a CN override longer than 64 characters', async () => {
      const node = new CertificateCreateNode('id', [[4]], { ...baseConfig, commonNameTemplate: 'x'.repeat(65) });
      await node.run({}, {}).should.be.rejectedWith({ message: /commonNameTemplate value exceeds maximum length/ });
    });

    it('rejects an organization override longer than 64 characters (verifies error includes the field name)', async () => {
      const node = new CertificateCreateNode('id', [[4]], { ...baseConfig, organizationTemplate: 'x'.repeat(65) });
      await node.run({}, {}).should.be.rejectedWith({ message: /organizationTemplate value exceeds maximum length of 64 characters/ });
    });

    it('rejects an invalid SAN dns value', async () => {
      const node = new CertificateCreateNode('id', [[4]], { ...baseConfig, subjectAltNames: [ { type: 'dns', valueTemplate: 'not a hostname' } ] });
      await node.run({}, {}).should.be.rejectedWith({ message: /Subject Alternative Name DNS value/ });
    });

    it('rejects an invalid SAN ip value', async () => {
      const node = new CertificateCreateNode('id', [[4]], { ...baseConfig, subjectAltNames: [ { type: 'ip', valueTemplate: 'nope' } ] });
      await node.run({}, {}).should.be.rejectedWith({ message: /Subject Alternative Name IP value/ });
    });

    it('rejects an unparseable SAN uri value', async () => {
      const node = new CertificateCreateNode('id', [[4]], { ...baseConfig, subjectAltNames: [ { type: 'uri', valueTemplate: 'not a uri' } ] });
      await node.run({}, {}).should.be.rejectedWith({ message: /Subject Alternative Name URI value/ });
    });

    it('rejects an unknown SAN type', async () => {
      const node = new CertificateCreateNode('id', [[4]], { ...baseConfig, subjectAltNames: [ { type: 'bogus', valueTemplate: 'foo' } ] });
      await node.run({}, {}).should.be.rejectedWith({ message: /Subject Alternative Name type 'bogus' is invalid/ });
    });

    it('rejects garbage in csrTemplate (no recognized PEM header)', async () => {
      const node = new CertificateCreateNode('id', [[4]], { ...baseConfig, csrTemplate: 'just some text' });
      const result = await node.run({}, {});
      result[1].result.error.message.should.equal('csrTemplate must be a PEM-encoded CSR, public key, or unencrypted private key.');
    });

    it('rejects multi-block PEM input (e.g. key+cert bundle pasted into csrTemplate)', async () => {
      const node = new CertificateCreateNode('id', [[4]], { ...baseConfig, csrTemplate: `${caCert}\n${caKey}` });
      const result = await node.run({}, {});
      result[1].result.error.message.should.equal('csrTemplate must contain exactly one PEM block.');
    });

    it('rejects a CERTIFICATE pasted into csrTemplate with a specific error', async () => {
      const node = new CertificateCreateNode('id', [[4]], { ...baseConfig, csrTemplate: caCert });
      const result = await node.run({}, {});
      result[1].result.error.message.should.equal('csrTemplate expected a CSR, public key, or private key, but received a certificate.');
    });

    it('accepts the legacy "NEW CERTIFICATE REQUEST" PEM label', async () => {
      const newLabelCsr = deviceCSR
        .replace('-----BEGIN CERTIFICATE REQUEST-----', '-----BEGIN NEW CERTIFICATE REQUEST-----')
        .replace('-----END CERTIFICATE REQUEST-----', '-----END NEW CERTIFICATE REQUEST-----');
      const node = new CertificateCreateNode('id', [[4]], { ...baseConfig, csrTemplate: newLabelCsr });
      const result = await node.run({}, {});
      result[1].result.certificate.should.be.a.String();
      result[1].result.info.commonName.should.equal('Losant');
    });

    it('rejects a PKCS#8 encrypted private key (BEGIN ENCRYPTED PRIVATE KEY)', async () => {
      const node = new CertificateCreateNode('id', [[4]], { ...baseConfig, csrTemplate: pkcs8EncryptedKey });
      const result = await node.run({}, {});
      result[1].result.error.message.should.equal('csrTemplate encrypted private keys are not supported. Decrypt the key before passing it.');
    });

    it('rejects a legacy openssl-encrypted private key (Proc-Type: 4,ENCRYPTED header)', async () => {
      const node = new CertificateCreateNode('id', [[4]], { ...baseConfig, csrTemplate: legacyEncryptedKey });
      const result = await node.run({}, {});
      result[1].result.error.message.should.equal('csrTemplate encrypted private keys are not supported. Decrypt the key before passing it.');
    });

    it('rejects an unparseable CA certificate', async () => {
      const node = new CertificateCreateNode('id', [[4]], { ...baseConfig, caCrtTemplate: 'not a pem cert' });
      const result = await node.run({}, {});
      result[1].result.error.message.should.equal('CA Certificate could not be parsed.');
    });

    it('rejects an unparseable CA key', async () => {
      const node = new CertificateCreateNode('id', [[4]], { ...baseConfig, caKeyTemplate: 'not a pem key' });
      const result = await node.run({}, {});
      result[1].result.error.message.should.match(/CA Key could not be parsed/);
    });
  });

  describe('serialNumberTemplate', () => {

    it('accepts a bare hex serial', async () => {
      const node = new CertificateCreateNode('id', [[4]], { ...baseConfig, serialNumberTemplate: 'ABCDEF' });
      const results = await node.run({}, {});
      results[1].result.info.serial.should.equal('11259375 (0xabcdef)');
    });

    it('rejects a serial with 0x prefix (bare hex only)', async () => {
      const node = new CertificateCreateNode('id', [[4]], { ...baseConfig, serialNumberTemplate: '0xABCDEF' });
      await node.run({}, {}).should.be.rejectedWith({ message: 'Invalid hexadecimal string.' });
    });

    it('rejects a non-hex serial', async () => {
      const node = new CertificateCreateNode('id', [[4]], { ...baseConfig, serialNumberTemplate: 'not-hex' });
      await node.run({}, {}).should.be.rejectedWith({ message: 'Invalid hexadecimal string.' });
    });

    it('rejects a zero serial', async () => {
      const node = new CertificateCreateNode('id', [[4]], { ...baseConfig, serialNumberTemplate: '00' });
      await node.run({}, {}).should.be.rejectedWith({ message: 'serialNumberTemplate must be a positive hex integer.' });
    });

    it('rejects a serial larger than 20 octets', async () => {
      const node = new CertificateCreateNode('id', [[4]], { ...baseConfig, serialNumberTemplate: 'ff'.repeat(21) });
      await node.run({}, {}).should.be.rejectedWith({ message: /exceeds 20 octets/ });
    });

    it('rejects a 20-octet serial whose high bit is set (would encode to 21 octets after sign-padding)', async () => {
      const node = new CertificateCreateNode('id', [[4]], { ...baseConfig, serialNumberTemplate: 'ff'.repeat(20) });
      await node.run({}, {}).should.be.rejectedWith({ message: /exceeds 20 octets/ });
    });

    it('falls back to a random serial when the template renders to empty', async () => {
      const node = new CertificateCreateNode('id', [[4]], { ...baseConfig, serialNumberTemplate: '{{ missing }}' });
      const results = await node.run({}, {});
      // pem formats serial as `<decimal> (0x<hex>)` for small values and as
      // colon-separated hex for big ones; either is acceptable evidence the
      // random fallback ran.
      results[1].result.info.serial.should.be.a.String().and.not.be.empty();
    });
  });

  describe('notBeforeTemplate', () => {
    it('defaults notBefore to ~now when no template is given', async () => {
      const before = Date.now();
      const node = new CertificateCreateNode('id', [[4]], baseConfig);
      const results = await node.run({}, {});
      const after = Date.now();
      const notBefore = results[1].result.info.notValidBefore.getTime();
      // Allow a one-second window (cert validity is rounded to seconds).
      notBefore.should.be.aboveOrEqual(before - 1000);
      notBefore.should.be.belowOrEqual(after + 1000);
    });

    it('uses an ISO 8601 date when provided', async () => {
      const node = new CertificateCreateNode('id', [[4]], {
        ...baseConfig,
        notBeforeTemplate: '2026-01-01T00:00:00Z',
        expiresInDaysTemplate: 30
      });
      const results = await node.run({}, {});
      results[1].result.info.notValidBefore.toISOString().should.equal('2026-01-01T00:00:00.000Z');
      // notAfter should be 30 days later.
      results[1].result.info.notValidAfter.toISOString().should.equal('2026-01-31T00:00:00.000Z');
    });

    it('accepts a numeric epoch timestamp (ms)', async () => {
      const epochMs = Date.UTC(2026, 5, 15, 12, 0, 0); // 2026-06-15T12:00:00Z
      const node = new CertificateCreateNode('id', [[4]], {
        ...baseConfig,
        notBeforeTemplate: String(epochMs)
      });
      const results = await node.run({}, {});
      results[1].result.info.notValidBefore.getTime().should.equal(epochMs);
    });

    it('rejects an invalid date string', async () => {
      const node = new CertificateCreateNode('id', [[4]], {
        ...baseConfig,
        notBeforeTemplate: 'not-a-date'
      });
      await node.run({}, {}).should.be.rejectedWith({ message: /notBeforeTemplate 'not-a-date' is not a valid date/ });
    });

    it('handles "0" as "now" (regression: previously crashed via enforceTime)', async () => {
      const before = Date.now();
      const node = new CertificateCreateNode('id', [[4]], { ...baseConfig, notBeforeTemplate: '0' });
      const results = await node.run({}, {});
      results[1].result.certificate.should.be.a.String();
      const notBefore = results[1].result.info.notValidBefore.getTime();
      notBefore.should.be.aboveOrEqual(before - 1000);
    });

    it('handles "-1" as "1ms before now" (regression: previously crashed via enforceTime)', async () => {
      const before = Date.now();
      const node = new CertificateCreateNode('id', [[4]], { ...baseConfig, notBeforeTemplate: '-1' });
      const results = await node.run({}, {});
      results[1].result.certificate.should.be.a.String();
      results[1].result.info.notValidBefore.getTime().should.be.belowOrEqual(before);
    });
  });

  describe('reading from a local path', async () => {
    const diskPath = './foo.txt';
    afterEach(() => {
      fs.rmSync(diskPath, { force: true });
    });
    it('should upload a file from a disk path', async () => {
      await fs.writeFile(diskPath, caKey);
      const node = new CertificateCreateNode('id', [[4]], {
        csrTemplate: deviceCSR,
        caKeyTemplateType: 'diskPath',
        caKeyTemplate: '{{ keyPath }}',
        caCrtTemplate: caCert,
        algorithmTemplate: 'sha256',
        resultPath: 'result'
      });

      const results = await node.run(contextify({ diskUtils: { loadGuardedFile: (p) => fs.readFile(p) } }), { foo: 1, bar: 2, keyPath: diskPath });
      (typeof results[1].result.certificate).should.equal('string');
    });
  });
});
