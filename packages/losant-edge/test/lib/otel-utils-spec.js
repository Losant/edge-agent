import os from 'node:os';
import path from 'node:path';
import fs from 'fs-extra';
import { tk, should } from '../common.js';
import { PROJECT_ROOT_DIR } from '../../src/constants.js';
import {
  nowNano,
  msToNano,
  timeToNano,
  objToOtlpAttrs,
  resolveAttributes,
  resolveSeverityNumber,
  makeGauge,
  makeSum,
  makeLogRecord,
  readPartialSuccess,
  buildAuthHeader,
  resolveCert
} from '../../src/lib/otel-utils.js';
import { NANOS_PER_MS } from '../../src/lib/otel-constants.js';
import { loadGuardedFile } from '../../src/lib/protected-path-utils.js';

const FROZEN_MS = 1700000000000;
const FROZEN_NANO = '1700000000000000000';

describe('otel-utils', () => {

  describe('nowNano', () => {
    it('returns the current time in nanoseconds as a string', () => {
      tk.freeze(new Date(FROZEN_MS));
      nowNano().should.equal(FROZEN_NANO);
    });
  });

  describe('msToNano', () => {
    it('converts milliseconds to a nanosecond string', () => {
      msToNano(FROZEN_MS).should.equal(FROZEN_NANO);
      msToNano(0).should.equal('0');
    });

    it('accepts numeric strings, as rendered templates always are', () => {
      msToNano(String(FROZEN_MS)).should.equal(FROZEN_NANO);
    });

    it('rounds fractional milliseconds', () => {
      msToNano(1700000000000.4).should.equal(FROZEN_NANO);
    });

    it('throws a validation error rather than a BigInt RangeError', () => {
      (() => msToNano('not-a-number')).should.throw(/Invalid timestamp/);
      (() => msToNano(NaN)).should.throw(/Invalid timestamp/);
      (() => msToNano(undefined)).should.throw(/Invalid timestamp/);
      (() => msToNano(Infinity)).should.throw(/Invalid timestamp/);
    });

    it('rejects negative timestamps, which timeUnixNano cannot represent', () => {
      (() => msToNano(-1)).should.throw(/Invalid timestamp/);
      (() => msToNano('-1700000000000')).should.throw(/Invalid timestamp/);
      (() => msToNano(-Infinity)).should.throw(/Invalid timestamp/);
    });
  });

  describe('timeToNano', () => {
    it('passes epoch milliseconds through', () => {
      timeToNano(FROZEN_MS).should.equal(FROZEN_NANO);
      timeToNano(String(FROZEN_MS)).should.equal(FROZEN_NANO);
    });

    it('reads a ten-digit number as epoch seconds', () => {
      timeToNano(FROZEN_MS / 1000).should.equal(FROZEN_NANO);
      timeToNano('1700000000').should.equal(FROZEN_NANO);
    });

    it('parses a date string, which is what {{time}} renders to', () => {
      timeToNano(new Date(FROZEN_MS).toISOString()).should.equal(FROZEN_NANO);
    });

    it('accepts a Date', () => {
      timeToNano(new Date(FROZEN_MS)).should.equal(FROZEN_NANO);
    });

    it('treats a negative number as an offset back from now', () => {
      tk.freeze(new Date(FROZEN_MS));
      timeToNano(-60000).should.equal(String(BigInt(FROZEN_MS - 60000) * NANOS_PER_MS));
    });

    it('treats zero as now', () => {
      tk.freeze(new Date(FROZEN_MS));
      timeToNano(0).should.equal(FROZEN_NANO);
    });

    // enforceTime would hand back the current time here; a metric quietly
    // stamped "now" is worse than a soft error naming the bad template.
    it('throws rather than falling back to now on unparsable input', () => {
      (() => timeToNano('not-a-date')).should.throw(/Invalid timestamp/);
      (() => timeToNano('')).should.throw(/Invalid timestamp/);
      (() => timeToNano(undefined)).should.throw(/Invalid timestamp/);
    });

    it('rejects a date before the epoch', () => {
      (() => timeToNano('1950-01-01T00:00:00.000Z')).should.throw(/Invalid timestamp/);
    });
  });

  describe('readPartialSuccess', () => {
    it('reads rejected counts out of an object body', () => {
      readPartialSuccess({
        partialSuccess: { rejectedDataPoints: '3', errorMessage: 'too old' }
      }, 'rejectedDataPoints').should.deepEqual({ rejected: 3, rejectedMessage: 'too old' });
    });

    it('reads a json string body', () => {
      readPartialSuccess(
        JSON.stringify({ partialSuccess: { rejectedDataPoints: 1 } }),
        'rejectedDataPoints'
      ).should.deepEqual({ rejected: 1, rejectedMessage: '' });
    });

    it('reports a warning that rejected nothing', () => {
      readPartialSuccess({
        partialSuccess: { errorMessage: 'deprecated field' }
      }, 'rejectedDataPoints').should.deepEqual({ rejected: 0, rejectedMessage: 'deprecated field' });
    });

    // The three shapes a collector uses for a completely successful export.
    it('returns nothing for a full success', () => {
      should(readPartialSuccess({}, 'rejectedDataPoints')).be.undefined();
      should(readPartialSuccess('', 'rejectedDataPoints')).be.undefined();
      should(readPartialSuccess({
        partialSuccess: { rejectedDataPoints: 0, errorMessage: '' }
      }, 'rejectedDataPoints')).be.undefined();
    });

    it('returns nothing for a body it cannot parse', () => {
      should(readPartialSuccess('<html>nope</html>', 'rejectedDataPoints')).be.undefined();
      should(readPartialSuccess(undefined, 'rejectedDataPoints')).be.undefined();
    });
  });

  describe('objToOtlpAttrs', () => {
    it('encodes safe integers as intValue strings', () => {
      objToOtlpAttrs({ count: 42 }).should.deepEqual([{ key: 'count', value: { intValue: '42' } }]);
    });

    it('encodes floats as doubleValue numbers', () => {
      objToOtlpAttrs({ temp: 22.5 }).should.deepEqual([{ key: 'temp', value: { doubleValue: 22.5 } }]);
    });

    it('encodes booleans as boolValue', () => {
      objToOtlpAttrs({ ok: true }).should.deepEqual([{ key: 'ok', value: { boolValue: true } }]);
    });

    it('encodes strings as stringValue', () => {
      objToOtlpAttrs({ id: 'temp-01' }).should.deepEqual([{ key: 'id', value: { stringValue: 'temp-01' } }]);
    });

    it('coerces null and undefined to empty strings', () => {
      objToOtlpAttrs({ a: null, b: undefined }).should.deepEqual([
        { key: 'a', value: { stringValue: '' } },
        { key: 'b', value: { stringValue: '' } }
      ]);
    });

    it('JSON-stringifies arrays and nested objects instead of [object Object]', () => {
      objToOtlpAttrs({ tags: ['a', 'b'], nested: { x: 1 } }).should.deepEqual([
        { key: 'tags', value: { stringValue: '["a","b"]' } },
        { key: 'nested', value: { stringValue: '{"x":1}' } }
      ]);
    });

    // JSON.stringify would give back an ISO string with its quotes inside the
    // value, which is what a payload.time attribute would have exported as.
    it('exports a date as a bare ISO string, not a quoted one', () => {
      objToOtlpAttrs({ time: new Date(FROZEN_MS) }).should.deepEqual([
        { key: 'time', value: { stringValue: '2023-11-14T22:13:20.000Z' } }
      ]);
    });

    it('exports an invalid date as Invalid Date', () => {
      objToOtlpAttrs({ time: new Date('nope') }).should.deepEqual([
        { key: 'time', value: { stringValue: 'Invalid Date' } }
      ]);
    });

    it('falls back to stringValue for non-finite numbers, which have no JSON form', () => {
      objToOtlpAttrs({ a: NaN, b: Infinity }).should.deepEqual([
        { key: 'a', value: { stringValue: 'NaN' } },
        { key: 'b', value: { stringValue: 'Infinity' } }
      ]);
    });

    it('falls back to doubleValue for integers too large to round-trip as int64', () => {
      objToOtlpAttrs({ huge: 1e21 }).should.deepEqual([{ key: 'huge', value: { doubleValue: 1e21 } }]);
    });

    it('returns an empty array for non-object input', () => {
      objToOtlpAttrs(undefined).should.deepEqual([]);
      objToOtlpAttrs(null).should.deepEqual([]);
      objToOtlpAttrs('nope').should.deepEqual([]);
    });
  });

  describe('makeGauge', () => {
    it('builds a gauge metric with a single data point', () => {
      makeGauge({
        name: 'device.temperature',
        description: 'Current reading',
        unit: 'Cel',
        value: 22.5,
        attrObj: { sensor: 'a' },
        timeUnixNano: FROZEN_NANO
      }).should.deepEqual({
        name: 'device.temperature',
        unit: 'Cel',
        description: 'Current reading',
        gauge: {
          dataPoints: [{
            asDouble: 22.5,
            timeUnixNano: FROZEN_NANO,
            attributes: [{ key: 'sensor', value: { stringValue: 'a' } }]
          }]
        }
      });
    });

    it('defaults a blank unit to 1 and omits a blank description', () => {
      const metric = makeGauge({
        name: 'a.metric', description: '', unit: '', value: 1, attrObj: {}, timeUnixNano: FROZEN_NANO
      });
      metric.unit.should.equal('1');
      metric.should.not.have.property('description');
    });
  });

  describe('makeSum', () => {
    const sum = (overrides) => makeSum({
      name: 'a.total', unit: '1', value: 10, attrObj: {}, timeUnixNano: FROZEN_NANO, ...overrides
    }).sum;

    it('defaults to cumulative and monotonic', () => {
      sum().aggregationTemporality.should.equal(2);
      sum().isMonotonic.should.equal(true);
    });

    it('maps delta temporality to 1', () => {
      sum({ aggregationTemporality: 'delta' }).aggregationTemporality.should.equal(1);
    });

    it('respects isMonotonic false', () => {
      sum({ aggregationTemporality: 'cumulative', isMonotonic: false }).isMonotonic.should.equal(false);
    });

    it('includes startTimeUnixNano when provided', () => {
      sum({ startTimeUnixNano: '1690000000000000000' })
        .dataPoints[0].startTimeUnixNano.should.equal('1690000000000000000');
    });

    it('omits the startTimeUnixNano key entirely when blank', () => {
      sum().dataPoints[0].should.not.have.property('startTimeUnixNano');
    });
  });

  describe('resolveSeverityNumber', () => {
    it('accepts a named severity, case-insensitively', () => {
      resolveSeverityNumber('TRACE').should.deepEqual({ severityNumber: 1, severityText: 'TRACE' });
      resolveSeverityNumber('debug').should.deepEqual({ severityNumber: 5, severityText: 'DEBUG' });
      resolveSeverityNumber('Info').should.deepEqual({ severityNumber: 9, severityText: 'INFO' });
      resolveSeverityNumber('Error').should.deepEqual({ severityNumber: 17, severityText: 'ERROR' });
      resolveSeverityNumber('fatal').should.deepEqual({ severityNumber: 21, severityText: 'FATAL' });
    });

    it('accepts WARN and WARNING as the same severity', () => {
      resolveSeverityNumber('WARN').should.deepEqual({ severityNumber: 13, severityText: 'WARN' });
      resolveSeverityNumber('WARNING').should.deepEqual({ severityNumber: 13, severityText: 'WARN' });
    });

    it('trims surrounding whitespace off a named severity', () => {
      resolveSeverityNumber('  error  ').should.deepEqual({ severityNumber: 17, severityText: 'ERROR' });
    });

    it('accepts a bare number 1-24, deriving severityText only for a named anchor', () => {
      resolveSeverityNumber('17').should.deepEqual({ severityNumber: 17, severityText: 'ERROR' });
      resolveSeverityNumber('18').should.deepEqual({ severityNumber: 18, severityText: undefined });
      resolveSeverityNumber('1').should.deepEqual({ severityNumber: 1, severityText: 'TRACE' });
      resolveSeverityNumber('24').should.deepEqual({ severityNumber: 24, severityText: undefined });
    });

    // Per spec, 0 represents an unspecified severity and has no name -
    // https://opentelemetry.io/docs/specs/otel/logs/data-model/#field-severitynumber
    it('accepts 0 as an unspecified severity with no severityText', () => {
      resolveSeverityNumber('0').should.deepEqual({ severityNumber: 0, severityText: undefined });
    });

    it('throws on a number outside 0-24', () => {
      (() => resolveSeverityNumber('25')).should.throw(/Invalid severity/);
      (() => resolveSeverityNumber('-1')).should.throw(/Invalid severity/);
    });

    it('throws on a non-integer number', () => {
      (() => resolveSeverityNumber('9.5')).should.throw(/Invalid severity/);
    });

    // A bare Number() would accept these as 17 and 10 respectively - not what
    // a user typing a severity template means by "a number".
    it('rejects hex and exponential notation rather than parsing them as numbers', () => {
      (() => resolveSeverityNumber('0x11')).should.throw(/Invalid severity/);
      (() => resolveSeverityNumber('1e1')).should.throw(/Invalid severity/);
    });

    it('throws on an unrecognized name rather than falling back to a default', () => {
      (() => resolveSeverityNumber('CRITICAL')).should.throw(/Invalid severity/);
    });

    it('throws when blank', () => {
      (() => resolveSeverityNumber('')).should.throw('Missing Severity');
      (() => resolveSeverityNumber('   ')).should.throw('Missing Severity');
      (() => resolveSeverityNumber(undefined)).should.throw('Missing Severity');
    });
  });

  describe('makeLogRecord', () => {
    const base = {
      body: 'Sensor read failed',
      severityNumber: 17,
      severityText: 'ERROR',
      attrObj: { 'sensor.id': 'temp-01' },
      observedTimeUnixNano: FROZEN_NANO
    };

    it('builds a log record with body, severity, and attributes', () => {
      makeLogRecord(base).should.deepEqual({
        observedTimeUnixNano: FROZEN_NANO,
        severityNumber: 17,
        severityText: 'ERROR',
        body: { stringValue: 'Sensor read failed' },
        attributes: [{ key: 'sensor.id', value: { stringValue: 'temp-01' } }]
      });
    });

    it('includes timeUnixNano and eventName only when provided', () => {
      const record = makeLogRecord({ ...base, timeUnixNano: FROZEN_NANO, eventName: 'my.app.SensorFailed' });
      record.timeUnixNano.should.equal(FROZEN_NANO);
      record.eventName.should.equal('my.app.SensorFailed');
    });

    it('omits timeUnixNano, severityText, and eventName when blank', () => {
      const record = makeLogRecord({ ...base, severityText: undefined, timeUnixNano: undefined, eventName: undefined });
      record.should.not.have.property('timeUnixNano');
      record.should.not.have.property('severityText');
      record.should.not.have.property('eventName');
    });
  });

  describe('buildAuthHeader', () => {
    it('builds a bearer header', () => {
      buildAuthHeader('bearer', { bearerToken: 'secret' }, {}).should.deepEqual({ Authorization: 'Bearer secret' });
    });

    it('renders the credential templates against the payload', () => {
      buildAuthHeader('bearer', { bearerToken: '{{working.token}}' }, { working: { token: 'from-payload' } })
        .should.deepEqual({ Authorization: 'Bearer from-payload' });
    });

    it('builds a basic header', () => {
      buildAuthHeader('basic', { username: 'user', password: 'pass' }, {}).should.deepEqual({
        Authorization: `Basic ${Buffer.from('user:pass').toString('base64')}`
      });
    });

    it('encodes an empty password rather than the string "undefined"', () => {
      buildAuthHeader('basic', { username: 'user' }, {}).should.deepEqual({
        Authorization: `Basic ${Buffer.from('user:').toString('base64')}`
      });
    });

    it('returns no header for none', () => {
      buildAuthHeader('none', {}, {}).should.deepEqual({});
      buildAuthHeader().should.deepEqual({});
    });

    // Sending the header anyway would turn a misconfigured node into a 401 the
    // workflow has to work backwards from, so a blank credential says so instead.
    it('throws when the credential renders blank', () => {
      (() => buildAuthHeader('bearer', { bearerToken: '' }, {})).should.throw('Missing Bearer Token');
      (() => buildAuthHeader('bearer', { bearerToken: '{{working.missing}}' }, {})).should.throw('Missing Bearer Token');
      (() => buildAuthHeader('basic', { username: '' }, {})).should.throw('Missing Username');
    });

    // A padded token is a copy-paste artifact, and sending it would only turn a
    // misconfigured node into a 401 the workflow has to work backwards from.
    it('trims the credentials that have a required check', () => {
      buildAuthHeader('bearer', { bearerToken: '  secret\n' }, {})
        .should.deepEqual({ Authorization: 'Bearer secret' });
      buildAuthHeader('basic', { username: ' user ', password: 'pass' }, {})
        .should.deepEqual({ Authorization: `Basic ${Buffer.from('user:pass').toString('base64')}` });
    });

    it('counts a whitespace-only credential as missing', () => {
      (() => buildAuthHeader('bearer', { bearerToken: '   ' }, {})).should.throw('Missing Bearer Token');
      (() => buildAuthHeader('basic', { username: ' \n' }, {})).should.throw('Missing Username');
    });

    // The one credential with no required check, and the one where surrounding
    // whitespace could plausibly be part of the secret.
    it('leaves the password exactly as rendered', () => {
      buildAuthHeader('basic', { username: 'user', password: ' pass ' }, {})
        .should.deepEqual({ Authorization: `Basic ${Buffer.from('user: pass ').toString('base64')}` });
    });

    // The point of taking templates rather than rendered strings: a broken
    // template on a field the chosen authType does not use must not fail the run.
    it('does not render the credentials the chosen authType does not use', () => {
      const throwingTemplate = '{{#each working.rows}}{{this}}{{/each}}';
      const payload = { working: { rows: Array.from({ length: 4097 }, (_, i) => i), token: 'ok' } };

      buildAuthHeader('bearer', { bearerToken: '{{working.token}}', username: throwingTemplate, password: throwingTemplate }, payload)
        .should.deepEqual({ Authorization: 'Bearer ok' });
      buildAuthHeader('none', { bearerToken: throwingTemplate }, payload).should.deepEqual({});
    });
  });

  describe('resolveCert', () => {
    // Deliberately outside PROJECT_ROOT_DIR. The agent directory is off limits
    // to cert paths, and a real user cert would live outside it too.
    const pemPath = path.resolve(os.tmpdir(), 'otel-utils-spec-client.crt');
    const emptyPemPath = path.resolve(os.tmpdir(), 'otel-utils-spec-empty.crt');
    const blankPemPath = path.resolve(os.tmpdir(), 'otel-utils-spec-blank.crt');
    // Both live outside the agent directory; only their targets differ.
    const symlinkPath = path.resolve(os.tmpdir(), 'otel-utils-spec-link.crt');
    const danglingLinkPath = path.resolve(os.tmpdir(), 'otel-utils-spec-dangling.crt');
    // A real file inside PROJECT_ROOT_DIR, so realpath has something to resolve to.
    const protectedTarget = path.resolve(PROJECT_ROOT_DIR, 'package.json');
    const pem = '-----BEGIN CERTIFICATE-----\nnot-a-real-cert\n-----END CERTIFICATE-----\n';
    const context = { diskUtils: { loadGuardedFile } };

    before(async () => {
      await fs.writeFile(pemPath, pem);
      await fs.writeFile(emptyPemPath, '');
      await fs.writeFile(blankPemPath, ' \n\t\n');
      await fs.ensureSymlink(protectedTarget, symlinkPath);
      await fs.symlink(path.resolve(os.tmpdir(), 'otel-utils-spec-no-such-target'), danglingLinkPath);
    });

    after(async () => {
      await fs.remove(pemPath);
      await fs.remove(emptyPemPath);
      await fs.remove(blankPemPath);
      await fs.remove(symlinkPath);
      await fs.remove(danglingLinkPath);
    });

    it('returns the rendered template as the PEM in stringTemplate mode', async () => {
      (await resolveCert('stringTemplate', '{{working.cert}}', { working: { cert: pem } })).should.equal(pem);
    });

    it('reads the PEM off disk in diskPath mode', async () => {
      (await resolveCert('diskPath', '{{working.certPath}}', { working: { certPath: pemPath } }, context)).should.equal(pem);
    });

    it('trims surrounding whitespace off a rendered path', async () => {
      (await resolveCert('diskPath', `  ${pemPath}\n`, {}, context)).should.equal(pem);
    });

    it('returns undefined for a blank or whitespace-only template', async () => {
      should.not.exist(await resolveCert('stringTemplate', '', {}));
      should.not.exist(await resolveCert('diskPath', '{{working.missing}}', {}, context));
      should.not.exist(await resolveCert('diskPath', '   ', {}, context));
    });

    it('returns undefined for an empty or whitespace-only file on disk', async () => {
      should.not.exist(await resolveCert('diskPath', emptyPemPath, {}, context));
      should.not.exist(await resolveCert('diskPath', blankPemPath, {}, context));
    });

    it('rejects with a typed error when the path does not exist', async () => {
      await resolveCert('diskPath', '/no/such/otel-cert.pem', {}, context)
        .should.be.rejectedWith({ type: 'NotFound', message: 'No file exists at "/no/such/otel-cert.pem"' });
    });

    it('rejects when the path is a directory', async () => {
      await resolveCert('diskPath', os.tmpdir(), {}, context)
        .should.be.rejectedWith({ type: 'NotFound', message: 'The provided disk path is a directory.' });
    });

    it('refuses to read a path inside the protected agent directory', async () => {
      await resolveCert('diskPath', path.resolve(PROJECT_ROOT_DIR, 'losant-edge-agent-config.toml'), {}, context)
        .should.be.rejectedWith(/protected Losant Edge Agent directory/);
    });

    it('refuses a traversal that resolves back into the agent directory', async () => {
      // Starts at tmpdir and walks back in via '..', so the raw string does not
      // begin with PROJECT_ROOT_DIR — only resolving it first catches this.
      const target = path.resolve(PROJECT_ROOT_DIR, 'losant-edge-agent-config.toml');
      // Concatenated, not path.join'd — join would normalize the '..' away.
      const traversal = `${os.tmpdir()}${path.sep}${path.relative(os.tmpdir(), target)}`;
      traversal.should.containEql('..');
      await resolveCert('diskPath', traversal, {}, context)
        .should.be.rejectedWith(/protected Losant Edge Agent directory/);
    });

    // The lexical guard passes here - the link itself is in tmpdir - so only
    // resolving it with realpath first catches where it actually points.
    it('refuses a symlink whose target is inside the protected agent directory', async () => {
      await resolveCert('diskPath', symlinkPath, {}, context)
        .should.be.rejectedWith(/protected Losant Edge Agent directory/);
    });

    it('refuses a dangling symlink', async () => {
      await resolveCert('diskPath', danglingLinkPath, {}, context)
        .should.be.rejectedWith({ type: 'NotFound', message: `No file exists at "${danglingLinkPath}"` });
    });

    it('does not apply the disk-path guard to stringTemplate PEMs', async () => {
      const templateLookingLikeAPath = path.resolve(PROJECT_ROOT_DIR, 'losant-edge-agent-config.toml');
      (await resolveCert('stringTemplate', templateLookingLikeAPath, {})).should.equal(templateLookingLikeAPath);
    });
  });

  describe('resolveAttributes', () => {
    const resolve = (overrides) => resolveAttributes({ payload: {}, title: 'Attributes', ...overrides });

    it('renders individual fields into a flat object', () => {
      resolve({
        writeMethod: 'individualFields',
        fields: [
          { keyTemplate: 'sensor.id', valueTemplate: '{{working.id}}' },
          { keyTemplate: 'unit.{{working.suffix}}', valueTemplate: 'Cel' }
        ],
        payload: { working: { id: 'temp-01', suffix: 'name' } }
      }).should.deepEqual({ 'sensor.id': 'temp-01', 'unit.name': 'Cel' });
    });

    it('renders field values typed', () => {
      resolve({
        writeMethod: 'individualFields',
        fields: [
          { keyTemplate: 'count', valueTemplate: '{{working.count}}' },
          { keyTemplate: 'ratio', valueTemplate: '{{working.ratio}}' },
          { keyTemplate: 'ok', valueTemplate: '{{working.ok}}' },
          { keyTemplate: 'label', valueTemplate: 'v{{working.count}}' }
        ],
        payload: { working: { count: 42, ratio: 1.5, ok: true } }
      }).should.deepEqual({ count: 42, ratio: 1.5, ok: true, label: 'v42' });
    });

    it('drops fields whose value renders undefined', () => {
      resolve({
        writeMethod: 'individualFields',
        fields: [
          { keyTemplate: 'missing', valueTemplate: '{{working.nope}}' },
          { keyTemplate: 'kept', valueTemplate: 'yes' }
        ]
      }).should.deepEqual({ kept: 'yes' });
    });

    it('trims rendered keys and drops whitespace-only ones', () => {
      resolve({
        writeMethod: 'individualFields',
        fields: [
          { keyTemplate: '  sensor.id  ', valueTemplate: 'temp-01' },
          { keyTemplate: '   ', valueTemplate: 'dropped' }
        ]
      }).should.deepEqual({ 'sensor.id': 'temp-01' });
    });

    it('skips fields whose key renders blank', () => {
      resolve({
        writeMethod: 'individualFields',
        fields: [
          { keyTemplate: '{{working.missing}}', valueTemplate: 'dropped' },
          { keyTemplate: 'kept', valueTemplate: 'yes' }
        ]
      }).should.deepEqual({ kept: 'yes' });
    });

    it('returns an empty object when there are no fields', () => {
      resolve({ writeMethod: 'individualFields' }).should.deepEqual({});
      resolve({ writeMethod: 'individualFields', fields: [] }).should.deepEqual({});
    });

    it('parses a json template', () => {
      resolve({
        writeMethod: 'jsonTemplate',
        jsonTemplate: '{ "count": {{working.count}}, "ok": true }',
        payload: { working: { count: 42 } }
      }).should.deepEqual({ count: 42, ok: true });
    });

    it('reads an object off a payload path', () => {
      resolve({
        writeMethod: 'payloadPath',
        payloadPath: 'working.attrs',
        payload: { working: { attrs: { 'host.name': 'gateway-01' } } }
      }).should.deepEqual({ 'host.name': 'gateway-01' });
    });

    it('treats an unconfigured source as no attributes', () => {
      resolve({ writeMethod: 'jsonTemplate', jsonTemplate: '' }).should.deepEqual({});
      resolve({ writeMethod: 'payloadPath', payloadPath: 'working.missing' }).should.deepEqual({});
    });

    // A source that resolves to something other than an object is a misconfigured
    // node, not an absence of attributes, so it errors the workflow.
    it('throws when the source resolves to something other than an object', () => {
      (() => resolve({ writeMethod: 'jsonTemplate', jsonTemplate: '["a", "b"]' }))
        .should.throw('Attributes must resolve to an object.');
      (() => resolve({
        writeMethod: 'payloadPath', payloadPath: 'working.str', payload: { working: { str: 'nope' } }
      })).should.throw('Attributes must resolve to an object.');
    });

    it('throws on invalid json', () => {
      (() => resolve({ writeMethod: 'jsonTemplate', jsonTemplate: '{ not json' })).should.throw();
    });
  });

});
