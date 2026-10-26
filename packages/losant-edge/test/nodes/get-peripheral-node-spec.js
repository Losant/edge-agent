import GetPeripheralNode from '../../src/nodes/get-peripheral-node.js';
import should from 'should';
import PeripheralDict from '../../src/types/peripheral-dict.js';

const devices = {
  '000000000000000000000001': {
    id: '000000000000000000000001',
    name: 'Grumpy',
    tags: { key1: ['beep', 'bop'], key2: ['bop'], key3: ['yee'], key4: ['haw'], key5: ['beep'] },
    attributes: [{
      name: 'hello',
      dataType: 'number',
      attributeTags: {
        a: 'b'
      }
    }],
    deviceClass: 'floating'
  },
  '000000000000000000000002': {
    id: '000000000000000000000002',
    name: 'Dopey',
    tags: { key1: ['yee'], key3: ['haw'] },
    attributes: [{
      name: 'hello',
      dataType: 'blob',
      attributeTags: {
        c: 'd'
      },
      contentType: 'text/plain'
    }],
    deviceClass: 'floating'
  },
  '000000000000000000000003': {
    id: '000000000000000000000003',
    name: 'Sneezy',
    tags: { key2: ['beep'], key3: ['yee'] },
    attributes: [],
    deviceClass: 'floating'
  },
  '000000000000000000000004': {
    id: '000000000000000000000004',
    name: 'Sleepy',
    tags: { key1: ['bop'], key4: ['haw'] },
    attributes: [],
    deviceClass: 'floating'
  },
  '000000000000000000000005': {
    id: '000000000000000000000005',
    name: '???',
    tags: { key5: ['beep'] },
    attributes: [],
    deviceClass: 'floating'
  },
  '000000000000000000000006': {
    id: '000000000000000000000006',
    name: 'Dopey',
    tags: {},
    attributes: [],
    deviceClass: 'floating'
  }
};

const context = {
  peripherals: PeripheralDict(devices)
};

