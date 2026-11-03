import { MongoClient } from 'mongodb';
import { EJSON } from 'losant-nodejs-utils/src/bson.js';
import * as payloadHelper from 'losant-handlebars';
import LJSON from 'losant-nodejs-utils/src/ljson.js';
import _debug from 'debug';
const debug = _debug('mongo-workflow-node');
import errors from 'losant-nodejs-utils/src/errors.js';
import cleanError from 'losant-nodejs-utils/src/utils/clean-error.js';
import verifyHosts from 'losant-nodejs-utils/src/utils/verify-hosts.js';
import { parseOptions as mongoUriParse } from 'mongodb/lib/connection_string.js';
import errorPath from './lib/error-path.js';
import resolveValueByLookupType from './lib/resolve-value-by-lookup-type.js';
import { clone, pick, isNilOrEmpty } from 'omnibelt';
import { MAX_RESPONSE_SIZE } from 'losant-nodejs-utils/src/utils/storage-helpers.js';

const VALID_METHODS = {
  aggregate: ['object', 'object'], // pipeline, options
  count: ['object', 'object'], // query, options -> countDocuments
  countDocuments: ['object', 'object'], // query, options -> countDocuments
  deleteMany: ['object', 'object'], // query, options
  deleteOne: ['object', 'object'], // query, options
  distinct: ['string', 'object', 'object'], // field, query, options
  find: ['object', 'object'], // query, options
  findOne: ['object', 'object'],  // query, options
  insert: ['object', 'object'], // doc(s), options
  insertMany: ['object', 'object'], // doc(s), options
  insertOne: ['object', 'object'], // doc(s), options
  remove: ['object', 'object'], // query, options
  replaceOne: ['object', 'object', 'object'], //query, doc, options
  update: ['object', 'object', 'object'], // query, update, options
  updateMany: ['object', 'object', 'object'], // query, update, options
  updateOne: ['object', 'object', 'object'] // query, update, options
};

const getNonDeprecatedMethod = (currentMeth, docs, options) => {
  if (currentMeth === 'count') { return 'countDocuments'; }
  if (currentMeth === 'insert') {
    if (Array.isArray(docs)) { return `${currentMeth}Many`; }
    return `${currentMeth}One`;
  }
  if (currentMeth === 'update') {
    if (options?.multi) { return `${currentMeth}Many`; }
    return `${currentMeth}One`;
  }
  if (currentMeth === 'remove') {
    if (!options?.single) { return 'deleteMany'; }
    return 'deleteOne';
  }
  return currentMeth;
};

const updateOptions = (args) => {
  let options = args[args.length-1];
  if (isNilOrEmpty(options)) {
    args.pop(); //the mongo node.js driver does not like empty options
    return;
  }
  if (options.fields) {
    // Clone first; otherwise updating the options would modify the object on the user's payload.
    options = clone(options);
    options.projection = options.fields;
    delete options.fields;
    args[args.length - 1] = options;
  }
};

const maxConnectionUnused = 70*1000;
const mongoConnectionCache = new Map();

const cleanMongoErrorWrap = async function(func) {
  try {
    return await func();
  } catch (e) {
    const clean = cleanError(e);
    if (clean.name.startsWith('Mongo')) {
      clean.name = clean.name.replace(/(MongoServer|MongoParse|Mongo)/, 'MongoNode');
    } else {
      clean.name = `MongoNode${clean.name}`;
    }
    throw clean;
  }
};

const removeMongoConnection = async function(uri) {
  const conWrapper = mongoConnectionCache.get(uri);
  if (!conWrapper) { return; }

  mongoConnectionCache.delete(uri);
  try {
    const { client } = await conWrapper.mongoConnection;
    await client.close(true);
  } catch (e) {
    debug('Mongo Closing Error: %o', e);
  }
};

const getMongoConnection = function(uri) {
  let conWrapper;
  if (mongoConnectionCache.has(uri)) {
    conWrapper = mongoConnectionCache.get(uri);
    conWrapper.lastUsed = Date.now();
    return conWrapper.mongoConnection;
  }

  const promise = (async () => {
    try {
      const parseResults = await cleanMongoErrorWrap(() => { return mongoUriParse(uri); });
      const hosts = parseResults.hosts.map((a) => {
        return a.host;
      });
      await verifyHosts(hosts);
      return cleanMongoErrorWrap(async () => {
        const client = new MongoClient(uri);
        await client.connect();
        const db = await client.db(parseResults.dbName);
        return { client, db };
      });
    } catch (e) {
      // we don't cache error-ed connections
      removeMongoConnection(uri);
      throw e;
    }
  })();

  conWrapper = {
    lastUsed: Date.now(),
    mongoConnection: promise
  };

  mongoConnectionCache.set(uri, conWrapper);

  return conWrapper.mongoConnection;
};

