import { TableClient, AzureNamedKeyCredential } from '@azure/data-tables';
import * as payloadHelper from 'losant-handlebars';
import errors from 'losant-nodejs-utils/src/errors.js';
import ljsonRender from './lib/ljson-render.js';
import { renderToIntegerRange } from './lib/common.js';

const keyOperations = new Set(['get', 'delete']);
const entityOperations = new Set(['insert', 'replace', 'merge']);
const selectOperations = new Set(['get', 'query']);

class AzureTableStorageNode {

  /* Example Config:
  {
    destination: <String - Required: payload path for the operation result (see Notes) or { error } on failure>,
    credentialNameTemplate: <String - Optional: template resolving to the name of the Azure credential to auth with. When set, accountTemplate and accountKeyTemplate are ignored>,
    accountTemplate: <String - Required unless credentialNameTemplate is set: Azure Storage account name>,
    accountKeyTemplate: <String - Required unless credentialNameTemplate is set: Azure Storage account access key>,
    operation: <String - Optional: one of get|query|insert|replace|merge|delete. Default get>,
    tableNameTemplate: <String - Required: Azure table to operate on>,
    partitionKeyTemplate: <String - Required for get|delete: partition key of the entity (template)>,
    rowKeyTemplate: <String - Required for get|delete: row key of the entity (template)>,
    selectTemplate: <String - Optional (get|query): template resolving to a comma-separated list of properties to return. Spaces are removed. If blank, all properties are returned>,
    filterTemplate: <String - Optional (query): OData filter query>,
    topTemplate: <String - Optional (query): template resolving to the maximum entities per page, an integer from 1 to 1000. Default 100>,
    continuationTokenTemplate: <String - Optional (query): continuation token from a previous query, used to fetch the next page>,
    entityTemplate: <String - Required for insert|replace|merge: JSON template for the entity. It must resolve to an object with string partitionKey and rowKey properties (PartitionKey and RowKey are also accepted)>,
    upsert: <Boolean - Optional (replace|merge): create the entity if it does not exist instead of failing. Default false>
  }
  Notes:
  A single output is used (outputIds).
  Result written to destination by operation:
    get: the entity (its properties plus partitionKey, rowKey and storage metadata).
    query: { entities, continuationToken, filter, select, top } (continuationToken is set when more pages exist).
    insert: the entity that was inserted.
    replace, merge, delete: { success: true }.
  Errors returned by Azure (for example entity not found or already exists) do not throw: they are written to destination as { error } (parsed from JSON when possible, otherwise the message string). Missing or invalid configuration (table name, account, keys, entity, invalid operation, or an invalid topTemplate) throws a Validation error.
  */

  constructor(id, outputIds, config) {
    this.id = id;
    this.outputIds = outputIds;

    this.credentialNameTemplate = config.credentialNameTemplate;
    this.accountTemplate = config.accountTemplate;
    this.accountKeyTemplate = config.accountKeyTemplate;
    this.tableNameTemplate = config.tableNameTemplate;
    this.operation = config.operation || 'get';

    // individual entity params
    this.partitionKeyTemplate = config.partitionKeyTemplate;
    this.rowKeyTemplate = config.rowKeyTemplate;
    this.entityTemplate = config.entityTemplate;
    this.upsert = config.upsert;

    // listEntities params
    this.selectTemplate = config.selectTemplate;
    this.filterTemplate = config.filterTemplate;
    this.topTemplate = config.topTemplate;
    this.continuationTokenTemplate = config.continuationTokenTemplate;

    this.destination = config.destination;
  }

