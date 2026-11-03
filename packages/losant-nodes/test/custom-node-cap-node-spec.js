import './common.js';
import CustomNodeCapNode from '../src/custom-node-cap-node.js';

describe('CustomNodeCapNode', () => {
  it('should correctly apply result', async () => {
    const node1 = new CustomNodeCapNode('id', [[4]], {
      resultSourcePath: 'hello',
      branchIndexTemplate: '{{what}}'
    });

    const node2 = new CustomNodeCapNode('id', [[5]], {});

    let ctx = {};
    let results = await node1.run(ctx, { hello: 'a', what: 2 });
    results[0].should.deepEqual([]);
    results[1].should.deepEqual({ hello: 'a', what: 2 });
    ctx.should.deepEqual({
      customNodeResult: {
        branchIndex: 2,
        result: 'a'
      }
    });

    ctx = {};
    results = await node2.run(ctx, { hello: 'b', what: 3 });
    results[0].should.deepEqual([]);
    results[1].should.deepEqual({ hello: 'b', what: 3 });
    ctx.should.deepEqual({
      customNodeResult: {
        branchIndex: NaN,
        result: undefined
      }
    });

    // explicitly not resetting ctx
    results = await node1.run(ctx, { hello: 'c', what: 4 });
    results[0].should.deepEqual([]);
    results[1].should.deepEqual({ hello: 'c', what: 4 });
    ctx.should.deepEqual({
      customNodeResult: {
        branchIndex: NaN,
        result: undefined
      }
    });
  });

});
