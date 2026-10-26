import os from 'node:os';
import path from 'node:path';
import https from 'node:https';
import { Readable } from 'node:stream';
import { text } from 'node:stream/consumers';
import fs from 'fs-extra';
import { mapP } from 'omnibelt';
import { nock, sinon, should, restoreEnv } from '../common.js';
import errors from 'losant-nodejs-utils/src/errors.js';
import { PROJECT_ROOT_DIR } from '../../src/constants.js';
import { guardPath, loadGuardedFile } from '../../src/lib/protected-path-utils.js';
import KubernetesNode, {
  makeKubernetesRequest,
  buildResourcePath,
  resolveListQueryParams,
  resolveGetQueryParams,
  resolveLogQueryParams,
  resolveBody,
  resolveAuth,
  resolveAndValidateDiskPath,
  resolveManifestContent,
  resolveManifestDocuments,
  resolveApiVersion,
  registerOperation,
  unregisterOperation,
  validateResourceName,
  validateNamespace,
  validateApiGroup,
  validateApiVersion,
  renderName,
  renderNamespace,
  prepareApplyManifest,
  executeApplyManifest,
  toDiskStream,
  RESOURCES
} from '../../src/nodes/kubernetes-node.js';

const OUTPUT_IDS = [['out']];
const SERVER_URL = 'https://k8s.example.com:6443';
const TOKEN = 'test-bearer-token-12345';

