import os from 'node:os';
import path from 'node:path';
import fs from 'fs-extra';
import errors from 'losant-nodejs-utils/src/errors.js';
import { tk, nock, should } from '../common.js';
import { AGENT_VERSION } from '../../src/constants.js';
import { loadGuardedFile } from '../../src/lib/protected-path-utils.js';
import OtelMetricsWriteNode from '../../src/nodes/otel-metrics-write-node.js';

const OUTPUT_IDS = [['out']];
const FROZEN_MS = 1700000000000;
const FROZEN_NANO = '1700000000000000000';
const COLLECTOR_URL = 'http://collector.example.com:4318';
const METRICS_PATH = '/v1/metrics';

describe('OtelMetricsWriteNode', () => {
  let requests;
  let respond;
  let context;

  const buildNode = (config) => new OtelMetricsWriteNode('id', OUTPUT_IDS, {
    collectorUrlTemplate: COLLECTOR_URL,
    resultPath: 'working.otelResult',
    ...config
  });

  // A single gauge, enough to get past the empty-metrics early return.
  const oneGauge = (overrides = {}) => ([{
    nameTemplate: 'device.temperature',
    valueTemplate: '22.5',
    metricType: 'gauge',
    ...overrides
  }]);

  const lastBody = () => requests[requests.length - 1].body;
  const lastMetrics = () => lastBody().resourceMetrics[0].scopeMetrics[0].metrics;

  beforeEach(() => {
    requests = [];
    // What the collector answers with, as [status, body]. Tests reassign this to
    // exercise a partial success, a non-2xx, and so on.
    respond = () => [200, {}];
    nock(COLLECTOR_URL)
      .persist()
      .post(METRICS_PATH)
      .reply(function(uri, body) {
        requests.push({ url: uri, headers: { ...this.req.headers }, body });
        return respond();
      });
    context = { externalTimeout: 5000, diskUtils: { loadGuardedFile } };
  });

  describe('metric collection', () => {
    it('makes no HTTP call and reports a zero count when there are no metrics', async () => {
      const [outputIds, payload] = await buildNode({ customMetrics: [] }).run(context, {});
      outputIds.should.equal(OUTPUT_IDS);
      payload.working.otelResult.should.deepEqual({ success: true, metricCount: 0 });
      requests.should.have.length(0);
    });

    it('posts a gauge to /v1/metrics', async () => {
      tk.freeze(new Date(FROZEN_MS));
      const [, payload] = await buildNode({
        customMetrics: oneGauge({ descriptionTemplate: 'Current reading', unitTemplate: 'Cel' })
      }).run(context, {});

      payload.working.otelResult.should.deepEqual({ success: true, metricCount: 1 });
      requests[0].url.should.equal('/v1/metrics');
      lastMetrics().should.deepEqual([{
        name: 'device.temperature',
        unit: 'Cel',
        description: 'Current reading',
        gauge: { dataPoints: [{ asDouble: 22.5, timeUnixNano: FROZEN_NANO, attributes: [] }] }
      }]);
    });

    it('sends the OTLP json content type', async () => {
      await buildNode({ customMetrics: oneGauge() }).run(context, {});
      requests[0].headers['content-type'].should.equal('application/json');
    });

    it('renders name and value from the payload', async () => {
      const [, payload] = await buildNode({
        customMetrics: oneGauge({ nameTemplate: '{{working.name}}', valueTemplate: '{{working.value}}' })
      }).run(context, { working: { name: 'a.metric', value: 7 } });

      payload.working.otelResult.metricCount.should.equal(1);
      lastMetrics()[0].name.should.equal('a.metric');
      lastMetrics()[0].gauge.dataPoints[0].asDouble.should.equal(7);
    });

    it('uses the rendered timestamp when given', async () => {
      await buildNode({
        customMetrics: oneGauge({ timestampTemplate: '1690000000000' })
      }).run(context, {});
      lastMetrics()[0].gauge.dataPoints[0].timeUnixNano.should.equal('1690000000000000000');
    });

    it('accepts the timestamp formats the rest of the platform accepts', async () => {
      await buildNode({
        customMetrics: [
          { nameTemplate: 'ms', valueTemplate: '1', timestampTemplate: '1690000000000' },
          { nameTemplate: 'seconds', valueTemplate: '1', timestampTemplate: '1690000000' },
          { nameTemplate: 'iso', valueTemplate: '1', timestampTemplate: '2023-07-22T04:26:40.000Z' }
        ]
      }).run(context, {});

      lastMetrics().map((m) => m.gauge.dataPoints[0].timeUnixNano)
        .should.deepEqual(['1690000000000000000', '1690000000000000000', '1690000000000000000']);
    });

    // enforceTime accepts no padding on any format - ' 1700000000000' and
    // ' 2023-11-14T22:13:20.000Z' both fail to parse - so a trailing space left
    // in an editor field would otherwise throw and take the whole export with it.
    it('trims a padded timestamp rather than failing to parse it', async () => {
      await buildNode({
        customMetrics: [
          { nameTemplate: 'ms', valueTemplate: '1', timestampTemplate: ' 1690000000000 ' },
          { nameTemplate: 'iso', valueTemplate: '1', timestampTemplate: '  2023-07-22T04:26:40.000Z\n' }
        ]
      }).run(context, {});

      lastMetrics().map((m) => m.gauge.dataPoints[0].timeUnixNano)
        .should.deepEqual(['1690000000000000000', '1690000000000000000']);
    });

    it('treats a whitespace-only timestamp as unset and uses the run time', async () => {
      tk.freeze(new Date(FROZEN_MS));
      await buildNode({
        customMetrics: oneGauge({ timestampTemplate: '   ' })
      }).run(context, {});
      lastMetrics()[0].gauge.dataPoints[0].timeUnixNano.should.equal(FROZEN_NANO);
    });

    it('errors on a timestamp it cannot parse', async () => {
      await buildNode({
        customMetrics: oneGauge({ timestampTemplate: 'yesterday' })
      }).run(context, {}).should.be.rejectedWith({ message: /^Invalid timestamp: yesterday\./ });
      requests.should.have.length(0);
    });

    it('gives every row without its own timestamp the same run time', async () => {
      await buildNode({
        customMetrics: [
          { nameTemplate: 'a', valueTemplate: '1' },
          { nameTemplate: 'b', valueTemplate: '2' }
        ]
      }).run(context, {});

      const [first, second] = lastMetrics().map((m) => m.gauge.dataPoints[0].timeUnixNano);
      first.should.equal(second);
    });

    // Rows sharing a name stay separate entries rather than being collapsed into
    // one multi-data-point stream - how the user's metrics are modeled is their
    // decision, and OTLP allows a name to repeat across entries.
    it('sends one metric entry per row, even when rows share a name', async () => {
      const [, payload] = await buildNode({
        customMetrics: [
          {
            nameTemplate: 'device.temperature',
            valueTemplate: '22.5',
            attributesFields: [{ keyTemplate: 'sensor', valueTemplate: 'a' }]
          },
          {
            nameTemplate: 'device.temperature',
            valueTemplate: '30.1',
            attributesFields: [{ keyTemplate: 'sensor', valueTemplate: 'b' }]
          }
        ]
      }).run(context, {});

      lastMetrics().should.have.length(2);
      lastMetrics().map((m) => m.name).should.deepEqual(['device.temperature', 'device.temperature']);
      lastMetrics().map((m) => m.gauge.dataPoints[0].asDouble).should.deepEqual([22.5, 30.1]);
      payload.working.otelResult.should.deepEqual({ success: true, metricCount: 2 });
    });

    // A dropped row would be a success that exported less than it was asked to,
    // so a row that cannot be built errors the workflow instead.
    it('errors on a row whose name renders blank', async () => {
      await buildNode({
        customMetrics: [
          { nameTemplate: '', valueTemplate: '1' },
          { nameTemplate: 'good.metric', valueTemplate: '3' }
        ]
      }).run(context, {}).should.be.rejectedWith({ message: 'Missing Metric Name' });
      requests.should.have.length(0);
    });

    it('errors on a row whose name renders whitespace only', async () => {
      await buildNode({
        customMetrics: [{ nameTemplate: '   ', valueTemplate: '1' }]
      }).run(context, {}).should.be.rejectedWith({ message: 'Missing Metric Name' });
      requests.should.have.length(0);
    });

    it('trims a rendered metric name rather than exporting the padding', async () => {
      await buildNode({
        customMetrics: oneGauge({ nameTemplate: '  device.temperature  ' })
      }).run(context, {});
      lastMetrics()[0].name.should.equal('device.temperature');
    });

    it('errors on a row whose value is not a number', async () => {
      await buildNode({
        customMetrics: [{ nameTemplate: 'bad.value', valueTemplate: 'not-a-number' }]
      }).run(context, {}).should.be.rejectedWith({
        message: 'Invalid value for metric bad.value: not-a-number. Expected a number.'
      });
      requests.should.have.length(0);
    });

    it('errors on a row whose value renders blank', async () => {
      await buildNode({
        customMetrics: [{ nameTemplate: 'blank.value', valueTemplate: '{{working.nope}}' }]
      }).run(context, {}).should.be.rejectedWith({ message: 'Missing Metric Value' });
      requests.should.have.length(0);
    });

    it('still exports a legitimate zero', async () => {
      await buildNode({
        customMetrics: oneGauge({ valueTemplate: '0' })
      }).run(context, {});
      lastMetrics()[0].gauge.dataPoints[0].asDouble.should.equal(0);
    });
  });

  describe('sums', () => {
    const oneSum = (overrides = {}) => ([{
      nameTemplate: 'device.events.total',
      valueTemplate: '1042',
      metricType: 'sum',
      ...overrides
    }]);

    it('defaults to cumulative and monotonic', async () => {
      await buildNode({ customMetrics: oneSum() }).run(context, {});
      lastMetrics()[0].sum.aggregationTemporality.should.equal(2);
      lastMetrics()[0].sum.isMonotonic.should.equal(true);
    });

    it('maps delta temporality to 1', async () => {
      await buildNode({ customMetrics: oneSum({ aggregationTemporality: 'delta' }) }).run(context, {});
      lastMetrics()[0].sum.aggregationTemporality.should.equal(1);
    });

    it('respects isMonotonic false', async () => {
      await buildNode({ customMetrics: oneSum({ isMonotonic: false }) }).run(context, {});
      lastMetrics()[0].sum.isMonotonic.should.equal(false);
    });

    it('includes startTimeUnixNano when given', async () => {
      await buildNode({ customMetrics: oneSum({ startTimestampTemplate: '1690000000000' }) }).run(context, {});
      lastMetrics()[0].sum.dataPoints[0].startTimeUnixNano.should.equal('1690000000000000000');
    });

    it('trims a padded start timestamp', async () => {
      await buildNode({ customMetrics: oneSum({ startTimestampTemplate: ' 1690000000000\n' }) }).run(context, {});
      lastMetrics()[0].sum.dataPoints[0].startTimeUnixNano.should.equal('1690000000000000000');
    });

    // Documented as omitted when blank, which a whitespace-only render is.
    it('omits startTimeUnixNano when it renders whitespace only', async () => {
      await buildNode({ customMetrics: oneSum({ startTimestampTemplate: '   ' }) }).run(context, {});
      lastMetrics()[0].sum.dataPoints[0].should.not.have.property('startTimeUnixNano');
    });

    it('omits startTimeUnixNano when blank', async () => {
      await buildNode({ customMetrics: oneSum() }).run(context, {});
      lastMetrics()[0].sum.dataPoints[0].should.not.have.property('startTimeUnixNano');
    });
  });

  describe('metric write methods', () => {
    it('embeds a jsonTemplate array as metrics[]', async () => {
      const metrics = [{ name: 'a.metric', unit: '1', gauge: { dataPoints: [{ asDouble: 1 }] } }];
      const [, payload] = await buildNode({
        metricsWriteMethod: 'jsonTemplate',
        metricsJsonTemplate: JSON.stringify(metrics)
      }).run(context, {});

      payload.working.otelResult.should.deepEqual({ success: true, metricCount: 1 });
      lastMetrics().should.deepEqual(metrics);
    });

    it('embeds a payloadPath array as metrics[]', async () => {
      const metrics = [{ name: 'b.metric', unit: '1', gauge: { dataPoints: [{ asDouble: 2 }] } }];
      await buildNode({
        metricsWriteMethod: 'payloadPath',
        metricsPayloadPath: 'working.metrics'
      }).run(context, { working: { metrics } });

      lastMetrics().should.deepEqual(metrics);
    });

    it('takes a lone metric object as a batch of one', async () => {
      const metric = { name: 'c.metric', unit: '1', gauge: { dataPoints: [{ asDouble: 3 }] } };
      const [, payload] = await buildNode({
        metricsWriteMethod: 'payloadPath',
        metricsPayloadPath: 'working.metric'
      }).run(context, { working: { metric } });

      payload.working.otelResult.should.deepEqual({ success: true, metricCount: 1 });
      lastMetrics().should.deepEqual([metric]);
    });

    it('errors when the source resolves to something that is not a metric', async () => {
      await buildNode({
        metricsWriteMethod: 'payloadPath',
        metricsPayloadPath: 'working.notMetrics'
      }).run(context, { working: { notMetrics: ['nope'] } }).should.be.rejectedWith({
        message: 'Metrics Payload Path must resolve to an OTLP metric object, or an array of them.'
      });
      requests.should.have.length(0);
    });

    it('errors when the source resolves to nothing', async () => {
      await buildNode({
        metricsWriteMethod: 'payloadPath',
        metricsPayloadPath: 'working.missing'
      }).run(context, {}).should.be.rejectedWith({ message: 'Missing Metrics Payload Path' });
      requests.should.have.length(0);
    });

    it('errors on a jsonTemplate that is not valid json', async () => {
      await buildNode({
        metricsWriteMethod: 'jsonTemplate',
        metricsJsonTemplate: '{ not json'
      }).run(context, {}).should.be.rejectedWith({ type: 'InvalidJson' });
      requests.should.have.length(0);
    });
  });

  describe('collector url', () => {
    // No default: a collector on localhost is wrong far more often than it is
    // right under Docker or Kubernetes, so an unset URL is a node to fix.
    it('errors when the collector url renders blank', async () => {
      await buildNode({ collectorUrlTemplate: '', customMetrics: oneGauge() })
        .run(context, {}).should.be.rejectedWith({ message: 'Missing Collector URL' });
      requests.should.have.length(0);
    });

    it('errors when the collector url template is not configured at all', async () => {
      await buildNode({ collectorUrlTemplate: undefined, customMetrics: oneGauge() })
        .run(context, {}).should.be.rejectedWith({ message: 'Missing Collector URL' });
      requests.should.have.length(0);
    });

    it('errors when the collector url renders to only whitespace', async () => {
      await buildNode({ collectorUrlTemplate: '   ', customMetrics: oneGauge() })
        .run(context, {}).should.be.rejectedWith({ message: 'Missing Collector URL' });
      requests.should.have.length(0);
    });

    it('posts to the metrics path under the configured host', async () => {
      await buildNode({ customMetrics: oneGauge() }).run(context, {});
      requests[0].url.should.equal('/v1/metrics');
    });

    it('trims whitespace off a rendered url', async () => {
      await buildNode({
        collectorUrlTemplate: `  ${COLLECTOR_URL}\n`, customMetrics: oneGauge()
      }).run(context, {});
      requests[0].url.should.equal('/v1/metrics');
    });

    // OTEL_EXPORTER_OTLP_ENDPOINT may carry a path prefix, which is how a
    // collector behind an ingress or api gateway is addressed.
    it('appends the metrics path under a configured path prefix', async () => {
      nock(COLLECTOR_URL).post(`/otlp${METRICS_PATH}`).reply(function(uri, body) {
        requests.push({ url: uri, headers: { ...this.req.headers }, body });
        return [200, {}];
      });
      const [, payload] = await buildNode({
        collectorUrlTemplate: `${COLLECTOR_URL}/otlp`, customMetrics: oneGauge()
      }).run(context, {});

      payload.working.otelResult.should.deepEqual({ success: true, metricCount: 1 });
      requests[0].url.should.equal('/otlp/v1/metrics');
    });

    it('ignores trailing slashes rather than erroring on them', async () => {
      await buildNode({ collectorUrlTemplate: `${COLLECTOR_URL}/`, customMetrics: oneGauge() })
        .run(context, {});
      await buildNode({ collectorUrlTemplate: `${COLLECTOR_URL}//`, customMetrics: oneGauge() })
        .run(context, {});
      requests.map(({ url }) => url).should.deepEqual(['/v1/metrics', '/v1/metrics']);
    });

    // 4318 is only the OTLP convention, not a requirement - a collector reached
    // through a gateway or a port mapping answers wherever it was put.
    it('posts to a non-standard port', async () => {
      nock('https://collector.example.com:18080').post(METRICS_PATH).reply(function(uri, body) {
        requests.push({ url: uri, headers: { ...this.req.headers }, body });
        return [200, {}];
      });
      const [, payload] = await buildNode({
        collectorUrlTemplate: 'https://collector.example.com:18080', customMetrics: oneGauge()
      }).run(context, {});

      payload.working.otelResult.should.deepEqual({ success: true, metricCount: 1 });
      requests[0].url.should.equal(METRICS_PATH);
      // The port rides through to the request, not just past validation.
      requests[0].headers.host.should.equal('collector.example.com:18080');
    });

    // The parser drops the default port, so the host the request goes to is not
    // spelled the way it was configured. That is normalization, not a mistake.
    it('accepts a url carrying the default port for its scheme', async () => {
      nock('http://collector.example.com').post(METRICS_PATH).reply(function(uri, body) {
        requests.push({ url: uri, headers: { ...this.req.headers }, body });
        return [200, {}];
      });
      const [, payload] = await buildNode({
        collectorUrlTemplate: 'http://collector.example.com:80', customMetrics: oneGauge()
      }).run(context, {});
      payload.working.otelResult.should.deepEqual({ success: true, metricCount: 1 });
    });

    // The per-signal OTEL_EXPORTER_OTLP_METRICS_ENDPOINT is the full endpoint, so
    // it gets pasted here too. Appending would give /v1/metrics/v1/metrics.
    it('rejects a url that already carries the /v1/metrics path', async () => {
      await buildNode({
        collectorUrlTemplate: `${COLLECTOR_URL}${METRICS_PATH}`, customMetrics: oneGauge()
      }).run(context, {}).should.be.rejectedWith({
        type: 'Validation',
        message: `Collector URL must not include ${METRICS_PATH}: use ${COLLECTOR_URL}`
      });
      await buildNode({
        collectorUrlTemplate: `${COLLECTOR_URL}/otlp${METRICS_PATH}/`, customMetrics: oneGauge()
      }).run(context, {}).should.be.rejectedWith({
        message: `Collector URL must not include ${METRICS_PATH}: use ${COLLECTOR_URL}/otlp`
      });
      requests.should.have.length(0);
    });

    it('rejects a url that already carries the /v1/traces path', async () => {
      await buildNode({
        collectorUrlTemplate: `${COLLECTOR_URL}/v1/traces`, customMetrics: oneGauge()
      }).run(context, {}).should.be.rejectedWith({
        type: 'Validation',
        message: `Collector URL must not include /v1/traces: use ${COLLECTOR_URL}`
      });
      requests.should.have.length(0);
    });

    it('rejects a url that already carries the /v1/logs path', async () => {
      await buildNode({
        collectorUrlTemplate: `${COLLECTOR_URL}/v1/logs`, customMetrics: oneGauge()
      }).run(context, {}).should.be.rejectedWith({
        type: 'Validation',
        message: `Collector URL must not include /v1/logs: use ${COLLECTOR_URL}`
      });
      requests.should.have.length(0);
    });

    // origin would drop all three of these without saying anything.
    it('rejects a query, a fragment, or embedded credentials', async () => {
      await buildNode({ collectorUrlTemplate: `${COLLECTOR_URL}?tenant=a`, customMetrics: oneGauge() })
        .run(context, {}).should.be.rejectedWith({ message: 'Collector URL must not contain a query string.' });
      await buildNode({ collectorUrlTemplate: `${COLLECTOR_URL}#frag`, customMetrics: oneGauge() })
        .run(context, {}).should.be.rejectedWith({ message: 'Collector URL must not contain a fragment.' });
      await buildNode({
        collectorUrlTemplate: 'http://user:pw@collector.example.com:4318', customMetrics: oneGauge()
      }).run(context, {}).should.be.rejectedWith(/must not contain embedded credentials/);
      requests.should.have.length(0);
    });
  });

  describe('attributes', () => {
    it('renders individual data point attribute fields', async () => {
      await buildNode({
        customMetrics: oneGauge({
          attributesWriteMethod: 'individualFields',
          attributesFields: [{ keyTemplate: 'sensor.id', valueTemplate: '{{working.id}}' }]
        })
      }).run(context, { working: { id: 'temp-01' } });

      lastMetrics()[0].gauge.dataPoints[0].attributes.should.deepEqual([
        { key: 'sensor.id', value: { stringValue: 'temp-01' } }
      ]);
    });

    it('types individual attribute fields per the OTLP mapping', async () => {
      await buildNode({
        customMetrics: oneGauge({
          attributesWriteMethod: 'individualFields',
          attributesFields: [
            { keyTemplate: 'http.response.status_code', valueTemplate: '{{working.status}}' },
            { keyTemplate: 'error', valueTemplate: '{{working.failed}}' },
            { keyTemplate: 'ratio', valueTemplate: '{{working.ratio}}' }
          ]
        })
      }).run(context, { working: { status: 200, failed: false, ratio: 22.5 } });

      lastMetrics()[0].gauge.dataPoints[0].attributes.should.deepEqual([
        { key: 'http.response.status_code', value: { intValue: '200' } },
        { key: 'error', value: { boolValue: false } },
        { key: 'ratio', value: { doubleValue: 22.5 } }
      ]);
    });

    it('types jsonTemplate attribute values per the OTLP mapping', async () => {
      await buildNode({
        customMetrics: oneGauge({
          attributesWriteMethod: 'jsonTemplate',
          attributesJsonTemplate: JSON.stringify({ count: 42, ratio: 22.5, ok: true, tags: ['a'] })
        })
      }).run(context, {});

      lastMetrics()[0].gauge.dataPoints[0].attributes.should.deepEqual([
        { key: 'count', value: { intValue: '42' } },
        { key: 'ratio', value: { doubleValue: 22.5 } },
        { key: 'ok', value: { boolValue: true } },
        { key: 'tags', value: { stringValue: '["a"]' } }
      ]);
    });

    it('puts resource attributes on the resource', async () => {
      await buildNode({
        resourceAttributesWriteMethod: 'individualFields',
        resourceAttributesFields: [{ keyTemplate: 'service.name', valueTemplate: 'my-gea' }],
        customMetrics: oneGauge()
      }).run(context, {});

      lastBody().resourceMetrics[0].resource.attributes.should.deepEqual([
        { key: 'service.name', value: { stringValue: 'my-gea' } }
      ]);
    });

    it('reads resource attributes from a payload path', async () => {
      await buildNode({
        resourceAttributesWriteMethod: 'payloadPath',
        resourceAttributesPayloadPath: 'working.resourceAttrs',
        customMetrics: oneGauge()
      }).run(context, { working: { resourceAttrs: { 'host.name': 'gateway-01' } } });

      lastBody().resourceMetrics[0].resource.attributes.should.deepEqual([
        { key: 'host.name', value: { stringValue: 'gateway-01' } }
      ]);
    });

    it('treats an unconfigured attribute source as no attributes', async () => {
      await buildNode({
        resourceAttributesWriteMethod: 'payloadPath',
        resourceAttributesPayloadPath: 'working.missing',
        customMetrics: oneGauge()
      }).run(context, {});

      lastBody().resourceMetrics[0].resource.attributes.should.deepEqual([]);
    });

    it('errors when an attribute source resolves to something other than an object', async () => {
      await buildNode({
        resourceAttributesWriteMethod: 'payloadPath',
        resourceAttributesPayloadPath: 'working.notAnObject',
        customMetrics: oneGauge()
      }).run(context, { working: { notAnObject: ['a', 'b'] } }).should.be.rejectedWith({
        message: 'Resource Attributes must resolve to an object.'
      });
      requests.should.have.length(0);
    });
  });

  describe('scope', () => {
    it('defaults the scope name and uses the agent version', async () => {
      await buildNode({ customMetrics: oneGauge() }).run(context, {});
      lastBody().resourceMetrics[0].scopeMetrics[0].scope.should.deepEqual({
        name: 'gea-otel-write',
        version: AGENT_VERSION.version
      });
    });

    // The scope templates render on the way to building the body, well after the
    // metrics and the connection resolve, and error the workflow like any other
    // template on this node that cannot render.
    it('errors when a scope template throws at render time', async () => {
      await buildNode({
        scopeNameTemplate: '{{#each working.rows}}{{this}}{{/each}}',
        customMetrics: oneGauge()
      }).run(context, { working: { rows: Array.from({ length: 4097 }, (_, i) => i) } })
        .should.be.rejectedWith({ message: /Maximum #each iteration count/ });
      requests.should.have.length(0);
    });

    it('honors rendered scope name and version', async () => {
      await buildNode({
        scopeNameTemplate: '{{working.scope}}',
        scopeVersionTemplate: '9.9.9',
        customMetrics: oneGauge()
      }).run(context, { working: { scope: 'my-scope' } });

      lastBody().resourceMetrics[0].scopeMetrics[0].scope.should.deepEqual({
        name: 'my-scope', version: '9.9.9'
      });
    });
  });

  describe('auth', () => {
    it('sends no authorization header for authType none', async () => {
      await buildNode({ authType: 'none', customMetrics: oneGauge() }).run(context, {});
      requests[0].headers.should.not.have.property('authorization');
    });

    it('sends a bearer header', async () => {
      await buildNode({
        authType: 'bearer', bearerTokenTemplate: '{{working.token}}', customMetrics: oneGauge()
      }).run(context, { working: { token: 'secret' } });
      requests[0].headers.authorization.should.equal('Bearer secret');
    });

    it('sends a basic header', async () => {
      await buildNode({
        authType: 'basic', usernameTemplate: 'user', passwordTemplate: 'pass', customMetrics: oneGauge()
      }).run(context, {});
      requests[0].headers.authorization.should.equal(`Basic ${Buffer.from('user:pass').toString('base64')}`);
    });

    // Sending `Bearer ` would turn a misconfigured node into a 401 the workflow
    // has to work backwards from, so an unresolvable credential says so instead.
    it('errors when the bearer token renders blank', async () => {
      await buildNode({
        authType: 'bearer', bearerTokenTemplate: '{{working.missing}}', customMetrics: oneGauge()
      }).run(context, {}).should.be.rejectedWith({ message: 'Missing Bearer Token' });
      requests.should.have.length(0);
    });

    it('errors when the basic username renders blank', async () => {
      await buildNode({ authType: 'basic', customMetrics: oneGauge() })
        .run(context, {}).should.be.rejectedWith({ message: 'Missing Username' });
      requests.should.have.length(0);
    });

    it('errors when a client certificate renders blank under clientCert auth', async () => {
      await buildNode({ authType: 'clientCert', customMetrics: oneGauge() })
        .run(context, {}).should.be.rejectedWith({ message: 'Missing Client Certificate' });
      requests.should.have.length(0);
    });

    it('errors when a certificate path cannot be read', async () => {
      await buildNode({
        authType: 'clientCert',
        clientCertTemplateType: 'diskPath',
        clientCertTemplate: '/no/such/client.crt',
        clientKeyTemplateType: 'diskPath',
        clientKeyTemplate: '/no/such/client.key',
        customMetrics: oneGauge()
      }).run(context, {}).should.be.rejectedWith({ type: 'NotFound', message: 'No file exists at "/no/such/client.crt"' });
      requests.should.have.length(0);
    });

    it('reads stringTemplate certificate PEMs without throwing', async () => {
      // Plain http endpoint, so the TLS options go unused - this asserts the
      // cert-auth branch resolves and still sends, not that TLS negotiated.
      const [, payload] = await buildNode({
        authType: 'clientCert',
        clientCertTemplateType: 'stringTemplate',
        clientCertTemplate: '-----BEGIN CERTIFICATE-----\nx\n-----END CERTIFICATE-----',
        clientKeyTemplateType: 'stringTemplate',
        clientKeyTemplate: '-----BEGIN PRIVATE KEY-----\nx\n-----END PRIVATE KEY-----',
        customMetrics: oneGauge()
      }).run(context, {});

      payload.working.otelResult.should.deepEqual({ success: true, metricCount: 1 });
      requests.should.have.length(1);
    });

    // What the node owns here is the object handed to https.Agent; whether OpenSSL
    // then honors it is Node's business, so these assert the options, not a handshake.
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
      // Outside PROJECT_ROOT_DIR — resolveCert refuses paths inside the agent directory.
      const certPath = path.resolve(os.tmpdir(), 'otel-metrics-spec-client.crt');
      await fs.writeFile(certPath, '-----BEGIN CERTIFICATE-----\nx\n-----END CERTIFICATE-----');
      try {
        const [, payload] = await buildNode({
          authType: 'clientCert',
          clientCertTemplateType: 'diskPath',
          clientCertTemplate: certPath,
          clientKeyTemplateType: 'diskPath',
          clientKeyTemplate: certPath,
          customMetrics: oneGauge()
        }).run(context, {});
        payload.working.otelResult.should.deepEqual({ success: true, metricCount: 1 });
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

    it('reports rejected data points next to the success', async () => {
      respondWith({ rejectedDataPoints: '2', errorMessage: 'timestamp too old' });
      const [, payload] = await buildNode({ customMetrics: oneGauge() }).run(context, {});

      payload.working.otelResult.should.deepEqual({
        success: true,
        metricCount: 1,
        rejectedDataPoints: 2,
        rejectedMessage: 'timestamp too old'
      });
    });

    it('reports a warning that rejected nothing', async () => {
      respondWith({ errorMessage: 'unit is deprecated' });
      const [, payload] = await buildNode({ customMetrics: oneGauge() }).run(context, {});

      payload.working.otelResult.rejectedDataPoints.should.equal(0);
      payload.working.otelResult.rejectedMessage.should.equal('unit is deprecated');
    });

    it('stays a plain success for an empty partialSuccess', async () => {
      respondWith({});
      const [, payload] = await buildNode({ customMetrics: oneGauge() }).run(context, {});
      payload.working.otelResult.should.deepEqual({ success: true, metricCount: 1 });
    });

    it('stays a plain success for an empty body', async () => {
      respond = () => [200, ''];
      const [, payload] = await buildNode({ customMetrics: oneGauge() }).run(context, {});
      payload.working.otelResult.should.deepEqual({ success: true, metricCount: 1 });
    });
  });

  describe('failures', () => {
    it('soft errors on a non-2xx response', async () => {
      respond = () => [500, 'kaboom'];
      const [outputIds, payload] = await buildNode({ customMetrics: oneGauge() }).run(context, {});

      outputIds.should.equal(OUTPUT_IDS);
      payload.working.otelResult.should.deepEqual({
        success: false,
        error: { type: 'OTEL_COLLECTOR_RESPONSE_ERROR', message: 'HTTP 500: kaboom' }
      });
    });

    it('caps how much of a chatty error body lands on the payload', async () => {
      respond = () => [500, 'x'.repeat(5000)];
      const [, payload] = await buildNode({ customMetrics: oneGauge() }).run(context, {});

      payload.working.otelResult.error.message.should.have.length('HTTP 500: '.length + 1024);
    });

    it('soft errors when the collector is unreachable', async () => {
      const downUrl = 'http://down.example.com:4318';
      nock(downUrl).post(METRICS_PATH).replyWithError('ECONNREFUSED');

      const node = buildNode({ collectorUrlTemplate: downUrl, customMetrics: oneGauge() });
      const [, payload] = await node.run(context, {});
      payload.working.otelResult.success.should.equal(false);
      payload.working.otelResult.error.type.should.equal('OTEL_COLLECTOR_REQUEST_ERROR');
      payload.working.otelResult.error.message.should.be.a.String();
    });

    it('soft errors as a timeout when the collector does not respond in time', async () => {
      const slowUrl = 'http://slow.example.com:4318';
      nock(slowUrl).post(METRICS_PATH).delay(200).reply(200, {});

      const [, payload] = await buildNode({ collectorUrlTemplate: slowUrl, customMetrics: oneGauge() })
        .run({ externalTimeout: 50 }, {});
      payload.working.otelResult.should.deepEqual({
        success: false,
        error: {
          type: 'NodeTimeout',
          message: 'Timeout running OpenTelemetry: Metrics Write node'
        }
      });
    });

    // A bad URL is a misconfigured node, not a collector that let us down, so it
    // errors the workflow rather than landing on the payload with the send failures.
    it('errors on a malformed collector url without making a request', async () => {
      await buildNode({
        collectorUrlTemplate: 'not a url', customMetrics: oneGauge()
      }).run(context, {}).should.be.rejectedWith({ type: 'Validation', message: /Invalid URL/ });
      requests.should.have.length(0);
    });

    it('errors on a non-http protocol, so a template cannot switch schemes', async () => {
      await buildNode({
        collectorUrlTemplate: 'ftp://collector.example.com', customMetrics: oneGauge()
      }).run(context, {}).should.be.rejectedWith({ message: /protocol must be http:, https:/ });
      requests.should.have.length(0);
    });

    // The point of the narrow catch: a defect in this node has to crash and be
    // reported, not come back as a collector that was never actually unreachable.
    it('rethrows an untyped error raised during the send rather than reporting it', async () => {
      const brokenContext = { get externalTimeout() { throw new TypeError('not a collector problem'); } };
      await buildNode({ customMetrics: oneGauge() })
        .run(brokenContext, {}).should.be.rejectedWith(TypeError, { message: 'not a collector problem' });
      requests.should.have.length(0);
    });

    // A status code marks one of ours, and those report under their own type
    // rather than as something the collector did.
    it('reports a typed error raised during the send under its own type', async () => {
      const refusingContext = {
        get externalTimeout() { throw errors.Validation({ message: 'Invalid host: nope.example.com' }); }
      };
      const [outputIds, payload] = await buildNode({ customMetrics: oneGauge() }).run(refusingContext, {});

      outputIds.should.equal(OUTPUT_IDS);
      payload.working.otelResult.should.deepEqual({
        success: false,
        error: { type: 'Validation', message: 'Invalid host: nope.example.com' }
      });
      requests.should.have.length(0);
    });

    it('leaves the payload otherwise untouched and always returns its output ids', async () => {
      const [outputIds, payload] = await buildNode({ customMetrics: oneGauge() })
        .run(context, { data: { untouched: true } });
      outputIds.should.equal(OUTPUT_IDS);
      payload.data.should.deepEqual({ untouched: true });
    });

    it('omits the result when no resultPath is configured', async () => {
      const [, payload] = await buildNode({ resultPath: '', customMetrics: oneGauge() }).run(context, {});
      payload.should.deepEqual({});
      requests.should.have.length(1);
    });
  });

  describe('agentConfig connection source', () => {
    it('throws Validation when context has no getOtlpCollectorConfig method', async () => {
      const node = new OtelMetricsWriteNode('id', OUTPUT_IDS, {
        connectionSource: 'agentConfig',
        resultPath: 'working.otelResult',
        customMetrics: oneGauge()
      });

      await node.run(context, {}).should.be.rejectedWith({
        message: 'No OpenTelemetry Collector configuration found in the Edge Agent config.'
      });
      requests.should.have.length(0);
    });

    it('throws Validation when getOtlpCollectorConfig throws unconfigured', async () => {
      const node = new OtelMetricsWriteNode('id', OUTPUT_IDS, {
        connectionSource: 'agentConfig',
        resultPath: 'working.otelResult',
        customMetrics: oneGauge()
      });

      const unconfiguredContext = {
        ...context,
        getOtlpCollectorConfig: () => {
          throw errors.Validation({ message: 'No OpenTelemetry Collector configuration found in the Edge Agent config.' });
        }
      };

      await node.run(unconfiguredContext, {}).should.be.rejectedWith({
        message: 'No OpenTelemetry Collector configuration found in the Edge Agent config.'
      });
      requests.should.have.length(0);
    });

    it('resolves collector url, resource attributes, and headers from agentConfig', async () => {
      const node = new OtelMetricsWriteNode('id', OUTPUT_IDS, {
        connectionSource: 'agentConfig',
        resultPath: 'working.otelResult',
        customMetrics: oneGauge()
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
      payload.working.otelResult.should.deepEqual({ success: true, metricCount: 1 });
      requests.should.have.length(1);
      requests[0].url.should.equal(METRICS_PATH);
      requests[0].headers.should.have.property('authorization', 'Bearer config-token');
      lastBody().resourceMetrics[0].resource.attributes.should.deepEqual([
        { key: 'service.name', value: { stringValue: 'agent-config-service' } }
      ]);
    });

    it('throws Validation when the agent config has no collector url configured', async () => {
      const node = new OtelMetricsWriteNode('id', OUTPUT_IDS, {
        connectionSource: 'agentConfig',
        resultPath: 'working.otelResult',
        customMetrics: oneGauge()
      });

      const emptyConfigContext = {
        ...context,
        getOtlpCollectorConfig: () => ({})
      };

      await node.run(emptyConfigContext, {}).should.be.rejectedWith({
        message: 'No OpenTelemetry Collector configuration found in the Edge Agent config.'
      });
      requests.should.have.length(0);
    });

    it('appends node-level resource attributes after the agent-level ones', async () => {
      const node = new OtelMetricsWriteNode('id', OUTPUT_IDS, {
        connectionSource: 'agentConfig',
        resultPath: 'working.otelResult',
        resourceAttributesWriteMethod: 'individualFields',
        resourceAttributesFields: [{ keyTemplate: 'flow.name', valueTemplate: 'my-flow' }],
        customMetrics: oneGauge()
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
      lastBody().resourceMetrics[0].resource.attributes.should.deepEqual([
        { key: 'service.name', value: { stringValue: 'agent-config-service' } },
        { key: 'flow.name', value: { stringValue: 'my-flow' } }
      ]);
    });

    it('overrides an agent-level resource attribute with a node-level one of the same key', async () => {
      const node = new OtelMetricsWriteNode('id', OUTPUT_IDS, {
        connectionSource: 'agentConfig',
        resultPath: 'working.otelResult',
        resourceAttributesWriteMethod: 'individualFields',
        resourceAttributesFields: [{ keyTemplate: 'service.name', valueTemplate: 'node-level-service' }],
        customMetrics: oneGauge()
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
      lastBody().resourceMetrics[0].resource.attributes.should.deepEqual([
        { key: 'service.name', value: { stringValue: 'node-level-service' } }
      ]);
    });
  });

});