describe('Edge: Get Device Node', async () => {

  it('find by all tags and sort by name', async () => {
    const findMethod = 'findByAllTags';

    const node1 = new GetPeripheralNode('id', [[1]], {
      tags: [{ keyTemplate: '{{key}}' }, { keyTemplate: '{{anotherKey}}' }],
      findMethod,
      findMultiple: true,
      resultPath: 'result'
    });
    const node2 = new GetPeripheralNode('id', [[1]], {
      tags: [{ keyTemplate: '{{key}}' }, { valueTemplate: '{{value}}' }, { keyTemplate: '{{anotherKey}}' }],
      findMethod,
      findMultiple: true,
      resultPath: 'result',
      sortDirection: 'des'
    });
    const node3 = new GetPeripheralNode('id', [[1]], {
      tags: [{ valueTemplate: '{{value}}' }],
      findMethod,
      findMultiple: true,
      resultPath: 'result'
    });
    const node4 = new GetPeripheralNode('id', [[1]], {
      tags: [{ keyTemplate: '{{key}}', valueTemplate: '{{value}}' }],
      findMethod,
      findMultiple: true,
      resultPath: 'result'
    });

    const [r1, r2, r3, r4] = await Promise.all([
      node1.run(context, { key: 'key2', anotherKey: 'key5' }),
      node2.run(context, { key: 'key2', anotherKey: 'key3', value: 'beep' }),
      node3.run(context, { value: 'haw' }),
      node4.run(context, { key: 'key5', value: 'beep' })
    ]);

    r1[1].result.should.deepEqual([devices['000000000000000000000001']]);
    r2[1].result.should.deepEqual([devices['000000000000000000000003'], devices['000000000000000000000001']]);
    r3[1].result.should.deepEqual([devices['000000000000000000000002'], devices['000000000000000000000001'], devices['000000000000000000000004']]);
    r4[1].result.should.deepEqual([devices['000000000000000000000005'], devices['000000000000000000000001']]);
  });

  it('find by any tags and sort by id', async () => {
    const findMethod = 'findByAnyTags';

    const node1 = new GetPeripheralNode('id', [[1]], {
      tags: [{ keyTemplate: '{{key}}' }, { keyTemplate: '{{anotherKey}}' }],
      findMethod,
      findMultiple: true,
      resultPath: 'result',
      sortField: 'id'
    });
    const node2 = new GetPeripheralNode('id', [[1]], {
      tags: [{ keyTemplate: '{{key}}' }, { valueTemplate: '{{value}}' }, { keyTemplate: '{{anotherKey}}' }],
      findMethod,
      findMultiple: true,
      resultPath: 'result',
      sortField: 'id',
      sortDirection: 'des'
    });
    const node3 = new GetPeripheralNode('id', [[1]], {
      tags: [{ valueTemplate: '{{value}}' }],
      findMethod,
      findMultiple: true,
      resultPath: 'result',
      sortField: 'id'
    });
    const node4 = new GetPeripheralNode('id', [[1]], {
      tags: [{ keyTemplate: '{{key}}', valueTemplate: '{{value}}' }],
      findMethod,
      findMultiple: true,
      resultPath: 'result',
      sortField: 'id'
    });

    const [r1, r2, r3, r4] = await Promise.all([
      node1.run(context, { key: 'key2', anotherKey: 'key5' }),
      node2.run(context, { key: 'key2', anotherKey: 'key3', value: 'beep' }),
      node3.run(context, { value: 'haw' }),
      node4.run(context, { key: 'key5', value: 'beep' })
    ]);

    r1[1].result.should.deepEqual([devices['000000000000000000000001'], devices['000000000000000000000003'], devices['000000000000000000000005']]);
    r2[1].result.should.deepEqual([devices['000000000000000000000005'], devices['000000000000000000000003'], devices['000000000000000000000002'], devices['000000000000000000000001']]);
    r3[1].result.should.deepEqual([devices['000000000000000000000001'], devices['000000000000000000000002'], devices['000000000000000000000004']]);
    r4[1].result.should.deepEqual([devices['000000000000000000000001'], devices['000000000000000000000005']]);
  });

  it('find by id', async () => {
    const findMethod = 'id';

    const node1 = new GetPeripheralNode('id', [[1]], {
      idTemplate: '{{id}}',
      findMethod,
      resultPath: 'result'
    });

    const [r1, r2] = await Promise.all([
      node1.run(context, { id: '000000000000000000000001' }),
      node1.run(context, { id: '000000000000000000000010' })
    ]);

    r1[1].result.should.deepEqual(devices['000000000000000000000001']);
    should.not.exist(r2[1].result);
  });

  it('find by name', async () => {
    const findMethod = 'name';

    const node1 = new GetPeripheralNode('id', [[1]], {
      name: '{{name}}',
      findMethod,
      findMultiple: true,
      resultPath: 'result'
    });

    const node2 = new GetPeripheralNode('id', [[1]], {
      name: '{{name}}',
      findMethod,
      resultPath: 'result',
      sortField: 'id',
      sortDirection: 'desc'
    });

    const [r1, r2, r3] = await Promise.all([
      node1.run(context, { name: 'Dopey' }),
      node1.run(context, { name: 'Happy' }),
      node2.run(context, { name: 'Dopey' })
    ]);

    r1[1].result.should.deepEqual([devices['000000000000000000000002'], devices['000000000000000000000006']]);
    r2[1].result.should.deepEqual([]);
    r3[1].result.should.deepEqual(devices['000000000000000000000006']);
  });

  it('find by any tags and use templates in the sort fields', async () => {
    const findMethod = 'findByAnyTags';

    const node1 = new GetPeripheralNode('id', [[1]], {
      tags: [{ keyTemplate: '{{key}}' }, { keyTemplate: '{{anotherKey}}' }],
      findMethod,
      findMultiple: true,
      resultPath: 'result',
      sortField: '{{field}}'
    });
    const node2 = new GetPeripheralNode('id', [[1]], {
      tags: [{ keyTemplate: '{{key}}' }, { valueTemplate: '{{value}}' }, { keyTemplate: '{{anotherKey}}' }],
      findMethod,
      findMultiple: true,
      resultPath: 'result',
      sortField: 'id',
      sortDirection: '{{direction}}'
    });
    const node3 = new GetPeripheralNode('id', [[1]], {
      tags: [{ valueTemplate: '{{value}}' }],
      findMethod,
      findMultiple: true,
      resultPath: 'result',
      sortField: '{{field}}'
    });
    const node4 = new GetPeripheralNode('id', [[1]], {
      tags: [{ keyTemplate: '{{key}}', valueTemplate: '{{value}}' }],
      findMethod,
      findMultiple: true,
      resultPath: 'result',
      sortDirection: '{{direction}}'
    });

    const [r1, r2, r3, r4] = await Promise.all([
      node1.run(context, { key: 'key2', anotherKey: 'key5', field: 'id' }),
      node2.run(context, { key: 'key2', anotherKey: 'key3', value: 'beep', direction: 'DESC' }),
      node3.run(context, { value: 'haw', field: 'name' }),
      node4.run(context, { key: 'key5', value: 'beep', direction: 'ASC' })
    ]);

    r1[1].result.should.deepEqual([devices['000000000000000000000001'], devices['000000000000000000000003'], devices['000000000000000000000005']]);
    r2[1].result.should.deepEqual([devices['000000000000000000000005'], devices['000000000000000000000003'], devices['000000000000000000000002'], devices['000000000000000000000001']]);
    r3[1].result.should.deepEqual([devices['000000000000000000000002'], devices['000000000000000000000001'], devices['000000000000000000000004']]);
    r4[1].result.should.deepEqual([devices['000000000000000000000005'], devices['000000000000000000000001']]);
  });

  it('work with tags as array, attributes as object', async () => {
    const findMethod = 'id';

    const node1 = new GetPeripheralNode('id', [[1]], {
      idTemplate: '{{id}}',
      findMethod,
      resultPath: 'result',
      tagsAsObject: false,
      attributesAsObject: true
    });

    const r1 = await node1.run(context, { id: '000000000000000000000001' });

    r1[1].result.should.deepEqual({
      id: '000000000000000000000001',
      name: 'Grumpy',
      tags: [
        { key: 'key1', value: 'beep' },
        { key: 'key1', value: 'bop' },
        { key: 'key2', value: 'bop' },
        { key: 'key3', value: 'yee' },
        { key: 'key4', value: 'haw' },
        { key: 'key5', value: 'beep' }
      ],
      attributes: {
        hello: {
          name: 'hello',
          dataType: 'number',
          attributeTags: {
            a: 'b'
          }
        }
      },
      deviceClass: 'floating'
    });
  });

  it('work with tags as object, attributes as array', async () => {
    const findMethod = 'id';

    const node1 = new GetPeripheralNode('id', [[1]], {
      idTemplate: '{{id}}',
      findMethod,
      resultPath: 'result',
      tagsAsObject: true,
      attributesAsObject: false
    });

    const r1 = await node1.run(context, { id: '000000000000000000000001' });

    r1[1].result.should.deepEqual({
      id: '000000000000000000000001',
      name: 'Grumpy',
      tags: { key1: ['beep', 'bop'], key2: ['bop'], key3: ['yee'], key4: ['haw'], key5: ['beep'] },
      attributes: [{
        name: 'hello',
        dataType: 'number',
        attributeTags: {
          a: 'b'
        }
      }],
      deviceClass: 'floating'
    });
  });

});
