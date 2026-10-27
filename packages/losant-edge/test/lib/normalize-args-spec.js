import { compose, omit, assoc } from 'omnibelt';
import {
  pathToEdgeConfFixture,
  fixtures
} from '../common.js';
const {
  command: commandFixture
} = fixtures;
import Args from '../../src/types/args.js';
import normalizeArgs from '../../src/lib/normalize-args.js';
import SslConf from '../../src/types/ssl-conf.js';
import { WORKFLOW_DIRECTORY_DEFAULT } from '../../src/constants.js';
import path from 'node:path';

describe('normalizeArgs', () => {

  it('"-f": allows for cli to provide a conf file', async () => {
    const actual = await normalizeArgs({ confPath: pathToEdgeConfFixture });
    const expected = Args({
      gateway: {
        host: 'localhost',
        id: '123412341234123412341234',
        key: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        secret: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
      },
      localBroker: {
        port: 45458,
        enabled: true
      },
      workflow: {
        directory: WORKFLOW_DIRECTORY_DEFAULT
      },
      otelReporting: {},
      originalCliArgs: { confPath: pathToEdgeConfFixture }
    });
    actual.should.deepEqual(expected);
  });

  it('allows cli to override conf', async () => {
    const actual = await compose(
      normalizeArgs,
      assoc('confPath', pathToEdgeConfFixture),
      omit(['accessKey']) // omit access key so it comes from conf
    )(commandFixture);
    const expected = Args({
      gateway: {
        host: 'from-cli',
        id: '123412341234123412341234',
        key: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        secret: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
      },
      localBroker: {
        port: 45458,
        enabled: true
      },
      workflow: {
        directory: WORKFLOW_DIRECTORY_DEFAULT
      },
      otelReporting: {},
      originalCliArgs: {
        confPath: pathToEdgeConfFixture,
        brokerHost: 'from-cli',
        accessSecret: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        deviceId: '123412341234123412341234'
      }
    });
    actual.should.deepEqual(expected);
  });

  it('should correctly validate keys and certificates', async () => {
    await SslConf.resolveAndValidate({
      keyPath: path.resolve(import.meta.dirname, '..', '__fixtures__', 'fake-ec-ssl.key'),
      certificatePath: path.resolve(import.meta.dirname, '..', '__fixtures__', 'fake-ec-ssl.crt')
    });

    await SslConf.resolveAndValidate({
      keyPath: path.resolve(import.meta.dirname, '..', '__fixtures__', 'fake-ssl.key'),
      certificatePath: path.resolve(import.meta.dirname, '..', '__fixtures__', 'fake-ssl.crt')
    });

    await SslConf.resolveAndValidate({
      keyPath: path.resolve(import.meta.dirname, '..', '__fixtures__', 'losant-edge-agent-config.simple.toml'),
      certificatePath: path.resolve(import.meta.dirname, '..', '__fixtures__', 'fake-ssl.crt')
    }).should.be.rejectedWith('The following configuration errors were found:\nSSL configuration is invalid: Key must start and end with proper formatting.');

    await SslConf.resolveAndValidate({
      keyPath: path.resolve(import.meta.dirname, '..', '__fixtures__', 'fake-ssl.key'),
      certificatePath: path.resolve(import.meta.dirname, '..', '__fixtures__', 'losant-edge-agent-config.simple.toml')
    }).should.be.rejectedWith('The following configuration errors were found:\nSSL configuration is invalid: Certificate must start and end with proper formatting.');

    await SslConf.resolveAndValidate({
      keyPath: path.resolve(import.meta.dirname, '..', '__fixtures__', 'fake-ssl.key'),
      certificatePath: path.resolve(import.meta.dirname, '..', '__fixtures__', 'fake-ec-ssl.crt')
    }).should.be.rejectedWith('The following configuration errors were found:\nSSL configuration is invalid: The provided certificate and key do not match.');

    await SslConf.resolveAndValidate({
      keyPath: path.resolve(import.meta.dirname, '..', '__fixtures__', 'fake-ec-ssl.key'),
      certificatePath: path.resolve(import.meta.dirname, '..', '__fixtures__', 'fake-ssl.crt')
    }).should.be.rejectedWith('The following configuration errors were found:\nSSL configuration is invalid: The provided certificate and key do not match.');
  });

  describe('OpenTelemetry collector and reporting configuration', () => {
    it('normalizes valid otlpCollector and otelReporting args', async () => {
      const args = await normalizeArgs({
        confPath: pathToEdgeConfFixture,
        otlpCollectorUrl: 'http://localhost:4318',
        otlpCollectorAuthType: 'basic',
        otlpCollectorUsername: 'admin',
        otlpCollectorPassword: 'password',
        otelReportingEnabled: true,
        otelReportingIntervalSeconds: 15
      });

      args.otlpCollector.url.should.equal('http://localhost:4318');
      args.otlpCollector.authType.should.equal('basic');
      args.otlpCollector.username.should.equal('admin');
      args.otlpCollector.password.should.equal('password');
      args.otlpCollector.disableSSLVerification.should.be.false();

      args.otelReporting.enabled.should.be.true();
      args.otelReporting.intervalSeconds.should.equal(15);
    });

    it('rejects invalid otlpCollector URL with query string', async () => {
      await normalizeArgs({
        confPath: pathToEdgeConfFixture,
        otlpCollectorUrl: 'http://localhost:4318?foo=bar'
      }).should.be.rejectedWith(/Collector URL must not contain a query string/);
    });

    it('rejects otelReporting enabled when otlpCollector is not configured', async () => {
      await normalizeArgs({
        confPath: pathToEdgeConfFixture,
        otelReportingEnabled: true
      }).should.be.rejectedWith(/An \[otlpCollector\] configuration block must be provided when \[otelReporting\] is enabled/);
    });

    it('defaults otelReporting.intervalSeconds to 30 when enabled', async () => {
      const args = await normalizeArgs({
        confPath: pathToEdgeConfFixture,
        otlpCollectorUrl: 'http://localhost:4318',
        otelReportingEnabled: true
      });

      args.otelReporting.enabled.should.be.true();
      args.otelReporting.intervalSeconds.should.equal(30);
    });

    it('rejects otlpCollector URL with /v1/metrics or /v1/logs suffix', async () => {
      await normalizeArgs({
        confPath: pathToEdgeConfFixture,
        otlpCollectorUrl: 'http://localhost:4318/v1/metrics'
      }).should.be.rejectedWith(/Collector URL must not include \/v1\/metrics/);

      await normalizeArgs({
        confPath: pathToEdgeConfFixture,
        otlpCollectorUrl: 'http://localhost:4318/custom/v1/logs'
      }).should.be.rejectedWith(/Collector URL must not include \/v1\/logs/);
    });

    it('rejects basic auth without username and bearer auth without token', async () => {
      await normalizeArgs({
        confPath: pathToEdgeConfFixture,
        otlpCollectorUrl: 'http://localhost:4318',
        otlpCollectorAuthType: 'basic'
      }).should.be.rejectedWith(/Username must be provided when authType is basic/);

      await normalizeArgs({
        confPath: pathToEdgeConfFixture,
        otlpCollectorUrl: 'http://localhost:4318',
        otlpCollectorAuthType: 'bearer'
      }).should.be.rejectedWith(/Bearer token must be provided when authType is bearer/);
    });

    it('rejects whitespace-only username and bearer token', async () => {
      await normalizeArgs({
        confPath: pathToEdgeConfFixture,
        otlpCollectorUrl: 'http://localhost:4318',
        otlpCollectorAuthType: 'basic',
        otlpCollectorUsername: '   '
      }).should.be.rejectedWith(/Username must be provided when authType is basic/);

      await normalizeArgs({
        confPath: pathToEdgeConfFixture,
        otlpCollectorUrl: 'http://localhost:4318',
        otlpCollectorAuthType: 'bearer',
        otlpCollectorBearerToken: '   '
      }).should.be.rejectedWith(/Bearer token must be provided when authType is bearer/);
    });

    it('trims leading/trailing whitespace from username and bearer token', async () => {
      const basicArgs = await normalizeArgs({
        confPath: pathToEdgeConfFixture,
        otlpCollectorUrl: 'http://localhost:4318',
        otlpCollectorAuthType: 'basic',
        otlpCollectorUsername: '  admin  '
      });
      basicArgs.otlpCollector.username.should.equal('admin');

      const bearerArgs = await normalizeArgs({
        confPath: pathToEdgeConfFixture,
        otlpCollectorUrl: 'http://localhost:4318',
        otlpCollectorAuthType: 'bearer',
        otlpCollectorBearerToken: '  token123  '
      });
      bearerArgs.otlpCollector.bearerToken.should.equal('token123');
    });

    it('rejects otlpCollector URL with /v1/traces suffix', async () => {
      await normalizeArgs({
        confPath: pathToEdgeConfFixture,
        otlpCollectorUrl: 'http://localhost:4318/v1/traces'
      }).should.be.rejectedWith(/Collector URL must not include \/v1\/traces/);
    });

    it('validates an unencrypted client cert and key pair', async () => {
      const args = await normalizeArgs({
        confPath: pathToEdgeConfFixture,
        otlpCollectorUrl: 'http://localhost:4318',
        otlpCollectorAuthType: 'clientCert',
        otlpCollectorClientCertPath: path.resolve(import.meta.dirname, '..', '__fixtures__', 'fake-ssl.crt'),
        otlpCollectorClientKeyPath: path.resolve(import.meta.dirname, '..', '__fixtures__', 'fake-ssl.key')
      });

      args.otlpCollector.authType.should.equal('clientCert');
      args.otlpCollector.clientCert.should.be.a.String();
      args.otlpCollector.clientKey.should.be.a.String();
    });

    it('parses resourceAttributes from the OTLP_COLLECTOR_RESOURCE_ATTRIBUTES-mapped arg and rejects non-scalar values', async () => {
      const args = await normalizeArgs({
        confPath: pathToEdgeConfFixture,
        otlpCollectorUrl: 'http://localhost:4318',
        otlpCollectorResourceAttributes: { 'service.name': 'gea', 'fleet.id': 42 }
      });
      args.otlpCollector.resourceAttributes.should.deepEqual({ 'service.name': 'gea', 'fleet.id': 42 });

      await normalizeArgs({
        confPath: pathToEdgeConfFixture,
        otlpCollectorUrl: 'http://localhost:4318',
        otlpCollectorResourceAttributes: { bad: { nested: true } }
      }).should.be.rejected();
    });
  });

});

