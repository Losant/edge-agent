import * as payloadHelper from 'losant-handlebars';
import errors from 'losant-nodejs-utils/src/errors.js';
import { sortBy, path, sleep } from 'omnibelt';
import LoopNode from '../../src/loop-node.js';
import LoopCapNode from '../../src/loop-cap-node.js';
import ConditionalNode from '../../src/conditional-node.js';

export default function(contextify) {

  it('should run a loop, sequential, no cap, no break', async () => {
    const expected = [
      {
        source: [ 1, 2, 3 ],
        item: { value: 1, index: 0, first: true }
      },
      {
        source: [ 1, 2, 3 ],
        item: { value: 2, index: 1 }
      },
      {
        source: [ 1, 2, 3 ],
        item: { value: 3, index: 2, last: true }
      }];
    let expIndex = 0;

    const fakeNode = {
      run: (ctx, p) => {
        p.should.deepEqual(expected[expIndex++]);
        p = payloadHelper.set(`[${p.item.index}]`, p.item.value, p);
        return [[], p];
      }
    };

    const node = new LoopNode('id', [[4], [5]], {
      loopSourcePath: 'source',
      currentItemPath: 'item',
      parallel: false
    });

    const context = contextify({
      concurrent: { awaiting: [], count: 1 },
      nodes: {
        5: fakeNode
      }
    });

    const [ oid, payload ] = await node.run(context, { source: [1, 2, 3] }, []);
    oid.should.deepEqual([4]);
    payload.should.deepEqual({ source: [1, 2, 3] });
    expIndex.should.equal(3);
  });

  it('should run a loop, sequential, with cap, no break', async () => {
    const expected = [
      {
        source: 'abc',
        item: { value: 'a', index: 0, first: true }
      },
      {
        source: 'abc',
        item: { value: 'b', index: 1 },
        0: 'a'
      },
      {
        source: 'abc',
        item: { value: 'c', index: 2, last: true },
        0: 'a'
      }];
    let expIndex = 0;

    const fakeNode = {
      run: (ctx, p) => {
        p.should.deepEqual(expected[expIndex++]);
        p = payloadHelper.set(`[${p.item.index}]`, p.item.value, p);
        return [p.item.index === 1 ? [] : [6], p];
      }
    };

    const node = new LoopNode('one', [[4], [5]], {
      loopSourcePath: 'source',
      currentItemPath: 'item',
      parallel: false
    });

    const context = contextify({
      concurrent: { awaiting: [], count: 1 },
      nodes: {
        5: fakeNode,
        6: new LoopCapNode('6', [], { loopNodeId: 'one', shouldBreak: false })
      }
    });

    const [ oid, payload ] = await node.run(context, { source: 'abc' }, []);
    oid.should.deepEqual([4]);
    payload.should.deepEqual({
      0: 'a',
      2: 'c',
      item: { value: 'c', index: 2, last: true },
      source: 'abc'
    });
    expIndex.should.equal(3);
  });

  it('should run a loop, sequential, with cap, with break', async () => {
    const expected = [
      {
        source: 3,
        item: { value: 0, index: 0, first: true }
      },
      {
        source: 3,
        item: { value: 1, index: 1 },
        0: 0
      },
      {
        source: 3,
        item: { value: 2, index: 2, last: true },
        0: 0,
        1: 1
      }];
    let expIndex = 0;

    const fakeNode = {
      run: (ctx, p) => {
        p.should.deepEqual(expected[expIndex++]);
        p = payloadHelper.set(`[${p.item.index}]`, p.item.value, p);
        return [[p.item.index === 1 ? 7 : 6], p];
      }
    };

    const node = new LoopNode('one', [[4], [5]], {
      loopSourcePath: 'source',
      currentItemPath: 'item',
      parallel: false
    });

    const context = contextify({
      concurrent: { awaiting: [], count: 1 },
      nodes: {
        5: fakeNode,
        6: new LoopCapNode('6', [], { loopNodeId: 'one', shouldBreak: false }),
        7: new LoopCapNode('7', [], { loopNodeId: 'one', shouldBreak: true })
      }
    });

    const [ oid, payload ] = await node.run(context, { source: 3 }, []);
    oid.should.deepEqual([4]);
    payload.should.deepEqual({
      0: 0,
      1: 1,
      item: { value: 1, index: 1 },
      source: 3
    });
    expIndex.should.equal(2);
  });

  it('should run a loop, parallel (break/cap ignored)', async () => {
    const expected = {
      0: {
        source: { a: 'b', c: 'd', e: 'f' },
        item: { value: 'b', key: 'a', index: 0, first: true }
      },
      1: {
        source: { a: 'b', c: 'd', e: 'f' },
        item: { value: 'd', key: 'c', index: 1 }
      },
      2: {
        source: { a: 'b', c: 'd', e: 'f' },
        item: { value: 'f', key: 'e', index: 2, last: true }
      }
    };
    let count = 0;

    const fakeNode = {
      run: (ctx, p) => {
        count++;
        p.should.deepEqual(expected[p.item.index]);
        p = payloadHelper.set(`[${p.item.index}]`, p.item.value, p);
        return [[p.item.index === 1 ? 7 : 6], p];
      }
    };

    const node = new LoopNode('one', [[4], [5]], {
      loopSourcePath: 'source',
      currentItemPath: 'item',
      parallel: true
    });

    const context = contextify({
      concurrent: { awaiting: [], count: 1 },
      nodes: {
        5: fakeNode,
        6: new LoopCapNode('6', [], { loopNodeId: 'one', shouldBreak: false }),
        7: new LoopCapNode('7', [], { loopNodeId: 'one', shouldBreak: true })
      }
    });

    const [ oid, payload ] = await node.run(context, { source: { a: 'b', c: 'd', e: 'f' } }, []);
    oid.should.deepEqual([4]);
    payload.should.deepEqual({ source: { a: 'b', c: 'd', e: 'f' } });
    count.should.equal(3);
  });

  it('should run a nested parallel loop', async () => {
    let count = 0;
    let context;
    const fakeNode = {
      run: (ctx, p) => {
        count++;
        ctx.maxConcurrentNodes.should.equal(5);
        ctx.scopedConcurrent.should.have.properties(['awaiting', 'slotInUse']);
        context.maxConcurrentNodes.should.equal(5);
        p = payloadHelper.set('innerLoopMapValue', p.innerLoopCurrentItem.value * 2, p);
        return [['capInner'], p];
      }
    };

    context = contextify({
      concurrent: { awaiting: [], count: 1 },
      nodes: {
        outerLoop: new LoopNode('outerLoop', [[], ['innerLoop']], {
          loopSourcePath: 'outerLoopSource',
          currentItemPath: 'outerLoopCurrentItem',
          mapValuePath: 'innerLoopMapResult',
          mapResultPath: 'outerLoopMapResult',
          parallel: true
        }),
        innerLoop: new LoopNode('innerLoop', [['capOuter'], ['nodeInner']], {
          loopSourcePath: 'outerLoopCurrentItem.value',
          currentItemPath: 'innerLoopCurrentItem',
          mapValuePath: 'innerLoopMapValue',
          mapResultPath: 'innerLoopMapResult',
          parallel: true
        }),
        nodeInner: fakeNode,
        capInner: new LoopCapNode('capInner', [], { loopNodeId: 'innerLoop' }),
        capOuter: new LoopCapNode('capOuter', [], { loopNodeId: 'outerLoop' })
      }
    });

    const [ oid, payload ] = await context.nodes.outerLoop.run(context, {
      outerLoopSource: [
        [ 0, 1, 2, 3, 4, 5 ],
        [ 6, 7, 8, 9, 10, 11 ],
        [ 12, 13, 14, 15, 16, 17 ],
        [ 18, 19, 20, 21, 22, 23 ],
        [ 24, 25, 26, 27, 28, 29 ],
        [ 30, 31, 32, 33, 34, 35 ]
      ]
    }, []);

    oid.should.deepEqual([]);
    payload.should.deepEqual({
      outerLoopSource: [
        [ 0, 1, 2, 3, 4, 5 ],
        [ 6, 7, 8, 9, 10, 11 ],
        [ 12, 13, 14, 15, 16, 17 ],
        [ 18, 19, 20, 21, 22, 23 ],
        [ 24, 25, 26, 27, 28, 29 ],
        [ 30, 31, 32, 33, 34, 35 ]
      ],
      outerLoopMapResult: [
        [ 0, 2, 4, 6, 8, 10 ],
        [ 12, 14, 16, 18, 20, 22 ],
        [ 24, 26, 28, 30, 32, 34 ],
        [ 36, 38, 40, 42, 44, 46 ],
        [ 48, 50, 52, 54, 56, 58 ],
        [ 60, 62, 64, 66, 68, 70 ]
      ]
    });
    count.should.equal(36);
  });

  it('should run a loop, sequential, properly error', async () => {
    let count = 0;
    const fakeNode = {
      run: (ctx, p) => {
        count++;
        throw errors.Validation({ message: `Error ${p.item.index}` });
      }
    };

    const node = new LoopNode('id', [[4], [5]], {
      loopSourcePath: 'source',
      currentItemPath: 'item',
      parallel: false
    });

    const context = contextify({
      flowErrorManager: { fireOnError: () => { return; } },
      originalPayload: {},
      concurrent: { awaiting: [], count: 1 },
      nodes: {
        5: fakeNode
      }
    });

    const result = await node.run(context, { source: [ true, false, undefined ] }, []);
    result[2].should.deepEqual([ { nodeId: 5, error: { name: 'ValidationError', message: 'Error 0' } } ]);
    count.should.equal(1);
  });

  it('should run a loop, parallel, properly error', async () => {
    let count = 0;
    const fakeNode = {
      run: (ctx, p) => {
        count++;
        throw errors.Validation({ message: `Error ${p.item.index}` });
      }
    };

    const node = new LoopNode('id', [[4], [5]], {
      loopSourcePath: 'source',
      currentItemPath: 'item',
      parallel: true
    });

    const context = contextify({
      flowErrorManager: { fireOnError: () => { return; } },
      originalPayload: {},
      concurrent: { awaiting: [], count: 1 },
      nodes: {
        5: fakeNode
      }
    });

    const result = await node.run(context, { source: [ true, false, undefined ] }, []);
    sortBy(path(['error', 'message']), result[2]).should.deepEqual([
      { nodeId: 5, error: { name: 'ValidationError', message: 'Error 0' } },
      { nodeId: 5, error: { name: 'ValidationError', message: 'Error 1' } },
      { nodeId: 5, error: { name: 'ValidationError', message: 'Error 2' } }
    ]);
    count.should.equal(3);
  });

  it('should run a loop, parallel, map result', async () => {
    const expected = {
      0: {
        source: { a: 'b', c: 'd', e: 'f' },
        item: { value: 'b', key: 'a', index: 0, first: true }
      },
      1: {
        source: { a: 'b', c: 'd', e: 'f' },
        item: { value: 'd', key: 'c', index: 1 }
      },
      2: {
        source: { a: 'b', c: 'd', e: 'f' },
        item: { value: 'f', key: 'e', index: 2, last: true }
      }
    };
    let count = 0;

    const fakeNode = {
      run: (ctx, p) => {
        count++;
        p.should.deepEqual(expected[p.item.index]);
        p = payloadHelper.set('mapValue', `${p.item.value}-${p.item.key}`, p);
        return [[6], p];
      }
    };

    const node = new LoopNode('one', [[4], [5]], {
      loopSourcePath: 'source',
      currentItemPath: 'item',
      mapValuePath: 'mapValue',
      mapResultPath: 'mapResult',
      parallel: true
    });

    const context = contextify({
      concurrent: { awaiting: [], count: 1 },
      nodes: {
        5: fakeNode,
        6: new LoopCapNode('6', [], { loopNodeId: 'one', shouldBreak: false })
      }
    });

    const [ oid, payload ] = await node.run(context, { source: { a: 'b', c: 'd', e: 'f' } }, []);
    oid.should.deepEqual([4]);
    payload.should.deepEqual({
      mapResult: [ 'b-a', 'd-c', 'f-e' ],
      source: { a: 'b', c: 'd', e: 'f' }
    });
    count.should.equal(3);
  });

  it('should run a loop, parallel, map result, with cap node map value path override', async () => {
    const expected = {
      0: {
        source: { a: 'b', c: 'd', e: 'f' },
        item: { value: 'b', key: 'a', index: 0, first: true }
      },
      1: {
        source: { a: 'b', c: 'd', e: 'f' },
        item: { value: 'd', key: 'c', index: 1 }
      },
      2: {
        source: { a: 'b', c: 'd', e: 'f' },
        item: { value: 'f', key: 'e', index: 2, last: true }
      }
    };
    let count = 0;

    const fakeNode = {
      run: (ctx, p) => {
        count++;
        p.should.deepEqual(expected[p.item.index]);
        p = payloadHelper.set('mapValue', `${p.item.value}-${p.item.key}`, p);
        p = payloadHelper.set('mapValueOverride', `mapValueOverride-${p.item.value}-${p.item.key}`, p);
        return [[6], p];
      }
    };

    const node = new LoopNode('one', [[4], [5]], {
      loopSourcePath: 'source',
      currentItemPath: 'item',
      mapValuePath: 'mapValue',
      mapResultPath: 'mapResult',
      parallel: true
    });

    const context = contextify({
      concurrent: { awaiting: [], count: 1 },
      nodes: {
        5: fakeNode,
        6: new ConditionalNode('6', [['7'], ['8']], { expression: '{{item.index}} === 1' }),
        7: new LoopCapNode('7', [], { loopNodeId: 'one', shouldBreak: false }),
        8: new LoopCapNode('8', [], { loopNodeId: 'one', mapValuePath: 'mapValueOverride', shouldBreak: false })
      }
    });

    const [ oid, payload ] = await node.run(context, { source: { a: 'b', c: 'd', e: 'f' } }, []);
    oid.should.deepEqual([4]);
    payload.should.deepEqual({
      mapResult: [ 'b-a', 'mapValueOverride-d-c', 'f-e' ],
      source: { a: 'b', c: 'd', e: 'f' }
    });
    count.should.equal(3);
  });

  it('should run a loop, parallel, stop at timeout', async () => {
    const seenItems = [];

    const fakeNode = {
      run: async (ctx, p) => {
        seenItems.push(p.item.value);
        await sleep(50);
        return [[6], p];
      }
    };

    const node = new LoopNode('one', [[4], [5]], {
      loopSourcePath: 'source',
      currentItemPath: 'item',
      parallel: true
    });

    const context = contextify({
      originalPayload: {},
      concurrent: { awaiting: [], count: 1 },
      runStart: Date.now(),
      maxFlowRunTime: 20,
      nodes: {
        5: fakeNode,
        6: new LoopCapNode('7', [], { loopNodeId: 'one' })
      }
    });

    await node.run(context, { source: 20 }, [])
      .should.be.rejectedWith({ message: 'Timeout running Loop node' });

    // should not continue running the loop past the timeout
    seenItems.sort().should.deepEqual([0, 1, 2, 3, 4]);
  });

  it('should run a loop, no items', async () => {
    const node = new LoopNode('id', [[4], [5]], {
      loopSourcePath: 'source',
      currentItemPath: 'item',
      mapResultPath: 'result',
      parallel: false
    });

    const context = contextify({ });

    const [ oid, payload ] = await node.run(context, { source: true }, []);
    oid.should.deepEqual([4]);
    payload.should.deepEqual({ source: true, result: [] });
  });

  it('should run a loop, no items (object)', async () => {
    const node = new LoopNode('id', [[4], [5]], {
      loopSourcePath: 'source',
      currentItemPath: 'item',
      mapResultPath: 'result',
      parallel: false
    });

    const context = contextify({ });

    const [ oid, payload ] = await node.run(context, { source: {} }, []);
    oid.should.deepEqual([4]);
    payload.should.deepEqual({ source: {}, result: [] });
  });

}
