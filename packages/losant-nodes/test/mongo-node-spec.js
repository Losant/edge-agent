import { describeService } from './common.js';
import MongoNode from '../src/mongo-node.js';
import { MongoClient } from 'mongodb';
import { ObjectId } from 'losant-nodejs-utils/src/bson.js';
const testHost = process.env.MONGO_HOST_CI || 'localhost';
const testMongoUri = `mongodb://${testHost}:27017/mongonodetest?directConnection=true`;

describeService('mongo', 'MongoNode', () => {
  let client;

  afterEach(async () => {
    if (client) {
      await client.close(true);
      client = null;
    }
  });

  it('should correctly do mongo operations', async () => {
    const removeNode = new MongoNode('id', [[4]], {
      collectionNameTemplate: '{{collectionName}}',
      mongoUriTemplate: '{{uri}}',
      mongoMethod: 'remove',
      mongoArgs: [{ valueType: 'path', value: 'arg1' },
        { valueType: 'path', value: 'arg2' }],
      resultPath: 'result'
    });

    const deleteOneNode = new MongoNode('id', [[4]], {
      collectionNameTemplate: '{{collectionName}}',
      mongoUriTemplate: '{{uri}}',
      mongoMethod: 'deleteOne',
      mongoArgs: [{ valueType: 'path', value: 'arg1' },
        { valueType: 'path', value: 'arg2' }],
      resultPath: 'result'
    });

    const deleteManyNode = new MongoNode('id', [[4]], {
      collectionNameTemplate: '{{collectionName}}',
      mongoUriTemplate: '{{uri}}',
      mongoMethod: 'deleteMany',
      mongoArgs: [{ valueType: 'path', value: 'arg1' },
        { valueType: 'path', value: 'arg2' }],
      resultPath: 'result'
    });

    const insertNode = new MongoNode('id', [[4]], {
      collectionNameTemplate: '{{collectionName}}',
      mongoUriTemplate: '{{uri}}',
      mongoMethod: 'insert',
      mongoArgs: [{ valueType: 'path', value: 'arg1' }],
      resultPath: 'result'
    });

    const insertOneNode = new MongoNode('id', [[4]], {
      collectionNameTemplate: '{{collectionName}}',
      mongoUriTemplate: '{{uri}}',
      mongoMethod: 'insertOne',
      mongoArgs: [{ valueType: 'path', value: 'arg1' }],
      resultPath: 'result'
    });

    const insertManyNode = new MongoNode('id', [[4]], {
      collectionNameTemplate: '{{collectionName}}',
      mongoUriTemplate: '{{uri}}',
      mongoMethod: 'insertMany',
      mongoArgs: [{ valueType: 'path', value: 'arg1' }],
      resultPath: 'result'
    });

    const findOneNode = new MongoNode('id', [[4]], {
      collectionNameTemplate: '{{collectionName}}',
      mongoUriTemplate: '{{uri}}',
      mongoMethod: 'findOne',
      mongoArgs: [{ valueType: 'json', value: '{ "value": 2 }' },
        { valueType: 'path', value: 'arg2' }],
      resultPath: 'result'
    });

    const findNode = new MongoNode('id', [[4]], {
      collectionNameTemplate: '{{collectionName}}',
      mongoUriTemplate: '{{uri}}',
      mongoMethod: 'find',
      mongoArgs: [{ valueType: 'json', value: '{ "value": 2 }' },
        { valueType: 'path', value: 'arg2' }],
      resultPath: 'result'
    });

    const distinctNode = new MongoNode('id', [[4]], {
      collectionNameTemplate: '{{collectionName}}',
      mongoUriTemplate: '{{uri}}',
      mongoMethod: 'distinct',
      mongoArgs: [{ valueType: 'template', value: '{{field}}' },
        { valueType: 'path', value: 'arg2' }],
      resultPath: 'result'
    });

    const countNode = new MongoNode('id', [[4]], {
      collectionNameTemplate: '{{collectionName}}',
      mongoUriTemplate: '{{uri}}',
      mongoMethod: 'count',
      mongoArgs: [{ valueType: 'template', value: '{{arg1}}' },
        { valueType: 'path', value: 'arg2' }],
      resultPath: 'result'
    });

    const updateNode = new MongoNode('id', [[4]], {
      collectionNameTemplate: '{{collectionName}}',
      mongoUriTemplate: '{{uri}}',
      mongoMethod: 'update',
      mongoArgs: [{ valueType: 'json', value: '{ "value": 2 }' },
        { valueType: 'json', value: '{ "$set": { "value": 5 } }' },
        { valueType: 'json', value: '{ "multi": true }' }],
      resultPath: 'result'
    });

    const updateOneNode = new MongoNode('id', [[4]], {
      collectionNameTemplate: '{{collectionName}}',
      mongoUriTemplate: '{{uri}}',
      mongoMethod: 'updateOne',
      mongoArgs: [{ valueType: 'json', value: '{ "value": 2 }' },
        { valueType: 'json', value: '{ "$set": { "value": 5 } }' }],
      resultPath: 'result'
    });

    const updateManyNode = new MongoNode('id', [[4]], {
      collectionNameTemplate: '{{collectionName}}',
      mongoUriTemplate: '{{uri}}',
      mongoMethod: 'updateMany',
      mongoArgs: [{ valueType: 'json', value: '{ "value": 2 }' },
        { valueType: 'json', value: '{ "$set": { "value": 5 } }' }],
      resultPath: 'result'
    });

    const replaceOneNode = new MongoNode('id', [[4]], {
      collectionNameTemplate: '{{collectionName}}',
      mongoUriTemplate: '{{uri}}',
      mongoMethod: 'replaceOne',
      mongoArgs: [{ valueType: 'json', value: '{ "value": 2 }' },
        { valueType: 'json', value: '{ "value": 5 }' }],
      resultPath: 'result'
    });

    const aggregateNode = new MongoNode('id', [[4]], {
      collectionNameTemplate: '{{collectionName}}',
      mongoUriTemplate: '{{uri}}',
      mongoMethod: 'aggregate',
      mongoArgs: [{ valueType: 'path', value: 'arg1' }],
      resultPath: 'result'
    });

    let [ oids, p ] = await removeNode.run({}, {
      uri: testMongoUri,
      collectionName: 'words',
      arg1: { },
      arg2: { single: false }
    });
    oids.should.deepEqual([[4]]);
    p.should.deepEqual({
      arg1: {},
      arg2: { single: false },
      collectionName: 'words',
      result: { n: p.result.n, ok: 1 },
      uri: testMongoUri
    });
    [ oids, p ] = await deleteOneNode.run({}, {
      uri: testMongoUri,
      collectionName: 'words',
      arg1: { }
    });
    oids.should.deepEqual([[4]]);
    p.should.deepEqual({
      arg1: {},
      collectionName: 'words',
      result: { deletedCount: 0, result: { n: 0, ok: 1 } },
      uri: testMongoUri
    });
    [ oids, p ] = await deleteManyNode.run({}, {
      uri: testMongoUri,
      collectionName: 'words',
      arg1: { }
    });
    oids.should.deepEqual([[4]]);
    p.should.deepEqual({
      arg1: {},
      collectionName: 'words',
      result: { deletedCount: 0, result: { n: 0, ok: 1 } },
      uri: testMongoUri
    });
    [ oids, p ] = await insertNode.run({}, {
      uri: testMongoUri,
      collectionName: 'words',
      arg1: '{ "test": "document", "value": 2 }'
    });
    oids.should.deepEqual([[4]]);
    p.should.deepEqual({
      arg1: '{ "test": "document", "value": 2 }',
      collectionName: 'words',
      result: { n: 1, ok: 1 },
      uri: testMongoUri
    });
    [ oids, p ] = await insertManyNode.run({}, {
      uri: testMongoUri,
      collectionName: 'words',
      arg1: '[{ "test": "doc2", "value": 2 }, { "test": "doc3", "value": 3 }]'
    });
    oids.should.deepEqual([[4]]);
    p.should.deepEqual({
      arg1: '[{ "test": "doc2", "value": 2 }, { "test": "doc3", "value": 3 }]',
      collectionName: 'words',
      result: {
        result: { ok: 1, n: 2 },
        ops: [
          { test: 'doc2', value: 2, _id: p.result.insertedIds[0] },
          { test: 'doc3', value: 3, _id: p.result.insertedIds[1] }
        ],
        insertedCount: 2,
        insertedIds: p.result.insertedIds
      },
      uri: testMongoUri
    });
    [ oids, p ] = await insertOneNode.run({}, {
      uri: testMongoUri,
      collectionName: 'words',
      arg1: '{ "test": "doc3", "value": 4 }'
    });
    oids.should.deepEqual([[4]]);

    p.should.deepEqual({
      arg1: '{ "test": "doc3", "value": 4 }',
      collectionName: 'words',
      result: {
        result: { ok: 1, n: 1 },
        ops: [ { test: 'doc3', value: 4, _id: p.result.insertedId } ],
        insertedCount: 1,
        insertedId: p.result.insertedId
      },
      uri: testMongoUri
    });
    [ oids, p ] = await findOneNode.run({}, {
      uri: testMongoUri,
      collectionName: 'words'
    });
    oids.should.deepEqual([[4]]);
    p.should.deepEqual({
      collectionName: 'words',
      result: { _id: p.result._id, test: 'document', value: 2 },
      uri: testMongoUri
    });
    [ oids, p ] = await findNode.run({}, {
      uri: testMongoUri,
      collectionName: 'words',
      arg2: { fields: { test: 1 } }
    });
    oids.should.deepEqual([[4]]);
    p.should.deepEqual({
      collectionName: 'words',
      arg2: { fields: { test: 1 } },
      result: [ { _id: p.result[0]._id, test: 'document' },
        { _id: p.result[1]._id, test: 'doc2' } ],
      uri: testMongoUri
    });
    [ oids, p ] = await distinctNode.run({}, {
      uri: testMongoUri,
      collectionName: 'words',
      field: 'value'
    });
    oids.should.deepEqual([[4]]);
    p.should.deepEqual({
      collectionName: 'words',
      result: [2, 3, 4],
      field: 'value',
      uri: testMongoUri
    });
    [ oids, p ] = await countNode.run({}, {
      uri: testMongoUri,
      collectionName: 'words',
      arg1: '{ "value": 2 }'
    });
    oids.should.deepEqual([[4]]);
    p.should.deepEqual({
      collectionName: 'words',
      arg1: '{ "value": 2 }',
      result: 2,
      uri: testMongoUri
    });
    [ oids, p ] = await updateNode.run({}, {
      uri: testMongoUri,
      collectionName: 'words'
    });
    oids.should.deepEqual([[4]]);
    p.should.deepEqual({
      collectionName: 'words',
      result: { ok: 1, nModified: 2, n: 2 },
      uri: testMongoUri
    });

    [ oids, p ] = await updateOneNode.run({}, {
      uri: testMongoUri,
      collectionName: 'words'
    });
    oids.should.deepEqual([[4]]);
    p.should.deepEqual({
      collectionName: 'words',
      result: {
        result: { ok: 1, nModified: 0, n: 0 },
        matchedCount: 0,
        modifiedCount: 0,
        upsertedCount: 0,
        upsertedId: null
      },
      uri: testMongoUri
    });
    [ oids, p ] = await updateManyNode.run({}, {
      uri: testMongoUri,
      collectionName: 'words'
    });
    oids.should.deepEqual([[4]]);
    p.should.deepEqual({
      collectionName: 'words',
      result: {
        result: { ok: 1, nModified: 0, n: 0 },
        matchedCount: 0,
        modifiedCount: 0,
        upsertedCount: 0,
        upsertedId: null
      },
      uri: testMongoUri
    });

    [ oids, p ] = await replaceOneNode.run({}, {
      uri: testMongoUri,
      collectionName: 'words'
    });
    p.should.deepEqual({
      collectionName: 'words',
      result: {
        result: { ok: 1, nModified: 0, n: 0 },
        matchedCount: 0,
        modifiedCount: 0,
        upsertedCount: 0,
        upsertedId: null
      },
      uri: testMongoUri
    });

    [ oids, p ] = await aggregateNode.run({}, {
      uri: testMongoUri,
      collectionName: 'words',
      arg1: [
        { $match: { test: 'doc3' } },
        { $group: { _id: '$test', total: { $sum: '$value' } } }
      ]
    });
    p.should.deepEqual({
      collectionName: 'words',
      result: [{
        _id: 'doc3',
        total: 7
      }],
      arg1: [
        { $match: { test: 'doc3' } },
        { $group: { _id: '$test', total: { $sum: '$value' } } }
      ],
      uri: testMongoUri
    });
  });

  it('should correctly deal with bad url', async () => {
    const removeNode = new MongoNode('id', [[4]], {
      collectionNameTemplate: '{{collectionName}}',
      mongoUriTemplate: '{{uri}}',
      mongoMethod: 'remove',
      mongoArgs: [{ valueType: 'path', value: 'arg1' },
        { valueType: 'path', value: 'arg2' }],
      resultPath: 'result'
    });

    await removeNode.run({}, {
      uri: 'mongodb://@@@@@@localhost:27017/mongonodetest',
      collectionName: 'words'
    }).should.be.rejectedWith({
      name: 'MongoNodeError',
      message: 'Protocol and host list are required in the uri'
    });
  });

  it('should correctly deal with bson types', async () => {
    client = await MongoClient.connect(testMongoUri);
    const db = await client.db('mongonodetest');
    try { await db.collection('bsonTypeTest').drop(); } catch {}

    const insertFromTemplate = new MongoNode('id', [[4]], {
      collectionNameTemplate: 'bsonTypeTest',
      mongoUriTemplate: testMongoUri,
      mongoMethod: 'insertOne',
      mongoArgs: [
        { valueType: 'template', value: '{ "objId": { "$oid": "{{oid}}" }, "date": { "$date": "{{date}}" } }' }
      ],
      resultPath: 'result'
    });

    const insertFromJson = new MongoNode('id', [[4]], {
      collectionNameTemplate: 'bsonTypeTest',
      mongoUriTemplate: testMongoUri,
      mongoMethod: 'insertOne',
      mongoArgs: [
        { valueType: 'json', value: '{ "objId": { "$oid": "{{oid}}" }, "date": { "$date": "{{date}}" } }' }
      ],
      resultPath: 'result'
    });

    const insertFromPath = new MongoNode('id', [[4]], {
      collectionNameTemplate: 'bsonTypeTest',
      mongoUriTemplate: testMongoUri,
      mongoMethod: 'insertOne',
      mongoArgs: [
        { valueType: 'path', value: 'fromPath' }
      ],
      resultPath: 'result'
    });

    const insert1 = await insertFromTemplate.run({}, { oid: '000000000000000000000001', date: '2023-04-24T16:03:09.482Z' });
    const insert2 = await insertFromJson.run({}, { oid: '000000000000000000000002', date: '2023-04-24T16:04:09.482Z' });
    const insert3 = await insertFromPath.run({}, { fromPath: { objId: { $oid: '000000000000000000000003' }, date: { $date: '2023-04-24T16:05:09.482Z' } } });

    const findFromPath = new MongoNode('id', [[4]], {
      collectionNameTemplate: 'bsonTypeTest',
      mongoUriTemplate: testMongoUri,
      mongoMethod: 'findOne',
      mongoArgs: [
        { valueType: 'path', value: 'fromPath' }
      ],
      resultPath: 'result'
    });

    const findFromTemplate = new MongoNode('id', [[4]], {
      collectionNameTemplate: 'bsonTypeTest',
      mongoUriTemplate: testMongoUri,
      mongoMethod: 'findOne',
      mongoArgs: [
        { valueType: 'template', value: '{ "objId": { "$oid": "{{oid}}" }, "date": { "$date": "{{date}}" } }' }
      ],
      resultPath: 'result'
    });

    const findFromJson = new MongoNode('id', [[4]], {
      collectionNameTemplate: 'bsonTypeTest',
      mongoUriTemplate: testMongoUri,
      mongoMethod: 'findOne',
      mongoArgs: [
        { valueType: 'json', value: '{ "objId": { "$oid": "{{oid}}" }, "date": { "$date": "{{date}}" } }' }
      ],
      resultPath: 'result'
    });

    const find1 = await findFromPath.run({}, { fromPath: { objId: { $oid: '000000000000000000000001' }, date: { $date: '2023-04-24T16:03:09.482Z' } } });
    const find2 = await findFromTemplate.run({}, { oid: '000000000000000000000002', date: '2023-04-24T16:04:09.482Z' });
    const find3 = await findFromJson.run({}, { oid: '000000000000000000000003', date: '2023-04-24T16:05:09.482Z' });

    // correct types in the workflow - date as date obj, oid as ejson $oid
    [find1[1].result, find2[1].result, find3[1].result].should.deepEqual([
      {
        _id: { $oid: insert1[1].result.insertedId.$oid },
        objId: { $oid: '000000000000000000000001' },
        date: new Date('2023-04-24T16:03:09.482Z')
      },
      {
        _id: { $oid: insert2[1].result.insertedId.$oid },
        objId: { $oid: '000000000000000000000002' },
        date: new Date('2023-04-24T16:04:09.482Z')
      },
      {
        _id: { $oid: insert3[1].result.insertedId.$oid },
        objId: { $oid: '000000000000000000000003' },
        date: new Date('2023-04-24T16:05:09.482Z')
      }
    ]);

    // correct types in mongo, date as date object, oid as oid
    (await(await db.collection('bsonTypeTest').find({}, { sort: { date: 1 } })).toArray()).should.deepEqual([
      {
        _id: new ObjectId(find1[1].result._id.$oid),
        objId: new ObjectId('000000000000000000000001'),
        date: new Date('2023-04-24T16:03:09.482Z')
      },
      {
        _id: new ObjectId(find2[1].result._id.$oid),
        objId: new ObjectId('000000000000000000000002'),
        date: new Date('2023-04-24T16:04:09.482Z')
      },
      {
        _id: new ObjectId(find3[1].result._id.$oid),
        objId: new ObjectId('000000000000000000000003'),
        date: new Date('2023-04-24T16:05:09.482Z')
      }
    ]);
  });

  it('should correctly route errors to errorPath', async () => {
    const removeNode = new MongoNode('id', [[4]], {
      collectionNameTemplate: '{{collectionName}}',
      mongoUriTemplate: '{{uri}}',
      mongoMethod: 'remove',
      mongoArgs: [{ valueType: 'path', value: 'arg1' },
        { valueType: 'path', value: 'arg2' }],
      resultPath: 'result',
      errorBehavior: 'payloadPath',
      errorPath: 'data.mongoBoy'
    });

    const result = await removeNode.run({}, {
      uri: 'mongodb://@@@@@@localhost:27017/mongonodetest',
      collectionName: 'words'
    });
    result[1].data.should.deepEqual({
      mongoBoy: {
        type: 'MongoNodeError',
        message: 'Protocol and host list are required in the uri'
      }
    });
  });

  it('should correctly wrap server selection error', async () => {
    const badNode = new MongoNode('id', [[4]], {
      collectionNameTemplate: '{{collectionName}}',
      mongoUriTemplate: `mongodb://${testHost}:27017/mongonodetest?replicaSet=notAThing&serverSelectionTimeoutMS=500`,
      mongoMethod: 'findOne',
      mongoArgs: [],
      resultPath: 'result'
    });

    await badNode.run({}, {
      uri: testMongoUri,
      collectionName: 'theCollection',
      arg1: { foo: 'bar' }
    }).should.be.rejectedWith({ name: 'MongoNodeSelectionError' });
  });

  it('should correctly route mongo errors to errorPath', async () => {
    client = await MongoClient.connect(testMongoUri);
    const db = await client.db('mongonodetest');
    const collection = await db.createCollection('theCollection');
    await collection.createIndex({ foo: 1 }, { unique: true });

    const badNode = new MongoNode('id', [[4]], {
      collectionNameTemplate: '{{collectionName}}',
      mongoUriTemplate: '{{uri}}',
      mongoMethod: 'insertOne',
      mongoArgs: [{ valueType: 'path', value: 'arg1' }, { valueType: 'path', value: 'arg2' }],
      resultPath: 'result',
      errorBehavior: 'payloadPath',
      errorPath: 'data.mongoBoy'
    });

    const result1 = await badNode.run({}, {
      uri: testMongoUri,
      collectionName: 'theCollection',
      arg1: { foo: 'bar' }
    });

    const result2 = await badNode.run({}, {
      uri: testMongoUri,
      collectionName: 'theCollection',
      arg1: { foo: 'bar' }
    });

    await db.collection('theCollection').drop();
    result1[1].result.insertedCount.should.deepEqual(1);
    const error = result2[1].data.mongoBoy;
    error.type.should.deepEqual('MongoNodeError');
    error.message.should.containEql('duplicate key error');
  });

  it('should correctly run methods with no input', async () => {
    const findNode = new MongoNode('id', [[4]], {
      collectionNameTemplate: '{{collectionName}}',
      mongoUriTemplate: '{{uri}}',
      mongoMethod: 'find',
      mongoArgs: [{ valueType: 'json', value: '' }],
      resultPath: 'result',
      errorBehavior: 'payloadPath',
      errorPath: 'data.error'
    });
    const countNode = new MongoNode('id', [[4]], {
      collectionNameTemplate: '{{collectionName}}',
      mongoUriTemplate: '{{uri}}',
      mongoMethod: 'count',
      mongoArgs: [{ valueType: 'json', value: '' }],
      resultPath: 'result',
      errorBehavior: 'payloadPath',
      errorPath: 'data.error'
    });
    const distinctNode = new MongoNode('id', [[4]], {
      collectionNameTemplate: '{{collectionName}}',
      mongoUriTemplate: '{{uri}}',
      mongoMethod: 'distinct',
      mongoArgs: [{ valueType: 'json', value: '' }, { valueType: 'json', value: '' }],
      resultPath: 'result',
      errorBehavior: 'payloadPath',
      errorPath: 'data.error'
    });

    const aggNode = new MongoNode('id', [[4]], {
      collectionNameTemplate: '{{collectionName}}',
      mongoUriTemplate: '{{uri}}',
      mongoMethod: 'aggregate',
      mongoArgs: [{ valueType: 'json', value: '{}' }, { valueType: 'json', value: '{}' }],
      resultPath: 'result',
      errorBehavior: 'payloadPath',
      errorPath: 'data.error'
    });

    const findResult = await findNode.run({}, {
      uri: testMongoUri,
      collectionName: 'words'
    });
    const countResult = await countNode.run({}, {
      uri: testMongoUri,
      collectionName: 'words'
    });
    const distinctResult = await distinctNode.run({}, {
      uri: testMongoUri,
      collectionName: 'words'
    });
    const aggResult = await aggNode.run({}, {
      uri: testMongoUri,
      collectionName: 'words'
    });
    findResult[1].result.length.should.deepEqual(4);
    countResult[1].result.should.deepEqual(4);
    aggResult[1].result.length.should.deepEqual(4);
    distinctResult[1].data.error.type.should.deepEqual('MongoNodeError');
  });


  it('should error on a too large result', async () => {
    let bigString = '';
    for (let i = 0; i < 30000; i++) { bigString+='The quick brown fox jumped over the lazy dog.'; }
    const bigArgs = [{ test: 'bigDoc', value: bigString }, { test: 'bigDoc1', value: bigString }, { test: 'bigDoc2', value: bigString }, { test: 'bigDoc3', value: bigString }];

    const insertManyNode = new MongoNode('id', [[4]], {
      collectionNameTemplate: 'bigStuff',
      mongoUriTemplate: '{{uri}}',
      mongoMethod: 'insertMany',
      mongoArgs: [{ valueType: 'path', value: 'arg1' }],
      resultPath: 'result'
    });
    await insertManyNode.run({}, {
      uri: testMongoUri,
      arg1: JSON.stringify(bigArgs)
    });

    const findNode = new MongoNode('id', [[4]], {
      collectionNameTemplate: 'bigStuff',
      mongoUriTemplate: '{{uri}}',
      mongoMethod: 'find',
      mongoArgs: [{ valueType: 'json', value: JSON.stringify({ value: bigString }) }],
      resultPath: 'result'
    });
    await findNode.run({}, {
      uri: testMongoUri
    }).should.be.rejectedWith({
      name: 'MongoNodeValidationError',
      message: 'Returned items cannot exceed 5MB'
    });
  });

  describe('it should act properly when defaulting options object', () => {
    beforeEach(async () => {
      const insertNode = new MongoNode('id', [[4]], {
        collectionNameTemplate: '{{collectionName}}',
        mongoUriTemplate: '{{uri}}',
        mongoMethod: 'insert',
        mongoArgs: [{ valueType: 'path', value: 'arg1' }],
        resultPath: 'result'
      });
      await insertNode.run({}, {
        uri: testMongoUri,
        collectionName: 'words',
        arg1: '{ "test": "document", "value": 2 }'
      });
      await insertNode.run({}, {
        uri: testMongoUri,
        collectionName: 'words',
        arg1: '{ "test": "document", "value": 2 }'
      });
    });
    it('#update', async () => {
      const updateNode2 = new MongoNode('id', [[4]], {
        collectionNameTemplate: '{{collectionName}}',
        mongoUriTemplate: '{{uri}}',
        mongoMethod: 'update',
        mongoArgs: [{ valueType: 'json', value: '{ "value": 2 }' },
          { valueType: 'json', value: '{ "$set": { "value": 5 } }' }],
        resultPath: 'result'
      });
      const [ oids, p ] = await updateNode2.run({}, {
        uri: testMongoUri,
        collectionName: 'words'
      });
      oids.should.deepEqual([[4]]);
      p.should.deepEqual({
        collectionName: 'words',
        result: { ok: 1, nModified: 1, n: 1 },
        uri: testMongoUri
      });
    });
    it('#remove', async () => {
      const removeNode = new MongoNode('id', [[4]], {
        collectionNameTemplate: '{{collectionName}}',
        mongoUriTemplate: '{{uri}}',
        mongoMethod: 'remove',
        mongoArgs: [{ valueType: 'path', value: 'arg1' }],
        resultPath: 'result'
      });
      const [ oids, p ] = await removeNode.run({}, {
        uri: testMongoUri,
        collectionName: 'words',
        arg1: { }
      });
      oids.should.deepEqual([[4]]);
      p.should.deepEqual({
        arg1: {},
        collectionName: 'words',
        result: { n: p.result.n, ok: 1 },
        uri: testMongoUri
      });

    });
  });
});
