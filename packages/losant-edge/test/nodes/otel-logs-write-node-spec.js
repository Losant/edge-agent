import os from 'node:os';
import path from 'node:path';
import fs from 'fs-extra';
import errors from 'losant-nodejs-utils/src/errors.js';
import { tk, nock, should } from '../common.js';
import { AGENT_VERSION } from '../../src/constants.js';
import { loadGuardedFile } from '../../src/lib/protected-path-utils.js';
import OtelLogsWriteNode from '../../src/nodes/otel-logs-write-node.js';

const OUTPUT_IDS = [['out']];
const FROZEN_MS = 1700000000000;
const FROZEN_NANO = '1700000000000000000';
const COLLECTOR_URL = 'http://collector.example.com:4318';
const LOGS_PATH = '/v1/logs';

describe('OtelLogsWriteNode', () => {
  let requests;
  let respond;
  let context;

  const buildNode = (config) => new OtelLogsWriteNode('id', OUTPUT_IDS, {
    collectorUrlTemplate: COLLECTOR_URL,
    resultPath: 'working.otelResult',
    ...config
  });

  // A single log row, enough to get past the empty-records early return.
  const oneLog = (overrides = {}) => ([{
    bodyTemplate: 'Sensor read failed',
    severityTemplate: 'ERROR',
    ...overrides
  }]);

  const lastBody = () => requests[requests.length - 1].body;
  const lastLogRecords = () => lastBody().resourceLogs[0].scopeLogs[0].logRecords;

  beforeEach(() => {
    requests = [];
    // What the collector answers with, as [status, body]. Tests reassign this to
    // exercise a partial success, a non-2xx, and so on.
    respond = () => [200, {}];
    nock(COLLECTOR_URL)
      .persist()
      .post(LOGS_PATH)
      .reply(function(uri, body) {
        requests.push({ url: uri, headers: { ...this.req.headers }, body });
        return respond();
      });
    context = { externalTimeout: 5000, diskUtils: { loadGuardedFile } };
  });

  describe('log record collection', () => {
    it('makes no HTTP call and reports a zero count when there are no log records', async () => {
      const [outputIds, payload] = await buildNode({ logRecords: [] }).run(context, {});
      outputIds.should.equal(OUTPUT_IDS);
      payload.working.otelResult.should.deepEqual({ success: true, logCount: 0 });
      requests.should.have.length(0);
    });

    it('posts a log record to /v1/logs', async () => {
      tk.freeze(new Date(FROZEN_MS));
      const [, payload] = await buildNode({ logRecords: oneLog() }).run(context, {});

      payload.working.otelResult.should.deepEqual({ success: true, logCount: 1 });
      requests[0].url.should.equal('/v1/logs');
      lastLogRecords().should.deepEqual([{
        observedTimeUnixNano: FROZEN_NANO,
        severityNumber: 17,
        severityText: 'ERROR',
        body: { stringValue: 'Sensor read failed' },
        attributes: []
      }]);
    });

    it('sends the OTLP json content type', async () => {
      await buildNode({ logRecords: oneLog() }).run(context, {});
      requests[0].headers['content-type'].should.equal('application/json');
    });

    it('renders body and severity from the payload', async () => {
      const [, payload] = await buildNode({
        logRecords: oneLog({ bodyTemplate: '{{working.msg}}', severityTemplate: '{{working.level}}' })
      }).run(context, { working: { msg: 'a message', level: 'WARN' } });

      payload.working.otelResult.logCount.should.equal(1);
      lastLogRecords()[0].body.should.deepEqual({ stringValue: 'a message' });
      lastLogRecords()[0].severityNumber.should.equal(13);
    });

    it('accepts a bare severity number', async () => {
      await buildNode({ logRecords: oneLog({ severityTemplate: '5' }) }).run(context, {});
      lastLogRecords()[0].severityNumber.should.equal(5);
      lastLogRecords()[0].severityText.should.equal('DEBUG');
    });

    it('errors on an unrecognized severity rather than falling back to a default', async () => {
      await buildNode({
        logRecords: oneLog({ severityTemplate: 'CRITICAL' })
      }).run(context, {}).should.be.rejectedWith({ message: /Invalid severity: CRITICAL/ });
      requests.should.have.length(0);
    });

    it('errors when severity renders blank', async () => {
      await buildNode({
        logRecords: oneLog({ severityTemplate: '{{working.missing}}' })
      }).run(context, {}).should.be.rejectedWith({ message: 'Missing Severity' });
      requests.should.have.length(0);
    });

    it('includes eventName only when configured', async () => {
      await buildNode({
        logRecords: oneLog({ eventNameTemplate: 'my.app.SensorFailed' })
      }).run(context, {});
      lastLogRecords()[0].eventName.should.equal('my.app.SensorFailed');
    });

    it('omits eventName when blank', async () => {
      await buildNode({ logRecords: oneLog() }).run(context, {});
      lastLogRecords()[0].should.not.have.property('eventName');
    });

    it('trims a rendered eventName rather than exporting the padding, and omits it when whitespace-only', async () => {
      await buildNode({
        logRecords: oneLog({ eventNameTemplate: '  my.app.SensorFailed  ' })
      }).run(context, {});
      lastLogRecords()[0].eventName.should.equal('my.app.SensorFailed');

      await buildNode({
        logRecords: oneLog({ eventNameTemplate: '   ' })
      }).run(context, {});
      lastLogRecords()[0].should.not.have.property('eventName');
    });

    it('omits timeUnixNano when the timestamp template is blank', async () => {
      await buildNode({ logRecords: oneLog() }).run(context, {});
      lastLogRecords()[0].should.not.have.property('timeUnixNano');
    });

    it('uses the rendered timestamp when given', async () => {
      await buildNode({
        logRecords: oneLog({ timestampTemplate: '1690000000000' })
      }).run(context, {});
      lastLogRecords()[0].timeUnixNano.should.equal('1690000000000000000');
    });

    // enforceTime accepts no padding on any format, so a trailing space left in
    // the editor would otherwise throw and take the whole export with it.
    it('trims a padded timestamp rather than failing to parse it', async () => {
      await buildNode({
        logRecords: oneLog({ timestampTemplate: ' 1690000000000 ' })
      }).run(context, {});
      lastLogRecords()[0].timeUnixNano.should.equal('1690000000000000000');
    });

    it('errors on a timestamp it cannot parse', async () => {
      await buildNode({
        logRecords: oneLog({ timestampTemplate: 'yesterday' })
      }).run(context, {}).should.be.rejectedWith({ message: /^Invalid timestamp: yesterday\./ });
      requests.should.have.length(0);
    });

    it('defaults the observed timestamp to the run time when blank', async () => {
      tk.freeze(new Date(FROZEN_MS));
      await buildNode({ logRecords: oneLog() }).run(context, {});
      lastLogRecords()[0].observedTimeUnixNano.should.equal(FROZEN_NANO);
    });

    it('uses the rendered observed timestamp when given', async () => {
      await buildNode({
        logRecords: oneLog({ observedTimestampTemplate: '1690000000000' })
      }).run(context, {});
      lastLogRecords()[0].observedTimeUnixNano.should.equal('1690000000000000000');
    });

    it('gives every row without its own observed timestamp the same run time', async () => {
      await buildNode({
        logRecords: [
          { bodyTemplate: 'a', severityTemplate: 'INFO' },
          { bodyTemplate: 'b', severityTemplate: 'INFO' }
        ]
      }).run(context, {});

      const [first, second] = lastLogRecords().map((r) => r.observedTimeUnixNano);
      first.should.equal(second);
    });

    it('sends one log record per row', async () => {
      const [, payload] = await buildNode({
        logRecords: [
          { bodyTemplate: 'first', severityTemplate: 'INFO' },
          { bodyTemplate: 'second', severityTemplate: 'ERROR' }
        ]
      }).run(context, {});

      lastLogRecords().should.have.length(2);
      lastLogRecords().map((r) => r.body.stringValue).should.deepEqual(['first', 'second']);
      payload.working.otelResult.should.deepEqual({ success: true, logCount: 2 });
    });

    // A dropped row would be a success that exported less than it was asked to,
    // so a row that cannot be built errors the workflow instead.
    it('errors on a row whose body renders blank', async () => {
      await buildNode({
        logRecords: [
          { bodyTemplate: '', severityTemplate: 'INFO' },
          { bodyTemplate: 'good log', severityTemplate: 'INFO' }
        ]
      }).run(context, {}).should.be.rejectedWith({ message: 'Missing Body' });
      requests.should.have.length(0);
    });

    it('errors on a row whose body renders whitespace only', async () => {
      await buildNode({
        logRecords: oneLog({ bodyTemplate: '   ' })
      }).run(context, {}).should.be.rejectedWith({ message: 'Missing Body' });
      requests.should.have.length(0);
    });

    // Unlike a metric name, meaningful content in a log body can start or end
    // with whitespace - the blank-check must not silently strip it.
    it('preserves leading and trailing whitespace in a body that is not blank', async () => {
      await buildNode({
        logRecords: oneLog({ bodyTemplate: '  padded message  ' })
      }).run(context, {});
      lastLogRecords()[0].body.stringValue.should.equal('  padded message  ');
    });
  });

  describe('log write methods', () => {
    it('embeds a jsonTemplate array as logRecords[]', async () => {
      const logRecords = [{ body: { stringValue: 'a' }, severityNumber: 9 }];
      const [, payload] = await buildNode({
        logsWriteMethod: 'jsonTemplate',
        logsJsonTemplate: JSON.stringify(logRecords)
      }).run(context, {});

      payload.working.otelResult.should.deepEqual({ success: true, logCount: 1 });
      lastLogRecords().should.deepEqual(logRecords);
    });

    it('embeds a payloadPath array as logRecords[]', async () => {
      const logRecords = [{ body: { stringValue: 'b' }, severityNumber: 17 }];
      await buildNode({
        logsWriteMethod: 'payloadPath',
        logsPayloadPath: 'working.logRecords'
      }).run(context, { working: { logRecords } });

      lastLogRecords().should.deepEqual(logRecords);
    });

    it('takes a lone log record object as a batch of one', async () => {
      const logRecord = { body: { stringValue: 'c' }, severityNumber: 5 };
      const [, payload] = await buildNode({
        logsWriteMethod: 'payloadPath',
        logsPayloadPath: 'working.logRecord'
      }).run(context, { working: { logRecord } });

      payload.working.otelResult.should.deepEqual({ success: true, logCount: 1 });
      lastLogRecords().should.deepEqual([logRecord]);
    });

    it('errors when the source resolves to something that is not a log record', async () => {
      await buildNode({
        logsWriteMethod: 'payloadPath',
        logsPayloadPath: 'working.notLogRecords'
      }).run(context, { working: { notLogRecords: ['nope'] } }).should.be.rejectedWith({
        message: 'Logs Payload Path must resolve to an OTLP log record object, or an array of them.'
      });
      requests.should.have.length(0);
    });

    it('errors when the source resolves to nothing', async () => {
      await buildNode({
        logsWriteMethod: 'payloadPath',
        logsPayloadPath: 'working.missing'
      }).run(context, {}).should.be.rejectedWith({ message: 'Missing Logs Payload Path' });
      requests.should.have.length(0);
    });

    it('errors on a jsonTemplate that is not valid json', async () => {
      await buildNode({
        logsWriteMethod: 'jsonTemplate',
        logsJsonTemplate: '{ not json'
      }).run(context, {}).should.be.rejectedWith({ type: 'InvalidJson' });
      requests.should.have.length(0);
    });
  });

  describe('collector url', () => {
    // No default: a collector on localhost is wrong far more often than it is
    // right under Docker or Kubernetes, so an unset URL is a node to fix.
    it('errors when the collector url renders blank', async () => {
      await buildNode({ collectorUrlTemplate: '', logRecords: oneLog() })
        .run(context, {}).should.be.rejectedWith({ message: 'Missing Collector URL' });
      requests.should.have.length(0);
    });

    it('posts to the logs path under the configured host', async () => {
      await buildNode({ logRecords: oneLog() }).run(context, {});
      requests[0].url.should.equal('/v1/logs');
    });

    it('appends the logs path under a configured path prefix', async () => {
      nock(COLLECTOR_URL).post(`/otlp${LOGS_PATH}`).reply(function(uri, body) {
        requests.push({ url: uri, headers: { ...this.req.headers }, body });
        return [200, {}];
      });
      const [, payload] = await buildNode({
        collectorUrlTemplate: `${COLLECTOR_URL}/otlp`, logRecords: oneLog()
      }).run(context, {});

      payload.working.otelResult.should.deepEqual({ success: true, logCount: 1 });
      requests[0].url.should.equal('/otlp/v1/logs');
    });

    it('rejects a url that already carries the /v1/logs path', async () => {
      await buildNode({
        collectorUrlTemplate: `${COLLECTOR_URL}${LOGS_PATH}`, logRecords: oneLog()
      }).run(context, {}).should.be.rejectedWith({
        type: 'Validation',
        message: `Collector URL must not include ${LOGS_PATH}: use ${COLLECTOR_URL}`
      });
      requests.should.have.length(0);
    });

    it('rejects a url that already carries the /v1/metrics path', async () => {
      await buildNode({
        collectorUrlTemplate: `${COLLECTOR_URL}/v1/metrics`, logRecords: oneLog()
      }).run(context, {}).should.be.rejectedWith({
        type: 'Validation',
        message: `Collector URL must not include /v1/metrics: use ${COLLECTOR_URL}`
      });
      requests.should.have.length(0);
    });

    it('rejects a url that already carries the /v1/traces path', async () => {
      await buildNode({
        collectorUrlTemplate: `${COLLECTOR_URL}/v1/traces`, logRecords: oneLog()
      }).run(context, {}).should.be.rejectedWith({
        type: 'Validation',
        message: `Collector URL must not include /v1/traces: use ${COLLECTOR_URL}`
      });
      requests.should.have.length(0);
    });

    it('rejects a query, a fragment, or embedded credentials', async () => {
      await buildNode({ collectorUrlTemplate: `${COLLECTOR_URL}?tenant=a`, logRecords: oneLog() })
        .run(context, {}).should.be.rejectedWith({ message: 'Collector URL must not contain a query string.' });
      await buildNode({ collectorUrlTemplate: `${COLLECTOR_URL}#frag`, logRecords: oneLog() })
        .run(context, {}).should.be.rejectedWith({ message: 'Collector URL must not contain a fragment.' });
      await buildNode({
        collectorUrlTemplate: 'http://user:pw@collector.example.com:4318', logRecords: oneLog()
      }).run(context, {}).should.be.rejectedWith(/must not contain embedded credentials/);
      requests.should.have.length(0);
    });

    it('ignores trailing slashes rather than erroring on them', async () => {
      await buildNode({ collectorUrlTemplate: `${COLLECTOR_URL}/`, logRecords: oneLog() })
        .run(context, {});
      requests[0].url.should.equal('/v1/logs');
    });

    // 4318 is only the OTLP convention, not a requirement - a collector reached
    // through a gateway or a port mapping answers wherever it was put.
    it('posts to a non-standard port', async () => {
      nock('https://collector.example.com:18080').post(LOGS_PATH).reply(function(uri, body) {
        requests.push({ url: uri, headers: { ...this.req.headers }, body });
        return [200, {}];
      });
      const [, payload] = await buildNode({
        collectorUrlTemplate: 'https://collector.example.com:18080', logRecords: oneLog()
      }).run(context, {});

      payload.working.otelResult.should.deepEqual({ success: true, logCount: 1 });
      requests[0].headers.host.should.equal('collector.example.com:18080');
    });
  });

  describe('attributes', () => {
    it('renders individual log record attribute fields', async () => {
      await buildNode({
        logRecords: oneLog({
          attributesWriteMethod: 'individualFields',
          attributesFields: [{ keyTemplate: 'sensor.id', valueTemplate: '{{working.id}}' }]
        })
      }).run(context, { working: { id: 'temp-01' } });

      lastLogRecords()[0].attributes.should.deepEqual([
        { key: 'sensor.id', value: { stringValue: 'temp-01' } }
      ]);
    });

    it('types individual attribute fields per the OTLP mapping', async () => {
      await buildNode({
        logRecords: oneLog({
          attributesWriteMethod: 'individualFields',
          attributesFields: [
            { keyTemplate: 'http.response.status_code', valueTemplate: '{{working.status}}' },
            { keyTemplate: 'error', valueTemplate: '{{working.failed}}' },
            { keyTemplate: 'ratio', valueTemplate: '{{working.ratio}}' }
          ]
        })
      }).run(context, { working: { status: 200, failed: false, ratio: 22.5 } });

      lastLogRecords()[0].attributes.should.deepEqual([
        { key: 'http.response.status_code', value: { intValue: '200' } },
        { key: 'error', value: { boolValue: false } },
        { key: 'ratio', value: { doubleValue: 22.5 } }
      ]);
    });

    it('types jsonTemplate attribute values per the OTLP mapping', async () => {
      await buildNode({
        logRecords: oneLog({
          attributesWriteMethod: 'jsonTemplate',
          attributesJsonTemplate: JSON.stringify({ count: 42, ok: true })
        })
      }).run(context, {});

      lastLogRecords()[0].attributes.should.deepEqual([
        { key: 'count', value: { intValue: '42' } },
        { key: 'ok', value: { boolValue: true } }
      ]);
    });

    it('treats an unconfigured attribute source as no attributes', async () => {
      await buildNode({
        logRecords: oneLog({ attributesWriteMethod: 'payloadPath', attributesPayloadPath: 'working.missing' })
      }).run(context, {});
      lastLogRecords()[0].attributes.should.deepEqual([]);
    });

    it('errors when an attribute source resolves to something other than an object', async () => {
      await buildNode({
        logRecords: oneLog({ attributesWriteMethod: 'payloadPath', attributesPayloadPath: 'working.notAnObject' })
      }).run(context, { working: { notAnObject: ['a', 'b'] } }).should.be.rejectedWith({
        message: 'Attributes must resolve to an object.'
      });
      requests.should.have.length(0);
    });

    it('puts resource attributes on the resource', async () => {
      await buildNode({
        resourceAttributesWriteMethod: 'individualFields',
        resourceAttributesFields: [{ keyTemplate: 'service.name', valueTemplate: 'my-gea' }],
        logRecords: oneLog()
      }).run(context, {});

      lastBody().resourceLogs[0].resource.attributes.should.deepEqual([
        { key: 'service.name', value: { stringValue: 'my-gea' } }
      ]);
    });

    it('reads resource attributes from a payload path', async () => {
      await buildNode({
        resourceAttributesWriteMethod: 'payloadPath',
        resourceAttributesPayloadPath: 'working.resourceAttrs',
        logRecords: oneLog()
      }).run(context, { working: { resourceAttrs: { 'host.name': 'gateway-01' } } });

      lastBody().resourceLogs[0].resource.attributes.should.deepEqual([
        { key: 'host.name', value: { stringValue: 'gateway-01' } }
      ]);
    });
  });

  describe('scope', () => {
    it('defaults the scope name and uses the agent version', async () => {
      await buildNode({ logRecords: oneLog() }).run(context, {});
      lastBody().resourceLogs[0].scopeLogs[0].scope.should.deepEqual({
        name: 'gea-otel-write',
        version: AGENT_VERSION.version
      });
    });

    it('honors rendered scope name and version', async () => {
      await buildNode({
        scopeNameTemplate: '{{working.scope}}',
        scopeVersionTemplate: '9.9.9',
        logRecords: oneLog()
      }).run(context, { working: { scope: 'my-scope' } });

      lastBody().resourceLogs[0].scopeLogs[0].scope.should.deepEqual({
        name: 'my-scope', version: '9.9.9'
      });
    });

    // The scope templates render on the way to building the body, well after the
    // log records and the connection resolve, and error the workflow like any
    // other template on this node that cannot render.
    it('errors when a scope template throws at render time', async () => {
      await buildNode({
        scopeNameTemplate: '{{#each working.rows}}{{this}}{{/each}}',
        logRecords: oneLog()
      }).run(context, { working: { rows: Array.from({ length: 4097 }, (_, i) => i) } })
        .should.be.rejectedWith({ message: /Maximum #each iteration count/ });
      requests.should.have.length(0);
    });
  });

  describe('auth', () => {
    it('sends no authorization header for authType none', async () => {
      await buildNode({ authType: 'none', logRecords: oneLog() }).run(context, {});
      requests[0].headers.should.not.have.property('authorization');
    });

    it('sends a bearer header', async () => {
      await buildNode({
        authType: 'bearer', bearerTokenTemplate: '{{working.token}}', logRecords: oneLog()
      }).run(context, { working: { token: 'secret' } });
      requests[0].headers.authorization.should.equal('Bearer secret');
    });

    it('sends a basic header', async () => {
      await buildNode({
        authType: 'basic', usernameTemplate: 'user', passwordTemplate: 'pass', logRecords: oneLog()
      }).run(context, {});
      requests[0].headers.authorization.should.equal(`Basic ${Buffer.from('user:pass').toString('base64')}`);
    });

    it('errors when the bearer token renders blank', async () => {
      await buildNode({
        authType: 'bearer', bearerTokenTemplate: '{{working.missing}}', logRecords: oneLog()
      }).run(context, {}).should.be.rejectedWith({ message: 'Missing Bearer Token' });
      requests.should.have.length(0);
    });

    it('errors when a client certificate renders blank under clientCert auth', async () => {
      await buildNode({ authType: 'clientCert', logRecords: oneLog() })
        .run(context, {}).should.be.rejectedWith({ message: 'Missing Client Certificate' });
      requests.should.have.length(0);
    });

    // What the node owns here is the object handed to https.Agent; whether OpenSSL
    // then honors it is Node's business, so this asserts the options, not a handshake.
    it('turns off verification and leaves the CA unread when disabled', async () => {
      const { agentOptions } = await buildNode({
        disableSSLVerification: true,
        caCertTemplateType: 'diskPath',
        caCertTemplate: '/no/such/ca.crt'
      }).resolveConnection({});

      agentOptions.should.deepEqual({ rejectUnauthorized: false });
    });

    it('applies the CA and leaves verification on by default', async () => {
      const { agentOptions } = await buildNode({
        caCertTemplateType: 'stringTemplate',
        caCertTemplate: '-----BEGIN CERTIFICATE-----\nca\n-----END CERTIFICATE-----'
      }).resolveConnection({});

      agentOptions.ca.should.match(/BEGIN CERTIFICATE/);
      agentOptions.should.not.have.property('rejectUnauthorized');
    });

    it('falls back to the system CA store when no CA is configured', async () => {
      const { agentOptions } = await buildNode({}).resolveConnection({});
      should(agentOptions.ca).be.undefined();
      agentOptions.should.not.have.property('rejectUnauthorized');
    });

    it('adds the client cert and key alongside the CA for clientCert auth', async () => {
      const { agentOptions } = await buildNode({
        authType: 'clientCert',
        clientCertTemplateType: 'stringTemplate',
        clientCertTemplate: '-----BEGIN CERTIFICATE-----\nclient\n-----END CERTIFICATE-----',
        clientKeyTemplateType: 'stringTemplate',
        clientKeyTemplate: '-----BEGIN PRIVATE KEY-----\nkey\n-----END PRIVATE KEY-----'
      }).resolveConnection({});

      agentOptions.cert.should.match(/client/);
      agentOptions.key.should.match(/BEGIN PRIVATE KEY/);
    });

    it('reads a certificate from disk in diskPath mode', async () => {
      // Outside PACKAGE_ROOT_DIR — resolveCert refuses paths inside the agent directory.
      const certPath = path.resolve(os.tmpdir(), 'otel-logs-spec-client.crt');
      await fs.writeFile(certPath, '-----BEGIN CERTIFICATE-----\nx\n-----END CERTIFICATE-----');
      try {
        const [, payload] = await buildNode({
          authType: 'clientCert',
          clientCertTemplateType: 'diskPath',
          clientCertTemplate: certPath,
          clientKeyTemplateType: 'diskPath',
          clientKeyTemplate: certPath,
          logRecords: oneLog()
        }).run(context, {});
        payload.working.otelResult.should.deepEqual({ success: true, logCount: 1 });
      } finally {
        await fs.remove(certPath);
      }
    });
  });

  // A collector can take the request and still drop part of it. The OTLP spec
  // calls that a success the client must not retry, so it rides along with one.
  describe('partial success', () => {
    const respondWith = (partialSuccess) => {
      respond = () => [200, { partialSuccess }];
    };

    it('reports rejected log records next to the success', async () => {
      respondWith({ rejectedLogRecords: '2', errorMessage: 'body too large' });
      const [, payload] = await buildNode({ logRecords: oneLog() }).run(context, {});

      payload.working.otelResult.should.deepEqual({
        success: true,
        logCount: 1,
        rejectedLogRecords: 2,
        rejectedMessage: 'body too large'
      });
    });

    it('stays a plain success for an empty partialSuccess', async () => {
      respondWith({});
      const [, payload] = await buildNode({ logRecords: oneLog() }).run(context, {});
      payload.working.otelResult.should.deepEqual({ success: true, logCount: 1 });
    });
  });

  describe('failures', () => {
    it('soft errors on a non-2xx response', async () => {
      respond = () => [500, 'kaboom'];
      const [outputIds, payload] = await buildNode({ logRecords: oneLog() }).run(context, {});

      outputIds.should.equal(OUTPUT_IDS);
      payload.working.otelResult.should.deepEqual({
        success: false,
        error: { type: 'OTEL_COLLECTOR_RESPONSE_ERROR', message: 'HTTP 500: kaboom' }
      });
    });

    it('soft errors when the collector is unreachable', async () => {
      const downUrl = 'http://down.example.com:4318';
      nock(downUrl).post(LOGS_PATH).replyWithError('ECONNREFUSED');

      const node = buildNode({ collectorUrlTemplate: downUrl, logRecords: oneLog() });
      const [, payload] = await node.run(context, {});
      payload.working.otelResult.success.should.equal(false);
      payload.working.otelResult.error.type.should.equal('OTEL_COLLECTOR_REQUEST_ERROR');
      payload.working.otelResult.error.message.should.be.a.String();
    });

    it('soft errors as a timeout when the collector does not respond in time', async () => {
      const slowUrl = 'http://slow.example.com:4318';
      nock(slowUrl).post(LOGS_PATH).delay(200).reply(200, {});

      const [, payload] = await buildNode({ collectorUrlTemplate: slowUrl, logRecords: oneLog() })
        .run({ externalTimeout: 50 }, {});
      payload.working.otelResult.should.deepEqual({
        success: false,
        error: {
          type: 'NodeTimeout',
          message: 'Timeout running OpenTelemetry: Logs Write node'
        }
      });
    });

    it('errors on a malformed collector url without making a request', async () => {
      await buildNode({
        collectorUrlTemplate: 'not a url', logRecords: oneLog()
      }).run(context, {}).should.be.rejectedWith({ type: 'Validation', message: /Invalid URL/ });
      requests.should.have.length(0);
    });

    it('reports a typed error raised during the send under its own type', async () => {
      const refusingContext = {
        get externalTimeout() { throw errors.Validation({ message: 'Invalid host: nope.example.com' }); }
      };
      const [outputIds, payload] = await buildNode({ logRecords: oneLog() }).run(refusingContext, {});

      outputIds.should.equal(OUTPUT_IDS);
      payload.working.otelResult.should.deepEqual({
        success: false,
        error: { type: 'Validation', message: 'Invalid host: nope.example.com' }
      });
      requests.should.have.length(0);
    });

    it('leaves the payload otherwise untouched and always returns its output ids', async () => {
      const [outputIds, payload] = await buildNode({ logRecords: oneLog() })
        .run(context, { data: { untouched: true } });
      outputIds.should.equal(OUTPUT_IDS);
      payload.data.should.deepEqual({ untouched: true });
    });

    it('omits the result when no resultPath is configured', async () => {
      const [, payload] = await buildNode({ resultPath: '', logRecords: oneLog() }).run(context, {});
      payload.should.deepEqual({});
      requests.should.have.length(1);
    });
  });

  describe('agentConfig connection source', () => {
    it('throws Validation when context has no getOtlpCollectorConfig method', async () => {
      const node = new OtelLogsWriteNode('id', OUTPUT_IDS, {
        connectionSource: 'agentConfig',
        resultPath: 'working.otelResult',
        logRecords: oneLog()
      });

      await node.run(context, {}).should.be.rejectedWith({
        message: 'No OpenTelemetry Collector configuration found in the Edge Agent config.'
      });
      requests.should.have.length(0);
    });

    it('resolves collector url, resource attributes, and headers from agentConfig', async () => {
      const node = new OtelLogsWriteNode('id', OUTPUT_IDS, {
        connectionSource: 'agentConfig',
        resultPath: 'working.otelResult',
        logRecords: oneLog()
      });

      const configuredContext = {
        ...context,
        getOtlpCollectorConfig: () => ({
          url: COLLECTOR_URL,
          resourceAttrs: [{ key: 'service.name', value: { stringValue: 'agent-config-service' } }],
          authHeaders: { Authorization: 'Bearer config-token' },
          agentOptions: {}
        })
      };

      const [outputIds, payload] = await node.run(configuredContext, {});
      outputIds.should.equal(OUTPUT_IDS);
      payload.working.otelResult.should.deepEqual({ success: true, logCount: 1 });
      requests.should.have.length(1);
      requests[0].url.should.equal(LOGS_PATH);
      requests[0].headers.should.have.property('authorization', 'Bearer config-token');
      lastBody().resourceLogs[0].resource.attributes.should.deepEqual([
        { key: 'service.name', value: { stringValue: 'agent-config-service' } }
      ]);
    });

    it('appends node-level resource attributes after the agent-level ones', async () => {
      const node = new OtelLogsWriteNode('id', OUTPUT_IDS, {
        connectionSource: 'agentConfig',
        resultPath: 'working.otelResult',
        resourceAttributesWriteMethod: 'individualFields',
        resourceAttributesFields: [{ keyTemplate: 'flow.name', valueTemplate: 'my-flow' }],
        logRecords: oneLog()
      });

      const configuredContext = {
        ...context,
        getOtlpCollectorConfig: () => ({
          url: COLLECTOR_URL,
          resourceAttrs: [{ key: 'service.name', value: { stringValue: 'agent-config-service' } }],
          authHeaders: {},
          agentOptions: {}
        })
      };

      await node.run(configuredContext, {});
      lastBody().resourceLogs[0].resource.attributes.should.deepEqual([
        { key: 'service.name', value: { stringValue: 'agent-config-service' } },
        { key: 'flow.name', value: { stringValue: 'my-flow' } }
      ]);
    });
  });

});