const cleanMongoConnections = function(max) {
  const cutoff = (max || Date.now()) - maxConnectionUnused;
  mongoConnectionCache.forEach((conWrapper, uri) => {
    if (conWrapper.lastUsed < cutoff) {
      removeMongoConnection(uri);
    }
  });
};

let cleanerIntervalId = setInterval(cleanMongoConnections, maxConnectionUnused);

class MongoNode {
  /* Example Config:
  {
    credentialNameTemplate: <String - Optional: template for the name of a MongoDB credential supplying the connection URI. When set, mongoUriTemplate is ignored>,
    collectionNameTemplate: <String - Required: template for collection name>,
    mongoUriTemplate: <String - Required unless credentialNameTemplate is set: template for mongo connection uri>,
    mongoMethod: <String - Required: template for the mongo method to execute. Valid methods are aggregate, count, countDocuments, deleteMany, deleteOne, distinct, find, findOne, insert, insertMany, insertOne, remove, replaceOne, update, updateMany, updateOne>,
    mongoArgs: [
      1, 2, or 3 of (depending on mongoMethod; extra arguments are ignored)
      {
        valueType: <String - Required: json|path|template. Also accepted: jsonTemplate, payloadPath, render, string, stringTemplate, payload, workflowPayload, none. An unknown type is treated as string>,
        value: <String - Required: the JSON, payload path, or template, according to valueType>
      }
    ],
    resultPath: <String - Optional: payload path for the result of the mongo method>,
    errorBehavior: <String - Optional: What to do with mongo node errors (throw|payloadPath). Default throw>,
    errorPath: <String - Optional: payload path for { type, message } of a caught error when errorBehavior is payloadPath>
  }
  Notes:
    Argument order per method: aggregate and find take (pipeline|query, options); distinct takes (field, query, options);
    insert* takes (doc(s), options); delete*, remove, count* take (query, options);
    update* and replaceOne take (query, update|replacement, options).
    The deprecated methods count, insert, update, and remove run their non-deprecated equivalents
    (update runs updateMany when options.multi is set; remove runs deleteOne when options.single is set).
    The legacy options key "fields" is sent to the driver as "projection".
    aggregate and find write an array of items to resultPath; their combined size may not exceed 5MB.
    Write results (insert/update/delete methods) are normalized to a { ok, n, ... } style shape.
    With errorBehavior payloadPath, errors are written to errorPath, except errors that are not user-correctable, which are still thrown.
  */

  constructor(id, outputIds, config) {
    this.id = id;
    this.outputIds = outputIds;
    this.credentialNameTemplate = config.credentialNameTemplate;
    this.collectionNameTemplate = config.collectionNameTemplate;
    this.mongoUriTemplate = config.mongoUriTemplate;
    this.mongoMethod = config.mongoMethod;
    this.mongoArgs = config.mongoArgs;
    this.resultPath = config.resultPath;
    this.errorBehavior = config.errorBehavior || 'throw';
    this.errorPath = config.errorPath;
  }

