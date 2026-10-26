import { nock, stubLogger } from './common.js';
import OtlpCollectorManager from '../src/otlp-collector-manager.js';

describe('OtlpCollectorManager', () => {
  it('should report hasConfig false and throw on get when unconfigured', () => {
    const manager = OtlpCollectorManager();
    manager.hasConfig().should.be.false();
    (() => {
      manager.get();
    }).should.throw('No OpenTelemetry Collector configuration found in the Edge Agent config.');
  });

  it('should return normalized url and resource attributes with default auth and tls', () => {
    const manager = OtlpCollectorManager({
      url: 'http://localhost:4318',
      authType: 'none',
      disableSSLVerification: false,
      resourceAttributes: {
        'service.name': 'gea',
        'host.name': 'gateway-01'
      }
    });

    manager.hasConfig().should.be.true();
    const config = manager.get();
    config.url.should.equal('http://localhost:4318');
    config.authHeaders.should.deepEqual({});
    config.agentOptions.should.deepEqual({});
    config.resourceAttrs.should.deepEqual([
      { key: 'service.name', value: { stringValue: 'gea' } },
      { key: 'host.name', value: { stringValue: 'gateway-01' } }
    ]);
  });

  it('should build basic auth header when authType is basic', () => {
    const manager = OtlpCollectorManager({
      url: 'https://collector.example.com',
      authType: 'basic',
      username: 'user1',
      password: 'password1'
    });

    const config = manager.get();
    config.authHeaders.should.have.property('Authorization');
    config.authHeaders.Authorization.should.startWith('Basic ');
    const decoded = Buffer.from(config.authHeaders.Authorization.replace('Basic ', ''), 'base64').toString('utf8');
    decoded.should.equal('user1:password1');
  });

  it('should build bearer token header when authType is bearer', () => {
    const manager = OtlpCollectorManager({
      url: 'https://collector.example.com',
      authType: 'bearer',
      bearerToken: 'my-secret-token'
    });

    const config = manager.get();
    config.authHeaders.should.deepEqual({
      Authorization: 'Bearer my-secret-token'
    });
  });

  it('should configure client cert and key in agentOptions', () => {
    const manager = OtlpCollectorManager({
      url: 'https://collector.example.com',
      authType: 'clientCert',
      clientCert: '---CERT---',
      clientKey: '---KEY---'
    });

    const config = manager.get();
    config.agentOptions.should.deepEqual({
      cert: '---CERT---',
      key: '---KEY---'
    });
  });

  it('should configure ca in agentOptions when caCert is provided', () => {
    const manager = OtlpCollectorManager({
      url: 'https://collector.example.com',
      authType: 'none',
      caCert: '---CA-CERT---'
    });

    const config = manager.get();
    config.agentOptions.should.deepEqual({
      ca: '---CA-CERT---'
    });
  });

  it('should set rejectUnauthorized to false when disableSSLVerification is true', () => {
    const manager = OtlpCollectorManager({
      url: 'https://collector.example.com',
      authType: 'none',
      disableSSLVerification: true,
      caCert: '---CA-CERT---'
    });

    const config = manager.get();
    config.agentOptions.should.deepEqual({
      rejectUnauthorized: false
    });
  });

  it('should preserve literal credentials containing handlebars characters', () => {
    const manager = OtlpCollectorManager({
      url: 'https://collector.example.com',
      authType: 'basic',
      username: 'user{{name}}',
      password: 'p{{a}}ss{{word'
    });

    const config = manager.get();
    const decoded = Buffer.from(config.authHeaders.Authorization.replace('Basic ', ''), 'base64').toString('utf8');
    decoded.should.equal('user{{name}}:p{{a}}ss{{word');

    const bearerManager = OtlpCollectorManager({
      url: 'https://collector.example.com',
      authType: 'bearer',
      bearerToken: 'token{{with}}braces{{'
    });
    bearerManager.get().authHeaders.should.deepEqual({
      Authorization: 'Bearer token{{with}}braces{{'
    });
  });

  describe('automated container metric reporting', () => {
    const baseUrl = 'http://test-collector:4318';
    const conf = {
      url: baseUrl,
      authType: 'bearer',
      bearerToken: 'test-token',
      resourceAttributes: { 'service.name': 'test-agent' }
    };
    let manager;

    afterEach(async () => {
      if (manager) {
        await manager.shutdown();
        manager = null;
      }
    });

    it('should export container metrics to the collector on /v1/metrics', async () => {
      let capturedMetricsBody;

      const scope = nock(baseUrl, {
        reqheaders: {
          'authorization': 'Bearer test-token',
          'content-type': 'application/json'
        }
      })
        .post('/v1/metrics')
        .reply(200, (uri, requestBody) => {
          capturedMetricsBody = typeof requestBody === 'string' ? JSON.parse(requestBody) : requestBody;
          return {};
        });

      manager = OtlpCollectorManager(conf, { enabled: true, intervalSeconds: 60 });

      await manager.initialize();
      await manager.report();

      scope.isDone().should.be.true();
      capturedMetricsBody.should.be.an.Object();
      capturedMetricsBody.resourceMetrics.length.should.equal(1);
      capturedMetricsBody.resourceMetrics[0].resource.attributes.should.deepEqual([
        { key: 'service.name', value: { stringValue: 'test-agent' } }
      ]);
      const metrics = capturedMetricsBody.resourceMetrics[0].scopeMetrics[0].metrics;
      metrics.length.should.be.aboveOrEqual(5);

      const metricNames = metrics.map((m) => m.name);
      metricNames.should.containEql('process.memory.usage');
      metricNames.should.containEql('v8js.memory.heap.used');
      metricNames.should.containEql('process.cpu.time');
      metricNames.should.containEql('process.uptime');

      const cpuMetrics = metrics.filter((m) => m.name === 'process.cpu.time');
      cpuMetrics.length.should.equal(2);
      for (const cpuMetric of cpuMetrics) {
        cpuMetric.sum.should.be.an.Object();
        cpuMetric.sum.dataPoints[0].startTimeUnixNano.should.be.a.String();
        cpuMetric.sum.aggregationTemporality.should.equal(2); // cumulative
        cpuMetric.sum.isMonotonic.should.equal(true);
        cpuMetric.sum.dataPoints[0].attributes.should.containDeep([{ key: 'cpu.mode' }]);
      }
    });

    it('should handle collector HTTP errors gracefully without throwing', async () => {
      const loggerCalls = stubLogger(['warn']);
      const scope = nock(baseUrl)
        .post('/v1/metrics')
        .reply(503, 'Service Unavailable');

      manager = OtlpCollectorManager(conf, { intervalSeconds: 60 });

      await manager.report();
      scope.isDone().should.be.true();
      loggerCalls.length.should.equal(1);
      loggerCalls[0][1].should.containEql('[otlp-collector-manager] Failed to export metrics: HTTP 503');
    });

    it('should handle network errors gracefully without throwing', async () => {
      const loggerCalls = stubLogger(['warn']);
      const scope = nock(baseUrl)
        .post('/v1/metrics')
        .replyWithError('Connection reset by peer');

      manager = OtlpCollectorManager(conf, { intervalSeconds: 60 });

      await manager.report();
      scope.isDone().should.be.true();
      loggerCalls.length.should.equal(1);
      loggerCalls[0][1].should.containEql('[otlp-collector-manager] Failed to export metrics:');
    });

    it('should do nothing when there is no otlpCollector config', async () => {
      const loggerCalls = stubLogger(['warn']);
      manager = OtlpCollectorManager(undefined, { intervalSeconds: 60 });

      await manager.report();
      loggerCalls.length.should.equal(0);
    });

    it('should prevent overlapping executions when report is already in progress', async () => {
      let resolveFirstRequest;
      const firstRequestPromise = new Promise((resolve) => {
        resolveFirstRequest = resolve;
      });

      let postCallCount = 0;
      const scope = nock(baseUrl)
        .post('/v1/metrics')
        .reply(200, async () => {
          postCallCount++;
          await firstRequestPromise;
          return {};
        });

      manager = OtlpCollectorManager(conf, { intervalSeconds: 60 });

      const run1 = manager.report();
      const run2 = manager.report(); // Should be skipped due to isReporting guard

      resolveFirstRequest();
      await Promise.all([run1, run2]);

      scope.isDone().should.be.true();
      postCallCount.should.equal(1);
    });

    it('should be safe to initialize and shut down multiple times', async () => {
      manager = OtlpCollectorManager(conf, { enabled: true, intervalSeconds: 60 });

      await manager.initialize();
      await manager.initialize(); // idempotent
      await manager.shutdown();
      await manager.shutdown(); // idempotent
    });

    it('should use consistent process start time across multiple reports', async () => {
      const startTimes = [];

      nock(baseUrl)
        .post('/v1/metrics')
        .twice()
        .reply(200, (uri, requestBody) => {
          const body = typeof requestBody === 'string' ? JSON.parse(requestBody) : requestBody;
          const metrics = body.resourceMetrics[0].scopeMetrics[0].metrics;
          const cpuMetric = metrics.find((m) => m.name === 'process.cpu.time');
          startTimes.push(cpuMetric.sum.dataPoints[0].startTimeUnixNano);
          return {};
        });

      manager = OtlpCollectorManager(conf, { intervalSeconds: 60 });
      await manager.report();
      await manager.report();
      startTimes.length.should.equal(2);
      startTimes[0].should.equal(startTimes[1]);
    });

    it('should not schedule reports when enabled is false', async () => {
      const scope = nock(baseUrl).post('/v1/metrics').reply(200);

      manager = OtlpCollectorManager(conf, { enabled: false, intervalSeconds: 1 });
      await manager.initialize();
      await new Promise((resolve) => setTimeout(resolve, 50));

      scope.isDone().should.be.false();
    });
  });
});