  async run(context, payload) {
    let result = { success: true }, entity, entities, partitionKey, rowKey, select, filter, top;
    const tableName = payloadHelper.renderToString(this.tableNameTemplate, payload);
    if (!tableName) {
      throw errors.Validation({ message: 'Table Name is required.' });
    }

    let account, accountKey;
    if (this.credentialNameTemplate) {
      ({ account, accountKey } = await context.loadCredential({
        credentialNameTemplate: this.credentialNameTemplate,
        type: 'azure',
        applicationId: context.applicationId,
        payload
      }));
    } else {
      account = payloadHelper.renderToString(this.accountTemplate, payload);
      if (!account) {
        throw errors.Validation({ message: 'Account is required.' });
      }
      accountKey = payloadHelper.renderToString(this.accountKeyTemplate, payload);
      if (!accountKey) {
        throw errors.Validation({ message: 'Account Key is required.' });
      }
    }
    const namedKey = new AzureNamedKeyCredential(account, accountKey);

    if (keyOperations.has(this.operation)) {
      partitionKey = payloadHelper.renderToString(this.partitionKeyTemplate, payload);
      rowKey = payloadHelper.renderToString(this.rowKeyTemplate, payload);
      if (!partitionKey) {
        throw errors.Validation({ message: 'Partition Key is required.' });
      }
      if (!rowKey) {
        throw errors.Validation({ message: 'Row Key is required.' });
      }
    }

    if (entityOperations.has(this.operation)) {
      entity = ljsonRender(this.entityTemplate, payload, 'entity');
      if (!entity) { throw errors.Validation({ message: 'Entity is required.' }); }

      //the Node SDK expects these to be camelCase, but Azure will PascalCase them everywhere else
      entity.partitionKey = entity.partitionKey || entity.PartitionKey;
      entity.rowKey = entity.rowKey || entity.RowKey;
      delete entity.RowKey;
      delete entity.PartitionKey;

      if (!entity.partitionKey || typeof entity.partitionKey !== 'string') {
        throw errors.Validation({ message: 'entity.partitionKey is required and must be a string.' });
      }
      if (!entity.rowKey || typeof entity.rowKey !== 'string') {
        throw errors.Validation({ message: 'entity.rowKey is required and must be a string.' });
      }
    }

    if (selectOperations.has(this.operation)) {
      select = payloadHelper.renderToString(this.selectTemplate, payload).replaceAll(' ', '');
      select = select ? select.split(',') : undefined;
    }

    const tableClient = new TableClient(`https://${namedKey.name}.table.core.windows.net`, tableName, namedKey);
    try {
      switch (this.operation) {
        case 'get':
          result = await tableClient.getEntity(partitionKey, rowKey, { queryOptions: { select } } );
          break;
        case 'query':
          filter = payloadHelper.renderToString(this.filterTemplate, payload) || undefined;
          top = renderToIntegerRange({
            template: this.topTemplate, payload, fieldName: 'Max Entities', min: 1, max: 1000, defaultValue: 100
          });
          entities = await tableClient.listEntities({ queryOptions: { filter, select } }).byPage({
            maxPageSize: top,
            continuationToken: payloadHelper.renderToString(this.continuationTokenTemplate, payload)
          }).next();
          //the result from azure is a typescript array with a named continuationToken, so we separate them
          result = { entities: Array.from(entities.value), continuationToken: entities.value.continuationToken, filter, select, top };
          break;
        case 'insert':
          await tableClient.createEntity(entity);
          result = entity;
          break;
        case 'replace':
        case 'merge':
          if (this.upsert) {
            await tableClient.upsertEntity(entity, this.operation === 'replace' ? 'Replace' : 'Merge');
          } else {
            await tableClient.updateEntity(entity, this.operation === 'replace' ? 'Replace' : 'Merge');
          }
          break;
        case 'delete':
          await tableClient.deleteEntity(partitionKey, rowKey);
          break;
        default:
          throw errors.Validation({ message: 'Invalid operation provided' });
      }
    } catch (e) {
      if (e.type === 'Validation') {
        throw e;
      } else {
        let error = e.message;
        try { error = JSON.parse(error); } catch {}
        result = { error };
      }
    }
    payload = payloadHelper.set(this.destination, result, payload);
    return [this.outputIds, payload];
  }
}

export default AzureTableStorageNode;
