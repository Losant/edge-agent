import should from 'should';
import LatchNode from '../../src/latch-node.js';

export default function(loadKvStoreAndContextify) {

  it('should behave for L-F, R-F, special id', async () => {
    const { contextify, kvStore } = loadKvStoreAndContextify();
    const node = new LatchNode('id', [['2'], ['1']], {
      latchExpression: '1 > 2',
      resetExpression: 'false',
      latchResultPath: 'lrp',
      resetResultPath: 'rrp',
      branchPath:      'bp',
      wasLatchedPath:  'wlp',
      isLatchedPath:   'ilp',
      latchIdTemplate: '{{foo}}'
    });

    await kvStore.del('appId', 'flowId', 'latch-id-hi');
    let [oids, p] = await node.run(
      contextify({ applicationId: 'appId', flowId: 'flowId' }),
      { foo: 'hi' }
    );
    oids.should.deepEqual(['2']);
    p.should.deepEqual({
      lrp: false, rrp: false, bp: false, wlp: false, ilp: false, foo: 'hi'
    });
    let val = await kvStore.get('appId', 'flowId', 'latch-id-hi');
    should(val).be.null();
    await kvStore.set('appId', 'flowId', 'latch-id-hi', '1');
    [oids, p] = await node.run(
      contextify({ applicationId: 'appId', flowId: 'flowId' }),
      { foo: 'hi' }
    );
    oids.should.deepEqual(['2']);
    p.should.deepEqual({
      lrp: false, rrp: false, bp: false, wlp: true, ilp: true, foo: 'hi'
    });
    val = await kvStore.get('appId', 'flowId', 'latch-id-hi');
    val.should.equal('1');
  });

  it('should behave for L-F, R-T', async () => {
    const { contextify, kvStore } = loadKvStoreAndContextify();
    const node = new LatchNode('id', [['2'], ['1']], {
      latchExpression: '1 > 2',
      resetExpression: 'true',
      latchResultPath: 'lrp',
      resetResultPath: 'rrp',
      branchPath:      'bp',
      wasLatchedPath:  'wlp',
      isLatchedPath:   'ilp'
    });

    await kvStore.del('appId', 'flowId', 'latch-id');
    let [oids, p] = await node.run(
      contextify({ applicationId: 'appId', flowId: 'flowId' }),
      { }
    );
    oids.should.deepEqual(['2']);
    p.should.deepEqual({ lrp: false, rrp: true, bp: false, wlp: false, ilp: false });
    let val = await kvStore.get('appId', 'flowId', 'latch-id');
    should(val).be.null();
    await kvStore.set('appId', 'flowId', 'latch-id', '1');
    [oids, p] = await node.run(
      contextify({ applicationId: 'appId', flowId: 'flowId' }),
      { }
    );
    oids.should.deepEqual(['2']);
    p.should.deepEqual({ lrp: false, rrp: true, bp: false, wlp: true, ilp: false });
    val = await kvStore.get('appId', 'flowId', 'latch-id');
    should(val).be.null();
  });

  it('should behave for L-T, R-F', async () => {
    const { contextify, kvStore } = loadKvStoreAndContextify();
    const node = new LatchNode('id', [['2'], ['1']], {
      latchExpression: '2 > 1',
      resetExpression: 'false',
      latchResultPath: 'lrp',
      resetResultPath: 'rrp',
      branchPath:      'bp',
      wasLatchedPath:  'wlp',
      isLatchedPath:   'ilp'
    });

    await kvStore.del('appId', 'flowId', 'latch-id');
    let [oids, p] = await node.run(
      contextify({ applicationId: 'appId', flowId: 'flowId' }),
      { }
    );
    oids.should.deepEqual(['1']);
    p.should.deepEqual({ lrp: true, rrp: false, bp: true, wlp: false, ilp: true });
    let val = await kvStore.get('appId', 'flowId', 'latch-id');
    val.should.equal('1');
    [oids, p] = await node.run(
      contextify({ applicationId: 'appId', flowId: 'flowId' }),
      { }
    );
    oids.should.deepEqual(['2']);
    p.should.deepEqual({ lrp: true, rrp: false, bp: false, wlp: true, ilp: true });
    val = await kvStore.get('appId', 'flowId', 'latch-id');
    val.should.equal('1');
  });

  it('should behave for L-T, R-T', async () => {
    const { contextify, kvStore } = loadKvStoreAndContextify();
    const node = new LatchNode('id', [['2'], ['1']], {
      latchExpression: '{{a}} === {{a}}',
      resetExpression: '{{a}} !== 0',
      latchResultPath: 'lrp',
      resetResultPath: 'rrp',
      branchPath:      'bp',
      wasLatchedPath:  'wlp',
      isLatchedPath:   'ilp'
    });

    await kvStore.del('appId', 'flowId', 'latch-id');
    let [oids, p] = await node.run(
      contextify({ applicationId: 'appId', flowId: 'flowId' }),
      { a: 1 }
    );
    oids.should.deepEqual(['1']);
    p.should.deepEqual({
      lrp: true, rrp: true, bp: true, wlp: false, ilp: true, a: 1
    });
    let val = await kvStore.get('appId', 'flowId', 'latch-id');
    val.should.equal('1');
    [oids, p] = await node.run(
      contextify({ applicationId: 'appId', flowId: 'flowId' }),
      { a: '0' }
    );
    oids.should.deepEqual(['1']);
    p.should.deepEqual({
      lrp: true, rrp: true, bp: true, wlp: true, ilp: true, a: '0'
    });
    val = await kvStore.get('appId', 'flowId', 'latch-id');
    val.should.equal('1');
  });
}
