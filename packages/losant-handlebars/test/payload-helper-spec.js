import './common.js';
import should from 'should';
import * as payloadHelper from '../src/index.js';
import u from 'updeep';

describe('PayloadHelper', () => {
  it('should lookup correctly', () => {
    payloadHelper.lookup('foo', { foo: 1 }).should.equal(1);
    should.throws(() => { payloadHelper.lookup('foo.1', { foo: [3, 4] }); });
    payloadHelper.lookup('foo.[1]', { foo: [3, 4, 5] }).should.equal(4);
    (payloadHelper.lookup('foo.[20]', { foo: [3, 4, 5] }) === undefined).should.equal(true);
    payloadHelper.lookup('foo.[1]', { foo: 'blah' }).should.equal('l');
    (payloadHelper.lookup('foo.[20]', { foo: 'blah' }) === undefined).should.equal(true);
    payloadHelper.lookup('foo.bar', { foo: { bar: 2 } }).should.equal(2);
    (payloadHelper.lookup('foo.bar', { foo: { blah: 2 } }) === undefined).should.equal(true);
    (payloadHelper.lookup('foo.bar', { foo: null }) === undefined).should.equal(true);
    (payloadHelper.lookup('foo.bar', null) === undefined).should.equal(true);
    (payloadHelper.lookup('foo.bar', '123') === undefined).should.equal(true);
    (payloadHelper.lookup('foo.bar', [1, 2, 3]) === undefined).should.equal(true);
    payloadHelper.lookup('[1]', [3, 4, 5]).should.equal(4);
    (payloadHelper.lookup('[20]', [3, 4, 5]) === undefined).should.equal(true);
    payloadHelper.lookup('[1]', 'blah').should.equal('l');
    (payloadHelper.lookup('[20]', 'blah') === undefined).should.equal(true);
    payloadHelper.lookup('.', 'hi').should.equal('hi');
    payloadHelper.lookup('.', { a: ['b'] }).should.deepEqual({ a: ['b'] });
    (payloadHelper.lookup('a.b.c', null) === undefined).should.equal(true);
    (payloadHelper.lookup('a.b.c', []) === undefined).should.equal(true);
    (payloadHelper.lookup('a.b.c', '') === undefined).should.equal(true);
    (payloadHelper.lookup('a.b.c', undefined) === undefined).should.equal(true);
    (payloadHelper.lookup('a.b.c', {}) === undefined).should.equal(true);
    (payloadHelper.lookup('a.b.c', true) === undefined).should.equal(true);
    (payloadHelper.lookup('', { a: ['b'] }) === undefined).should.equal(true);
    should.throws(() => { payloadHelper.lookup(' ', { ' ': 1 }); });
    payloadHelper.lookup('[ ]', { ' ': 1 }).should.equal(1);
  });

  it('should set values correctly', () => {
    const checks = [
      // path, value, payload, expected result
      ['', 'val', { a: ['b'] }, { a: ['b'] }],
      ['.', 1, { a: ['b'] }, 1],
      ['.', undefined, { a: ['b'] }, { }],
      ['[ ]', 1, { }, { ' ': 1 }],
      ['[{]', 1, { }, { '{': 1 }],
      ['[[]', 1, { }, { '[': 1 }],
      ['[ foo.bar blah ]', 1, { }, { ' foo.bar blah ': 1 }],
      ['foo', 1, { }, { foo: 1 }],
      ['foo', 1, undefined, { foo: 1 }],
      ['foo.bar', 1, { }, { foo: { bar: 1 } }],
      ['foo.bar', 1, undefined, { foo: { bar: 1 } }],
      ['[1]', 9, [1, 2, 3], [1, 9, 3]],
      ['[0]', 9, [], [9]],
      ['[0]', 9, undefined, [9]],
      ['[1]', 9, 'blah', 'b9ah'],
      ['[0]', 9, '', '9'],
      ['foo.[1]', 9, { foo: [1, 2, 3] }, { foo: [1, 9, 3] }],
      ['foo.[0]', 9, { foo: [] }, { foo: [9] }],
      ['foo.[0]', 9, { foo: undefined }, { foo: [9] }],
      ['foo.[1]', 9, { foo: 'blah' }, { foo: 'b9ah' }],
      ['foo.[0]', 9, { foo: '' }, { foo: '9' }],

      ['[0].a.[0].b', 9, undefined, [{ a: [{ b: 9 }] }]],
      ['[0].a.[0].b', 9, [], [{ a: [{ b: 9 }] }]],
      ['[0].a.[0].b', 9, {}, { 0: { a: [{ b: 9 }] } }],

      ['[0].[ $ ].[2]', 'a', { 0: { ' $ ': 'abcd' } }, { 0: { ' $ ': 'abad' } }],
      ['[0].[ $ ].[3]', 'a', { 0: { ' $ ': 'abcd' } }, { 0: { ' $ ': 'abca' } }],
      ['[0].[ $ ].[4]', 'a', { 0: { ' $ ': 'abcd' } }, { 0: { ' $ ': 'abcda' } }],
      ['[0].[ $ ].[5]', 'a', { 0: { ' $ ': 'abcd' } }, { 0: { ' $ ': 'abcda' } }],

      ['a.b.c', undefined, { a: { b: { c: {} } } }, { a: { b: { } } }],
      ['a.b.c', undefined, { a: { b: {} } }, { a: { b: {} } }],
      ['a.b.c', undefined, { a: {} }, { a: {} }],
      ['a.b.c', undefined, {}, {}],
      ['a.b.[1]', undefined, { a: { b: ['a', 'b', 'c'] } }, { a: { b: ['a', 'c'] } }],
      ['a.b.[1]', undefined, { a: { b: [] } }, { a: { b: [] } }],
      ['a.b.[1]', undefined, { a: {} }, { a: {} }],
      ['a.b.[1]', undefined, {}, {}]
    ];

    checks.forEach((check) => {
      payloadHelper.set(check[0], check[1], u.freeze(check[2])).should.deepEqual(check[3]);
    });

    const mismatchThrows = [
      ['foo', 1, null],
      ['foo', 1, []],
      ['foo', 1, ''],
      ['foo', 1, true],
      ['[1].blah', 1, 'hello'],
      ['foo.bar', 1, { foo: null }],
      ['foo.bar', 1, { foo: [] }],
      ['foo.bar', 1, { foo: '' }],
      ['foo.bar', 1, { foo: true }],
      ['foo.[1].blah', 1, { foo: 'hello' }],
      ['foo.bar.[1]', 'multiple', { foo: { bar: 'hello' } }]
    ];

    mismatchThrows.forEach((check) => {
      should.throws(
        () => { payloadHelper.set(check[0], check[1], u.freeze(check[2])); },
        /PayloadPathMismatch/
      );
    });

    const invalidPathThrows = [
      ['[', 1, {}],
      [' ', 1, {}],
      ['{', 1, {}],
      [']', 1, {}],
      [' foo.bar blah ', {}]
    ];

    invalidPathThrows.forEach((check) => {
      should.throws(
        () => { payloadHelper.set(check[0], check[1], u.freeze(check[2])); },
        /InvalidPayloadPathError/
      );
    });
  });

  it('should remove values correctly', () => {
    const checks = [
      // path, payload, expected result
      ['', { a: ['b'] }, { a: ['b'] }],
      ['.', { a: 'b' }, {}],
      ['.', undefined, {}],
      ['a.b.c', { a: {} }, { a: {} }],
      ['a.b.c', { }, { }],
      ['a.b.c', { a: { b: { c: 1 } } }, { a: { b: { } } }],
      ['[1]', [1, 2, 3], [1, 3]],
      ['[0]', [], []],
      ['[1]', 'blah', 'bah'],
      ['[0]', '', '', ''],
      ['foo.[1]', { foo: [1, 2, 3] }, { foo: [1, 3] }],
      ['foo.[0]', { foo: [] }, { foo: [] }],
      ['foo.[0]', { foo: undefined }, { foo: undefined }],
      ['foo.[1]', { foo: 'blah' }, { foo: 'bah' }],
      ['foo.[0]', { foo: '' }, { foo: '' }]
    ];

    checks.forEach((check) => {
      payloadHelper.remove(check[0], u.freeze(check[1])).should.deepEqual(check[2]);
    });

    ['a.b.c', '[0]'].forEach((check) => {
      (payloadHelper.remove(check, u.freeze(undefined)) === undefined).should.equal(true);
    });

    const throws = [
      ['foo', null],
      ['foo', []],
      ['foo', ''],
      ['foo', true],
      ['[1].blah', 'hello'],
      ['foo.bar', { foo: null }],
      ['foo.bar', { foo: [] }],
      ['foo.bar', { foo: '' }],
      ['foo.bar', { foo: true }],
      ['foo.[1].blah', { foo: 'hello' }]
    ];

    throws.forEach((check) => {
      should.throws(
        () => { payloadHelper.remove(check[0], u.freeze(check[1])); },
        /PayloadPathMismatch/
      );
    });
  });

  it('should correctly test payload paths', () => {
    payloadHelper.isValidPath('').should.equal(true);
    payloadHelper.isValidPath('a').should.equal(true);
    payloadHelper.isValidPath('a.b').should.equal(true);
    payloadHelper.isValidPath('[a].[b]').should.equal(true);
    payloadHelper.isValidPath('[a].[1].[b].[0]').should.equal(true);
    payloadHelper.isValidPath('[a].[1].[b].0').should.equal(false);
    payloadHelper.isValidPath('.').should.equal(true);
    payloadHelper.isValidPath(' a b ').should.equal(false);
    payloadHelper.isValidPath('[ a b ]').should.equal(true);
    payloadHelper.isValidPath(' ').should.equal(false);
    payloadHelper.isValidPath('[ ]').should.equal(true);
  });

  it('should correctly test json templates', () => {
    const good = [
      '',
      '{ {{#each data}}"1": "2"{{/each}} }',
      '{ {{#with data}}"1": "2"{{/with}} }',
      '{}',
      '{{a}}',
      '{{{a}}}',
      '{{&a}}',
      '{{{a.b}}}',
      '{{&a.b}}',
      '{ "{{q}}": {{w}}, "x": [{{z}}, {{z}}] }',
      '{ "{{a}}": 1 }',
      '{{{jsonEncode b}}}',
      '{{jsonEncode b}}',
      '{{a.b}}',
      '{{a.b.c}}',
      '{{.}}',
      '{{this}}',
      '{ "{{q.[0].t.[$ $ $]}}": {{w}}, "x": [{{z.[1].a}}, {{z.[2].a}}] }',
      '{ {{#if a}}"a": "b"{{/if}} }',
      '{ {{#eq a b}}"a": "b"{{/eq}} }',
      '{ "{{format a}}": 1 }',
      '{ "{{a}}": "" }',
      `{
        "groupId": "{{loop.item.value.groupId}}",
        "assetId": "{{triggerId}}",
        "type": "{{#if loop.item.value.inZone}}enterZone{{else}}exitZone{{/if}}",
        "time": {{format time 'x'}},
        "info": {
          "zoneId": "{{loop.item.value._id}}",
          "zoneName": "{{loop.item.value.name}}",
          "lastChangeTime": {{loop.item.value.oldInZone.time}}
        }
      }`,
      `{
         "{{jsonEncode working.a}}": "{{jsonEncode working.b}}",
         {{jsonEncode working.c}}: {{jsonEncode working.d}},
         "{{working.e}}": "{{working.f}}",
         {{working.g}}: {{working.h}},
         "{{jsonEncode working.a}}"  :  "{{jsonEncode working.b}}",
         {{jsonEncode working.c}}  :  {{jsonEncode working.d}},
         "{{working.e}}"  :  "{{working.f}}",
         {{working.g}}  :  {{working.h}},
         "a": "b",
         "": "",
         "a" : "b",
         ""  : ""
      }`,
      '{ "{{q}}": {{w}}, {{z}}: [{{z}}, {{z}}] }',
      '{ ",{{a}}:": "b" }',
      '{ "a": "hello, \\"{{a}}\\"" }',
      '{ "a": [{{#each data}}{{jsonEncode this}}{{#unless @last}},{{/unless}}{{/each}}] }'
    ];

    const bad = [
      '{{{',
      '{{',
      '{ {{#dne a}}"a": "b"{{/dne}} }',
      '{{a b}}',
      '{ "{{dne a}}": 1 }',

      // this technically should be valid, but is an edge case
      // in terms of how we are forcing rendered unquoted keys
      // to be quoted. You have to mix requiring the unquoted key fix
      // plus an instance where the unquoted key fix does the wrong thing
      '{ {{a}}: "b", ",{{a}}:": "b" }'
    ];

    good.forEach((template) => {
      payloadHelper.isValidJsonTemplate(template).should.equal(true, template);
    });

    bad.forEach((template) => {
      payloadHelper.isValidJsonTemplate(template).should.equal(false, template);
    });
  });

  it('should correctly test templates', () => {
    const good = [
      '',
      '{{a}}',
      '{{{a}}}',
      '{{&a}}',
      '{{{a.b}}}',
      '{{&a.b}}',
      '{{#if a}}"a": "b"{{/if}} }',
      '{{#eq a b}}"a": "b"{{/eq}} }',
      '{{format a}}": 1 }',
      '{{a}}": 1 }'
    ];

    const bad = [
      '{{{',
      '{{',
      '{{#dne a}}"a": "b"{{/dne}} }',
      '{{dne a}}": 1 }'
    ];

    good.forEach((template) => {
      payloadHelper.isValidTemplate(template).should.equal(true, template);
    });

    bad.forEach((template) => {
      payloadHelper.isValidTemplate(template).should.equal(false, template);
    });
  });

  it('should correctly test expressions', () => {
    const good = [
      'true',
      '{{a}}',
      '{{a}} > 1',
      '{{a}} + {{b}} + pow({{c}}, {{d}})',
      '{{[a].[b]}} === {{[c].[0]}}',
      '{{format a}} > 1',
      '!2',
      '5+!!2',
      'min({{a}}, 2) + max({{b}}, 3)',
      '{{a}} >> {{b}}',
      '16 << 5',
      'includes({{a}}, {{b}})'
    ];

    const bad = [
      'a',
      '{{a}} >',
      '{{[a].[b]}} === {{[c].0}}',
      '{{dne a}} > 1',
      '5!2',
      '{{hello',
      '{{a}} + 1 + {{b + 2',
      '{{#if a}}1{{else}}2{{/if}} + 2',
      '4 <<< 1',
      '{{c}} >>> 2'
    ];

    good.forEach((exp) => {
      payloadHelper.isValidExpression(exp).should.equal(true, exp);
    });

    bad.forEach((exp) => {
      payloadHelper.isValidExpression(exp).should.equal(false, exp);
    });
  });

  it('should correctly evaluate expressions', () => {
    [
      ['true', {}, true],
      [true, {}, true],
      ['null', {}, null],
      [null, {}, null],
      [0, {}, 0],
      ['0', {}, 0],
      ['"hello"', {}, 'hello'],
      ['{{a}}', { a: 1 }, 1],
      ['{{format a}}', { a: 1 }, '1'],
      ['{{a}} > {{b}}', { a: 1, b: 2 }, false],
      ['{{a}} > {{b}}', { a: 2, b: 1 }, true],
      ['{{a}} + {{b}}', { a: '1.1', b: new Date(1475099650322) }, 1475099650323.1],
      ['{{format a "YYYY"}} === "2016"', { a: new Date(1475099650322) }, true],
      ['{{format a \'YYYY\'}} === \'2016\'', { a: new Date(1475099650322) }, true],
      ['{{format a "YYYY"}} == "2016"', { a: new Date(1475099650322) }, true],
      ['{{format a "YYYY"}} == 2016', { a: new Date(1475099650322) }, true],
      ['{{format a "YYYY"}} === 2016', { a: new Date(1475099650322) }, false],
      ['!2', {}, false],
      ['5+!!2', {}, 6],
      ['min({{a}}, 2) + max({{b}}, 3)', { a: 1, b: 2 }, 4],
      ['min({{a}} - {{b}}, 2) + max({{b}}, 3)', { a: 10, b: '11' }, 10],
      ['{{a}} << {{b}}', { a: 5, b: 2 }, 20],
      ['{{c}} >> {{d}}', { c: 25, d: 1 }, 12],
      ['{{a}} << {{b}}', { a: 'fda', b: 2 }, 0],
      ['pow(pow({{a}},{{b}}), {{c}})', { a: 2, b: 3, c: 2 }, 64],
      ['({{a}}+2)*(3+{{b}})', { a: 1, b: 45 }, 144],
      ['(3+{{b}})*({{a}}+2)', { a: 1, b: 45 }, 144],
      ['3+{{b}}*({{a}}+2)', { a: 1, b: 45 }, 138],
      ['2 + 3 * {{a}}', { a: 4 }, 14],
      ['(2 + 3) * {{a}}', { a: 4 }, 20],
      ['2-3^{{a}}', { a: 4 }, -79],
      ['-2-3^{{a}}', { a: 4 }, -83],
      ['10*+{{a}}', { a: 1 }, 10],
      ['10*-{{a}}', { a: 1 }, -10],
      ['8/{{a}}*({{a}}+{{a}})', { a: 2 }, 16],
      ['{{a}}^{{a}}^{{a}}', { a: 3 }, 19683] // opinionated, some calculators will take the other form (3^(3^3))
    ].forEach(([expression, payload, result]) => {
      should(payloadHelper.evaluateExpression(expression, payload)).equal(result);
    });
  });

  it('should eval include expression correctly', () => {
    payloadHelper.evaluateExpression('includes("aaaa", "b")', {}).should.equal(false);
    payloadHelper.evaluateExpression('includes("aaaa", "a")', {}).should.equal(true);
    payloadHelper.evaluateExpression('includes({{a}}, "three")', { a: ['one', 'two'] }).should.equal(false);
    payloadHelper.evaluateExpression('includes({{a}}, "one")', { a: ['one', 'two'] }).should.equal(true);
    payloadHelper.evaluateExpression('includes({{a}}, {{b}})', { a: ['one', 'two'], b: 'two' }).should.equal(true);
    payloadHelper.evaluateExpression('includes("", false)', { }).should.equal(false);
    payloadHelper.evaluateExpression('includes(false, "")', { }).should.equal(false);
    payloadHelper.evaluateExpression('includes(false, false)', { }).should.equal(false);
    payloadHelper.evaluateExpression('includes(null, null)', { }).should.equal(false);
    payloadHelper.evaluateExpression('includes(0, 0)', { }).should.equal(false);
    payloadHelper.evaluateExpression('includes({{a}}, "b")', { a: { a: 'b' } }).should.equal(true);
    payloadHelper.evaluateExpression('includes({{a}}, "c")', { a: { a: 'b' } }).should.equal(false);
    payloadHelper.evaluateExpression('includes({{a}}, 0)', { a: { a: '0' } }).should.equal(false);
    payloadHelper.evaluateExpression('includes("false", false)', {}).should.equal(true);
    payloadHelper.evaluateExpression('includes({{a}}, {{b}})', { a: [0], b: 0 }).should.equal(true);
    payloadHelper.evaluateExpression('includes({{a}}, {{b}})', { a: [0], b: '0' }).should.equal(false);
    payloadHelper.evaluateExpression('includes("0", 0)', {}).should.equal(true);
    payloadHelper.evaluateExpression('includes("", "")', {}).should.equal(true);
    payloadHelper.evaluateExpression('includes({{a}}, {{b}})', { }).should.equal(false);

    // behavior that I'm not sure I agree with, but it is now legacy behavior
    payloadHelper.evaluateExpression('includes({{a}}, {{b}})', { a: [null], b: null }).should.equal(false);
    payloadHelper.evaluateExpression('includes({{a}}, {{b}})', { a: [undefined], b: undefined }).should.equal(false);
  });

  it('should unescape quotes inside string literals', () => {
    payloadHelper.evaluateExpression('"a\\"b"', {}).should.equal('a"b');
    payloadHelper.evaluateExpression('\'a\\\'b\'', {}).should.equal('a\'b');
    payloadHelper.evaluateExpression('"a\\\\b"', {}).should.equal('a\\b');
  });

  it('should compute log10 exactly for powers of ten', () => {
    payloadHelper.evaluateExpression('log10(1000)', {}).should.equal(3);
    payloadHelper.evaluateExpression('log10(100)', {}).should.equal(2);
    payloadHelper.evaluateExpression('log10(1)', {}).should.equal(0);
    payloadHelper.evaluateExpression('log10({{a}})', { a: 1e15 }).should.equal(15);
    payloadHelper.evaluateExpression('log10(0.001)', {}).should.equal(-3);
  });

  it('should raise ExpressionError for a comma outside of a function call', () => {
    ['1, 2', '1 + 2, 3'].forEach((expression) => {
      (() => {
        payloadHelper.evaluateExpression(expression, {});
      }).should.throw({ name: 'ExpressionError' });
    });
    payloadHelper.evaluateExpression('pow(2, 3)', {}).should.equal(8);
    payloadHelper.evaluateExpression('pow(1 + 1, 3)', {}).should.equal(8);
  });

  it('should correctly error on expressions', () => {
    [
      ['notAThing', {}, { name: 'ExpressionError', message: 'parse error [column 0]: unknown character' }],
      ['1 + {{#if a}}', {}, { name: 'InvalidTemplateError', message: 'Parse error on line 1:\n{{#if a}}\n---------^' }],
      ['1 + sin({{a}}, {{b}})', {}, { name: 'ExpressionError', message: 'parse error [column 21]: parity' }],
      ['', {}, { name: 'ExpressionError', message: 'parse error [column 0]: parity' }]
    ].forEach(([expression, payload, error]) => {
      (() => {
        payloadHelper.evaluateExpression(expression, payload);
      }).should.throw(error);
    });
  });

  it('should correctly reuse an expression evaluator', () => {
    payloadHelper.evaluateExpression('min({{a}}, 2) + max({{b}}, 3)', { a: 0, b: 0 }).should.equal(3);
    payloadHelper.evaluateExpression('min({{a}}, 2) + max({{b}}, 3)', { a: 10, b: 5 }).should.equal(7);
    payloadHelper.evaluateExpression('min({{a}}, 2) + max({{b}}, 3)', { a: -11, b: 11 }).should.equal(0);
    (() => { payloadHelper.evaluateExpression('notAThing', { a: 0, b: 0 }); }).should.throw({ name: 'ExpressionError' });
    (() => { payloadHelper.evaluateExpression('notAThing', { a: 1, b: 0 }); }).should.throw({ name: 'ExpressionError' });
    (() => { payloadHelper.evaluateExpression('notAThing', { a: 2, b: 0 }); }).should.throw({ name: 'ExpressionError' });
    (() => { payloadHelper.evaluateExpression('1 + {{#if a}}', { a: 0, b: 0 }); }).should.throw({ name: 'InvalidTemplateError' });
    (() => { payloadHelper.evaluateExpression('1 + {{#if a}}', { a: 1, b: 0 }); }).should.throw({ name: 'InvalidTemplateError' });
    (() => { payloadHelper.evaluateExpression('1 + {{#if a}}', { a: 2, b: 0 }); }).should.throw({ name: 'InvalidTemplateError' });
  });

  it('valueByKey should work with render', () => {
    const payload = { foo: { bar: [{ key: 'one', value: 'two' }, { key: 'three', value: 'four' }] } };
    payloadHelper.render('{{valueByKey foo.bar "one"}}', payload).should.equal('two');
  });

  it('should never explode with renderIfValid', () => {
    [
      ['{{a}}', '1'],
      ['{{', '{{'],
      [undefined, undefined]
    ].forEach(([template, result]) => {
      should(payloadHelper.renderIfValid(template, { a: '1' })).deepEqual(result);
    });
  });

  it('should never explode with renderIfValidToString', () => {
    [
      ['{{a}}', '1'],
      ['{{', '{{'],
      [undefined, '']
    ].forEach(([template, result]) => {
      should(payloadHelper.renderIfValidToString(template, { a: '1' })).deepEqual(result);
    });
  });

  it('renderToString goes to string correctly', () => {
    [
      [{ a: '1' }, '1'],
      [{ a: 1 }, '1'],
      [{ a: ['a', 'b'] }, 'a,b'],
      [{ a: null }, ''],
      [{ a: false }, 'false'],
      [{ a: true }, 'true'],
      [{}, ''],
      [{ a: { } }, '[object Object]']
    ].forEach(([payload, result]) => {
      should(payloadHelper.renderToString('{{a}}', payload)).deepEqual(result);
    });
  });

  it('regular render leaves simple expressions alone', () => {
    [
      [{ a: '1' }, '1', '1 '],
      [{ a: 1 }, 1, '1 '],
      [{ a: ['a', 'b'] }, ['a', 'b'], 'a,b '],
      [{ a: null }, null, ' '],
      [{ a: false }, false, 'false '],
      [{ a: true }, true, 'true '],
      [{}, undefined, ' '],
      [{ a: { } }, {}, '[object Object] ']
    ].forEach(([payload, singleExpressionResult, multiExpressionResult]) => {
      should(payloadHelper.render('{{a}}', payload)).deepEqual(singleExpressionResult);
      should(payloadHelper.render('{{a}} ', payload)).deepEqual(multiExpressionResult);
    });
  });

  it('should do normal render with weird helpers', () => {
    payloadHelper.renderIfValid('{{dashboardUrl a="b"}}', {})
      .should.equal('https://app.losant.com/dashboards/?a=b');
    payloadHelper.renderIfValid('{{dashboardUrl}}', {})
      .should.equal('https://app.losant.com/dashboards/');
  });

  it('should not explode when lookup is missing its second argument', () => {
    // existing behavior of handlebars lookup
    should(payloadHelper.render('{{lookup}}', { a: 'b', undefined: 'c' })).deepEqual(undefined);
    should(payloadHelper.render('{{lookup . "a"}}', { a: 'b', undefined: 'c' })).deepEqual('b');
    should(payloadHelper.render('{{lookup . "b"}}', { a: 'b', undefined: 'c' })).deepEqual('');
    should(payloadHelper.render('{{lookup nope nope}}', { a: 'b', undefined: 'c' })).deepEqual('');
    should(payloadHelper.render('{{lookup . nope}}', { a: 'b', undefined: 'c' })).deepEqual('c');
    should(payloadHelper.render('{{lookup nope}}', { a: 'b', undefined: 'c' })).deepEqual('');
    // weird case but is actually built in handlebars behavior so maintaining
    should(payloadHelper.render('{{lookup false}}', { a: 'b', undefined: 'c' })).deepEqual('false');
    // a missing field argument looks up the 'undefined' key
    should(payloadHelper.render('{{lookup .}}', { a: 'b', undefined: 'c' })).deepEqual('c');
  });

  it('should support sub-rendering', () => {
    payloadHelper.render('{{add (template "{{a}}{{b}}") (template "{{b}}{{a}}") }}',
      { a: '1', b: '2' }).should.equal('33');
    payloadHelper.render('{{add (template "{{a}}{{b}}" nested) (template "{{b}}{{a}}") }}',
      { nested: { a: '1', b: '2' }, a: '3', b: '4' }).should.equal('55');
    payloadHelper.render('{{#each foo}}{{template "{{bar}}" .}}{{/each}}',
      { foo: [{ bar: 1 }, { bar: 2 }, { bar: 3 }, { bar: 4 }], bar: 9 }).should.equal('1234');
    payloadHelper.render('{{#each foo}}{{template "{{bar}}"}}{{/each}}',
      { foo: [{ bar: 1 }, { bar: 2 }, { bar: 3 }, { bar: 4 }], bar: 9 }).should.equal('9999');

    payloadHelper.evaluateExpression('{{a}} + {{template b}}',
      { a: 5, b: '{{add c d}}', c: 3, d: 4 }).should.equal(12);
  });

  it('should support sub-expressions', () => {
    payloadHelper.evaluateExpression('{{a}} + {{evalExpression b}} * {{evalExpression b e}}',
      { a: 5, b: '{{c}} + {{d}}', c: 3, d: 4, e: { c: 6, d: 7 } }).should.equal(96);

    payloadHelper.evaluateExpression('{{a}} + {{template b}} - {{template b e}} ',
      { a: 5, b: '{{multiply c d}}', c: 3, d: 4, e: { c: 6, d: 7 } }).should.equal(-25);

    payloadHelper.render('{{evalExpression b}} is to {{template b}} as {{evalExpression b e}} is to {{template b e}}',
      { a: 5, b: '{{c}} + {{d}}', c: 3, d: 4, e: { c: 6, d: 7 } }).should.equal('7 is to 3 + 4 as 13 is to 6 + 7');

    // the following does not work because evaluate expression fails on nested {{ }} in strings
    // when finding variables
    // payloadHelper.evaluateExpression('{{a}} + {{evalExpression "{{b}} + {{c}}"}}',
    //  { a: 5, b: 6, c: 7 }).should.equal(18);
  });

  it('should not support nested sub-rendering', () => {
    let payload = { a: 5, b: 6, foo: '{{a}}{{b}}:{{template foo}}:{{b}}{{a}}' };
    payloadHelper.render('hello - {{foo}} - {{template foo}}', payload).should
      .equal('hello - {{a}}{{b}}:{{template foo}}:{{b}}{{a}} - 56::65');
    payloadHelper.render('hello - {{foo}} - {{evalExpression foo}}', payload).should
      .equal('hello - {{a}}{{b}}:{{template foo}}:{{b}}{{a}} - ');
    payloadHelper.evaluateExpression('{{template foo}}', payload).should
      .equal('56::65');

    payload = { a: 5, b: 6, foo: '{{a}} + {{b}} + {{evalExpression foo}}' };
    payloadHelper.render('hello - {{foo}} - {{template foo}}', payload).should
      .equal('hello - {{a}} + {{b}} + {{evalExpression foo}} - 5 + 6 + ');
    payloadHelper.evaluateExpression('{{template foo}}', payload).should
      .equal('5 + 6 + ');
    payloadHelper.evaluateExpression('{{evalExpression foo}}', payload).should
      .equal('11');
  });

  it('should not support inline partials', () => {
    (() => payloadHelper.render('{{#*inline "myPartial"}}hi{{/inline}}{{> myPartial .}}', {}))
      .should.throw({ name: 'InvalidTemplateError', message: 'Inline partials are not supported.' });
  });

  it('should error when each input is too large', () => {
    (() => payloadHelper.render('{{#each foo}}hi{{/each}}', { foo: new Array(4097).fill('') }))
      .should.throw({ name: 'InvalidTemplateError', message: 'Maximum #each iteration count (4096) exceeded.' });

    (() => payloadHelper.render('{{#each foo}}hi{{/each}}', { foo: 4097 }))
      .should.throw({ name: 'InvalidTemplateError', message: 'Maximum #each iteration count (4096) exceeded.' });

    (() => payloadHelper.render('{{#each foo}}hi{{/each}}', { foo: Object.fromEntries(Array.from({ length: 4097 }, (_, index) => [index, index])) }))
      .should.throw({ name: 'InvalidTemplateError', message: 'Maximum #each iteration count (4096) exceeded.' });

    (() => payloadHelper.render('{{#each foo}}hi{{/each}}', { foo: new Array(4097).fill(' ').join('') }))
      .should.throw({ name: 'InvalidTemplateError', message: 'Maximum #each iteration count (4096) exceeded.' });
  });

  it('should error when each output is too large', () => {
    const largeString = new Array(2000).fill('a').join('');
    (() => payloadHelper.render('{{#each foo}}{{../largeString}}{{/each}}', { largeString, foo: new Array(3000).fill('') }))
      .should.throw({ name: 'InvalidTemplateError', message: 'Maximum #each iteration result size (1MB) exceeded.' });
  });

  it('should error when each depth is too large', () => {
    const inner = new Array(20).fill('{{#each ../foo}}').join('') + new Array(20).fill('{{/each}}').join('');
    (() => payloadHelper.render(`{{#each foo}}${inner}{{/each}}`, { foo: [1] }))
      .should.throw({ name: 'InvalidTemplateError', message: 'Maximum #each depth size (20) exceeded.' });
  });

  it('should support numbers for each', () => {
    payloadHelper.render('{{#each foo}}a-{{.}}-{{@index}}-{{@key}}-{{@first}}-{{@last}}-b{{/each}}', { foo: 4.3 }).should.equal('a-0-0-0-true-false-ba-1-1-1-false-false-ba-2-2-2-false-false-ba-3-3-3-false-false-ba-4-4-4-false-true-b');
    payloadHelper.render('{{#each foo}}a-{{.}}-{{@index}}-{{@key}}-{{@first}}-{{@last}}-b{{/each}}', { foo: NaN }).should.equal('');
    payloadHelper.render('{{#each foo}}a-{{.}}-{{@index}}-{{@key}}-{{@first}}-{{@last}}-b{{/each}}', { foo: -4.3 }).should.equal('a-0-0-0-true-false-ba-1-1-1-false-false-ba-2-2-2-false-false-ba-3-3-3-false-true-b');
  });

  it('should support strings for each', () => {
    payloadHelper.render('{{#each foo}}a-{{.}}-{{@index}}-{{@key}}-{{@first}}-{{@last}}-b{{/each}}', { foo: 'hello' }).should.equal('a-h-0-0-true-false-ba-e-1-1-false-false-ba-l-2-2-false-false-ba-l-3-3-false-false-ba-o-4-4-false-true-b');
    payloadHelper.render('{{#each foo}}a-{{.}}-{{@index}}-{{@key}}-{{@first}}-{{@last}}-b{{/each}}', { foo: '' }).should.equal('');
  });

  it('should support arrays for each', () => {
    payloadHelper.render('{{#each foo}}a-{{.}}-{{@index}}-{{@key}}-{{@first}}-{{@last}}-b{{/each}}', { foo: ['x', -1, 'z', -2] }).should.equal('a-x-0-0-true-false-ba--1-1-1-false-false-ba-z-2-2-false-false-ba--2-3-3-false-true-b');
    payloadHelper.render('{{#each foo}}a-{{.}}-{{@index}}-{{@key}}-{{@first}}-{{@last}}-b{{/each}}', { foo: [] }).should.equal('');
  });

  it('should support objects for each', () => {
    payloadHelper.render('{{#each foo}}a-{{.}}-{{@index}}-{{@key}}-{{@first}}-{{@last}}-b{{/each}}', { foo: { m: 'n', o: 'p' } }).should.equal('a-n-0-m-true-false-ba-p-1-o-false-true-b');
    payloadHelper.render('{{#each foo}}a-{{.}}-{{@index}}-{{@key}}-{{@first}}-{{@last}}-b{{/each}}', { foo: {} }).should.equal('');
  });

  it('should render nothing for each on non-iterables', () => {
    payloadHelper.render('{{#each foo}}a-{{.}}-{{@index}}-{{@key}}-{{@first}}-{{@last}}-b{{/each}}', { foo: null }).should.equal('');
    payloadHelper.render('{{#each foo}}a-{{.}}-{{@index}}-{{@key}}-{{@first}}-{{@last}}-b{{/each}}', { }).should.equal('');
    payloadHelper.render('{{#each foo}}a-{{.}}-{{@index}}-{{@key}}-{{@first}}-{{@last}}-b{{/each}}', { foo: true }).should.equal('');
  });

  it('should support else with each', () => {
    payloadHelper.render('{{#each foo}}in{{else}}out{{/each}}', { foo: [] }).should.equal('out');
    payloadHelper.render('{{#each foo}}in{{else}}out{{/each}}', { foo: 0 }).should.equal('out');
    payloadHelper.render('{{#each foo}}in{{else}}out{{/each}}', { foo: '' }).should.equal('out');
    payloadHelper.render('{{#each foo}}in{{else}}out{{/each}}', { foo: {} }).should.equal('out');
    payloadHelper.render('{{#each foo}}in{{else}}out{{/each}}', { foo: null }).should.equal('out');
    payloadHelper.render('{{#each foo}}in{{else}}out{{/each}}', { }).should.equal('out');
    payloadHelper.render('{{#each foo}}in{{else}}out{{/each}}', { foo: [1] }).should.equal('in');
    payloadHelper.render('{{#each foo}}in{{else}}out{{/each}}', { foo: 1 }).should.equal('in');
    payloadHelper.render('{{#each foo}}in{{else}}out{{/each}}', { foo: '1' }).should.equal('in');
    payloadHelper.render('{{#each foo}}in{{else}}out{{/each}}', { foo: { 1: 1 } }).should.equal('in');
  });

  it('jsonEncode, undefined, and defaultTo should play well together', () => {
    payloadHelper.render('{{defaultTo (jsonEncode notAThing) "hi"}}', { }).should.equal('hi');
    payloadHelper.render('{{defaultTo (jsonEncode notAThing) "hi"}}', { notAThing: 'bye' }).should.equal('"bye"');
  });

  it('eq and safestring play well together', () => {
    payloadHelper.render('{{#eq (jsonEncode "hi") \'"hi"\'}}good{{else}}bad{{/eq}}', { }).should.equal('good');
    payloadHelper.render('{{#ne (jsonEncode "a") (jsonEncode "a")}}bad{{else}}good{{/ne}}', { }).should.equal('good');
    payloadHelper.render('{{#eq (jsonEncode) (jsonEncode)}}good{{else}}bad{{/eq}}', { }).should.equal('good');
  });

  it('should correctly support nested functions that return non strings', () => {
    JSON.parse(payloadHelper.render('{{jsonEncode (merge (obj k1=a k2=(array b "c")) d (jsonDecode e))}}', {
      a: 'v1',
      b: 'v2',
      d: { d1: 'v3' },
      e: '{ "e1": "v4" }'
    })).should.deepEqual({ k2: [ 'v2', 'c'], k1: 'v1', d1: 'v3', e1: 'v4' });
  });

  it('should correctly apply id to string func', () => {
    const ctx = { one: { id: 'theID', a: 'b' }, two: 'aStr' };
    payloadHelper.render(
      '{{ctx.one}}, {{jsonEncode ctx.one}}, {{ctx.one.a}}, {{ctx.one.not}}, {{ctx.two}}',
      { ctx }).should.equal('[object Object], {"id":"theID","a":"b"}, b, , aStr');
    payloadHelper.applyIdToString(ctx);
    payloadHelper.render(
      '{{ctx.one}}, {{jsonEncode ctx.one}}, {{ctx.one.a}}, {{ctx.one.not}}, {{ctx.two}}',
      { ctx }).should.equal('theID, {"id":"theID","a":"b"}, b, , aStr');
  });

  it('isValidExpression method has optional error return', () => {
    payloadHelper.isValidExpression('true').should.equal(true);
    payloadHelper.isValidExpression('nope').should.equal(false);
    should(payloadHelper.isValidExpression('true', { returnError: true })).equal(null);
    payloadHelper.isValidExpression('nope', { returnError: true }).should.match({
      name: 'ExpressionError',
      message: 'parse error [column 0]: unknown character'
    });
  });

  it('isValidPath method has optional error return', () => {
    payloadHelper.isValidPath('a.path').should.equal(true);
    payloadHelper.isValidPath('a path').should.equal(false);
    should(payloadHelper.isValidPath('a.path', { returnError: true })).equal(null);
    payloadHelper.isValidPath('a path', { returnError: true }).should.match({
      name: 'InvalidPayloadPathError',
      message: 'Invalid Payload Path: a path',
      path: 'a path'
    });
  });

  it('isValidTemplate method has optional error return', () => {
    payloadHelper.isValidTemplate('{{a}}').should.equal(true);
    payloadHelper.isValidTemplate('{{{a}}').should.equal(false);
    should(payloadHelper.isValidTemplate('{{a}}', { returnError: true })).equal(null);
    payloadHelper.isValidTemplate('{{{a}}', { returnError: true }).should.match({
      name: 'InvalidTemplateError',
      message: 'Parse error on line 1:\n{{a}\n----^',
      details: {
        token: 'CLOSE',
        expected: [
          '\'CLOSE_UNESCAPED\'',
          '\'OPEN_SEXPR\'',
          '\'ID\'',
          '\'STRING\'',
          '\'NUMBER\'',
          '\'BOOLEAN\'',
          '\'UNDEFINED\'',
          '\'NULL\'',
          '\'DATA\''
        ],
        lineNumber: 1,
        endLineNumber: 1,
        column: 3,
        endColumn: 4
      }
    });
    payloadHelper.isValidTemplate('{{hello goodbye}}', { returnError: true }).should.match({
      name: 'InvalidTemplateError',
      message: 'Attempted to use an invalid helper: hello',
      details: { lineNumber: 1, endLineNumber: 1, column: 0, endColumn: 17 }
    });
  });

  it('isValidJsonTemplate method has optional error return', () => {
    payloadHelper.isValidJsonTemplate('{{a}}').should.equal(true);
    payloadHelper.isValidJsonTemplate('{{a}}+').should.equal(false);
    should(payloadHelper.isValidJsonTemplate('{{a}}', { returnError: true })).equal(null);
    payloadHelper.isValidJsonTemplate('{{a}}+', { returnError: true }).should.match({
      name: 'SyntaxError',
      message: 'Unexpected non-whitespace character after JSON at position 13 (line 1 column 14)'
    });
  });
});
