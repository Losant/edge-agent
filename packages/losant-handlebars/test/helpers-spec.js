import { tk } from './common.js';
import helpers from '../src/helpers.js';
import should from 'should';
import { difference } from 'omnibelt';
import hb from 'handlebars';
import helperDescriptions from '../src/helper-descriptions.js';
import wrapperHelpers from '../src/wrapper.js';

const { SafeString } = hb;

describe('Helpers', () => {

  it('should have every helper in the description list', () => {
    const blockHelpers = [
      'each', 'eq', 'gt', 'gte', 'if', 'includes',
      'lt', 'lte', 'match', 'ne', 'unless', 'with'
    ];
    // except for log which we always disable
    const builtInHelpers = [ 'if', 'unless', 'with' ];

    const descriptionKeys = Object.keys(helperDescriptions).sort();
    const helperKeys = [...Object.keys(helpers), ...builtInHelpers].sort();
    const nonBlockHelperKeys = Object.entries(wrapperHelpers.nonBlockHelpers).filter(([, v]) => v).map(([k]) => k).sort();

    descriptionKeys.should.deepEqual(helperKeys);
    nonBlockHelperKeys.should.deepEqual(difference(helperKeys, blockHelpers));
  });

  it('should match correctly', () => {
    const options = { fn: () => true, inverse: () => false };
    helpers.match(options).should.equal(true);
    helpers.match('abcdef', options).should.equal(true);
    helpers.match('abcdef', '/abc(?=def)/', options).should.equal(false);
    helpers.match('abcdef', '^(abc).*', options).should.equal(true);
    helpers.match('1234', '\\d+', options).should.equal(true);
    helpers.match('abcdef', '/abc(?=def)/', 'extra', 'args', 'ignored', options).should.equal(false);
    helpers.match('abcdef', '^(abc).*', 'extra', 'args', 'ignored', options).should.equal(true);
  });

  it('should include correctly', () => {
    const options = { fn: () => 'fn', inverse: () => 'inverse' };
    helpers.includes(options).should.equal('inverse');
    helpers.includes('aaaa', options).should.equal('inverse');
    helpers.includes('aaaa', 'b', options).should.equal('inverse');
    helpers.includes('aaaa', 'a', options).should.equal('fn');
    helpers.includes(['one', 'two'], 'three', options).should.equal('inverse');
    helpers.includes(['one', 'two'], 'one', options).should.equal('fn');
    helpers.includes(['one', 'two'], 'three', 'extra', 'args', 'ignored', options).should.equal('inverse');
    helpers.includes(['one', 'two'], 'one', 'extra', 'args', 'ignored', options).should.equal('fn');
    helpers.includes('', false, options).should.equal('inverse');
    helpers.includes(false, '', options).should.equal('inverse');
    helpers.includes(false, false, options).should.equal('inverse');
    helpers.includes(null, null, options).should.equal('inverse');
    helpers.includes(0, 0, options).should.equal('inverse');
    helpers.includes({ a: 'b' }, 'b', options).should.equal('fn');
    helpers.includes({ a: 'b' }, 'c', options).should.equal('inverse');
    helpers.includes({ a: '0' }, 0, options).should.equal('inverse');
    helpers.includes('false', false, options).should.equal('fn');
    helpers.includes([0], 0, options).should.equal('fn');
    helpers.includes('0', 0, options).should.equal('fn');
    helpers.includes('', '', options).should.equal('fn');

    // behavior that I'm not sure I agree with, but it is now legacy behavior
    helpers.includes([null], null, options).should.equal('inverse');
    helpers.includes([undefined], undefined, options).should.equal('inverse');
  });

  it('should jsonEncode correctly', () => {
    helpers.jsonEncode({ a: 'b' }, {}).string.should.equal('{"a":"b"}');

    // these are proving other helpers deal with jsonEncode's "SafeString" result properly
    helpers.jsonEncode(helpers.jsonEncode({ a: 'b' }, {}), {}).string.should.equal('"{\\"a\\":\\"b\\"}"');
    helpers.jsonEncode(helpers.format({ a: 'b' }, {}), {}).string.should.equal('"{\\n  \\"a\\": \\"b\\"\\n}"');
    helpers.last(helpers.jsonEncode({ a: 'b' }, {}), {}).should.equal('}');
    helpers.merge(helpers.jsonEncode(1, {}), {}).should.deepEqual({ 0: '1' });
    helpers.array(helpers.jsonEncode(1, {}), {}).should.deepEqual([ '1' ]);
    helpers.obj({ hash: { a: helpers.jsonEncode(1, {}) } }).should.deepEqual({ a: '1' });
    helpers.jsonDecode(helpers.jsonEncode({ a: 'b' }, {}), {}).should.deepEqual({ a: 'b' });
    helpers.dashboardUrl(helpers.jsonEncode(1, {}), { hash: { a: helpers.jsonEncode(2, {}) } }).string.should.equal('https://app.losant.com/dashboards/1?a=2');
  });

  it('should base64 correctly', () => {
    helpers.encodeBase64('hello', {}).should.equal('aGVsbG8=');
    helpers.decodeBase64('aGVsbG8=', {}).should.equal('hello');
  });

  it('should default values', () => {
    helpers.defaultTo('abc', 'def', {}).should.equal('abc');
    helpers.defaultTo(' ', 'def', {}).should.equal(' ');
    helpers.defaultTo(0, 'def', {}).should.equal(0);
    helpers.defaultTo({}, 'def', {}).should.deepEqual({});
    helpers.defaultTo([], 'def', {}).should.deepEqual([]);
    helpers.defaultTo(undefined, 'def', {}).should.equal('def');
    helpers.defaultTo(null, 'def', {}).should.equal('def');
    helpers.defaultTo('', 'def', {}).should.equal('def');
  });

  it('should min/max correctly', () => {
    helpers.min(10, 20, {}).should.equal(10);
    helpers.min(21, 11, {}).should.equal(11);
    helpers.max(12, 22, {}).should.equal(22);
    helpers.max(23, 13, {}).should.equal(23);

    (helpers.min({}) === undefined).should.be.true();
    (helpers.max({}) === undefined).should.be.true();

    helpers.min('10', 'za', {}).should.equal('10');
    helpers.min('zb', '11', {}).should.equal('11');
    helpers.max('12', 'zc', {}).should.equal('zc');
    helpers.max('zd', '13', {}).should.equal('zd');
  });

  it('should ceil/floor correctly', () => {
    helpers.ceil(10, {}).should.equal(10);
    helpers.ceil(10.5, {}).should.equal(11);
    helpers.ceil(-10.5, {}).should.equal(-10);
    helpers.ceil('10.5', {}).should.equal(11);
    helpers.ceil('nope', {}).should.be.NaN();
    helpers.ceil(true, {}).should.equal(1);
    helpers.ceil(false, {}).should.equal(0);
    helpers.ceil(null, {}).should.equal(0);
    helpers.ceil({}, {}).should.be.NaN();
    helpers.ceil({}).should.be.NaN();

    helpers.floor(10, {}).should.equal(10);
    helpers.floor(10.5, {}).should.equal(10);
    helpers.floor(-10.5, {}).should.equal(-11);
    helpers.floor('10.5', {}).should.equal(10);
    helpers.floor('nope', {}).should.be.NaN();
    helpers.floor(true, {}).should.equal(1);
    helpers.floor(false, {}).should.equal(0);
    helpers.floor(null, {}).should.equal(0);
    helpers.floor({}, {}).should.be.NaN();
    helpers.floor({}).should.be.NaN();
  });

  it('should valueByKey and indexByKey simple fields correctly', () => {
    const tagArray = [{ key: 'one', value: 'two' }, { key: 'three', value: 'four' }];
    helpers.valueByKey(tagArray, 'three', {}).should.equal('four');
    helpers.valueByKey(tagArray, 'one', {}).should.equal('two');
    should(helpers.valueByKey(tagArray, 'two', {})).be.undefined();
    helpers.valueByKey(tagArray, 'four', 'value', 'key', {}).should.equal('three');
    helpers.valueByKey(tagArray, 'two', 'value', 'key', {}).should.equal('one');
    should(helpers.valueByKey(tagArray, 'one', 'value', 'key', {})).be.undefined();

    helpers.indexByKey(tagArray, 'three', {}).should.equal(1);
    helpers.indexByKey(tagArray, 'one', {}).should.equal(0);
    helpers.indexByKey(tagArray, 'two', {}).should.equal(-1);
    helpers.indexByKey(tagArray, 'four', 'value', 'key', {}).should.equal(1);
    helpers.indexByKey(tagArray, 'two', 'value', 'key', {}).should.equal(0);
    helpers.indexByKey(tagArray, 'one', 'value', 'key', {}).should.equal(-1);
  });

  it('should valueByKey and indexByKey edge cases correctly', () => {
    should(helpers.valueByKey(undefined, 'three', {})).be.undefined();
    should(helpers.valueByKey([], 'three', {})).be.undefined();
    should(helpers.valueByKey(1, 'three', {})).be.undefined();
    should(helpers.valueByKey({}, 'three', {})).be.undefined();
    helpers.valueByKey(['a', 'b', 'c'], 'b', '.', '.', {}).should.equal('b');
    should.throws(() => {
      helpers.valueByKey(['a'], 'c', 'this is a bad path', {});
    }, /InvalidPayloadPathError/);
    should.throws(() => {
      helpers.valueByKey(['a'], 'a', '.', 'this is a bad path', {});
    }, /InvalidPayloadPathError/);

    helpers.indexByKey(undefined, 'three', {}).should.equal(-1);
    helpers.indexByKey([], 'three', {}).should.equal(-1);
    helpers.indexByKey(1, 'three', {}).should.equal(-1);
    helpers.indexByKey({}, 'three', {}).should.equal(-1);
    helpers.indexByKey(['a', 'b', 'c'], 'b', '.', {}).should.equal(1);
    should.throws(() => {
      helpers.indexByKey(['a'], 'c', 'this is a bad path', {});
    }, /InvalidPayloadPathError/);
  });

  it('should valueByKey and indexByKey with deep fields correctly', () => {
    const objArray = [ {
      id: 1,
      name: 'Luke Skywalker',
      race: 'Human',
      age: 38,
      father: {
        name: 'Darth Vader',
        relationship: 'strained',
        xRef: 2
      },
      affiliation: ['Jedi', 'Rebels']
    }, {
      id: 2,
      name: 'Darth Vader',
      race: 'Human',
      age: 58,
      father: {
        name: 'Unknown',
        relationship: 'mysterious',
        xRef: -1
      },
      affiliation: ['Sith', 'Empire']
    } ];

    helpers.valueByKey(objArray, 'Darth Vader', 'father.name', 'father.relationship', {}).should.equal('strained');
    should(helpers.valueByKey(objArray, 'Barf Vader', 'father.name', 'father.relationship', {})).be.undefined();
    helpers.valueByKey(objArray, 58, 'age', '.', {}).should.deepEqual(objArray[1]);
    helpers.valueByKey(objArray, ['Jedi', 'Rebels'], 'affiliation', 'father', {}).should.deepEqual(objArray[0].father);

    helpers.indexByKey(objArray, 'Darth Vader', 'father.name', {}).should.equal(0);
    helpers.indexByKey(objArray, 'Barf Vader', 'father.name', {}).should.equal(-1);
    helpers.indexByKey(objArray, 58, 'age', {}).should.equal(1);
    helpers.indexByKey(objArray, ['Jedi', 'Rebels'], 'affiliation', {}).should.equal(0);
  });

  it('should format correctly', () => {
    helpers.format(1234.5678, {}).should.equal('1,234.57');
    helpers.format(1234.5678, { hash: { locale: 'pt' } }).should.equal('1.234,57');
    helpers.format(new Date(0), {}).should.equal('01/01/1970 12:00:00 AM');
    helpers.formatDate(new Date(0), {}).should.equal('01/01/1970 12:00:00 AM');
    helpers.formatDate('20241212', {}).should.equal('12/12/2024 12:00:00 AM');
    helpers.formatDate(20241212, {}).should.equal('01/01/1970 5:37:21 AM');
    helpers.formatDate('123412341234', {}).should.equal('11/29/1973 9:12:21 AM');
    helpers.formatDate(123412341234, {}).should.equal('11/29/1973 9:12:21 AM');
    String(helpers.format({ a: ['b'] }, {})).should.equal('{\n  "a": [\n    "b"\n  ]\n}');
    helpers.formatDateRelative(new Date(0), new Date(1), null, {}).should.equal('a few seconds ago');
    helpers.formatDateRelative('123412341234', '223412341234', null, {}).should.equal('3 years ago');
    helpers.formatDateRelative(123412341234, 223412341234, null, {}).should.equal('3 years ago');
    helpers.formatDateRelative('20241212', '20241213', {}).should.equal('a day ago');
    helpers.formatDateRelative(20241212, 20241213, {}).should.equal('a few seconds ago');
    helpers.formatDateRelative(new Date(Date.now() - 60*60*1000).toISOString(), undefined, {}).should.equal('an hour ago');
    String(helpers.format(new SafeString('hello'), {})).should.equal('hello');

    helpers.formatDate(new Date(0), { hash: { locale: 'pt', tz: 'EST' } }).should.equal('31/12/1969 19:00:00');
    helpers.formatDate('2024-05-23T14:51:39.225Z', { hash: { locale: 'en', tz: 'EST' } }).should.equal('05/23/2024 9:51:39 AM');
    helpers.formatDate('2024-05-23T14:51:39.225Z', { hash: { locale: 'pt', tz: 'America/New_York' } }).should.equal('23/05/2024 10:51:39');

    helpers.formatDate('2024-05-23T14:51:39.225Z', { hash: { locale: 'not a locale', tz: 'not a time zone' } }).should.equal('05/23/2024 2:51:39 PM');
    helpers.formatDate('2024-05-23T14:51:39.225Z', { hash: { locale: -5, tz: -5 } }).should.equal('05/23/2024 2:51:39 PM');

    helpers.formatDateRelative(new Date(Date.now() - 60*60*1000).toISOString(), undefined, { hash: { locale: 'pt' } }).should.equal('há uma hora');
  });

  it('should get current time correctly', () => {
    tk.freeze(new Date('2024-05-23T15:06:52.090Z'));
    helpers.currentDateTime({}).should.equal('05/23/2024 3:06:52 PM');
    helpers.currentDateTime('x', {}).should.equal('1716476812090');
    helpers.currentDateTime({ hash: { locale: 'pt', tz: 'America/New_York' } }).should.equal('23/05/2024 11:06:52');
  });

  it('should properly query string encode', () => {
    // ensure none of these should explode (but they are meaningless)
    helpers.queryStringEncode({}).should.equal('');
    helpers.queryStringEncode(null, {}).should.equal('');
    helpers.queryStringEncode(undefined, {}).should.equal('');
    helpers.queryStringEncode('1', {}).should.equal('');
    helpers.queryStringEncode(1, {}).should.equal('');

    helpers.queryStringEncode({}, {}).should.equal('');
    helpers.queryStringEncode([], {}).should.equal('');
    helpers.queryStringEncode({ a: 'b', c: ['d', 1] }, {}).should.equal('a=b&c%5B0%5D=d&c%5B1%5D=1');
  });

  it('should distance correctly', () => {
    helpers.gpsDistance('', '', {}).should.be.false();
    helpers.gpsDistance({}).should.be.false();
    helpers.gpsDistance({}, {}, {}).should.be.false();
    helpers.gpsDistance({ latitude: 37.33233333, longitude: -122.03121667 },
      '$GPGGA,123519,4807.038,N,01131.000,E,1,08,0.9,545.4,M,46.9,M,,*47', {}).should.equal(9484014);
    helpers.gpsDistance('$GPGLL,3719.940,N,12201.873,S,225444,A,*1C',
      { latitude: 48.1173, longitude: 11.51666667 }, {}).should.equal(9484014);
    helpers.gpsDistance('48.1173,11.51666667', '47.1173,11.51666667', {}).should.equal(111183);
  });

  it('should format gps', () => {
    helpers.formatGps('', {}).should.equal('');
    helpers.formatGps({}).should.equal('');
    helpers.formatGps({}, {}).should.equal('');
    helpers.formatGps({ latitude: 37.33233333, longitude: -122.03121667 }, {}).should.equal('37.332333, -122.031217');
    helpers.formatGps({ latitude: 37.33233333, longitude: -122.03121667 }, 'decimal', 2, {}).should.equal('37.33, -122.03');
    helpers.formatGps({ latitude: 37.33233333, longitude: -122.03121667 }, 'decimal', 0, {}).should.equal('37, -122');
    helpers.formatGps('$GPGLL,3719.940,N,12201.873,S,225444,A,*1C', ' dEgreeS', {}).should.equal('37° 19\' 56.3988" N, 122° 01\' 52.3812" W');
    helpers.formatGps('-1,2', 'degrees', {}).should.equal('1° 00\' 00.0" S, 2° 00\' 00.0" E');
    helpers.formatGps('1° 00\' 00" S, 2° 00\' 00" E', {}).should.equal('-1, 2');
  });

  it('should point inside correctly', () => {
    helpers.gpsIsPointInside({}).should.be.false();
    helpers.gpsIsPointInside('', '', {}).should.be.false();
    helpers.gpsIsPointInside('', [], {}).should.be.false();
    helpers.gpsIsPointInside({}, [], {}).should.be.false();
    helpers.gpsIsPointInside({ latitude: -77, longitude: 44 }, [
      { latitude: -81, longitude: 41 },
      { latitude: -81, longitude: 47 },
      { latitude: -72, longitude: 47 },
      { latitude: -72, longitude: 41 }
    ], {}).should.be.true();
    helpers.gpsIsPointInside({ latitude: -65, longitude: 44 }, [
      { latitude: -81, longitude: 41 },
      { latitude: -81, longitude: 47 },
      { latitude: -72, longitude: 47 },
      { latitude: -72, longitude: 41 }
    ], {}).should.be.false();
  });

  it('should join correctly', () => {
    helpers.join(['a', 1], '', {}).should.equal('a,1');
    helpers.join(['b', 2], ';', {}).should.equal('b;2');
    helpers.join('what', ';', {}).should.equal('what');
  });

  it('should trim correctly', () => {
    helpers.trim(' a ', {}).should.equal('a');
    helpers.join('123abc456', {}).should.equal('123abc456');
  });

  it('should scale correctly', () => {
    helpers.scaleLinear(0, 10, -1, 1, 5, {}).should.equal(0);
    helpers.scaleLinear(1, 50, 50, 1, 3, {}).should.equal(48);
    helpers.scaleLinear(0, 50, 0, -100, 6, {}).should.equal(-12);
  });

  it('should last correctly', async () => {
    helpers.last([1, 2, 3, 4], {}).should.equal(4);
    helpers.last('hello', {}).should.equal('o');
    should(helpers.last(1, {})).be.undefined();
    should(helpers.last([], {})).be.undefined();
    should(helpers.last(undefined, {})).be.undefined();
  });

  it('should typeof correctly', () => {
    helpers.typeof(0, {}).should.equal('number');
    helpers.typeof('0', {}).should.equal('string');
    helpers.typeof(new SafeString('0'), {}).should.equal('string');
    helpers.typeof(true, {}).should.equal('boolean');
    helpers.typeof([], {}).should.equal('array');
    helpers.typeof(new Date(), {}).should.equal('date');
    helpers.typeof(undefined, {}).should.equal('undefined');
    helpers.typeof(null, {}).should.equal('null');
    helpers.typeof({}, {}).should.equal('object');
    // moves first arg to second, leaves first as undefined
    helpers.typeof({}).should.equal('undefined');
  });

  it('should toHtml correctly', () => {
    String(helpers.toHtml({})).should.equal('');
    String(helpers.toHtml({}, {})).should.equal('');
    String(helpers.toHtml([
      {
        type: 'element',
        name: 'status',
        children: [ { type: 'text', value: 'created' } ]
      }
    ], {})).should.equal('<status>created</status>');
    String(helpers.toHtml([
      {
        type: 'element',
        name: 'status',
        children: [ { type: 'text', value: 'created' } ]
      },
      {
        type: 'element',
        name: 'hello',
        children: [ { type: 'cdata', value: 'destroyed' } ]
      }
    ], {})).should.equal('<status>created</status><hello><![CDATA[destroyed]]></hello>');

    String(helpers.toHtml({
      children: [
        {
          type: 'element',
          name: 'author',
          attributes: { id: 'uniq' },
          children: [
            {
              type: 'element',
              name: 'name',
              children: [
                { type: 'text', value: 'John Doe' },
                { type: 'comment', value: 'the comment' }
              ]
            }
          ]
        }
      ]
    }, {})).should.equal('<author id="uniq"><name>John Doe<!--the comment--></name></author>');

    String(helpers.toHtml({
      doctype: 'html',
      children: [
        {
          type: 'element',
          name: 'html',
          children: [
            {
              type: 'element',
              name: 'body',
              children: [ { type: 'text', value: 'hello' } ]
            } ]
        } ]
    }, {})).should.equal('<!DOCTYPE html>\n<html><body>hello</body></html>');
  });

  it('should array correctly', async () => {
    // last argument is always the handlebars options argument
    helpers.array({ }).should.deepEqual([ ]);
    helpers.array(1, 2, 3, 4, { }).should.deepEqual([1, 2, 3, 4]);
    helpers.array(null, undefined, [ ], { }, true, false, 1, '2', { }).should.deepEqual([null, undefined, [ ], { }, true, false, 1, '2']);
  });

  it('should object correctly', async () => {
    // last argument is always the handlebars options argument
    helpers.obj({ }).should.deepEqual({ });
    helpers.obj({ hash: { } }).should.deepEqual({ });
    helpers.obj({ hash: { a: 1, b: 2 } }).should.deepEqual({ a: 1, b: 2 });
    helpers.obj('these', 'should', 'be', 'ignored', { }).should.deepEqual({ });
    helpers.obj('these', 'should', 'be', 'ignored', { hash: { a: 1, b: 2 } }).should.deepEqual({ a: 1, b: 2 });
  });

  it('should merge correctly', async () => {
    // last argument is always the handlebars options argument
    helpers.merge({ }).should.deepEqual({ });

    helpers.merge(
      { a: '1', b: '2', c: '3' },
      { b: '4', c: '5', d: '6', e: '7' },
      { c: '8', d: '9', f: '10' },
      { }
    ).should.deepEqual({
      a: '1', b: '4', c: '8', d: '9', e: '7', f: '10'
    });

    helpers.merge('hello', { a: 'b' }, { }).should.deepEqual({
      0: 'h', 1: 'e', 2: 'l', 3: 'l', 4: 'o', a: 'b'
    });

    helpers.merge([1, 2, 3], { a: 'b' }, { }).should.deepEqual({
      0: 1, 1: 2, 2: 3, a: 'b'
    });

    helpers.merge(null, undefined, true, false, 0, 1, { }).should.deepEqual({ });
  });

  it('should json decode correctly', async () => {
    should(helpers.jsonDecode({})).be.undefined();
    should(helpers.jsonDecode('', {})).be.undefined();
    should(helpers.jsonDecode({ }, {})).be.undefined();
    should(helpers.jsonDecode(1, {})).be.undefined();
    should(helpers.jsonDecode(null, {})).be.undefined();
    should(helpers.jsonDecode('not valid', {})).be.undefined();
    helpers.jsonDecode('{ "a": "b" }', {}).should.deepEqual({ a: 'b' });
    helpers.jsonDecode('"a string"', {}).should.equal('a string');
  });

  it('should titleCase correctly', async () => {
    helpers.titleCase({}).should.equal('');
    helpers.titleCase('', {}).should.equal('');
    helpers.titleCase('this is a string', {}).should.equal('This Is a String');
    helpers.titleCase('THIS IS A STRING', {}).should.equal('This Is a String');
    helpers.titleCase(true, {}).should.equal('True');
    helpers.titleCase(1, {}).should.equal('1');
    helpers.titleCase(null, {}).should.equal('');
    helpers.titleCase([0, 'a', 1], {}).should.equal('0,a,1');
    helpers.titleCase({ a: 1 }, {}).should.equal('[object Object]');
  });

  it('should substring correctly', async () => {
    helpers.substring({}).should.equal('');
    helpers.substring('', {}).should.equal('');
    helpers.substring('this is a string', {}).should.equal('this is a string');
    helpers.substring('this is a string', 1, {}).should.equal('his is a string');
    helpers.substring('this is a string', 1, 1, {}).should.equal('');
    helpers.substring('this is a string', 1, 2, {}).should.equal('h');
    helpers.substring('this is a string', 2, 1, {}).should.equal('h');
    helpers.substring('this is a string', '3.2', '5.2', {}).should.equal('s ');
    helpers.substring('this is a string', {}, {}, {}).should.equal('');
    helpers.substring('this is a string', -3, -5, {}).should.equal('');
    helpers.substring('this is a string', 10000000, 100000000, {}).should.equal('');
    helpers.substring('this is a string', -10000000, 100000000, {}).should.equal('this is a string');
    helpers.substring(true, {}).should.equal('true');
    helpers.substring(1, {}).should.equal('1');
    helpers.substring(null, {}).should.equal('');
    helpers.substring([0, 'a', 1], 2, 3, {}).should.equal('a');
    helpers.substring({ a: 1 }, {}).should.equal('[object Object]');
  });

});