  async run(context, payload) {
    let results, mongoMethod, mongoArgs, uri;

    try {
      if (this.credentialNameTemplate) {
        uri = await context.loadCredential({
          credentialNameTemplate: this.credentialNameTemplate,
          type: 'mongodb',
          applicationId: context.applicationId,
          payload,
          secretOnly: true
        });
      } else {
        uri = payloadHelper.renderToString(this.mongoUriTemplate, payload);
        if (!uri) { throw errors.MissingField({ title: 'Mongo URI' }); }
      }

      const collectionName = payloadHelper.renderToString(this.collectionNameTemplate, payload);
      if (!collectionName) { throw errors.MissingField({ title: 'Collection Name' }); }

      mongoMethod = payloadHelper.renderToString(this.mongoMethod, payload).trim();
      const expectedArgs = VALID_METHODS[mongoMethod];
      if (!expectedArgs) { throw errors.MissingField({ title: 'Mongo Method' }); }

      mongoArgs = (this.mongoArgs || []).map((argument, index) => {
        if (!expectedArgs[index]) { return undefined; }

        let value = resolveValueByLookupType({
          inputValue: argument.value,
          lookupType: argument.valueType,
          payload,
          title: `Argument ${index}`,
          blankJsonToUndefined: true
        });

        if (!value) { return undefined; }

        if (typeof(value) === 'string' && 'string' !== expectedArgs[index]) {
          try {
            value = LJSON.parse(value);
          } catch { }
        }

        if (typeof(value) !== expectedArgs[index]) {
          throw errors.Validation({ message: 'Mongo arguments are invalid' });
        }

        return value;
      });

      const { db } = await getMongoConnection(uri);
      results = await cleanMongoErrorWrap(async () => {
        const collection = db.collection(collectionName);
        const newMeth = getNonDeprecatedMethod(mongoMethod, mongoArgs[0], mongoArgs[mongoArgs.length - 1]);
        if (mongoArgs && mongoArgs.length > 1) { updateOptions(mongoArgs); }
        // LJSON.stringify serializes special types (such as dates) to extended JSON,
        // and EJSON.parse converts them back to the driver's native types.
        const args = EJSON.parse(LJSON.stringify(mongoArgs));
        if (args[0] === null) {
          args[0] = {};
        }
        if (newMeth === 'aggregate' && !Array.isArray(args[0])) {
          if (!isNilOrEmpty(args[0])) {
            args[0] = [ args[0] ];
          } else {
            args[0] = undefined;
          }
        }
        let result = await collection[newMeth](...args);
        if (newMeth === 'aggregate' || newMeth === 'find') {
          const arrayResult = [];
          let dataSize = 0;
          await result.forEach((item) => {
            const rawItem = EJSON.stringify(item);
            dataSize += rawItem.length;
            if (dataSize > MAX_RESPONSE_SIZE) { return result.close(); }
            arrayResult.push(LJSON.parse(rawItem));
          });
          if (dataSize > MAX_RESPONSE_SIZE) {
            throw errors.Validation({ message: 'Returned items cannot exceed 5MB' });
          }
          result = arrayResult;
        }
        return result;
      });
    } catch (err) {
      payload = errorPath(err, this, payload);
      return [this.outputIds, payload];
    }
    let cleanResult = results;
    switch (mongoMethod) {
      case 'insert':
        cleanResult = { ok: results.acknowledged ? 1 : 0, n: results.insertedCount };
        if (cleanResult.n === undefined) {
          cleanResult.n = cleanResult.ok;
        }
        break;
      case 'remove':
        cleanResult = { ok: results.acknowledged ? 1 : 0, n: results.deletedCount };
        break;
      case 'update':
        cleanResult = { ok: results.acknowledged ? 1 : 0, nModified: results.modifiedCount, n: results.matchedCount };
        break;
      case 'deleteOne':
      case 'deleteMany':
        cleanResult = pick(['result', 'deletedCount'], results);
        cleanResult.result = { ok: results.acknowledged ? 1 : 0, n: cleanResult.deletedCount };
        break;
      case 'insertOne':
        cleanResult = pick(['insertedId'], results);
        cleanResult.insertedCount = cleanResult.insertedId ? 1 : 0;
        cleanResult.result = { ok: results.acknowledged ? 1 : 0, n: cleanResult.insertedCount };
        if (cleanResult.insertedId) {
          cleanResult.ops = [{
            _id: cleanResult.insertedId, ...mongoArgs[0]
          }];
        }
        break;
      case 'insertMany':
        cleanResult = pick(['insertedCount', 'insertedIds'], results);
        cleanResult.result = { ok: results.acknowledged ? 1 : 0, n: results.insertedCount };
        cleanResult.ops = [];
        mongoArgs[0].forEach((insertedArgs, i) => {
          cleanResult.ops.push({ _id: cleanResult.insertedIds[`${i}`], ...insertedArgs });
        });
        break;
      case 'updateOne':
      case 'updateMany':
      case 'replaceOne':
        cleanResult = pick([ 'matchedCount', 'modifiedCount', 'upsertedCount', 'upsertedId'], results);
        cleanResult.result = {
          ok: results.acknowledged ? 1 : 0,
          nModified: results.modifiedCount,
          n: cleanResult.matchedCount
        };
        break;
      default:
        break;
    }

    // this gets us an entirely new object, where things like $date/$undefined
    // are actually dates and undefined, but things like $oid and other types
    // we never convert in workflows are left as $oid
    // for aggregate/find this is done inline per result
    if (mongoMethod !== 'aggregate' && mongoMethod !== 'find') {
      cleanResult = LJSON.parse(EJSON.stringify(cleanResult));
    }

    payload = payloadHelper.set(this.resultPath, cleanResult, payload);
    return [this.outputIds, payload];
  }

  static shutdown() {
    if (cleanerIntervalId) {
      clearInterval(cleanerIntervalId);
      cleanerIntervalId = null;
    }
    cleanMongoConnections(Infinity);
  }

}

export default MongoNode;