describe('KubernetesNode', () => {
  const defaultContext = {
    diskUtils: { guardPath, loadGuardedFile },
    externalTimeout: 30000
  };

  const buildNode = (config = {}) => new KubernetesNode('node-id', OUTPUT_IDS, {
    authMode: 'inline',
    kubernetesUrlTemplate: SERVER_URL,
    tokenTemplate: TOKEN,
    resultPath: 'working.k8sResult',
    ...config
  });

  describe('Path and Query Resolvers', () => {
    it('buildResourcePath builds correct URLs for cluster-scoped and namespaced resources', () => {
      buildResourcePath({ ...RESOURCES.pods, namespace: 'kube-system', name: 'coredns' })
        .should.equal('/api/v1/namespaces/kube-system/pods/coredns');

      buildResourcePath({ ...RESOURCES.pods })
        .should.equal('/api/v1/pods');

      buildResourcePath({ ...RESOURCES.deployments, namespace: 'default', name: 'my-app' })
        .should.equal('/apis/apps/v1/namespaces/default/deployments/my-app');

      buildResourcePath({ ...RESOURCES.nodes, name: 'worker-1' })
        .should.equal('/api/v1/nodes/worker-1');

      buildResourcePath({ ...RESOURCES.pods, namespace: 'default', name: 'app-1', subresource: 'log' })
        .should.equal('/api/v1/namespaces/default/pods/app-1/log');
    });

    it('validateResourceName rejects dot segments, slashes, and percent characters', () => {
      ['.', '..', 'foo/bar', 'foo%2fbar', 'foo%2Fbar', 'foo%20bar', '%2e'].forEach((val) => {
        (() => validateResourceName(val)).should.throw({
          type: 'Validation',
          message: `Invalid resource name "${val}".`
        });
      });

      // Does not throw for valid resource names or falsy values
      (() => validateResourceName('')).should.not.throw();
      (() => validateResourceName('nginx-demo')).should.not.throw();
      (() => validateResourceName('valid.pod.name')).should.not.throw();
      (() => validateResourceName('valid-123')).should.not.throw();
    });

    it('validateNamespace enforces DNS label rules (lowercase alphanumeric and hyphens, max 63 chars)', () => {
      ['.', '..', 'foo/bar', 'foo\\bar', 'foo%2fbar', 'foo_bar', 'foo.bar', 'Foo', 'PROD', '-foo', 'foo-', 'a'.repeat(64)].forEach((val) => {
        (() => validateNamespace(val)).should.throw({
          type: 'Validation',
          message: `Invalid namespace "${val}".`
        });
      });

      // Does not throw for valid namespaces or falsy values
      (() => validateNamespace('')).should.not.throw();
      (() => validateNamespace('default')).should.not.throw();
      (() => validateNamespace('kube-system')).should.not.throw();
      (() => validateNamespace('a'.repeat(63))).should.not.throw();
      (() => validateNamespace('0-valid-ns-1')).should.not.throw();
    });

    it('validateApiGroup enforces DNS subdomain rules and max length 253', () => {
      ['.', '..', 'sub/dir', 'sub%2fdir', 'Apps', 'app_group', '-apps', 'apps-', 'a'.repeat(254)].forEach((badGroup) => {
        (() => validateApiGroup(badGroup)).should.throw({
          type: 'Validation',
          message: `Invalid apiGroup "${badGroup}".`
        });
      });

      (() => validateApiGroup('')).should.not.throw();
      (() => validateApiGroup(null)).should.not.throw();
      (() => validateApiGroup(undefined)).should.not.throw();
      (() => validateApiGroup('apps')).should.not.throw();
      (() => validateApiGroup('networking.k8s.io')).should.not.throw();
      (() => validateApiGroup('a'.repeat(253))).should.not.throw();
    });

    it('validateApiVersion enforces Kubernetes version format', () => {
      ['.', '..', 'sub/dir', 'sub%2fdir', '1', '1.0', 'version1', 'v', 'v0', 'v01', 'v1alpha', 'v1beta0', 'V1', 'v1/extra'].forEach((badVersion) => {
        (() => validateApiVersion(badVersion)).should.throw({
          type: 'Validation',
          message: `Invalid version "${badVersion}".`
        });
      });

      (() => validateApiVersion('')).should.not.throw();
      (() => validateApiVersion(null)).should.not.throw();
      (() => validateApiVersion(undefined)).should.not.throw();
      (() => validateApiVersion('v1')).should.not.throw();
      (() => validateApiVersion('v2')).should.not.throw();
      (() => validateApiVersion('v1beta1')).should.not.throw();
      (() => validateApiVersion('v1alpha1')).should.not.throw();
      (() => validateApiVersion('v2alpha2')).should.not.throw();
      (() => validateApiVersion('v10beta10')).should.not.throw();
    });

    it('exports prepareApplyManifest and executeApplyManifest', () => {
      (typeof prepareApplyManifest).should.equal('function');
      (typeof executeApplyManifest).should.equal('function');
    });

    it('buildResourcePath rejects invalid namespace, name, apiGroup, and version segments', () => {
      ['.', '..', 'sub/dir', 'sub%2fdir'].forEach((badSegment) => {
        (() => buildResourcePath({ ...RESOURCES.pods, namespace: badSegment, name: 'valid-pod' }))
          .should.throw({ type: 'Validation' });
        (() => buildResourcePath({ ...RESOURCES.pods, namespace: 'valid-ns', name: badSegment }))
          .should.throw({ type: 'Validation' });
        (() => buildResourcePath({ ...RESOURCES.pods, apiGroup: badSegment }))
          .should.throw({ type: 'Validation' });
        (() => buildResourcePath({ ...RESOURCES.pods, version: badSegment }))
          .should.throw({ type: 'Validation' });
      });
    });

    it('toDiskStream converts various body types to streams and safely handles undefined/null', async () => {
      const readable = Readable.from('existing stream');
      toDiskStream(readable).should.equal(readable);

      await text(toDiskStream('string content')).should.finally.equal('string content');
      await text(toDiskStream(Buffer.from('buffer content'))).should.finally.equal('buffer content');
      await text(toDiskStream({ foo: 'bar' })).should.finally.equal('{"foo":"bar"}');
      await text(toDiskStream(null)).should.finally.equal('');
      await text(toDiskStream(undefined)).should.finally.equal('');
    });

    it('renderName and renderNamespace reject invalid segments', () => {
      ['.', '..', 'bad/name', 'bad%2fname'].forEach((badVal) => {
        (() => renderName({ nameTemplate: badVal }, {})).should.throw({ type: 'Validation' });
        (() => renderNamespace({ namespaceTemplate: badVal }, {})).should.throw({ type: 'Validation' });
      });
    });

    it('resolveListQueryParams extracts and renders list options', () => {
      const node = {
        labelSelectorTemplate: 'app={{appLabel}}',
        fieldSelectorTemplate: 'status.phase=Running',
        limitTemplate: '50',
        continueTemplate: 'tok-abc',
        resourceVersionTemplate: '1000',
        resourceVersionMatch: 'Exact'
      };
      const query = resolveListQueryParams(node, { appLabel: 'web' });
      query.should.deepEqual({
        labelSelector: 'app=web',
        fieldSelector: 'status.phase=Running',
        limit: '50',
        continue: 'tok-abc',
        resourceVersion: '1000',
        resourceVersionMatch: 'Exact'
      });
    });

    it('resolveListQueryParams excludes resourceVersionMatch if resourceVersion is empty', () => {
      const node = {
        resourceVersionMatch: 'Exact'
      };
      const query = resolveListQueryParams(node, {});
      query.should.deepEqual({});
    });

    it('resolveListQueryParams appends timeoutSeconds when timeoutMs is provided', () => {
      const node = { limitTemplate: '10' };
      const query = resolveListQueryParams(node, {}, 30000);
      query.should.deepEqual({
        limit: '10',
        timeoutSeconds: 30
      });
    });

    it('resolveGetQueryParams extracts resourceVersion', () => {
      const node = { resourceVersionTemplate: '2048' };
      resolveGetQueryParams(node, {}).should.deepEqual({ resourceVersion: '2048' });
    });

    it('resolveLogQueryParams extracts container and tailLines', () => {
      const node = { containerTemplate: 'nginx', tailLinesTemplate: '100' };
      resolveLogQueryParams(node, {}).should.deepEqual({ container: 'nginx', tailLines: '100' });
    });

    it('resolveBody parses valid JSON and throws on invalid JSON', () => {
      resolveBody('', {}).should.deepEqual({});
      resolveBody('{"replicas": 3}', {}).should.deepEqual({ replicas: 3 });
      (() => {
        resolveBody('not-valid-json', {});
      }).should.throw();
    });
  });

  describe('Authentication Resolution', () => {
    restoreEnv('KUBERNETES_SERVICE_HOST', 'KUBERNETES_SERVICE_PORT', 'KUBERNETES_SERVICE_PORT_HTTPS');

    it('throws MissingField if kubernetes URL or token are missing in inline mode', async () => {
      await resolveAuth({ authMode: 'inline', kubernetesUrlTemplate: '' }, {})
        .should.be.rejectedWith(errors.MissingField({ title: 'Kubernetes URL' }));

      await resolveAuth({ authMode: 'inline', kubernetesUrlTemplate: SERVER_URL, tokenTemplate: '' }, {})
        .should.be.rejectedWith(errors.MissingField({ title: 'Token' }));
    });

    it('throws Validation if kubernetes URL is invalid or not http/https', async () => {
      await resolveAuth({ authMode: 'inline', kubernetesUrlTemplate: 'not-a-valid-url', tokenTemplate: TOKEN }, {})
        .should.be.rejectedWith(errors.Validation({ message: 'Invalid URL: not-a-valid-url' }));

      await resolveAuth({ authMode: 'inline', kubernetesUrlTemplate: 'ftp://k8s.example.com', tokenTemplate: TOKEN }, {})
        .should.be.rejectedWith(errors.Validation({ message: 'Invalid URL (protocol must be http:, https:): ftp://k8s.example.com' }));
    });

    it('resolves inline auth with custom CA cert when caCertSource is stringTemplate', async () => {
      const auth = await resolveAuth({
        authMode: 'inline',
        kubernetesUrlTemplate: SERVER_URL,
        tokenTemplate: TOKEN,
        caCertSource: 'stringTemplate',
        caCertTemplate: '-----BEGIN CERTIFICATE-----\nFAKE\n-----END CERTIFICATE-----'
      }, {});
      auth.server.should.equal(SERVER_URL);
      auth.token.should.equal(TOKEN);
      auth.caCert.should.equal('-----BEGIN CERTIFICATE-----\nFAKE\n-----END CERTIFICATE-----');
    });

    it('resolves inline auth with token read from disk in diskPath mode', async () => {
      const tokenPath = path.resolve(os.tmpdir(), 'k8s-test-token.txt');
      await fs.writeFile(tokenPath, 'disk-bearer-token-xyz\n');
      try {
        const auth = await resolveAuth({
          authMode: 'inline',
          kubernetesUrlTemplate: SERVER_URL,
          tokenSource: 'diskPath',
          tokenDiskPathTemplate: tokenPath
        }, {}, defaultContext);
        auth.token.should.equal('disk-bearer-token-xyz');
      } finally {
        await fs.remove(tokenPath);
      }
    });

    it('throws MissingField if tokenDiskPathTemplate is missing or empty in diskPath mode', async () => {
      await resolveAuth({
        authMode: 'inline',
        kubernetesUrlTemplate: SERVER_URL,
        tokenSource: 'diskPath',
        tokenDiskPathTemplate: ''
      }, {}, defaultContext).should.be.rejectedWith(errors.MissingField({ title: 'Token Path' }));
    });

    it('throws Validation if tokenDiskPathTemplate attempts to access protected Losant Edge Agent directory', async () => {
      const protectedPath = path.resolve(PROJECT_ROOT_DIR, 'package.json');
      await resolveAuth({
        authMode: 'inline',
        kubernetesUrlTemplate: SERVER_URL,
        tokenSource: 'diskPath',
        tokenDiskPathTemplate: protectedPath
      }, {}, defaultContext).should.be.rejectedWith({ type: 'Validation', message: 'Cannot access within the protected Losant Edge Agent directory.' });
    });

    it('throws NotFound if tokenDiskPathTemplate points to a nonexistent file', async () => {
      const missing = path.resolve(os.tmpdir(), 'k8s-missing-token.txt');
      await resolveAuth({
        authMode: 'inline',
        kubernetesUrlTemplate: SERVER_URL,
        tokenSource: 'diskPath',
        tokenDiskPathTemplate: missing
      }, {}, defaultContext).should.be.rejectedWith({ type: 'NotFound' });
    });

    it('throws MissingField if token file on disk is empty', async () => {
      const emptyPath = path.resolve(os.tmpdir(), 'k8s-empty-token.txt');
      await fs.writeFile(emptyPath, '   \n');
      try {
        await resolveAuth({
          authMode: 'inline',
          kubernetesUrlTemplate: SERVER_URL,
          tokenSource: 'diskPath',
          tokenDiskPathTemplate: emptyPath
        }, {}, defaultContext).should.be.rejectedWith(errors.MissingField({ title: 'Token' }));
      } finally {
        await fs.remove(emptyPath);
      }
    });

    it('resolves inline auth with CA certificate read from disk in diskPath mode', async () => {
      const caPath = path.resolve(os.tmpdir(), 'k8s-test-ca.crt');
      await fs.writeFile(caPath, '-----BEGIN CERTIFICATE-----\nDISK-CA\n-----END CERTIFICATE-----\n');
      try {
        const auth = await resolveAuth({
          authMode: 'inline',
          kubernetesUrlTemplate: SERVER_URL,
          tokenTemplate: TOKEN,
          caCertSource: 'diskPath',
          caCertDiskPathTemplate: caPath
        }, {}, defaultContext);
        auth.caCert.should.equal('-----BEGIN CERTIFICATE-----\nDISK-CA\n-----END CERTIFICATE-----');
      } finally {
        await fs.remove(caPath);
      }
    });

    it('throws MissingField if caCertDiskPathTemplate is missing or empty in diskPath mode', async () => {
      await resolveAuth({
        authMode: 'inline',
        kubernetesUrlTemplate: SERVER_URL,
        tokenTemplate: TOKEN,
        caCertSource: 'diskPath',
        caCertDiskPathTemplate: ''
      }, {}, defaultContext).should.be.rejectedWith(errors.MissingField({ title: 'CA Certificate Path' }));
    });

    it('throws Validation if caCertDiskPathTemplate points inside protected directory', async () => {
      const protectedPath = path.resolve(PROJECT_ROOT_DIR, 'package.json');
      await resolveAuth({
        authMode: 'inline',
        kubernetesUrlTemplate: SERVER_URL,
        tokenTemplate: TOKEN,
        caCertSource: 'diskPath',
        caCertDiskPathTemplate: protectedPath
      }, {}, defaultContext).should.be.rejectedWith({ type: 'Validation', message: 'Cannot access within the protected Losant Edge Agent directory.' });
    });

    it('resolves inCluster auth by reading service account files', async () => {
      process.env.KUBERNETES_SERVICE_HOST = '10.96.0.1';
      process.env.KUBERNETES_SERVICE_PORT = '443';

      const loadGuardedFileStub = sinon.stub();
      loadGuardedFileStub.withArgs('/var/run/secrets/kubernetes.io/serviceaccount/token', sinon.match.any)
        .resolves('service-account-token\n');
      loadGuardedFileStub.withArgs('/var/run/secrets/kubernetes.io/serviceaccount/ca.crt', sinon.match.any)
        .resolves('ca-cert-content\n');

      const auth = await resolveAuth({ authMode: 'inCluster' }, {}, { diskUtils: { loadGuardedFile: loadGuardedFileStub } });
      auth.server.should.equal('https://10.96.0.1:443');
      auth.token.should.equal('service-account-token');
      auth.caCert.should.equal('ca-cert-content');
    });

    it('resolves inCluster auth using KUBERNETES_SERVICE_PORT_HTTPS when set', async () => {
      process.env.KUBERNETES_SERVICE_HOST = '10.96.0.1';
      delete process.env.KUBERNETES_SERVICE_PORT;
      process.env.KUBERNETES_SERVICE_PORT_HTTPS = '6443';

      const loadGuardedFileStub = sinon.stub();
      loadGuardedFileStub.withArgs('/var/run/secrets/kubernetes.io/serviceaccount/token', sinon.match.any)
        .resolves('service-account-token\n');
      loadGuardedFileStub.withArgs('/var/run/secrets/kubernetes.io/serviceaccount/ca.crt', sinon.match.any)
        .resolves('ca-cert-content\n');

      const auth = await resolveAuth({ authMode: 'inCluster' }, {}, { diskUtils: { loadGuardedFile: loadGuardedFileStub } });
      auth.server.should.equal('https://10.96.0.1:6443');
      auth.token.should.equal('service-account-token');
      auth.caCert.should.equal('ca-cert-content');
    });

    it('throws KubernetesAuthError when in-cluster token file cannot be read', async () => {
      const loadGuardedFileStub = sinon.stub();
      loadGuardedFileStub.withArgs('/var/run/secrets/kubernetes.io/serviceaccount/token', sinon.match.any)
        .rejects(new Error('ENOENT: no such file or directory'));

      await resolveAuth({ authMode: 'inCluster' }, {}, { loadGuardedFile: loadGuardedFileStub })
        .should.be.rejectedWith(/Failed to read in-cluster service account token/);
    });

    it('skips loading CA cert and returns disableSSLVerification when disableSSLVerification is true (inline)', async () => {
      const auth = await resolveAuth({
        authMode: 'inline',
        kubernetesUrlTemplate: SERVER_URL,
        tokenTemplate: TOKEN,
        caCertSource: 'stringTemplate',
        caCertTemplate: '-----BEGIN CERTIFICATE-----\nFAKE\n-----END CERTIFICATE-----',
        disableSSLVerification: true
      }, {}, defaultContext);

      auth.disableSSLVerification.should.be.true();
      (auth.caCert === null).should.be.true();
    });

    it('skips reading CA cert from disk when disableSSLVerification is true even if disk path is empty/invalid', async () => {
      const auth = await resolveAuth({
        authMode: 'inline',
        kubernetesUrlTemplate: SERVER_URL,
        tokenTemplate: TOKEN,
        caCertSource: 'diskPath',
        caCertDiskPathTemplate: '',
        disableSSLVerification: true
      }, {}, defaultContext);

      auth.disableSSLVerification.should.be.true();
      (auth.caCert === null).should.be.true();
    });

    it('skips reading in-cluster CA cert when disableSSLVerification is true (inCluster)', async () => {
      const origHost = process.env.KUBERNETES_SERVICE_HOST;
      const origPort = process.env.KUBERNETES_SERVICE_PORT;
      process.env.KUBERNETES_SERVICE_HOST = '10.96.0.1';
      process.env.KUBERNETES_SERVICE_PORT = '443';

      const loadGuardedFileStub = sinon.stub();
      loadGuardedFileStub.withArgs('/var/run/secrets/kubernetes.io/serviceaccount/token', sinon.match.any)
        .resolves('service-account-token\n');

      try {
        const auth = await resolveAuth({
          authMode: 'inCluster',
          disableSSLVerification: true
        }, {}, { diskUtils: { loadGuardedFile: loadGuardedFileStub } });

        auth.disableSSLVerification.should.be.true();
        (auth.caCert === null).should.be.true();
        loadGuardedFileStub.calledOnce.should.be.true();
        loadGuardedFileStub.firstCall.args[0].should.equal('/var/run/secrets/kubernetes.io/serviceaccount/token');
      } finally {
        process.env.KUBERNETES_SERVICE_HOST = origHost;
        process.env.KUBERNETES_SERVICE_PORT = origPort;
      }
    });

    it('defaults disableSSLVerification to false when not provided', async () => {
      const auth = await resolveAuth({
        authMode: 'inline',
        kubernetesUrlTemplate: SERVER_URL,
        tokenTemplate: TOKEN
      }, {}, defaultContext);

      auth.disableSSLVerification.should.be.false();
    });

    describe('resolveManifestContent', () => {
      it('renders manifest from stringTemplate', async () => {
        const node = {
          manifestSource: 'stringTemplate',
          manifestTemplate: 'kind: Pod\nmetadata:\n  name: {{podName}}'
        };
        const res = await resolveManifestContent(node, { podName: 'nginx' }, defaultContext);
        res.should.equal('kind: Pod\nmetadata:\n  name: nginx');
      });

      it('defaults manifestSource to stringTemplate if unspecified', async () => {
        const node = {
          manifestTemplate: 'kind: ConfigMap\nmetadata:\n  name: my-cm'
        };
        const res = await resolveManifestContent(node, {}, defaultContext);
        res.should.equal('kind: ConfigMap\nmetadata:\n  name: my-cm');
      });

      it('throws MissingField if manifestTemplate is missing or empty', async () => {
        await resolveManifestContent({ manifestSource: 'stringTemplate', manifestTemplate: '' }, {}, defaultContext)
          .should.be.rejectedWith(errors.MissingField({ title: 'Manifest Template' }));
        await resolveManifestContent({ manifestSource: 'stringTemplate' }, {}, defaultContext)
          .should.be.rejectedWith(errors.MissingField({ title: 'Manifest Template' }));
      });

      it('throws Validation if manifestTemplate resolves to empty string', async () => {
        await resolveManifestContent({ manifestSource: 'stringTemplate', manifestTemplate: '  {{emptyVar}}  ' }, { emptyVar: '' }, defaultContext)
          .should.be.rejectedWith(errors.Validation({ message: 'Manifest template resolved to an empty value.' }));
      });

      it('resolves manifest string from payloadPath', async () => {
        const node = {
          manifestSource: 'payloadPath',
          manifestPayloadPath: 'working.yaml'
        };
        const res = await resolveManifestContent(node, { working: { yaml: 'kind: Service\nmetadata:\n  name: svc' } }, defaultContext);
        res.should.equal('kind: Service\nmetadata:\n  name: svc');
      });

      it('serializes manifest object from payloadPath to JSON string', async () => {
        const manifestObj = { kind: 'Pod', metadata: { name: 'obj-pod' } };
        const node = {
          manifestSource: 'payloadPath',
          manifestPayloadPath: 'working.manifest'
        };
        const res = await resolveManifestContent(node, { working: { manifest: manifestObj } }, defaultContext);
        res.should.equal(JSON.stringify(manifestObj));
      });

      it('throws MissingField if manifestPayloadPath is missing or empty', async () => {
        await resolveManifestContent({ manifestSource: 'payloadPath', manifestPayloadPath: '' }, {}, defaultContext)
          .should.be.rejectedWith(errors.MissingField({ title: 'Manifest Payload Path' }));
      });

      it('throws Validation if payloadPath resolves to null or undefined', async () => {
        await resolveManifestContent({ manifestSource: 'payloadPath', manifestPayloadPath: 'missing.path' }, {}, defaultContext)
          .should.be.rejectedWith(errors.Validation({ message: 'No manifest found at payload path "missing.path".' }));
      });

      it('throws Validation if payloadPath resolves to empty string', async () => {
        await resolveManifestContent({ manifestSource: 'payloadPath', manifestPayloadPath: 'working.empty' }, { working: { empty: '   ' } }, defaultContext)
          .should.be.rejectedWith(errors.Validation({ message: 'Manifest at payload path "working.empty" is empty.' }));
      });

      it('resolves manifest file content in diskPath mode', async () => {
        const filePath = path.resolve(os.tmpdir(), 'k8s-test-manifest.yaml');
        await fs.writeFile(filePath, 'kind: Pod\nmetadata:\n  name: disk-pod\n');
        try {
          const node = {
            manifestSource: 'diskPath',
            manifestDiskPathTemplate: filePath
          };
          const res = await resolveManifestContent(node, {}, defaultContext);
          res.should.equal('kind: Pod\nmetadata:\n  name: disk-pod');
        } finally {
          await fs.remove(filePath);
        }
      });

      it('throws MissingField if manifestDiskPathTemplate is missing or empty', async () => {
        await resolveManifestContent({ manifestSource: 'diskPath', manifestDiskPathTemplate: '' }, {}, defaultContext)
          .should.be.rejectedWith(errors.MissingField({ title: 'Manifest Disk Path' }));
      });

      it('throws Validation if disk file is empty', async () => {
        const filePath = path.resolve(os.tmpdir(), 'k8s-empty-manifest.yaml');
        await fs.writeFile(filePath, '   \n   \n');
        try {
          const node = {
            manifestSource: 'diskPath',
            manifestDiskPathTemplate: filePath
          };
          await resolveManifestContent(node, {}, defaultContext)
            .should.be.rejectedWith(errors.Validation({ message: `Manifest file at "${filePath}" is empty.` }));
        } finally {
          await fs.remove(filePath);
        }
      });

      it('throws Validation if manifestDiskPathTemplate targets protected Losant directory', async () => {
        const protectedPath = path.resolve(PROJECT_ROOT_DIR, 'package.json');
        const node = {
          manifestSource: 'diskPath',
          manifestDiskPathTemplate: protectedPath
        };
        await resolveManifestContent(node, {}, defaultContext).should.be.rejectedWith({
          type: 'Validation',
          message: 'Cannot access within the protected Losant Edge Agent directory.'
        });
      });

      it('throws Validation for unsupported manifestSource', async () => {
        await resolveManifestContent({ manifestSource: 'ftp' }, {}, defaultContext)
          .should.be.rejectedWith(errors.Validation({ message: 'Unsupported manifestSource "ftp".' }));
      });
    });

    describe('resolveManifestDocuments', () => {
      it('parses a single namespaced YAML document with metadata.namespace', () => {
        const yaml = `
          apiVersion: apps/v1
          kind: Deployment
          metadata:
            name: nginx-deployment
            namespace: custom-ns
          `;
        const docs = resolveManifestDocuments(yaml);
        docs.should.have.length(1);
        docs[0].should.deepEqual({
          doc: {
            apiVersion: 'apps/v1',
            kind: 'Deployment',
            metadata: {
              name: 'nginx-deployment',
              namespace: 'custom-ns'
            }
          },
          kind: 'Deployment',
          name: 'nginx-deployment',
          namespace: 'custom-ns',
          path: '/apis/apps/v1/namespaces/custom-ns/deployments/nginx-deployment'
        });
      });

      it('uses defaultNamespace when namespaced resource omits metadata.namespace', () => {
        const yaml = `
          kind: Pod
          metadata:
            name: standalone-pod
          `;
        const docs = resolveManifestDocuments(yaml, 'my-namespace');
        docs.should.have.length(1);
        docs[0].namespace.should.equal('my-namespace');
        docs[0].path.should.equal('/api/v1/namespaces/my-namespace/pods/standalone-pod');
      });

      it('falls back to "default" namespace when neither document nor defaultNamespace provides one', () => {
        const yaml = `
          kind: Service
          metadata:
            name: my-service
          `;
        const docs = resolveManifestDocuments(yaml, '');
        docs.should.have.length(1);
        docs[0].namespace.should.equal('default');
        docs[0].path.should.equal('/api/v1/namespaces/default/services/my-service');
      });

      it('correctly handles cluster-scoped resources (Namespace, Node, ClusterRole)', () => {
        const yaml = `
          kind: Namespace
          metadata:
            name: dev-env
          `;
        const docs = resolveManifestDocuments(yaml);
        docs.should.have.length(1);
        should(docs[0].namespace).be.undefined();
        docs[0].path.should.equal('/api/v1/namespaces/dev-env');

        const clusterRoleYaml = `
          kind: ClusterRole
          metadata:
            name: secret-reader
          `;
        const clusterRoleDocs = resolveManifestDocuments(clusterRoleYaml);
        clusterRoleDocs.should.have.length(1);
        should(clusterRoleDocs[0].namespace).be.undefined();
        clusterRoleDocs[0].path.should.equal('/apis/rbac.authorization.k8s.io/v1/clusterroles/secret-reader');
      });

      it('parses multi-document YAML manifests and ignores comments / empty docs', () => {
        const yaml = `
          # Comment at the top
---
          apiVersion: v1
          kind: ConfigMap
          metadata:
            name: app-config
            namespace: prod
---
          # Empty separator
---
          apiVersion: apps/v1
          kind: StatefulSet
          metadata:
            name: redis
            namespace: prod
---
          `;
        const docs = resolveManifestDocuments(yaml);
        docs.should.have.length(2);
        docs[0].kind.should.equal('ConfigMap');
        docs[0].name.should.equal('app-config');
        docs[0].path.should.equal('/api/v1/namespaces/prod/configmaps/app-config');

        docs[1].kind.should.equal('StatefulSet');
        docs[1].name.should.equal('redis');
        docs[1].path.should.equal('/apis/apps/v1/namespaces/prod/statefulsets/redis');
      });

      it('parses JSON formatted manifest', () => {
        const json = JSON.stringify({
          kind: 'Job',
          metadata: { name: 'db-migrate', namespace: 'batch-ns' }
        });
        const docs = resolveManifestDocuments(json);
        docs.should.have.length(1);
        docs[0].kind.should.equal('Job');
        docs[0].name.should.equal('db-migrate');
        docs[0].path.should.equal('/apis/batch/v1/namespaces/batch-ns/jobs/db-migrate');
      });

      it('throws Validation on invalid YAML syntax', () => {
        const badYaml = 'kind: Pod\nmetadata:\n  name: [unclosed';
        try {
          resolveManifestDocuments(badYaml);
          should.fail('Expected resolveManifestDocuments to throw');
        } catch (err) {
          err.type.should.equal('Validation');
          err.message.should.match(/^Invalid YAML manifest:/);
        }
      });

      it('throws Validation if manifest contains no valid resource definitions', () => {
        const emptyYaml = '# Only comments\n---\n---\n';
        (() => resolveManifestDocuments(emptyYaml))
          .should.throw(errors.Validation({ message: 'Manifest contains no valid Kubernetes resource definitions.' }));

        const stringOnlyYaml = 'just a string';
        (() => resolveManifestDocuments(stringOnlyYaml))
          .should.throw(errors.Validation({ message: 'Manifest contains no valid Kubernetes resource definitions.' }));
      });

      it('throws Validation if document is missing kind', () => {
        const yaml = 'metadata:\n  name: missing-kind';
        (() => resolveManifestDocuments(yaml))
          .should.throw(errors.Validation({ message: 'Resource at index 1 is missing "kind".' }));
      });

      it('throws Validation if kind is unsupported / CRD', () => {
        const yaml = 'kind: CustomResourceDefinition\nmetadata:\n  name: my-crd';
        (() => resolveManifestDocuments(yaml))
          .should.throw(errors.Validation({
            message: 'Unsupported kind "CustomResourceDefinition" — use the \'custom\' operation for CRDs.'
          }));
      });

      it('throws Validation if document is missing metadata.name', () => {
        const yaml = 'kind: Pod\nmetadata:\n  namespace: default';
        (() => resolveManifestDocuments(yaml))
          .should.throw(errors.Validation({ message: 'Resource "Pod" at index 1 is missing "metadata.name".' }));
      });

      it('throws Validation if resource name is invalid', () => {
        const yaml = 'kind: Pod\nmetadata:\n  name: ../bad/name';
        (() => resolveManifestDocuments(yaml))
          .should.throw(errors.Validation({ message: 'Invalid resource name "../bad/name".' }));
      });

      it('throws Validation if namespace is invalid', () => {
        const yaml = 'kind: Pod\nmetadata:\n  name: my-pod\n  namespace: BAD_NS!';
        (() => resolveManifestDocuments(yaml))
          .should.throw(errors.Validation({ message: 'Invalid namespace "BAD_NS!".' }));
      });

      it('successfully resolves manifests with YAML anchors, aliases, and special characters (&, *, &&)', () => {
        const yamlWithAnchors = `
kind: ConfigMap
metadata:
  name: cm
data:
  key: &anchor value
  key2: *anchor
  cmd: "echo foo && echo bar"
  cron: "* * * * *"
`;
        const docs = resolveManifestDocuments(yamlWithAnchors);
        docs.should.have.length(1);
        docs[0].doc.data.key.should.equal('value');
        docs[0].doc.data.key2.should.equal('value');
        docs[0].doc.data.cmd.should.equal('echo foo && echo bar');
        docs[0].doc.data.cron.should.equal('* * * * *');
      });

      it('does not reject literal "&" characters inside a quoted scalar value', () => {
        const yaml = 'kind: ConfigMap\nmetadata:\n  name: cm\ndata:\n  note: "Salt & Pepper"';
        const docs = resolveManifestDocuments(yaml);
        docs.should.have.length(1);
        docs[0].doc.data.note.should.equal('Salt & Pepper');
      });

      it('reports the original document index, unshifted by earlier filtered-out empty documents', () => {
        const yaml = 'kind: ConfigMap\nmetadata:\n  name: cm-1\n---\n---\nkind: Pod\nmetadata:\n  namespace: default';
        (() => resolveManifestDocuments(yaml))
          .should.throw(errors.Validation({ message: 'Resource "Pod" at index 3 is missing "metadata.name".' }));
      });

      it('resolveApiVersion resolves defaults when apiVersion is omitted or nil', () => {
        const res = resolveApiVersion(undefined, { apiGroup: 'apps', version: 'v1' });
        res.should.deepEqual({ apiGroup: 'apps', version: 'v1' });

        const resNil = resolveApiVersion(null, { apiGroup: '', version: 'v1' });
        resNil.should.deepEqual({ apiGroup: '', version: 'v1' });
      });

      it('resolveApiVersion throws Validation if apiVersion is not a string or is empty', () => {
        [1, true, {}, []].forEach((badVal) => {
          (() => resolveApiVersion(badVal, { version: 'v1' }, { kind: 'Pod', docIndex: 1 }))
            .should.throw(errors.Validation({
              message: `Resource "Pod" at index 1 has an invalid "apiVersion" value "${badVal}".`
            }));
        });

        ['', '   '].forEach((badVal) => {
          (() => resolveApiVersion(badVal, { version: 'v1' }, { kind: 'Pod', docIndex: 1 }))
            .should.throw(errors.Validation({
              message: `Resource "Pod" at index 1 has an invalid "apiVersion" value "${badVal}".`
            }));
        });
      });

      it('resolveApiVersion throws Validation if apiVersion has an invalid number of path segments', () => {
        ['apps/v1/extra', '/', 'a/b/c'].forEach((badVal) => {
          (() => resolveApiVersion(badVal, { version: 'v1' }, { kind: 'Deployment', docIndex: 1 }))
            .should.throw(errors.Validation({
              message: `Resource "Deployment" at index 1 has an invalid "apiVersion" value "${badVal}".`
            }));
        });
      });

      it('resolveApiVersion throws Validation if apiVersion contains path traversal or invalid characters', () => {
        ['../v1', 'apps/../v1', 'apps/v1/..', 'apps/v1%', 'invalid group/v1', 'apps/1.0', 'apps/v1.0', 'apps/v0', 'apps/v1alpha', 'apps/V1'].forEach((badVal) => {
          (() => resolveApiVersion(badVal, { version: 'v1' }, { kind: 'Deployment', docIndex: 1 }))
            .should.throw(errors.Validation({
              message: `Resource "Deployment" at index 1 has an invalid "apiVersion" value "${badVal}".`
            }));
        });
      });

      it('throws Validation if manifest document has non-string or path-traversal apiVersion', () => {
        const yamlNum = 'apiVersion: 1\nkind: Pod\nmetadata:\n  name: pod\n';
        (() => resolveManifestDocuments(yamlNum))
          .should.throw(errors.Validation({
            message: 'Resource "Pod" at index 1 has an invalid "apiVersion" value "1".'
          }));

        const yamlTraversal = 'apiVersion: ../v1\nkind: Pod\nmetadata:\n  name: pod\n';
        (() => resolveManifestDocuments(yamlTraversal))
          .should.throw(errors.Validation({
            message: 'Resource "Pod" at index 1 has an invalid "apiVersion" value "../v1".'
          }));
      });
    });
  });

  describe('makeKubernetesRequest', () => {
    afterEach(() => {
      nock.cleanAll();
    });

    it('makes authenticated GET requests with Bearer token', async () => {
      nock(SERVER_URL, { reqheaders: { authorization: `Bearer ${TOKEN}` } })
        .get('/api/v1/pods')
        .reply(200, { items: [] });

      const res = await makeKubernetesRequest({ server: SERVER_URL, token: TOKEN, path: '/api/v1/pods' });
      res.statusCode.should.equal(200);
      res.body.should.deepEqual({ items: [] });
    });

    it('does not append timeoutSeconds query parameter automatically when timeoutMs is configured', async () => {
      nock(SERVER_URL)
        .get('/api/v1/pods')
        .reply(200, { items: [] });

      const res = await makeKubernetesRequest({ server: SERVER_URL, token: TOKEN, path: '/api/v1/pods', timeoutMs: 15000 });
      res.statusCode.should.equal(200);
    });

    it('forwards timeoutSeconds when explicitly provided in query', async () => {
      nock(SERVER_URL)
        .get('/api/v1/pods?timeoutSeconds=15')
        .reply(200, { items: [] });

      const res = await makeKubernetesRequest({
        server: SERVER_URL,
        token: TOKEN,
        path: '/api/v1/pods',
        query: { timeoutSeconds: 15 },
        timeoutMs: 15000
      });
      res.statusCode.should.equal(200);
    });

    it('omits request body and content-type header for GET and DELETE requests even if body is supplied', async () => {
      nock(SERVER_URL, {
        badheaders: ['content-type']
      })
        .get('/api/v1/pods')
        .reply(200, function(uri, requestBody) {
          requestBody.should.equal('');
          return { items: [] };
        });

      nock(SERVER_URL, {
        badheaders: ['content-type']
      })
        .delete('/api/v1/namespaces/default/pods/my-pod')
        .reply(200, function(uri, requestBody) {
          requestBody.should.equal('');
          return { status: 'Success' };
        });

      const getRes = await makeKubernetesRequest({
        server: SERVER_URL,
        token: TOKEN,
        method: 'GET',
        path: '/api/v1/pods',
        body: { shouldBeIgnored: true }
      });
      getRes.statusCode.should.equal(200);

      const delRes = await makeKubernetesRequest({
        server: SERVER_URL,
        token: TOKEN,
        method: 'DELETE',
        path: '/api/v1/namespaces/default/pods/my-pod',
        body: { shouldBeIgnored: true }
      });
      delRes.statusCode.should.equal(200);
    });

    it('returns non-2xx status codes directly without throwing', async () => {
      nock(SERVER_URL)
        .get('/api/v1/namespaces/default/pods/missing')
        .reply(404, { kind: 'Status', status: 'Failure', message: 'pods "missing" not found', code: 404 });

      const res = await makeKubernetesRequest({ server: SERVER_URL, token: TOKEN, path: '/api/v1/namespaces/default/pods/missing' });
      res.statusCode.should.equal(404);
      res.body.code.should.equal(404);
      res.body.message.should.equal('pods "missing" not found');
    });

    it('rejects on transport error (e.g. connection refused)', async () => {
      const netError = new Error('connect ECONNREFUSED');
      netError.code = 'ECONNREFUSED';
      nock(SERVER_URL)
        .get('/api/v1/pods')
        .replyWithError(netError);

      await makeKubernetesRequest({ server: SERVER_URL, token: TOKEN, path: '/api/v1/pods' })
        .should.be.rejectedWith(/ECONNREFUSED/);
    });

    it('passes custom headers and serialized body', async () => {
      nock(SERVER_URL, {
        reqheaders: {
          'authorization': 'Bearer custom-token',
          'accept': 'application/json, */*',
          'x-custom-header': 'custom-val',
          'content-type': 'application/strategic-merge-patch+json'
        }
      })
        .patch('/api/v1/namespaces/default/pods/my-pod')
        .reply(200, { metadata: { name: 'my-pod' } });

      const res = await makeKubernetesRequest({
        server: SERVER_URL,
        token: 'custom-token',
        method: 'PATCH',
        path: '/api/v1/namespaces/default/pods/my-pod',
        headers: {
          'x-custom-header': 'custom-val'
        },
        body: { spec: { activeDeadlineSeconds: 30 } },
        contentType: 'application/strategic-merge-patch+json'
      });
      res.statusCode.should.equal(200);
    });

    it('preserves query parameters in path without percent-encoding question mark', async () => {
      nock(SERVER_URL)
        .get('/apis/batch/v1/jobs?limit=5')
        .reply(200, { items: [] });

      const res = await makeKubernetesRequest({
        server: SERVER_URL,
        token: TOKEN,
        path: '/apis/batch/v1/jobs?limit=5',
        timeoutMs: 30000
      });
      res.statusCode.should.equal(200);
      res.body.should.deepEqual({ items: [] });
    });

    it('merges path query parameters with query option and preserves server reverse proxy base path', async () => {
      const proxyServer = 'https://k8s.example.com:6443/prefix/k8s';
      nock('https://k8s.example.com:6443')
        .get('/prefix/k8s/api/v1/pods?labelSelector=app%3Dweb&limit=10')
        .reply(200, { items: [] });

      const res = await makeKubernetesRequest({
        server: proxyServer,
        token: TOKEN,
        path: '/api/v1/pods?labelSelector=app=web',
        query: { limit: '10' },
        timeoutMs: 15000
      });
      res.statusCode.should.equal(200);
      res.body.should.deepEqual({ items: [] });
    });

    it('throws MissingField if server URL is missing', async () => {
      await makeKubernetesRequest({ server: '', token: TOKEN, path: '/api/v1/pods' })
        .should.be.rejectedWith(errors.MissingField({ title: 'Kubernetes Server URL' }));
    });

    it('throws Validation if server is not a valid http/https URL', async () => {
      await makeKubernetesRequest({ server: 'not-a-valid-url', token: TOKEN, path: '/api/v1/pods' })
        .should.be.rejectedWith(errors.Validation({ message: 'Invalid URL: not-a-valid-url' }));

      await makeKubernetesRequest({ server: 'ftp://k8s.example.com', token: TOKEN, path: '/api/v1/pods' })
        .should.be.rejectedWith(errors.Validation({ message: 'Invalid URL (protocol must be http:, https:): ftp://k8s.example.com' }));
    });

    it('configures httpsAgent with rejectUnauthorized: false when disableSSLVerification is true for HTTPS', async () => {
      nock(SERVER_URL).get('/api/v1/pods').reply(200, { items: [] });
      const agentSpy = sinon.spy(https, 'Agent');
      try {
        const res = await makeKubernetesRequest({
          server: SERVER_URL,
          token: TOKEN,
          path: '/api/v1/pods',
          disableSSLVerification: true
        });
        res.statusCode.should.equal(200);
        agentSpy.calledOnce.should.be.true();
        agentSpy.calledWithMatch({
          rejectUnauthorized: false,
          keepAlive: false
        }).should.be.true();
      } finally {
        agentSpy.restore();
      }
    });

    it('prefers rejectUnauthorized: false over caCert when disableSSLVerification is true', async () => {
      nock(SERVER_URL).get('/api/v1/pods').reply(200, { items: [] });
      const agentSpy = sinon.spy(https, 'Agent');
      try {
        const res = await makeKubernetesRequest({
          server: SERVER_URL,
          token: TOKEN,
          path: '/api/v1/pods',
          caCert: '---CUSTOM-CA---',
          disableSSLVerification: true
        });
        res.statusCode.should.equal(200);
        agentSpy.calledOnce.should.be.true();
        agentSpy.calledWithMatch({
          rejectUnauthorized: false,
          keepAlive: false
        }).should.be.true();
      } finally {
        agentSpy.restore();
      }
    });

    it('does not create httpsAgent for plain HTTP requests even if disableSSLVerification is true', async () => {
      nock('http://k8s.example.com').get('/api/v1/pods').reply(200, { items: [] });
      const agentSpy = sinon.spy(https, 'Agent');
      try {
        const res = await makeKubernetesRequest({
          server: 'http://k8s.example.com',
          token: TOKEN,
          path: '/api/v1/pods',
          disableSSLVerification: true
        });
        res.statusCode.should.equal(200);
        agentSpy.called.should.be.false();
      } finally {
        agentSpy.restore();
      }
    });
  });

  describe('Node Execution & Validation', () => {
    afterEach(() => {
      nock.cleanAll();
    });

    it('executes operation and leaves payload unmodified when resultPath is omitted', async () => {
      nock(SERVER_URL).get('/api/v1/pods?timeoutSeconds=30').reply(200, { items: [] });
      const node = new KubernetesNode('id', OUTPUT_IDS, {
        authMode: 'inline',
        kubernetesUrlTemplate: SERVER_URL,
        tokenTemplate: TOKEN,
        operationTemplate: 'listPods'
      });
      const [outputIds, newPayload] = await node.run(defaultContext, { existing: 123 });
      outputIds.should.equal(OUTPUT_IDS);
      newPayload.should.deepEqual({ existing: 123 });
    });

    it('executes operation with disableSSLVerification enabled on node', async () => {
      nock(SERVER_URL).get('/api/v1/pods?timeoutSeconds=30').reply(200, { items: [] });
      const agentSpy = sinon.spy(https, 'Agent');
      try {
        const node = buildNode({
          operationTemplate: 'listPods',
          disableSSLVerification: true
        });
        node.disableSSLVerification.should.be.true();

        const [outputIds, newPayload] = await node.run(defaultContext, {});
        outputIds.should.equal(OUTPUT_IDS);
        newPayload.working.k8sResult.statusCode.should.equal(200);
        agentSpy.calledOnce.should.be.true();
        agentSpy.calledWithMatch({
          rejectUnauthorized: false,
          keepAlive: false
        }).should.be.true();
      } finally {
        agentSpy.restore();
      }
    });

    it('defaults disableSSLVerification to false on node instance', () => {
      const node = buildNode();
      node.disableSSLVerification.should.be.false();
    });

    it('throws MissingField when operationTemplate is missing', async () => {
      const node = new KubernetesNode('id', OUTPUT_IDS, { resultPath: 'working.res' });
      await node.run(defaultContext, {}).should.be.rejectedWith(errors.MissingField({ title: 'Operation' }));
    });

    it('throws Validation when operation is unknown', async () => {
      const node = buildNode({ operationTemplate: 'nonExistentOperation' });
      await node.run(defaultContext, {}).should.be.rejectedWith(errors.Validation({ message: 'Unsupported Kubernetes operation "nonExistentOperation"' }));
    });

    it('throws MissingField when namespaceTemplate is required but missing', async () => {
      // getPod requires both namespace and name; verify namespace validation triggers when missing
      const node = buildNode({ operationTemplate: 'getPod', namespaceTemplate: '', nameTemplate: 'my-pod' });
      await node.run(defaultContext, {}).should.be.rejectedWith(errors.MissingField({ title: 'Namespace' }));
    });

    it('throws MissingField when nameTemplate is required but missing', async () => {
      // getPod is a namespaced resource where namespace is validated before name; provide namespace to isolate name validation
      const node = buildNode({ operationTemplate: 'getPod', namespaceTemplate: 'default', nameTemplate: '' });
      await node.run(defaultContext, {}).should.be.rejectedWith(errors.MissingField({ title: 'Name' }));
    });

    it('executes listPods operation and writes result to resultPath', async () => {
      nock(SERVER_URL)
        .get('/api/v1/namespaces/production/pods?labelSelector=tier%3Dbackend&timeoutSeconds=30')
        .reply(200, {
          kind: 'PodList',
          items: [{ metadata: { name: 'api-1' } }]
        });

      const node = buildNode({
        operationTemplate: 'listPods',
        namespaceTemplate: 'production',
        labelSelectorTemplate: 'tier={{tier}}'
      });

      const [outputIds, newPayload] = await node.run(defaultContext, { tier: 'backend' });
      outputIds.should.equal(OUTPUT_IDS);
      newPayload.working.k8sResult.statusCode.should.equal(200);
      newPayload.working.k8sResult.body.kind.should.equal('PodList');
      newPayload.working.k8sResult.body.items[0].metadata.name.should.equal('api-1');
    });

    it('executes getPod operation', async () => {
      nock(SERVER_URL)
        .get('/api/v1/namespaces/default/pods/web-pod')
        .reply(200, { metadata: { name: 'web-pod' }, status: { phase: 'Running' } });

      const node = buildNode({
        operationTemplate: 'getPod',
        namespaceTemplate: 'default',
        nameTemplate: 'web-pod'
      });

      const [, newPayload] = await node.run(defaultContext, {});
      newPayload.working.k8sResult.statusCode.should.equal(200);
      newPayload.working.k8sResult.body.status.phase.should.equal('Running');
    });

    it('executes createPod operation', async () => {
      nock(SERVER_URL)
        .post('/api/v1/namespaces/default/pods', {
          metadata: { name: 'new-pod' }
        })
        .reply(201, { metadata: { name: 'new-pod' } });

      const node = buildNode({
        operationTemplate: 'createPod',
        namespaceTemplate: 'default',
        bodyTemplate: '{"metadata":{"name":"new-pod"}}'
      });

      const [, newPayload] = await node.run(defaultContext, {});
      newPayload.working.k8sResult.statusCode.should.equal(201);
      newPayload.working.k8sResult.body.metadata.name.should.equal('new-pod');
    });

    it('executes deletePod operation', async () => {
      nock(SERVER_URL)
        .delete('/api/v1/namespaces/default/pods/old-pod')
        .reply(200, { status: 'Success' });

      const node = buildNode({
        operationTemplate: 'deletePod',
        namespaceTemplate: 'default',
        nameTemplate: 'old-pod'
      });

      const [, newPayload] = await node.run(defaultContext, {});
      newPayload.working.k8sResult.statusCode.should.equal(200);
      newPayload.working.k8sResult.body.status.should.equal('Success');
    });

    it('executes getPodLogs operation and retrieves plain text', async () => {
      nock(SERVER_URL, { reqheaders: { accept: 'text/plain, */*' } })
        .get('/api/v1/namespaces/default/pods/web-pod/log?container=app&tailLines=50')
        .reply(200, '2026-10-01T12:00:00Z Server listening on port 80\n2026-10-01T12:00:01Z Ready');

      const node = buildNode({
        operationTemplate: 'getPodLogs',
        namespaceTemplate: 'default',
        nameTemplate: 'web-pod',
        containerTemplate: 'app',
        tailLinesTemplate: '50'
      });

      const [, newPayload] = await node.run(defaultContext, {});
      newPayload.working.k8sResult.statusCode.should.equal(200);
      newPayload.working.k8sResult.body.should.equal('2026-10-01T12:00:00Z Server listening on port 80\n2026-10-01T12:00:01Z Ready');
    });

    it('executes Deployment operations (list, get, create, update, patch, delete)', async () => {
      nock(SERVER_URL)
        .get('/apis/apps/v1/namespaces/default/deployments?timeoutSeconds=30')
        .reply(200, { items: [] });
      nock(SERVER_URL)
        .get('/apis/apps/v1/namespaces/default/deployments/web')
        .reply(200, { metadata: { name: 'web' } });
      nock(SERVER_URL)
        .post('/apis/apps/v1/namespaces/default/deployments', { metadata: { name: 'web' } })
        .reply(201, { metadata: { name: 'web' } });
      nock(SERVER_URL)
        .put('/apis/apps/v1/namespaces/default/deployments/web', { metadata: { name: 'web' } })
        .reply(200, { metadata: { name: 'web' } });
      nock(SERVER_URL, {
        reqheaders: { 'content-type': 'application/strategic-merge-patch+json' }
      })
        .patch('/apis/apps/v1/namespaces/default/deployments/web', { spec: { replicas: 5 } })
        .reply(200, { metadata: { name: 'web' } });
      nock(SERVER_URL)
        .delete('/apis/apps/v1/namespaces/default/deployments/web')
        .reply(200, { status: 'Success' });

      // listDeployments
      let [, res] = await buildNode({ operationTemplate: 'listDeployments', namespaceTemplate: 'default' }).run(defaultContext, {});
      res.working.k8sResult.statusCode.should.equal(200);

      // getDeployment
      [, res] = await buildNode({ operationTemplate: 'getDeployment', namespaceTemplate: 'default', nameTemplate: 'web' }).run(defaultContext, {});
      res.working.k8sResult.statusCode.should.equal(200);

      // createDeployment
      [, res] = await buildNode({ operationTemplate: 'createDeployment', namespaceTemplate: 'default', bodyTemplate: '{"metadata":{"name":"web"}}' }).run(defaultContext, {});
      res.working.k8sResult.statusCode.should.equal(201);

      // updateDeployment
      [, res] = await buildNode({ operationTemplate: 'updateDeployment', namespaceTemplate: 'default', nameTemplate: 'web', bodyTemplate: '{"metadata":{"name":"web"}}' }).run(defaultContext, {});
      res.working.k8sResult.statusCode.should.equal(200);

      // patchDeployment
      [, res] = await buildNode({ operationTemplate: 'patchDeployment', namespaceTemplate: 'default', nameTemplate: 'web', bodyTemplate: '{"spec":{"replicas":5}}' }).run(defaultContext, {});
      res.working.k8sResult.statusCode.should.equal(200);

      // deleteDeployment
      [, res] = await buildNode({ operationTemplate: 'deleteDeployment', namespaceTemplate: 'default', nameTemplate: 'web' }).run(defaultContext, {});
      res.working.k8sResult.statusCode.should.equal(200);
    });

    it('executes Service, ConfigMap, Namespace, and Node operations', async () => {
      nock(SERVER_URL).get('/api/v1/namespaces/default/services?timeoutSeconds=30').reply(200, { items: [] });
      nock(SERVER_URL).put('/api/v1/namespaces/default/services/svc', { spec: { type: 'NodePort' } }).reply(200, { metadata: { name: 'svc' } });
      nock(SERVER_URL, { reqheaders: { 'content-type': 'application/strategic-merge-patch+json' } })
        .patch('/api/v1/namespaces/default/services/svc', { spec: { type: 'ClusterIP' } })
        .reply(200, { metadata: { name: 'svc' } });
      nock(SERVER_URL).get('/api/v1/namespaces/default/configmaps/cfg').reply(200, { data: { key: 'val' } });
      nock(SERVER_URL).put('/api/v1/namespaces/default/configmaps/cfg', { data: { key: 'updated' } }).reply(200, { data: { key: 'updated' } });
      nock(SERVER_URL, { reqheaders: { 'content-type': 'application/strategic-merge-patch+json' } })
        .patch('/api/v1/namespaces/default/configmaps/cfg', { data: { key: 'patched' } })
        .reply(200, { data: { key: 'patched' } });
      nock(SERVER_URL).get('/api/v1/namespaces?timeoutSeconds=30').reply(200, { items: [{ metadata: { name: 'default' } }] });
      nock(SERVER_URL).get('/api/v1/namespaces/production').reply(200, { metadata: { name: 'production' } });
      nock(SERVER_URL).get('/api/v1/nodes/node-1').reply(200, { metadata: { name: 'node-1' } });

      let [, res] = await buildNode({ operationTemplate: 'listServices', namespaceTemplate: 'default' }).run(defaultContext, {});
      res.working.k8sResult.statusCode.should.equal(200);

      [, res] = await buildNode({ operationTemplate: 'updateService', namespaceTemplate: 'default', nameTemplate: 'svc', bodyTemplate: '{"spec":{"type":"NodePort"}}' }).run(defaultContext, {});
      res.working.k8sResult.statusCode.should.equal(200);

      [, res] = await buildNode({ operationTemplate: 'patchService', namespaceTemplate: 'default', nameTemplate: 'svc', bodyTemplate: '{"spec":{"type":"ClusterIP"}}' }).run(defaultContext, {});
      res.working.k8sResult.statusCode.should.equal(200);

      [, res] = await buildNode({ operationTemplate: 'getConfigMap', namespaceTemplate: 'default', nameTemplate: 'cfg' }).run(defaultContext, {});
      res.working.k8sResult.statusCode.should.equal(200);

      [, res] = await buildNode({ operationTemplate: 'updateConfigMap', namespaceTemplate: 'default', nameTemplate: 'cfg', bodyTemplate: '{"data":{"key":"updated"}}' }).run(defaultContext, {});
      res.working.k8sResult.statusCode.should.equal(200);

      [, res] = await buildNode({ operationTemplate: 'patchConfigMap', namespaceTemplate: 'default', nameTemplate: 'cfg', bodyTemplate: '{"data":{"key":"patched"}}' }).run(defaultContext, {});
      res.working.k8sResult.statusCode.should.equal(200);

      [, res] = await buildNode({ operationTemplate: 'listNamespaces' }).run(defaultContext, {});
      res.working.k8sResult.statusCode.should.equal(200);

      [, res] = await buildNode({ operationTemplate: 'getNamespace', nameTemplate: 'production' }).run(defaultContext, {});
      res.working.k8sResult.statusCode.should.equal(200);

      [, res] = await buildNode({ operationTemplate: 'getNode', nameTemplate: 'node-1' }).run(defaultContext, {});
      res.working.k8sResult.statusCode.should.equal(200);
    });

    it('executes listNodes operation and queries cluster-wide nodes', async () => {
      nock(SERVER_URL)
        .get('/api/v1/nodes?labelSelector=role%3Dworker&timeoutSeconds=30')
        .reply(200, {
          kind: 'NodeList',
          items: [{ metadata: { name: 'node-worker-1' } }]
        });

      const node = buildNode({
        operationTemplate: 'listNodes',
        labelSelectorTemplate: 'role={{nodeRole}}'
      });

      const [outputIds, newPayload] = await node.run(defaultContext, { nodeRole: 'worker' });
      outputIds.should.equal(OUTPUT_IDS);
      newPayload.working.k8sResult.statusCode.should.equal(200);
      newPayload.working.k8sResult.body.kind.should.equal('NodeList');
      newPayload.working.k8sResult.body.items[0].metadata.name.should.equal('node-worker-1');
    });

    it('executes custom operation with custom method, path, and body', async () => {
      nock(SERVER_URL)
        .intercept('/apis/custom.metrics.k8s.io/v1beta1/namespaces/default/pods', 'GET')
        .reply(200, { items: [{ metricName: 'cpu' }] });

      const node = buildNode({
        operationTemplate: 'custom',
        customMethodTemplate: 'get',
        customPathTemplate: '/apis/custom.metrics.k8s.io/v1beta1/namespaces/default/pods'
      });

      const [, newPayload] = await node.run(defaultContext, {});
      newPayload.working.k8sResult.statusCode.should.equal(200);
      newPayload.working.k8sResult.body.items[0].metricName.should.equal('cpu');
    });

    it('executes custom GET and DELETE without sending request body or content-type even if customBodyTemplate is set', async () => {
      nock(SERVER_URL, {
        badheaders: ['content-type']
      })
        .intercept('/apis/custom.metrics.k8s.io/v1beta1/namespaces/default/pods', 'GET')
        .reply(200, function(uri, requestBody) {
          requestBody.should.equal('');
          return { items: [] };
        });

      nock(SERVER_URL, {
        badheaders: ['content-type']
      })
        .intercept('/apis/custom.metrics.k8s.io/v1beta1/namespaces/default/pods/my-pod', 'DELETE')
        .reply(200, function(uri, requestBody) {
          requestBody.should.equal('');
          return { status: 'Success' };
        });

      const getNode = buildNode({
        operationTemplate: 'custom',
        customMethodTemplate: 'GET',
        customPathTemplate: '/apis/custom.metrics.k8s.io/v1beta1/namespaces/default/pods',
        customBodyTemplate: '{"ignored":true}'
      });
      const [, getRes] = await getNode.run(defaultContext, {});
      getRes.working.k8sResult.statusCode.should.equal(200);

      const delNode = buildNode({
        operationTemplate: 'custom',
        customMethodTemplate: 'DELETE',
        customPathTemplate: '/apis/custom.metrics.k8s.io/v1beta1/namespaces/default/pods/my-pod',
        customBodyTemplate: '{"ignored":true}'
      });
      const [, delRes] = await delNode.run(defaultContext, {});
      delRes.working.k8sResult.statusCode.should.equal(200);
    });

    it('executes custom POST with empty customBodyTemplate sending {} body', async () => {
      nock(SERVER_URL, {
        reqheaders: {
          'content-type': 'application/json'
        }
      })
        .post('/apis/custom.metrics.k8s.io/v1beta1/namespaces/default/pods', {})
        .reply(201, { created: true });

      const postNode = buildNode({
        operationTemplate: 'custom',
        customMethodTemplate: 'POST',
        customPathTemplate: '/apis/custom.metrics.k8s.io/v1beta1/namespaces/default/pods',
        customBodyTemplate: ''
      });
      const [, postRes] = await postNode.run(defaultContext, {});
      postRes.working.k8sResult.statusCode.should.equal(201);
      postRes.working.k8sResult.body.created.should.be.true();
    });

    it('executes custom operation preserving query string in customPathTemplate without encoding question mark', async () => {
      nock(SERVER_URL)
        .intercept('/apis/batch/v1/jobs?limit=5', 'GET')
        .reply(200, { items: [{ metadata: { name: 'backup-job' } }] });

      const node = buildNode({
        operationTemplate: 'custom',
        customMethodTemplate: 'get',
        customPathTemplate: '/apis/batch/v1/jobs?limit=5'
      });

      const [, newPayload] = await node.run(defaultContext, {});
      newPayload.working.k8sResult.statusCode.should.equal(200);
      newPayload.working.k8sResult.body.items[0].metadata.name.should.equal('backup-job');
    });

    it('handles HTTP error responses (e.g. 404, 403) by writing statusCode and body without throwing', async () => {
      nock(SERVER_URL)
        .get('/api/v1/namespaces/default/pods/ghost')
        .reply(404, { message: 'pod ghost not found' });

      const node = buildNode({
        operationTemplate: 'getPod',
        namespaceTemplate: 'default',
        nameTemplate: 'ghost'
      });

      const [outputIds, newPayload] = await node.run(defaultContext, {});
      outputIds.should.equal(OUTPUT_IDS);
      newPayload.working.k8sResult.should.deepEqual({
        statusCode: 404,
        body: { message: 'pod ghost not found' }
      });
    });

    it('handles transport/network errors by writing error info to resultPath', async () => {
      const netError = new Error('getaddrinfo ENOTFOUND k8s.example.com');
      netError.code = 'ENOTFOUND';
      nock(SERVER_URL)
        .get('/api/v1/pods?timeoutSeconds=30')
        .replyWithError(netError);

      const node = buildNode({ operationTemplate: 'listPods' });
      const [outputIds, newPayload] = await node.run(defaultContext, {});
      outputIds.should.equal(OUTPUT_IDS);
      newPayload.working.k8sResult.should.deepEqual({
        error: {
          type: 'ENOTFOUND',
          message: 'getaddrinfo ENOTFOUND k8s.example.com'
        }
      });
    });

    it('throws Validation when guarded token path is inside protected directory', async () => {
      const protectedPath = path.resolve(PROJECT_ROOT_DIR, 'package.json');
      const node = buildNode({
        operationTemplate: 'listPods',
        tokenSource: 'diskPath',
        tokenDiskPathTemplate: protectedPath
      });
      await node.run(defaultContext, {}).should.be.rejectedWith({
        type: 'Validation',
        message: 'Cannot access within the protected Losant Edge Agent directory.'
      });
    });

    it('throws NotFound when token file does not exist on disk', async () => {
      const missing = path.resolve(os.tmpdir(), 'nonexistent-k8s-token.txt');
      const node = buildNode({
        operationTemplate: 'listPods',
        tokenSource: 'diskPath',
        tokenDiskPathTemplate: missing
      });
      await node.run(defaultContext, {}).should.be.rejectedWith({ type: 'NotFound' });
    });

    it('executes operation successfully with token loaded from diskPath', async () => {
      const tokenPath = path.resolve(os.tmpdir(), 'k8s-run-disk-token.txt');
      await fs.writeFile(tokenPath, 'disk-token-run-test');
      nock(SERVER_URL, { reqheaders: { authorization: 'Bearer disk-token-run-test' } })
        .get('/api/v1/pods?timeoutSeconds=30')
        .reply(200, { items: [] });

      try {
        const node = buildNode({
          operationTemplate: 'listPods',
          tokenSource: 'diskPath',
          tokenDiskPathTemplate: tokenPath
        });
        const [outputIds, newPayload] = await node.run(defaultContext, {});
        outputIds.should.equal(OUTPUT_IDS);
        newPayload.working.k8sResult.statusCode.should.equal(200);
        newPayload.working.k8sResult.body.should.deepEqual({ items: [] });
      } finally {
        await fs.remove(tokenPath);
      }
    });

    it('surfaces in-cluster token read error on resultPath as runtime error', async () => {
      const loadGuardedFileStub = sinon.stub();
      loadGuardedFileStub.withArgs('/var/run/secrets/kubernetes.io/serviceaccount/token', sinon.match.any)
        .rejects(new Error('ENOENT: no such file or directory'));

      const node = new KubernetesNode('id', OUTPUT_IDS, {
        authMode: 'inCluster',
        operationTemplate: 'listPods',
        resultPath: 'working.k8sResult'
      });
      const [outputIds, newPayload] = await node.run({ ...defaultContext, diskUtils: { loadGuardedFile: loadGuardedFileStub } }, {});
      outputIds.should.equal(OUTPUT_IDS);
      newPayload.working.k8sResult.should.deepEqual({
        error: {
          type: 'KubernetesAuthError',
          message: 'Failed to read in-cluster service account token: ENOENT: no such file or directory'
        }
      });
    });

    it('throws Validation when timeoutTemplate is greater than externalTimeout', async () => {
      const node = buildNode({
        operationTemplate: 'listPods',
        timeoutTemplate: '35000'
      });

      await node.run({ ...defaultContext, externalTimeout: 30000 }, {})
        .should.be.rejectedWith({
          name: 'ValidationError',
          message: 'timeoutTemplate cannot be greater than 30 seconds.'
        });
    });

    it('appends timeoutSeconds query parameter and sets timeout when timeoutTemplate is configured', async () => {
      nock(SERVER_URL)
        .get('/api/v1/pods?timeoutSeconds=10')
        .reply(200, { items: [] });

      const node = buildNode({
        operationTemplate: 'listPods',
        timeoutTemplate: '10000'
      });

      const [, newPayload] = await node.run({ ...defaultContext, externalTimeout: 30000 }, {});
      newPayload.working.k8sResult.statusCode.should.equal(200);
    });

    it('renders timeoutTemplate from payload template expression', async () => {
      nock(SERVER_URL)
        .get('/api/v1/pods?timeoutSeconds=5')
        .reply(200, { items: [] });

      const node = buildNode({
        operationTemplate: 'listPods',
        timeoutTemplate: '{{working.customTimeout}}'
      });

      const [, newPayload] = await node.run(defaultContext, { working: { customTimeout: 5000 } });
      newPayload.working.k8sResult.statusCode.should.equal(200);
    });

    it('appends timeoutSeconds query parameter from context.externalTimeout when not configured on node', async () => {
      nock(SERVER_URL)
        .get('/api/v1/pods?timeoutSeconds=30')
        .reply(200, { items: [] });

      const node = buildNode({
        operationTemplate: 'listPods'
      });

      const [, newPayload] = await node.run(defaultContext, {});
      newPayload.working.k8sResult.statusCode.should.equal(200);
    });

    it('throws Validation when nameTemplate resolves to path traversal segment (e.g. "..")', async () => {
      const node = buildNode({
        operationTemplate: 'deletePod',
        namespaceTemplate: 'production',
        nameTemplate: '..'
      });

      await node.run(defaultContext, {}).should.be.rejectedWith({
        name: 'ValidationError',
        message: 'Invalid resource name "..".'
      });
    });

    it('throws Validation when namespaceTemplate resolves to path traversal segment (e.g. ".")', async () => {
      const node = buildNode({
        operationTemplate: 'deletePod',
        namespaceTemplate: '.',
        nameTemplate: 'my-pod'
      });

      await node.run(defaultContext, {}).should.be.rejectedWith({
        name: 'ValidationError',
        message: 'Invalid namespace ".".'
      });
    });
  });

  describe('Extensibility for Future Kubectl Operations (e.g. drain)', () => {
    afterEach(() => {
      nock.cleanAll();
      unregisterOperation('drainNode');
    });

    it('supports registering and executing a multi-step composite operation like drain', async () => {
      // Register simulated drain operation using the client backbone
      registerOperation('drainNode', async (client, node) => {
        const nodeName = node.nameTemplate;
        // Step 1: Cordon the node (PATCH unschedulable = true)
        const cordonRes = await client.request({
          method: 'PATCH',
          path: `/api/v1/nodes/${nodeName}`,
          body: { spec: { unschedulable: true } }
        });
        if (cordonRes.statusCode >= 400) {
          return cordonRes;
        }

        // Step 2: List pods on the node
        const podListRes = await client.request({
          method: 'GET',
          path: '/api/v1/pods',
          query: { fieldSelector: `spec.nodeName=${nodeName}` }
        });
        if (podListRes.statusCode >= 400) {
          return podListRes;
        }

        const pods = podListRes.body.items || [];

        // Step 3: Evict each pod concurrently using omnibelt mapP
        const evicted = await mapP(async (pod) => {
          const ns = pod.metadata.namespace;
          const name = pod.metadata.name;
          await client.request({
            method: 'POST',
            path: `/api/v1/namespaces/${ns}/pods/${name}/eviction`,
            body: {
              apiVersion: 'policy/v1',
              kind: 'Eviction',
              metadata: { name, namespace: ns }
            }
          });
          return `${ns}/${name}`;
        }, pods);

        return {
          statusCode: 200,
          body: {
            cordoned: true,
            nodeName,
            evictedCount: evicted.length,
            evictedPods: evicted
          }
        };
      });

      // Mock the multi-step API calls
      nock(SERVER_URL)
        .patch('/api/v1/nodes/worker-node-1', { spec: { unschedulable: true } })
        .reply(200, { metadata: { name: 'worker-node-1' } });

      nock(SERVER_URL)
        .get('/api/v1/pods?fieldSelector=spec.nodeName%3Dworker-node-1')
        .reply(200, {
          items: [
            { metadata: { namespace: 'default', name: 'task-1' } },
            { metadata: { namespace: 'default', name: 'task-2' } }
          ]
        });

      nock(SERVER_URL)
        .post('/api/v1/namespaces/default/pods/task-1/eviction', {
          apiVersion: 'policy/v1',
          kind: 'Eviction',
          metadata: { name: 'task-1', namespace: 'default' }
        })
        .reply(201, { status: 'Success' });

      nock(SERVER_URL)
        .post('/api/v1/namespaces/default/pods/task-2/eviction', {
          apiVersion: 'policy/v1',
          kind: 'Eviction',
          metadata: { name: 'task-2', namespace: 'default' }
        })
        .reply(201, { status: 'Success' });

      const node = buildNode({
        operationTemplate: 'drainNode',
        nameTemplate: 'worker-node-1'
      });

      const [, newPayload] = await node.run({}, {});
      newPayload.working.k8sResult.statusCode.should.equal(200);
      newPayload.working.k8sResult.body.should.deepEqual({
        cordoned: true,
        nodeName: 'worker-node-1',
        evictedCount: 2,
        evictedPods: ['default/task-1', 'default/task-2']
      });
    });

    it('unregisters custom operations using unregisterOperation', async () => {
      registerOperation('tempOp', async () => ({ statusCode: 200, body: 'ok' }));
      unregisterOperation('tempOp');

      const node = buildNode({ operationTemplate: 'tempOp' });
      await node.run(defaultContext, {}).should.be.rejectedWith({
        name: 'ValidationError',
        message: 'Unsupported Kubernetes operation "tempOp"'
      });
    });
  });

  describe('Disk Path Export', () => {
    let testDir;

    beforeEach(async () => {
      testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'k8s-disk-test-'));
    });

    afterEach(async () => {
      await fs.remove(testDir);
    });

    describe('resolveAndValidateDiskPath', () => {
      it('throws Validation if resultDiskPathTemplate resolves to empty', async () => {
        await resolveAndValidateDiskPath({ resultDiskPathTemplate: '   ' }, {}, defaultContext)
          .should.be.rejectedWith(errors.Validation({ message: 'Disk path template resolved to an empty value.' }));
      });

      it('throws Validation if resultDiskPathTemplate targets protected Losant directory', async () => {
        const protectedPath = path.resolve(PROJECT_ROOT_DIR, 'out.txt');
        await resolveAndValidateDiskPath({ resultDiskPathTemplate: protectedPath }, {}, defaultContext)
          .should.be.rejectedWith({ type: 'Validation', message: 'Cannot access within the protected Losant Edge Agent directory.' });
      });

      it('throws Validation on invalid encodingTemplate', async () => {
        await resolveAndValidateDiskPath({
          resultDiskPathTemplate: path.join(testDir, 'out.txt'),
          encodingTemplate: 'invalid-encoding'
        }, {}, defaultContext).should.be.rejectedWith({ type: 'Validation' });
      });

      it('resolves valid disk path with default utf8 encoding', async () => {
        const outPath = path.join(testDir, 'out.txt');
        const res = await resolveAndValidateDiskPath({ resultDiskPathTemplate: outPath }, {}, defaultContext);
        res.should.deepEqual({
          diskPath: path.resolve(outPath),
          encoding: 'utf8'
        });
      });

      it('resolves valid disk path with custom valid encoding', async () => {
        const outPath = path.join(testDir, 'out.txt');
        const res = await resolveAndValidateDiskPath({
          resultDiskPathTemplate: outPath,
          encodingTemplate: 'base64'
        }, {}, defaultContext);
        res.should.deepEqual({
          diskPath: path.resolve(outPath),
          encoding: 'base64'
        });
      });
    });

    describe('node execution', () => {
      it('writes pod logs to disk on 200 response and sets result.body to file path', async () => {
        const logContent = '2026-10-01T12:00:00Z App started\n2026-10-01T12:00:01Z Ready';
        nock(SERVER_URL, { reqheaders: { accept: 'text/plain, */*' } })
          .get('/api/v1/namespaces/default/pods/web-pod/log')
          .reply(200, logContent);

        const filePath = path.join(testDir, 'pod.log');
        const node = buildNode({
          operationTemplate: 'getPodLogs',
          namespaceTemplate: 'default',
          nameTemplate: 'web-pod',
          resultDiskPathTemplate: filePath
        });

        const [outputIds, newPayload] = await node.run(defaultContext, {});
        outputIds.should.equal(OUTPUT_IDS);
        newPayload.working.k8sResult.statusCode.should.equal(200);
        newPayload.working.k8sResult.body.should.equal(filePath);

        const saved = await fs.readFile(filePath, 'utf8');
        saved.should.equal(logContent);
      });

      it('streams JSON response to disk on 200 response and sets result.body to file path', async () => {
        const podJson = { metadata: { name: 'my-pod', namespace: 'default' }, spec: { nodeName: 'worker-1' } };
        nock(SERVER_URL)
          .get('/api/v1/namespaces/default/pods/my-pod')
          .reply(200, podJson);

        const filePath = path.join(testDir, 'pod.json');
        const node = buildNode({
          operationTemplate: 'getPod',
          namespaceTemplate: 'default',
          nameTemplate: 'my-pod',
          resultDiskPathTemplate: filePath
        });

        const [outputIds, newPayload] = await node.run(defaultContext, {});
        outputIds.should.equal(OUTPUT_IDS);
        newPayload.working.k8sResult.statusCode.should.equal(200);
        newPayload.working.k8sResult.body.should.equal(filePath);

        const saved = await fs.readJson(filePath);
        saved.should.deepEqual(podJson);
      });

      it('does not write to disk on non-2xx status code', async () => {
        const errorBody = { message: 'pod not found' };
        nock(SERVER_URL)
          .get('/api/v1/namespaces/default/pods/ghost')
          .reply(404, errorBody);

        const filePath = path.join(testDir, 'error.json');
        const node = buildNode({
          operationTemplate: 'getPod',
          namespaceTemplate: 'default',
          nameTemplate: 'ghost',
          resultDiskPathTemplate: filePath
        });

        const [outputIds, newPayload] = await node.run(defaultContext, {});
        outputIds.should.equal(OUTPUT_IDS);
        newPayload.working.k8sResult.statusCode.should.equal(404);
        newPayload.working.k8sResult.body.should.deepEqual(errorBody);

        const fileExists = await fs.pathExists(filePath);
        fileExists.should.be.false();
      });

      it('writes to disk on 200 response when resultDiskPathTemplate is used on deletePod operation (DELETE)', async () => {
        const deleteStatus = { kind: 'Status', status: 'Success' };
        nock(SERVER_URL)
          .delete('/api/v1/namespaces/default/pods/old-pod')
          .reply(200, deleteStatus);

        const filePath = path.join(testDir, 'deleted-pod.json');
        const node = buildNode({
          operationTemplate: 'deletePod',
          namespaceTemplate: 'default',
          nameTemplate: 'old-pod',
          resultDiskPathTemplate: filePath
        });

        const [outputIds, newPayload] = await node.run(defaultContext, {});
        outputIds.should.equal(OUTPUT_IDS);
        newPayload.working.k8sResult.statusCode.should.equal(200);
        newPayload.working.k8sResult.body.should.equal(filePath);

        const saved = await fs.readJson(filePath);
        saved.should.deepEqual(deleteStatus);
      });

      it('writes to disk on 200 response when resultDiskPathTemplate is used on custom POST operation', async () => {
        const postResult = { result: 'custom-post-ok' };
        nock(SERVER_URL)
          .post('/api/v1/namespaces/default/pods', { test: true })
          .reply(200, postResult);

        const filePath = path.join(testDir, 'custom-post.json');
        const node = buildNode({
          operationTemplate: 'custom',
          customMethodTemplate: 'POST',
          customPathTemplate: '/api/v1/namespaces/default/pods',
          customBodyTemplate: '{"test":true}',
          resultDiskPathTemplate: filePath
        });

        const [outputIds, newPayload] = await node.run(defaultContext, {});
        outputIds.should.equal(OUTPUT_IDS);
        newPayload.working.k8sResult.statusCode.should.equal(200);
        newPayload.working.k8sResult.body.should.equal(filePath);

        const saved = await fs.readJson(filePath);
        saved.should.deepEqual(postResult);
      });

      it('writes to disk on 200 response when resultDiskPathTemplate is used on custom GET operation', async () => {
        const metricData = { items: [{ metricName: 'memory_usage' }] };
        nock(SERVER_URL)
          .intercept('/apis/custom.metrics.k8s.io/v1beta1/namespaces/default/pods', 'GET')
          .reply(200, metricData);

        const filePath = path.join(testDir, 'custom-metrics.json');
        const node = buildNode({
          operationTemplate: 'custom',
          customMethodTemplate: 'GET',
          customPathTemplate: '/apis/custom.metrics.k8s.io/v1beta1/namespaces/default/pods',
          resultDiskPathTemplate: filePath
        });

        const [outputIds, newPayload] = await node.run(defaultContext, {});
        outputIds.should.equal(OUTPUT_IDS);
        newPayload.working.k8sResult.statusCode.should.equal(200);
        newPayload.working.k8sResult.body.should.equal(filePath);

        const saved = await fs.readJson(filePath);
        saved.should.deepEqual(metricData);
      });


      it('writes a registered custom operation handler result to disk', async () => {
        registerOperation('diskHandlerOp', async () => ({ statusCode: 200, body: { hello: 'world' } }));
        try {
          const filePath = path.join(testDir, 'handler.json');
          const node = buildNode({
            operationTemplate: 'diskHandlerOp',
            resultDiskPathTemplate: filePath
          });

          const [, newPayload] = await node.run(defaultContext, {});
          newPayload.working.k8sResult.statusCode.should.equal(200);
          newPayload.working.k8sResult.body.should.equal(filePath);
          (await fs.readJson(filePath)).should.deepEqual({ hello: 'world' });
        } finally {
          unregisterOperation('diskHandlerOp');
        }
      });

      it('does not write a non-2xx registered custom operation handler result to disk', async () => {
        registerOperation('diskHandlerFail', async () => ({ statusCode: 500, body: 'nope' }));
        try {
          const filePath = path.join(testDir, 'handler-fail.json');
          const node = buildNode({
            operationTemplate: 'diskHandlerFail',
            resultDiskPathTemplate: filePath
          });

          const [, newPayload] = await node.run(defaultContext, {});
          newPayload.working.k8sResult.should.deepEqual({ statusCode: 500, body: 'nope' });
          (await fs.pathExists(filePath)).should.be.false();
        } finally {
          unregisterOperation('diskHandlerFail');
        }
      });

      it('throws Validation during node.run if resultDiskPathTemplate targets protected Losant directory', async () => {
        const protectedPath = path.resolve(PROJECT_ROOT_DIR, 'out.txt');
        const node = buildNode({
          operationTemplate: 'getPod',
          namespaceTemplate: 'default',
          nameTemplate: 'my-pod',
          resultDiskPathTemplate: protectedPath
        });

        await node.run(defaultContext, {}).should.be.rejectedWith({
          type: 'Validation',
          message: 'Cannot access within the protected Losant Edge Agent directory.'
        });
      });

      it('appends content to existing file when shouldAppend is true', async () => {
        const filePath = path.join(testDir, 'appended.log');
        await fs.writeFile(filePath, 'Initial line\n');

        nock(SERVER_URL, { reqheaders: { accept: 'text/plain, */*' } })
          .get('/api/v1/namespaces/default/pods/web-pod/log')
          .reply(200, 'Second line\n');

        const node = buildNode({
          operationTemplate: 'getPodLogs',
          namespaceTemplate: 'default',
          nameTemplate: 'web-pod',
          resultDiskPathTemplate: filePath,
          shouldAppend: true
        });

        const [outputIds, newPayload] = await node.run(defaultContext, {});
        outputIds.should.equal(OUTPUT_IDS);
        newPayload.working.k8sResult.statusCode.should.equal(200);
        newPayload.working.k8sResult.body.should.equal(filePath);

        const saved = await fs.readFile(filePath, 'utf8');
        saved.should.equal('Initial line\nSecond line\n');
      });

      it('captures EEXIST write error on resultPath when errorIfFileExists is true and file exists', async () => {
        const filePath = path.join(testDir, 'existing.log');
        await fs.writeFile(filePath, 'already here');

        nock(SERVER_URL, { reqheaders: { accept: 'text/plain, */*' } })
          .get('/api/v1/namespaces/default/pods/web-pod/log')
          .reply(200, 'new logs');

        const node = buildNode({
          operationTemplate: 'getPodLogs',
          namespaceTemplate: 'default',
          nameTemplate: 'web-pod',
          resultDiskPathTemplate: filePath,
          errorIfFileExists: true
        });

        const [outputIds, newPayload] = await node.run(defaultContext, {});
        outputIds.should.equal(OUTPUT_IDS);
        newPayload.working.k8sResult.error.type.should.equal('EEXIST');

        const saved = await fs.readFile(filePath, 'utf8');
        saved.should.equal('already here');
      });
    });
  });

  describe('applyManifest execution', () => {
    let testDir;

    beforeEach(async () => {
      testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'k8s-apply-test-'));
    });

    afterEach(async () => {
      await fs.remove(testDir);
      nock.cleanAll();
    });

    it('applies a single document manifest via Server-Side Apply (Option A unwrap)', async () => {
      const manifest = `
apiVersion: v1
kind: Pod
metadata:
  name: my-pod
  namespace: default
spec:
  containers:
    - name: nginx
      image: nginx:1.21
`;
      const k8sResponse = {
        apiVersion: 'v1',
        kind: 'Pod',
        metadata: { name: 'my-pod', namespace: 'default' },
        status: { phase: 'Running' }
      };

      nock(SERVER_URL, {
        reqheaders: {
          'content-type': 'application/apply-patch+yaml',
          'authorization': `Bearer ${TOKEN}`
        }
      })
        .patch('/api/v1/namespaces/default/pods/my-pod?fieldManager=gea')
        .reply(201, k8sResponse);

      const node = buildNode({
        operationTemplate: 'applyManifest',
        manifestSource: 'stringTemplate',
        manifestTemplate: manifest
      });

      const [outputIds, newPayload] = await node.run(defaultContext, {});
      outputIds.should.equal(OUTPUT_IDS);
      newPayload.working.k8sResult.statusCode.should.equal(201);
      newPayload.working.k8sResult.body.should.deepEqual({
        kind: 'Pod',
        name: 'my-pod',
        namespace: 'default',
        statusCode: 201,
        body: k8sResponse
      });
    });

    it('supports custom fieldManager and forceConflicts options', async () => {
      const manifest = `
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web-app
  namespace: production
`;
      const k8sResponse = {
        apiVersion: 'apps/v1',
        kind: 'Deployment',
        metadata: { name: 'web-app', namespace: 'production' }
      };

      nock(SERVER_URL, {
        reqheaders: {
          'content-type': 'application/apply-patch+yaml',
          'authorization': `Bearer ${TOKEN}`
        }
      })
        .patch('/apis/apps/v1/namespaces/production/deployments/web-app?fieldManager=edge-agent-1&force=true')
        .reply(200, k8sResponse);

      const node = buildNode({
        operationTemplate: 'applyManifest',
        manifestSource: 'stringTemplate',
        manifestTemplate: manifest,
        fieldManagerTemplate: 'edge-agent-{{agentId}}',
        forceConflicts: true
      });

      const [outputIds, newPayload] = await node.run(defaultContext, { agentId: '1' });
      outputIds.should.equal(OUTPUT_IDS);
      newPayload.working.k8sResult.statusCode.should.equal(200);
      newPayload.working.k8sResult.body.should.deepEqual({
        kind: 'Deployment',
        name: 'web-app',
        namespace: 'production',
        statusCode: 200,
        body: k8sResponse
      });
    });

    it('applies multi-document YAML manifests sequentially and returns array of results', async () => {
      const manifest = `
apiVersion: v1
kind: Pod
metadata:
  name: multi-pod
  namespace: test-ns
---
apiVersion: v1
kind: Service
metadata:
  name: multi-svc
  namespace: test-ns
`;
      const podRes = { kind: 'Pod', metadata: { name: 'multi-pod' } };
      const svcRes = { kind: 'Service', metadata: { name: 'multi-svc' } };

      nock(SERVER_URL)
        .patch('/api/v1/namespaces/test-ns/pods/multi-pod?fieldManager=gea')
        .reply(201, podRes);

      nock(SERVER_URL)
        .patch('/api/v1/namespaces/test-ns/services/multi-svc?fieldManager=gea')
        .reply(200, svcRes);

      const node = buildNode({
        operationTemplate: 'applyManifest',
        manifestSource: 'stringTemplate',
        manifestTemplate: manifest
      });

      const [outputIds, newPayload] = await node.run(defaultContext, {});
      outputIds.should.equal(OUTPUT_IDS);
      newPayload.working.k8sResult.statusCode.should.equal(201);
      newPayload.working.k8sResult.body.should.deepEqual([
        {
          kind: 'Pod',
          name: 'multi-pod',
          namespace: 'test-ns',
          statusCode: 201,
          body: podRes
        },
        {
          kind: 'Service',
          name: 'multi-svc',
          namespace: 'test-ns',
          statusCode: 200,
          body: svcRes
        }
      ]);
    });

    it('reports non-2xx status code on multi-document partial failure without throwing', async () => {
      const manifest = `
apiVersion: v1
kind: ConfigMap
metadata:
  name: cm-ok
  namespace: default
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: cm-fail
  namespace: default
`;
      const cmRes = { kind: 'ConfigMap', metadata: { name: 'cm-ok' } };
      const errRes = { message: 'Conflict on field ownership' };

      nock(SERVER_URL)
        .patch('/api/v1/namespaces/default/configmaps/cm-ok?fieldManager=gea')
        .reply(200, cmRes);

      nock(SERVER_URL)
        .patch('/api/v1/namespaces/default/configmaps/cm-fail?fieldManager=gea')
        .reply(409, errRes);

      const node = buildNode({
        operationTemplate: 'applyManifest',
        manifestSource: 'stringTemplate',
        manifestTemplate: manifest
      });

      const [outputIds, newPayload] = await node.run(defaultContext, {});
      outputIds.should.equal(OUTPUT_IDS);
      newPayload.working.k8sResult.statusCode.should.equal(409);
      newPayload.working.k8sResult.body.should.deepEqual([
        {
          kind: 'ConfigMap',
          name: 'cm-ok',
          namespace: 'default',
          statusCode: 200,
          body: cmRes
        },
        {
          kind: 'ConfigMap',
          name: 'cm-fail',
          namespace: 'default',
          statusCode: 409,
          body: errRes
        }
      ]);
    });

    it('continues applying later documents after an earlier document fails (non-atomic apply)', async () => {
      const manifest = `
apiVersion: v1
kind: ConfigMap
metadata:
  name: cm-fail-first
  namespace: default
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: cm-ok-second
  namespace: default
`;
      const errRes = { message: 'Conflict on field ownership' };
      const okRes = { kind: 'ConfigMap', metadata: { name: 'cm-ok-second' } };

      nock(SERVER_URL)
        .patch('/api/v1/namespaces/default/configmaps/cm-fail-first?fieldManager=gea')
        .reply(409, errRes);

      const secondApply = nock(SERVER_URL)
        .patch('/api/v1/namespaces/default/configmaps/cm-ok-second?fieldManager=gea')
        .reply(200, okRes);

      const node = buildNode({
        operationTemplate: 'applyManifest',
        manifestSource: 'stringTemplate',
        manifestTemplate: manifest
      });

      const [outputIds, newPayload] = await node.run(defaultContext, {});
      outputIds.should.equal(OUTPUT_IDS);

      // The second document's PATCH was still sent despite the first one failing
      secondApply.isDone().should.be.true();

      newPayload.working.k8sResult.statusCode.should.equal(409);
      newPayload.working.k8sResult.body.should.deepEqual([
        {
          kind: 'ConfigMap',
          name: 'cm-fail-first',
          namespace: 'default',
          statusCode: 409,
          body: errRes
        },
        {
          kind: 'ConfigMap',
          name: 'cm-ok-second',
          namespace: 'default',
          statusCode: 200,
          body: okRes
        }
      ]);
    });

    it('correctly applies cluster-scoped resource (Namespace)', async () => {
      const manifest = `
apiVersion: v1
kind: Namespace
metadata:
  name: edge-namespace
`;
      const nsRes = { kind: 'Namespace', metadata: { name: 'edge-namespace' } };

      nock(SERVER_URL)
        .patch('/api/v1/namespaces/edge-namespace?fieldManager=gea')
        .reply(201, nsRes);

      const node = buildNode({
        operationTemplate: 'applyManifest',
        manifestSource: 'stringTemplate',
        manifestTemplate: manifest
      });

      const [outputIds, newPayload] = await node.run(defaultContext, {});
      outputIds.should.equal(OUTPUT_IDS);
      newPayload.working.k8sResult.statusCode.should.equal(201);
      newPayload.working.k8sResult.body.should.deepEqual({
        kind: 'Namespace',
        name: 'edge-namespace',
        statusCode: 201,
        body: nsRes
      });
    });

    it('supports operationTemplate: "apply" as an alias for applyManifest', async () => {
      const manifest = `
apiVersion: v1
kind: Pod
metadata:
  name: alias-pod
  namespace: default
`;
      const k8sResponse = { kind: 'Pod', metadata: { name: 'alias-pod' } };

      nock(SERVER_URL)
        .patch('/api/v1/namespaces/default/pods/alias-pod?fieldManager=gea')
        .reply(200, k8sResponse);

      const node = buildNode({
        operationTemplate: 'apply',
        manifestSource: 'stringTemplate',
        manifestTemplate: manifest
      });

      const [outputIds, newPayload] = await node.run(defaultContext, {});
      outputIds.should.equal(OUTPUT_IDS);
      newPayload.working.k8sResult.statusCode.should.equal(200);
      newPayload.working.k8sResult.body.name.should.equal('alias-pod');
    });

    it('applies manifest from payloadPath', async () => {
      const manifestObj = {
        apiVersion: 'v1',
        kind: 'ConfigMap',
        metadata: {
          name: 'payload-cm',
          namespace: 'default'
        },
        data: {
          key: 'val'
        }
      };

      nock(SERVER_URL)
        .patch('/api/v1/namespaces/default/configmaps/payload-cm?fieldManager=gea')
        .reply(200, manifestObj);

      const node = buildNode({
        operationTemplate: 'applyManifest',
        manifestSource: 'payloadPath',
        manifestPayloadPath: 'data.myManifest'
      });

      const [outputIds, newPayload] = await node.run(defaultContext, {
        data: { myManifest: manifestObj }
      });

      outputIds.should.equal(OUTPUT_IDS);
      newPayload.working.k8sResult.statusCode.should.equal(200);
      newPayload.working.k8sResult.body.kind.should.equal('ConfigMap');
      newPayload.working.k8sResult.body.name.should.equal('payload-cm');
    });

    it('applies manifest from diskPath', async () => {
      const manifestContent = `
apiVersion: v1
kind: Pod
metadata:
  name: disk-applied-pod
  namespace: default
`;
      const filePath = path.join(testDir, 'apply-manifest.yaml');
      await fs.writeFile(filePath, manifestContent);

      const k8sResponse = { kind: 'Pod', metadata: { name: 'disk-applied-pod' } };

      nock(SERVER_URL)
        .patch('/api/v1/namespaces/default/pods/disk-applied-pod?fieldManager=gea')
        .reply(201, k8sResponse);

      const node = buildNode({
        operationTemplate: 'applyManifest',
        manifestSource: 'diskPath',
        manifestDiskPathTemplate: filePath
      });

      const [outputIds, newPayload] = await node.run(defaultContext, {});
      outputIds.should.equal(OUTPUT_IDS);
      newPayload.working.k8sResult.statusCode.should.equal(201);
      newPayload.working.k8sResult.body.name.should.equal('disk-applied-pod');
    });

    it('writes to disk on 2xx response when resultDiskPathTemplate is used on applyManifest', async () => {
      const k8sResponse = {
        kind: 'Pod',
        metadata: { name: 'pod', namespace: 'default' },
        status: { phase: 'Running' }
      };

      nock(SERVER_URL)
        .patch('/api/v1/namespaces/default/pods/pod?fieldManager=gea')
        .reply(201, k8sResponse);

      const filePath = path.join(testDir, 'out.json');
      const node = buildNode({
        operationTemplate: 'applyManifest',
        manifestSource: 'stringTemplate',
        manifestTemplate: 'kind: Pod\nmetadata:\n  name: pod\n  namespace: default',
        resultDiskPathTemplate: filePath
      });

      const [outputIds, newPayload] = await node.run(defaultContext, {});
      outputIds.should.equal(OUTPUT_IDS);
      newPayload.working.k8sResult.statusCode.should.equal(201);
      newPayload.working.k8sResult.body.should.equal(filePath);

      const saved = await fs.readJson(filePath);
      saved.should.deepEqual({
        kind: 'Pod',
        name: 'pod',
        namespace: 'default',
        statusCode: 201,
        body: k8sResponse
      });
    });

    it('captures network/timeout errors on resultPath without throwing', async () => {
      const manifest = `
apiVersion: v1
kind: Pod
metadata:
  name: timeout-pod
  namespace: default
`;

      nock(SERVER_URL)
        .patch('/api/v1/namespaces/default/pods/timeout-pod?fieldManager=gea')
        .delayConnection(2000)
        .reply(200, {});

      const node = buildNode({
        operationTemplate: 'applyManifest',
        manifestSource: 'stringTemplate',
        manifestTemplate: manifest,
        timeoutTemplate: '50'
      });

      const [outputIds, newPayload] = await node.run(defaultContext, {});
      outputIds.should.equal(OUTPUT_IDS);
      newPayload.working.k8sResult.should.have.property('error');
      newPayload.working.k8sResult.error.type.should.equal('TIMEOUT');
    });

    it('returns partial results when a later document throws a transport error', async () => {
      const manifest = `
apiVersion: v1
kind: ConfigMap
metadata:
  name: cm-first
  namespace: default
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: cm-timeout
  namespace: default
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: cm-never
  namespace: default
`;
      const okRes = { kind: 'ConfigMap', metadata: { name: 'cm-first' } };

      nock(SERVER_URL)
        .patch('/api/v1/namespaces/default/configmaps/cm-first?fieldManager=gea')
        .reply(200, okRes);
      nock(SERVER_URL)
        .patch('/api/v1/namespaces/default/configmaps/cm-timeout?fieldManager=gea')
        .delayConnection(2000)
        .reply(200, {});
      const third = nock(SERVER_URL)
        .patch('/api/v1/namespaces/default/configmaps/cm-never?fieldManager=gea')
        .reply(200, {});

      const node = buildNode({
        operationTemplate: 'applyManifest',
        manifestSource: 'stringTemplate',
        manifestTemplate: manifest,
        timeoutTemplate: '50'
      });

      const [outputIds, newPayload] = await node.run(defaultContext, {});
      outputIds.should.equal(OUTPUT_IDS);
      third.isDone().should.be.false();

      const res = newPayload.working.k8sResult;
      res.error.type.should.equal('TIMEOUT');
      res.should.not.have.property('statusCode');
      res.body.should.have.length(2);
      res.body[0].should.deepEqual({
        kind: 'ConfigMap',
        name: 'cm-first',
        namespace: 'default',
        statusCode: 200,
        body: okRes
      });
      res.body[1].name.should.equal('cm-timeout');
      res.body[1].error.type.should.equal('TIMEOUT');
    });

    it('applies manifest from payloadPath when value is an array of resource objects', async () => {
      const podObj = {
        apiVersion: 'v1',
        kind: 'Pod',
        metadata: { name: 'arr-pod', namespace: 'default' }
      };
      const svcObj = {
        apiVersion: 'v1',
        kind: 'Service',
        metadata: { name: 'arr-svc', namespace: 'default' }
      };

      nock(SERVER_URL)
        .patch('/api/v1/namespaces/default/pods/arr-pod?fieldManager=gea')
        .reply(201, podObj);

      nock(SERVER_URL)
        .patch('/api/v1/namespaces/default/services/arr-svc?fieldManager=gea')
        .reply(200, svcObj);

      const node = buildNode({
        operationTemplate: 'applyManifest',
        manifestSource: 'payloadPath',
        manifestPayloadPath: 'data.manifests'
      });

      const [outputIds, newPayload] = await node.run(defaultContext, {
        data: { manifests: [podObj, svcObj] }
      });

      outputIds.should.equal(OUTPUT_IDS);
      newPayload.working.k8sResult.statusCode.should.equal(201);
      newPayload.working.k8sResult.body.should.deepEqual([
        {
          kind: 'Pod',
          name: 'arr-pod',
          namespace: 'default',
          statusCode: 201,
          body: podObj
        },
        {
          kind: 'Service',
          name: 'arr-svc',
          namespace: 'default',
          statusCode: 200,
          body: svcObj
        }
      ]);
    });

    it('throws NotFound when manifestDiskPathTemplate file does not exist', async () => {
      const missing = path.join(testDir, 'nonexistent-manifest.yaml');
      const node = buildNode({
        operationTemplate: 'applyManifest',
        manifestSource: 'diskPath',
        manifestDiskPathTemplate: missing
      });

      await node.run(defaultContext, {}).should.be.rejectedWith({ type: 'NotFound' });
    });

    it('throws Validation when manifestDiskPathTemplate file is empty', async () => {
      const emptyFile = path.join(testDir, 'empty.yaml');
      await fs.writeFile(emptyFile, '   ');

      const node = buildNode({
        operationTemplate: 'applyManifest',
        manifestSource: 'diskPath',
        manifestDiskPathTemplate: emptyFile
      });

      await node.run(defaultContext, {}).should.be.rejectedWith({
        type: 'Validation',
        message: `Manifest file at "${emptyFile}" is empty.`
      });
    });

    it('throws Validation when manifestDiskPathTemplate targets protected directory', async () => {
      const protectedPath = path.resolve(PROJECT_ROOT_DIR, 'package.json');
      const node = buildNode({
        operationTemplate: 'applyManifest',
        manifestSource: 'diskPath',
        manifestDiskPathTemplate: protectedPath
      });

      await node.run(defaultContext, {}).should.be.rejectedWith({
        type: 'Validation',
        message: 'Cannot access within the protected Losant Edge Agent directory.'
      });
    });

    it('throws Validation when manifestTemplate contains invalid YAML syntax', async () => {
      const badYaml = 'key: : invalid';
      const node = buildNode({
        operationTemplate: 'applyManifest',
        manifestSource: 'stringTemplate',
        manifestTemplate: badYaml
      });

      await node.run(defaultContext, {}).should.be.rejectedWith({
        type: 'Validation'
      });
    });
  });
});
