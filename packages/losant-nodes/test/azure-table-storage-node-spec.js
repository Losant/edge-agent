import { nock } from './common.js';
import AzureTableStorageNode from '../src/azure-table-storage-node.js';

const baseConfig = {
  accountTemplate: 'testAccount',
  accountKeyTemplate: 'testKey',
  tableNameTemplate: 'testTable',
  destination: 'testResult'
};

describe('AzureTableStorageNode', () => {
  it('should validate generic fields', async () => {
    await new AzureTableStorageNode('id', [[4]], {}).run({}, {}).should.be.rejectedWith({ message: 'Table Name is required.' });
    const config = { tableNameTemplate: 'testTable' };

    await new AzureTableStorageNode('id', [[4]], config).run({}, {}).should.be.rejectedWith({ message: 'Account is required.' });
    config.accountTemplate = 'testAccount';

    await new AzureTableStorageNode('id', [[4]], config).run({}, {}).should.be.rejectedWith({ message: 'Account Key is required.' });
  });
  it('should get a single entity', async () => {
    await new AzureTableStorageNode('id', [[4]], {
      ...baseConfig,
      operation: 'get',
      rowKeyTemplate: 'testRowKey'
    }).run({}, {}).should.be.rejectedWith({ message: 'Partition Key is required.' });

    await new AzureTableStorageNode('id', [[4]], {
      ...baseConfig,
      operation: 'get',
      partitionKeyTemplate: 'testPartitionKey',
      rowKeyTemplate: ''
    }).run({}, {}).should.be.rejectedWith({ message: 'Row Key is required.' });

    nock('https://testAccount.table.core.windows.net:443', { encodedQueryParams: true })
      .get('/testTable(PartitionKey=\'testPart\',RowKey=\'testRow\')')
      .reply(200, {
        'odata.metadata': 'https://testAccount.table.core.windows.net/$metadata#testTable/@Element', 'odata.etag': "W/\"datetime'2023-07-03T16%3A56%3A03.9531335Z'\"", 'PartitionKey': 'testPart', 'RowKey': 'testRow', 'Timestamp': '2023-07-03T16:56:03.9531335Z', 'Look': 'Here!', 'Wow': 'Big!'
      });
    const result = await new AzureTableStorageNode('id', [[4]], {
      ...baseConfig,
      operation: 'get',
      partitionKeyTemplate: 'testPart',
      rowKeyTemplate: 'testRow'
    }).run({}, {});
    result[1].should.deepEqual({
      testResult: {
        'Look': 'Here!', 'Wow': 'Big!', 'etag': "W/\"datetime'2023-07-03T16%3A56%3A03.9531335Z'\"", 'odata.metadata': 'https://testAccount.table.core.windows.net/$metadata#testTable/@Element', 'partitionKey': 'testPart', 'rowKey': 'testRow', 'timestamp': '2023-07-03T16:56:03.9531335Z'
      }
    });
  });

  it('should get entity with selected property', async () => {
    nock('https://testAccount.table.core.windows.net:443', { encodedQueryParams: true })
      .get("/testTable(PartitionKey='testPart',RowKey='testRow')?$select=Wow%2CHuge")
      .reply(200, {
        'odata.metadata': 'https://testAccount.table.core.windows.net/$metadata#testTable/@Element&select=Wow%2CHuge', 'odata.etag': "W/\"datetime'2023-07-03T16%3A56%3A03.9531335Z'\"", 'Wow': 'Big!'
      });
    const node = new AzureTableStorageNode('id', [[4]], {
      ...baseConfig,
      operation: 'get',
      partitionKeyTemplate: 'testPart',
      rowKeyTemplate: 'testRow',
      selectTemplate: '{{a}}, {{b}}'
    });
    const result = await node.run({}, { a: 'Wow', b: 'Huge' });
    result[1].should.deepEqual({
      a: 'Wow',
      b: 'Huge',
      testResult: {
        'odata.metadata': 'https://testAccount.table.core.windows.net/$metadata#testTable/@Element&select=Wow%2CHuge',
        'etag': "W/\"datetime'2023-07-03T16%3A56%3A03.9531335Z'\"",
        'Wow': 'Big!'
      }
    });
  });

  it('should query entities', async () => {
    await new AzureTableStorageNode('id', [[4]], {
      ...baseConfig,
      operation: 'query',
      topTemplate: 2000
    }).run({}, {}).should.be.rejectedWith({ message: 'Max Entities number (2000) is invalid.' });

    nock('https://testAccount.table.core.windows.net:443', { encodedQueryParams: true })
      .get('/testTable()?$top=2')
      .reply(200, {
        'odata.metadata': 'https://testAccount.table.core.windows.net/$metadata#testTable/@Element',
        'value': [{
          'odata.etag': 'W/"datetime\'2023-07-03T15%3A18%3A22.272918Z\'"',
          'PartitionKey': 'testPart1',
          'RowKey': 'testRow1',
          'Timestamp': '2023-07-03T15:18:22.272918Z',
          'Look': 'Here!',
          'Wow': 'Big!'
        },
        {
          'odata.etag': 'W/"datetime\'2023-07-03T16%3A56%3A03.9531335Z\'"',
          'PartitionKey': 'testPart2',
          'RowKey': 'testRow2',
          'Timestamp': '2023-07-03T16:56:03.9531335Z',
          'Look': 'Oh?',
          'Wow': 'Much!'
        }]
      });
    const result = await new AzureTableStorageNode('id', [[4]], {
      ...baseConfig,
      operation: 'query',
      topTemplate: 2
    }).run({}, {});

    result[1].should.deepEqual({
      testResult: {
        entities: [{
          etag: 'W/"datetime\'2023-07-03T15%3A18%3A22.272918Z\'"',
          partitionKey: 'testPart1',
          rowKey: 'testRow1',
          timestamp: '2023-07-03T15:18:22.272918Z',
          Look: 'Here!',
          Wow: 'Big!'
        },
        {
          etag: 'W/"datetime\'2023-07-03T16%3A56%3A03.9531335Z\'"',
          partitionKey: 'testPart2',
          rowKey: 'testRow2',
          timestamp: '2023-07-03T16:56:03.9531335Z',
          Look: 'Oh?',
          Wow: 'Much!'
        }],
        continuationToken: undefined,
        filter: undefined,
        select: undefined,
        top: 2
      }
    });
  });

  it('should query entities with no next entity', async () => {
    nock('https://testAccount.table.core.windows.net:443', { encodedQueryParams: true })
      .get('/testTable()?$top=2&NextPartitionKey=1!8!cGFydDM-&NextRowKey=1!8!cm93Mw--')
      .reply(400, '{"odata.error":{"code":"EntityAlreadyExists","message":{"lang":"en-US","value":"The specified entity already exists.\\nRequestId:d93d3e62-9002-0033-14ef-cadfa3000000\\nTime:2023-08-09T18:30:01.0805515Z"}}}');
    const node = new AzureTableStorageNode('id', [[4]], {
      ...baseConfig,
      operation: 'query',
      topTemplate: 2,
      continuationTokenTemplate: Buffer(JSON.stringify({
        nextPartitionKey: '1!8!cGFydDM-',
        nextRowKey: '1!8!cm93Mw--'
      })).toString('base64')
    });
    const result = await node.run({}, {});
    result[1].should.deepEqual({
      testResult: {
        error: {
          'odata.error': {
            code: 'EntityAlreadyExists',
            message: {
              lang: 'en-US',
              value: 'The specified entity already exists.\nRequestId:d93d3e62-9002-0033-14ef-cadfa3000000\nTime:2023-08-09T18:30:01.0805515Z'
            }
          }
        }
      }
    });
  });

  it('should correctly filter and select queried entities', async () => {
    nock('https://testAccount.table.core.windows.net:443', { encodedQueryParams: true })
      .get('/testTable()?$top=2&$select=Look%2Cmom%2Cno%2Chands&$filter=PartitionKey%20eq%20%27part2%27')
      .reply(200, {
        'odata.metadata': 'https://testAccount.table.core.windows.net/$metadata#testTable&$select=Look%2Cmom%2Cno%2Chands&$filter=PartitionKey%20eq%20%27part2%27',
        'value': [{
          'odata.etag': "W/\"datetime'2023-07-03T16%3A56%3A03.9531335Z'\"",
          'Look': 'Oh?'
        }]
      });
    const node = new AzureTableStorageNode('id', [[4]], {
      ...baseConfig,
      operation: 'query',
      filterTemplate: 'PartitionKey eq \'part2\'',
      selectTemplate: '{{a}}',
      topTemplate: 2
    });
    const result = await node.run({}, { a: 'Look, mom, no, hands' });
    result[1].should.deepEqual({
      a: 'Look, mom, no, hands',
      testResult: {
        entities: [{
          etag: 'W/"datetime\'2023-07-03T16%3A56%3A03.9531335Z\'"',
          Look: 'Oh?'
        }],
        continuationToken: undefined,
        filter: 'PartitionKey eq \'part2\'',
        select: [ 'Look', 'mom', 'no', 'hands' ],
        top: 2
      }
    });
  });
  it('should correctly query pages of entities', async () => {
    nock('https://testAccount.table.core.windows.net:443', { encodedQueryParams: true })
      .get('/testTable()?$top=2&NextPartitionKey=1!8!cGFydDM-&NextRowKey=1!8!cm93Mw--')
      .reply(200, {
        'odata.metadata': 'https://testAccount.table.core.windows.net/$metadata#testTable&NextPartitionKey=1!8!cDFydDM-&NextRowKey=1!8!cd93Mw--',
        'value': [
          {
            'odata.etag': 'W/"datetime\'2023-07-03T15%3A18%3A22.272918Z\'"',
            'PartitionKey': 'testPart3',
            'RowKey': 'testRow3',
            'Timestamp': '2023-07-03T15:18:22.272918Z',
            'Look': 'There!',
            'Wow': 'How?'
          },
          {
            'odata.etag': 'W/"datetime\'2023-07-03T16%3A56%3A03.9531335Z\'"',
            'PartitionKey': 'testPart4',
            'RowKey': 'testRow4',
            'Timestamp': '2023-07-03T16:56:03.9531335Z',
            'Look': 'Merged',
            'Wow': 'Replaced'
          }
        ]
      },
      [
        'x-ms-continuation-NextPartitionKey',
        '1!8!cGFydDM-',
        'x-ms-continuation-NextRowKey',
        '1!8!cm93Mw--'
      ]);
    const result = await new AzureTableStorageNode('id', [[4]], {
      ...baseConfig,
      operation: 'query',
      topTemplate: 2,
      continuationTokenTemplate: Buffer.from(JSON.stringify(
        { nextPartitionKey: '1!8!cGFydDM-', nextRowKey: '1!8!cm93Mw--' }
      )).toString('base64')
    }).run({}, {});

    result[1].should.deepEqual({
      testResult: {
        entities: [
          {
            etag: 'W/"datetime\'2023-07-03T15%3A18%3A22.272918Z\'"',
            partitionKey: 'testPart3',
            rowKey: 'testRow3',
            timestamp: '2023-07-03T15:18:22.272918Z',
            Look: 'There!',
            Wow: 'How?'
          },
          {
            etag: 'W/"datetime\'2023-07-03T16%3A56%3A03.9531335Z\'"',
            partitionKey: 'testPart4',
            rowKey: 'testRow4',
            timestamp: '2023-07-03T16:56:03.9531335Z',
            Look: 'Merged',
            Wow: 'Replaced'
          }
        ],
        continuationToken: 'eyJuZXh0UGFydGl0aW9uS2V5IjoiMSE4IWNHRnlkRE0tIiwibmV4dFJvd0tleSI6IjEhOCFjbTkzTXctLSJ9',
        filter: undefined,
        select: undefined,
        top: 2
      }
    });
  });

  it('should correctly validate and insert an entity', async () => {
    await new AzureTableStorageNode('id', [[4]], {
      ...baseConfig,
      operation: 'insert'
    }).run({}, {}).should.be.rejectedWith({ message: 'Entity is required.' });

    await new AzureTableStorageNode('id', [[4]], {
      ...baseConfig,
      operation: 'insert',
      entityTemplate: 'invalid'
    }).run({}, {}).should.be.rejectedWith({ message: 'entity template did not render to valid JSON' });

    await new AzureTableStorageNode('id', [[4]], {
      ...baseConfig,
      operation: 'insert',
      entityTemplate: { partitionKey: 'testPartitionKey', Look: 'New', Wow: 'Inserted' }
    }).run({}, {}).should.be.rejectedWith({ message: 'entity.rowKey is required and must be a string.' });

    await new AzureTableStorageNode('id', [[4]], {
      ...baseConfig,
      operation: 'insert',
      entityTemplate: { rowKey: 'testRowKey', Look: 'New', Wow: 'Inserted' }
    }).run({}, {}).should.be.rejectedWith({ message: 'entity.partitionKey is required and must be a string.' });

    nock('https://testAccount.table.core.windows.net:443', { encodedQueryParams: true })
      .post('/testTable', { PartitionKey: 'testPartitionKey', RowKey: 'testRowKey', Look: 'New', Wow: 'Inserted' })
      .reply(204, '');
    const result = await new AzureTableStorageNode('id', [[4]], {
      ...baseConfig,
      operation: 'insert',
      entityTemplate: { partitionKey: 'testPartitionKey', rowKey: 'testRowKey', Look: 'New', Wow: 'Inserted' }
    }).run({}, {});

    result[1].should.deepEqual({
      testResult: { partitionKey: 'testPartitionKey', rowKey: 'testRowKey', Look: 'New', Wow: 'Inserted' }
    });
  });

  it('should correctly validate and replace an entity', async () => {
    await new AzureTableStorageNode('id', [[4]], {
      ...baseConfig,
      operation: 'replace',
      entityTemplate: { rowKey: 'testRowKey' },
      upsert: true
    }).run({}, {}).should.be.rejectedWith({ message: 'entity.partitionKey is required and must be a string.' });

    await new AzureTableStorageNode('id', [[4]], {
      ...baseConfig,
      operation: 'replace',
      entityTemplate: { partitionKey: 'testPartitionKey' },
      upsert: true
    }).run({}, {}).should.be.rejectedWith({ message: 'entity.rowKey is required and must be a string.' });

    await new AzureTableStorageNode('id', [[4]], {
      ...baseConfig,
      operation: 'replace',
      entityTemplate: '{{a}}',
      upsert: true
    }).run({}, {}).should.be.rejectedWith({ message: 'Entity is required.' });

    nock('https://testAccount.table.core.windows.net:443', { encodedQueryParams: true })
      .put('/testTable(PartitionKey=\'testPartitionKey\',RowKey=\'testRowKey\')', { PartitionKey: 'testPartitionKey', RowKey: 'testRowKey', Look: 'Different', Wow: 'Replaced' })
      .reply(204, '');
    const result = await new AzureTableStorageNode('id', [[4]], {
      ...baseConfig,
      operation: 'replace',
      entityTemplate: { partitionKey: 'testPartitionKey', rowKey: 'testRowKey', Look: 'Different', Wow: 'Replaced' },
      upsert: true
    }).run({}, {});
    result[1].should.deepEqual({ testResult: { success: true } });
  });

  it('should correctly validate and merge an entity', async () => {
    await new AzureTableStorageNode('id', [[4]], {
      ...baseConfig,
      operation: 'merge',
      tableNameTemplate: 'testName',
      entityTemplate: { rowKey: 'testRowKey' }
    }).run({}, {}).should.be.rejectedWith({ message: 'entity.partitionKey is required and must be a string.' });

    await new AzureTableStorageNode('id', [[4]], {
      ...baseConfig,
      operation: 'merge',
      partitionKeyTemplate: 'testPartitionKey',
      entityTemplate: { partitionKey: 'testPartitionKey' }
    }).run({}, {}).should.be.rejectedWith({ message: 'entity.rowKey is required and must be a string.' });

    nock('https://testAccount.table.core.windows.net:443', { encodedQueryParams: true })
      .patch('/testTable(PartitionKey=\'testPartitionKey\',RowKey=\'testRowKey\')', { PartitionKey: 'testPartitionKey', RowKey: 'testRowKey', Look: 'Merged' })
      .reply(204, '');

    const result = await new AzureTableStorageNode('id', [[4]], {
      ...baseConfig,
      operation: 'merge',
      entityTemplate: { partitionKey: 'testPartitionKey', rowKey: 'testRowKey', Look: 'Merged' },
      upsert: false
    }).run({}, {});
    result[1].should.deepEqual({ testResult: { success: true } });
  });

  it('should validate and delete an entity', async () => {
    await new AzureTableStorageNode('id', [[4]], {
      ...baseConfig,
      operation: 'delete',
      partitionKeyTemplate: 'testPartitionKey',
      rowKeyTemplate: ''
    }).run({}, {}).should.be.rejectedWith({ message: 'Row Key is required.' });

    await new AzureTableStorageNode('id', [[4]], {
      ...baseConfig,
      operation: 'delete',
      partitionKeyTemplate: '',
      rowKeyTemplate: 'testRowKey'
    }).run({}, {}).should.be.rejectedWith({ message: 'Partition Key is required.' });

    nock('https://testAccount.table.core.windows.net:443', { encodedQueryParams: true })
      .delete('/testTable(PartitionKey=\'testPartitionKey\',RowKey=\'testRowKey\')')
      .reply(204, '');
    const result = await new AzureTableStorageNode('id', [[4]], {
      ...baseConfig,
      operation: 'delete',
      partitionKeyTemplate: 'testPartitionKey',
      rowKeyTemplate: 'testRowKey'
    }).run({}, {});
    result[1].should.deepEqual({ testResult: { success: true } });
  });
});
