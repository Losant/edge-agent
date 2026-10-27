import './common.js';
import should from 'should';
import MutateNode from '../src/mutate-node.js';

describe('MutateNode', () => {
  it('should correctly mutate payload', () => {
    const node = new MutateNode('id', [[4]], {
      rules: [
        { type: 'set', destination: 'var1.var2', valueTemplate: 1 },
        { type: 'set', destination: 'var1.var3', valueTemplate: 'what{{var1.var2}}where' },
        { type: 'set', destination: 'var1.var4', valueTemplate: '{{var1.var2}}' },
        { type: 'remove', source: 'var1.var2' },
        { type: 'move', source: 'var1.var3', destination: 'var3.var1' },
        { type: 'copy', source: 'var1.var4', destination: 'var3.var4' }
      ]
    });

    const results = node.run({}, {});
    results[0].should.deepEqual([[4]]);
    results[1].should.deepEqual({ var1: { var4: 1 }, var3: { var1: 'what1where', var4: 1 } });
  });

  it('move should not alter destination', () => {
    const node = new MutateNode('id', [[4]], {
      rules: [
        { type: 'move', source: 'data.generalWait.[0]', destination: 'data.generalWait' }
      ]
    });

    const results = node.run({}, {
      data: { generalWait: ['16\r'] }
    });
    results[0].should.deepEqual([[4]]);
    results[1].should.deepEqual({ data: { generalWait: '16\r' } });
  });

  it('should be able to replace entire payload', () => {
    const node = new MutateNode('id', [[4]], {
      rules: [
        { type: 'set', valueTemplate: '{{some}}', destination: '.' }
      ]
    });

    const results = node.run({}, { some: 'payloadStuff' });
    results[0].should.deepEqual([[4]]);
    results[1].should.deepEqual('payloadStuff');
  });

  it('should correctly set with json', () => {
    const node = new MutateNode('id', [[4]], {
      rules: [
        { type: 'set', destination: 'var1.var2', valueTemplate: 1 },
        { type: 'set', destination: 'var1.var3', valueTemplate: 'null', valueTemplateType: 'json' },
        { type: 'set', destination: 'var1.var4', valueTemplate: '2', valueTemplateType: 'json' },
        { type: 'set', destination: 'var1.var5', valueTemplate: '"{{var1.var2}}-{{var1.var4}}"', valueTemplateType: 'json' }
      ]
    });

    const results = node.run({}, {});
    results[0].should.deepEqual([[4]]);
    results[1].should.deepEqual({
      var1: {
        var2: 1,
        var3: null,
        var4: 2,
        var5: '1-2'
      }
    });
  });

  it('should correctly error with bad set json', () => {
    const node = new MutateNode('id', [[4]], {
      rules: [
        { type: 'set', destination: 'var1.var2', valueTemplate: 'notJson', valueTemplateType: 'json' }
      ]
    });

    should.throws(() => { node.run({}, {}); }, /InvalidJsonError/);
  });

  it('should correctly return error message with bad set json', () => {
    let error;
    const node = new MutateNode('id', [[4]], {
      rules: [
        { type: 'set', destination: 'var1.var5', valueTemplate: '"{{var1.var2}}-{{var1.var4}}"', valueTemplateType: 'json' },
        { type: 'set', destination: 'var1.var2', valueTemplate: 'notJson', valueTemplateType: 'json' }
      ]
    });
    try {
      node.run({}, {});
    } catch (e) {
      error = e;
    }
    error.message.should.deepEqual('Rule 2: Set Value template did not render to valid JSON');
  });
});
