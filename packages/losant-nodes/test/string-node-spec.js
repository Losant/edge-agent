import './common.js';
import StringNode from '../src/string-node.js';

const harness = async (config, payload, resultMod) => {
  const outputIds = [[4]];
  const node = new StringNode('id', outputIds, config);
  const [ oids, results ] = await node.run({}, payload);
  oids.should.deepEqual(outputIds);
  results.should.deepEqual({ ...payload, ...resultMod });
  return [oids, results];
};

describe('StringNode', () => {

  it('returns output tuple with minimal config', () => {
    const config = { sourceData: 'foo' };
    const payload = {};
    const resultMod = {};
    return harness(config, payload, resultMod);
  });

  it('defaults `sourceData` to \'\'', () => {
    const itHarness = (sourceData) => {
      const config = {
        sourceData,
        method: 'noop',
        resultPath: 'result'
      };
      const payload = {};
      const resultMod = { result: '' };
      return harness(config, payload, resultMod);
    };
    return Promise.all([
      itHarness(),
      itHarness('{{path.to.nothing}}')
    ]);
  });

  it('defaults `method` to \'noop\' when omitted', () => {
    const config = {
      sourceData: 'foo',
      resultPath: 'result'
    };
    const payload = {};
    const resultMod = { result: 'foo' };
    return harness(config, payload, resultMod);
  });

  it('correctly places results at desired location', () => {
    const config = {
      sourceData: 'foo',
      method: 'noop',
      resultPath: 'result'
    };
    const payload = {};
    const resultMod = { result: 'foo' };
    return harness(config, payload, resultMod);
  });

  it('rejects for invalid `method`', () => {
    const config = {
      sourceData: 'foo',
      method: 'solveWorldHunger'
    };
    const payload = {};
    const resultMod = {};
    return harness(config, payload, resultMod)
      .should.be.rejectedWith('Method is invalid');
  });

  it('correctly rejects bad arguments', async () => {
    const config = {
      sourceData: 'foo',
      method: 'pad',
      methodArgs: ['{{first}}', '{{second}}'],
      resultPath: 'result'
    };
    await harness(config, { first: 1001, second: 'a' }, {})
      .should.be.rejectedWith('Argument must be between 0 and 1000');
    await harness(config, { first: -1, second: 'a' }, {})
      .should.be.rejectedWith('Argument must be between 0 and 1000');
    await harness(config, { first: 'a', second: 'a' }, {})
      .should.be.rejectedWith('Argument must be a valid number');
    await harness(config, { first: '', second: ' ' }, { result: 'foo' });
    await harness(config, { first: 0, second: ' ' }, { result: 'foo' });
    await harness(config, { first: 5, second: ' ' }, { result: ' foo ' });
  });

  it('supports templating for `sourceData`', () => {
    const config = {
      sourceData: '{{data}}',
      method: 'noop',
      resultPath: 'result'
    };
    const payload = { data: 'foo' };
    const resultMod = { result: 'foo' };
    return harness(config, payload, resultMod);
  });

  it('supports templating for `methodArgs`', () => {
    const config = {
      sourceData: '{{data}}',
      method: 'concat',
      methodArgs: ['{{bar.baz}}'],
      resultPath: 'result'
    };
    const payload = {
      data: 'foo',
      bar: {
        baz: ' qux  '
      }
    };
    const resultMod = { result: 'foo qux  ' };
    return harness(config, payload, resultMod);
  });

  it('Properly calls unary methods with simple config', () => {
    const itHarness = (method, data, result) => {
      const config = {
        sourceData: '{{data}}',
        method,
        resultPath: 'result'
      };
      const payload = { data };
      const resultMod = { result };
      return harness(config, payload, resultMod);
    };

    // No need to test them all, lodash does that on its own
    return Promise.all([
      itHarness('noop', 'foo', 'foo'),
      itHarness('trim', '    foo    ', 'foo'),
      itHarness('trimEnd', '    foo    ', '    foo'),
      itHarness('trimStart', '    foo    ', 'foo    '),
      itHarness('toLower', '__FOO_BAR', '__foo_bar'),
      itHarness('toNumber', '80000', 80000),
      itHarness('toUpper', 'foo_bar', 'FOO_BAR')
    ]);
  });

  describe('Yields correct result for special methods', () => {
    const arityHarness = (method, methodArgs, data, result) => {
      return () => {
        const config = {
          sourceData: '{{data}}',
          method,
          methodArgs,
          resultPath: 'result'
        };
        const payload = { data };
        const resultMod = { result };
        return harness(config, payload, resultMod);
      };
    };

    it('concat',
      arityHarness('concat', ['{{data}}'], 'foo ', 'foo foo ')
    );

    it('indexOf',
      arityHarness('indexOf', ['l', 0], 'hello', 2)
    );

    it('pad',
      arityHarness('pad', [8, '_-'], 'foo', '_-foo_-_')
    );

    it('padStart',
      arityHarness('padStart', [6, '_-'], 'foo', '_-_foo')
    );

    it('padEnd',
      arityHarness('padEnd', [6, '_-'], 'foo', 'foo_-_')
    );

    it('replaceFirst',
      arityHarness('replaceFirst', ['bar', 'qux'], 'foo bar baz bar', 'foo qux baz bar')
    );

    it('replaceAll',
      arityHarness('replaceAll', ['bar', 'qux'], 'foo bar baz bar', 'foo qux baz qux')
    );

    it('split',
      arityHarness('split', ['-'], 'foo-bar-baz', ['foo', 'bar', 'baz'])
    );

    it('split - empty args',
      arityHarness('split', [''], 'foo', ['f', 'o', 'o'])
    );

    it('truncate',
      arityHarness('truncate', [5, '__'], 'foo-bar-baz', 'foo__')
    );

    it('truncate - empty args',
      arityHarness('truncate', ['', ''],
        '1234567890123456789012345678901234567890', '123456789012345678901234567890')
    );

  });

  it('casts args on non-unary methods to spec type', () => {
    const config = {
      sourceData: '{{data}}',
      method: 'pad',
      methodArgs: ['9', ['f', 'o']], // ¯\_(ツ)_/¯, I guess they *could* do this
      resultPath: 'result'
    };
    const payload = { data: 'bar' };
    const resultMod = { result: 'f,obarf,o' };
    return harness(config, payload, resultMod);
  });

  it('handles too many `methodArgs`', () => {
    const config = {
      sourceData: 'data',
      method: 'split',
      methodArgs: ['-', 'foo'],
      resultPath: 'result'
    };
    const payload = { data: 'foo-bar-baz' };
    const resultMod = { result: ['foo', 'bar', 'baz'] };
    return harness(config, payload, resultMod)
      .should.be.rejectedWith('Incorrect number of method arguments');
  });

  it('handles too few `methodArgs`', () => {
    const config = {
      sourceData: 'data',
      method: 'split',
      methodArgs: [],
      resultPath: 'result'
    };
    const payload = { data: 'foo-bar-baz' };
    const resultMod = { result: ['foo', 'bar', 'baz'] };
    return harness(config, payload, resultMod)
      .should.be.rejectedWith('Incorrect number of method arguments');
  });

});
