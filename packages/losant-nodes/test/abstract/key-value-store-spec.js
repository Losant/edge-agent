import should from 'should';
import { sleep } from 'omnibelt';

export default function(getKvStore) {
  it('#get', async () => {
    const kvStore = getKvStore();
    let val = await kvStore.get('a', 'b', 'c');
    should(val).be.null();
    await kvStore.set('a', 'b', 'c', 'hello');
    val = await kvStore.get('a', 'b', 'c');
    val.should.equal('hello');
  });

  it('#set', async () => {
    const kvStore = getKvStore();
    let val = await kvStore.get('1', '2', '3');
    should(val).be.null();
    val = await kvStore.set('1', '2', '3', 'aVal');
    val.should.equal('aVal');
    val = await kvStore.get('1', '2', '3');
    val.should.equal('aVal');
    val = await kvStore.set('1', '2', '3', 10);
    val.should.equal('10');
    val = await kvStore.get('1', '2', '3');
    val.should.equal('10');
    val = await kvStore.set('1', '2', '3', null);
    val.should.equal('');
    val = await kvStore.get('1', '2', '3');
    val.should.equal('');
  });

  it('#incr', async () => {
    const kvStore = getKvStore();
    let val = await kvStore.get('x', 'y', 'z');
    should(val).be.null();
    val = await kvStore.incr('x', 'y', 'z', 2);
    val.should.equal('2');
    val = await kvStore.get('x', 'y', 'z');
    val.should.equal('2');
    val = await kvStore.incr('x', 'y', 'z', -10.5);
    val.should.equal('-8.5');
    val = await kvStore.get('x', 'y', 'z');
    val.should.equal('-8.5');
    await kvStore.incr('x', 'y', 'z', 'notANum').should.be
      .rejectedWith('Amount is not a number, cannot be used to increment/decrement');
    val = await kvStore.get('x', 'y', 'z');
    val.should.equal('-8.5');
    await kvStore.set('x', 'y', 'z', 'notANum');
    await kvStore.incr('x', 'y', 'z', 1).should.be
      .rejectedWith('Value at z is not a number, cannot be incremented/decremented');
    await kvStore.del('x', 'y', 'z');
    val = await kvStore.incr('x', 'y', 'z', 2.5);
    val.should.equal('2.5');
    val = await kvStore.get('x', 'y', 'z');
    val.should.equal('2.5');
  });

  it('#del', async () => {
    const kvStore = getKvStore();
    await kvStore.set('a', 'b', 'c', 'goodbye');
    let val = await kvStore.del('a', 'b', 'c');
    val.should.equal('goodbye');
    val = await kvStore.get('a', 'b', 'c');
    should(val).be.null();
    val = await kvStore.del('a', 'b', 'c');
    should(val).be.null();
  });

  it('#lock', async () => {
    const kvStore = getKvStore();
    const array = [];

    const p1 = kvStore.lock('a', 'b', 'c', async () => {
      array.push(1);
      await sleep(10);
      array.push(1);
      await sleep(10);
      array.push(1);
      await sleep(10);
      array.push(1);
    });

    const p2 = kvStore.lock('a', 'b', 'c', async () => {
      array.push(2);
      await sleep(10);
      array.push(2);
      await sleep(10);
      array.push(2);
      await sleep(10);
      array.push(2);
    });

    await Promise.all([p1, p2]);

    array.should.deepEqual([1, 1, 1, 1, 2, 2, 2, 2]);
  });

  it('#getAll/#delAll/#getAllKeys/#delMany', async () => {
    const kvStore = getKvStore();
    const appId = 'appId';
    const flowId1 = 'flowId1';
    const flowId2 = 'flowId2';

    (await kvStore.getAll(appId, flowId1)).should.deepEqual({});
    (await kvStore.getAll(appId, flowId2)).should.deepEqual({});
    (await kvStore.getAllKeys(appId, flowId1)).should.deepEqual([]);
    (await kvStore.getAllKeys(appId, flowId2)).should.deepEqual([]);

    (await kvStore.set(appId, flowId1, 'myKey1', '1')).should.equal('1');
    (await kvStore.set(appId, flowId1, 'myKey2', 'true')).should.equal('true');
    (await kvStore.set(appId, flowId1, 'myKey3', '"myValue3"')).should.equal('"myValue3"');
    (await kvStore.set(appId, flowId1, 'myKey4', '[{ "$undefined": true }]')).should.equal('[{ "$undefined": true }]');
    (await kvStore.set(appId, flowId2, 'myKey1', '5')).should.equal('5');

    (await kvStore.getAll(appId, flowId1)).should.deepEqual({
      myKey1: 1,
      myKey2: true,
      myKey3: 'myValue3',
      myKey4: [undefined]
    });
    (await kvStore.getAll(appId, flowId2, false)).should.deepEqual({ myKey1: '5' });
    (await kvStore.getAllKeys(appId, flowId1)).should.deepEqual(['myKey1', 'myKey2', 'myKey3', 'myKey4']);
    (await kvStore.getAllKeys(appId, flowId2)).should.deepEqual(['myKey1']);

    (await kvStore.delMany(appId, flowId1, ['myKey2', 'myKey4'])).should.equal(2);
    (await kvStore.delMany(appId, flowId2, [])).should.equal(0);

    (await kvStore.getAll(appId, flowId1)).should.deepEqual({
      myKey1: 1,
      myKey3: 'myValue3'
    });
    (await kvStore.getAll(appId, flowId2, false)).should.deepEqual({ myKey1: '5' });
    (await kvStore.getAllKeys(appId, flowId1)).should.deepEqual(['myKey1', 'myKey3']);
    (await kvStore.getAllKeys(appId, flowId2)).should.deepEqual(['myKey1']);

    (await kvStore.delAll(appId, flowId1)).should.equal(2);

    (await kvStore.getAll(appId, flowId1)).should.deepEqual({});
    (await kvStore.getAll(appId, flowId2, false)).should.deepEqual({ myKey1: '5' });
    (await kvStore.getAllKeys(appId, flowId1)).should.deepEqual([]);
    (await kvStore.getAllKeys(appId, flowId2)).should.deepEqual(['myKey1']);
  });
}
