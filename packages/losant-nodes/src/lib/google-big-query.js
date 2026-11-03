/**
 * @typedef {Object} QueryRequest
 * @see https://cloud.google.com/bigquery/docs/reference/rest/v2/jobs/query
 *
 * @typedef {Object} Table
 * @see https://cloud.google.com/bigquery/docs/reference/rest/v2/tables
 *
 * @typedef {Object} TableData
 * @see https://cloud.google.com/bigquery/docs/reference/rest/v2/tabledata
 *
 * @typedef {Object} Dataset
 * @see https://cloud.google.com/bigquery/docs/reference/rest/v2/datasets
 *
 * These are the common args that every BigQuery API wrapper function expects.
 * Each wrapper function may list additional args
 * @typedef {Object} ApiArgs
 * @property {AuthClient} authClient Auth client.
 * @property {number=}    timeout    Request timeout (in ms).
 */

import ljsonRender from './ljson-render.js';
import { google } from 'googleapis';
import {
  __, pipe, always, when, unless, equalsAny, isEmpty, prop, pathOr, keys,
  assoc, evolve, updateKeyPaths, objOf, trim, thunkify,
  fpThrow, identity, list, apply, ifElse, defaultTo, stringToBoolean
} from 'omnibelt';


import errors from 'losant-nodejs-utils/src/errors.js';
const { MissingField, InvalidEnumValue } = errors;

import { renderToStringTrimmed } from './fp-payload-helper.js';

import {
  GOOGLE_AUTH_SCOPES,
  validateAndParseAuthCredentials
} from './google-auth.js';

import fetchApiResult from './google-apis.js';

const bigQuery = google.bigquery('v2');

export const AUTH_SCOPES = [GOOGLE_AUTH_SCOPES.BIG_QUERY];

export const TIMEOUT_MESSAGE = 'ETIMEDOUT';

const VALID_ACTIONS = {
  jobs: ['query'],
  datasets: ['get', 'list', 'insert', 'update', 'patch', 'delete'],
  tables: ['get', 'list', 'insert', 'update', 'patch', 'delete'],
  tabledata: ['list', 'insertAll']
};

const VALID_RESOURCES = keys(VALID_ACTIONS);

const setCommonArgs = assoc('timeoutMessage', TIMEOUT_MESSAGE);

const isValidResource = equalsAny(VALID_RESOURCES);

const getValidActions = prop(__, VALID_ACTIONS);

/**
 * Takes a resource (jobs, datasets, tables, tabledata) and an action and
 * return true if the action is valid for the given resource, or false if not.
 *
 * @typedef Resource = String
 * @typedef Action = String
 *
 * @signature Resource -> Action -> Boolean
 */
const isValidAction = pipe(
  list,
  evolve([getValidActions, identity]),
  apply(equalsAny)
);

/**
 * Takes a node title and returns a function that takes a value and throws a
 * MissingFieldError if the value is empty or returns the value if not.
 *
 * @signature String -> a -> a
 *
 * @throws MissingFieldError
 */
const validateRequiredField = pipe(
  objOf('title'),
  MissingField,
  thunkify(fpThrow),
  when(isEmpty)
);

/**
 * Parses a numeric string value into a number. If the string is empty,
 * `undefined` is returned.
 *
 * @signature String -> ?Number
 */
const parseNumericField = ifElse(
  isEmpty,
  always(undefined),
  pipe(
    Number,
    defaultTo(undefined)
  )
);

/**
 * Parses a string value into a boolean. If the string is empty, `false` is
 * returned.
 *
 * @signature String -> Boolean
 */
const parseBooleanField = pipe(
  defaultTo('false'),
  stringToBoolean
);

export const validateAndParseBaseConfig = (payload, config) => {
  const { resource, action } = config;

  return evolve({
    resource: pipe(
      trim,
      validateRequiredField('API Resource'),
      unless(isValidResource, (resourceVal) => {
        throw InvalidEnumValue({
          field: 'resource',
          allowedValues: VALID_RESOURCES,
          actualValue: resourceVal
        });
      })
    ),
    action: pipe(
      trim,
      validateRequiredField('API Action'),
      unless(isValidAction(resource), () => {
        throw InvalidEnumValue({
          field: 'action',
          allowedValues: getValidActions(resource),
          actualValue: action
        });
      })
    ),
    resultPath: pipe(
      trim,
      validateRequiredField('Result Path')
    )
  })(config);
};

export const validateAndParseActionConfig = (payload, config) => {
  const { resource, action } = config;

  const _renderToStringTrimmed = renderToStringTrimmed(payload);

  const validators = {
    jobs: {
      query: {
        queryRequest: pipe(
          (inputValue) => ljsonRender(inputValue, payload, 'Query Request'),
          validateRequiredField('Query Request')
        )
      }
    },
    datasets: {
      get: {
        datasetId: pipe(
          _renderToStringTrimmed,
          validateRequiredField('Dataset ID')
        )
      },
      list: {
        includeHidden: pipe(
          _renderToStringTrimmed,
          parseBooleanField
        ),
        filter: _renderToStringTrimmed,
        maxResults: pipe(
          _renderToStringTrimmed,
          parseNumericField
        )
      },
      insert: {
        dataset: (inputValue) => ljsonRender(inputValue, payload, 'Dataset')
      },
      update: {
        datasetId: pipe(
          _renderToStringTrimmed,
          validateRequiredField('Dataset ID')
        ),
        dataset: pipe(
          (inputValue) => ljsonRender(inputValue, payload, 'Dataset'),
          validateRequiredField('Dataset')
        )
      },
      patch: {
        datasetId: pipe(
          _renderToStringTrimmed,
          validateRequiredField('Dataset ID')
        ),
        dataset: pipe(
          (inputValue) => ljsonRender(inputValue, payload, 'Dataset'),
          validateRequiredField('Dataset')
        )
      },
      delete: {
        datasetId: pipe(
          _renderToStringTrimmed,
          validateRequiredField('Dataset ID')
        ),
        deleteContents: pipe(
          _renderToStringTrimmed,
          parseBooleanField
        )
      }
    },
    tables: {
      get: {
        datasetId: pipe(
          _renderToStringTrimmed,
          validateRequiredField('Dataset ID')
        ),
        tableId: pipe(
          _renderToStringTrimmed,
          validateRequiredField('Table ID')
        ),
        selectedFields: _renderToStringTrimmed
      },
      list: {
        datasetId: pipe(
          _renderToStringTrimmed,
          validateRequiredField('Dataset ID')
        ),
        maxResults: pipe(
          _renderToStringTrimmed,
          parseNumericField
        )
      },
      insert: {
        datasetId: pipe(
          _renderToStringTrimmed,
          validateRequiredField('Dataset ID')
        ),
        table: (inputValue) => ljsonRender(inputValue, payload, 'Table')
      },
      update: {
        datasetId: pipe(
          _renderToStringTrimmed,
          validateRequiredField('Dataset ID')
        ),
        tableId: pipe(
          _renderToStringTrimmed,
          validateRequiredField('Table ID')
        ),
        table: pipe(
          (inputValue) => ljsonRender(inputValue, payload, 'Table'),
          validateRequiredField('Table')
        )
      },
      patch: {
        datasetId: pipe(
          _renderToStringTrimmed,
          validateRequiredField('Dataset ID')
        ),
        tableId: pipe(
          _renderToStringTrimmed,
          validateRequiredField('Table ID')
        ),
        table: pipe(
          (inputValue) => ljsonRender(inputValue, payload, 'Table'),
          validateRequiredField('Table')
        )
      },
      delete: {
        datasetId: pipe(
          _renderToStringTrimmed,
          validateRequiredField('Dataset ID')
        ),
        tableId: pipe(
          _renderToStringTrimmed,
          validateRequiredField('Table ID')
        )
      }
    },
    tabledata: {
      list: {
        datasetId: pipe(
          _renderToStringTrimmed,
          validateRequiredField('Dataset ID')
        ),
        tableId: pipe(
          _renderToStringTrimmed,
          validateRequiredField('Table ID')
        ),
        maxResults: pipe(
          _renderToStringTrimmed,
          parseNumericField
        ),
        selectedFields: _renderToStringTrimmed,
        startIndex: pipe(
          _renderToStringTrimmed,
          parseNumericField
        )
      },
      insertAll: {
        datasetId: pipe(
          _renderToStringTrimmed,
          validateRequiredField('Dataset ID')
        ),
        tableId: pipe(
          _renderToStringTrimmed,
          validateRequiredField('Table ID')
        ),
        tableData: pipe(
          (inputValue) => ljsonRender(inputValue, payload, 'Table Data'),
          validateRequiredField('Table Data')
        )
      }
    }
  };

  const transformMap = pathOr({}, [resource, action], validators);

  return evolve(transformMap, config);
};

export const validateAndParseConfig = async (payload, config, context) => {
  config = validateAndParseBaseConfig(payload, config);
  config = validateAndParseActionConfig(payload, config);
  config = await validateAndParseAuthCredentials(payload, context, config);
  return config;
};

/**
 * Runs a BigQuery SQL query synchronously and returns query results if the
 * query completes within a specified timeout.
 *
 * @see bigquery.jobs.query
 *
 * @param {ApiArgs}      args              Function args.
 * @param {string}       args.projectId    Project ID.
 * @param {QueryRequest} args.queryRequest Query to get results for.
 */
const getQueryResult = pipe(
  setCommonArgs,
  updateKeyPaths({
    projectId: ['params', 'projectId'],
    queryRequest: ['params', 'resource']
  }),
  fetchApiResult(bigQuery.jobs.query.bind(bigQuery.jobs))
);

/**
 * Returns the dataset for the specified ID.
 *
 * @see bigquery.datasets.get
 *
 * @param {ApiArgs} args           Function args.
 * @param {string}  args.projectId Project ID.
 * @param {string}  args.datasetId Dataset ID.
 *
 * @return {Promise<Object>} The API result or error.
 */
const getDataset = pipe(
  setCommonArgs,
  updateKeyPaths({
    projectId: ['params', 'projectId'],
    datasetId: ['params', 'datasetId']
  }),
  fetchApiResult(bigQuery.datasets.get.bind(bigQuery.datasets))
);

/**
 * Lists all datasets in the specified project to which you have been granted
 * the READER dataset role.
 *
 * @see bigquery.datasets.list
 *
 * @param {ApiArgs} args               Function args.
 * @param {string}  args.projectId     Project ID.
 * @param {boolean} args.includeHidden Include hidden datasets.
 * @param {string}  args.filter        Filter expression.
 * @param {number}  args.maxResults    Max number of results to return.
 *
 * @return {Promise<Object>} The API result or error.
 */
const listDatasets = pipe(
  setCommonArgs,
  updateKeyPaths({
    projectId: ['params', 'projectId'],
    includeHidden: ['params', 'all'],
    filter: ['params', 'filter'],
    maxResults: ['params', 'maxResults']
  }),
  fetchApiResult(bigQuery.datasets.list.bind(bigQuery.datasets))
);

/**
 * Creates a new dataset. If a dataset resource is given it will be used when
 * creating the new dataset; otherwise, the new dataset will be empty.
 *
 * @see bigquery.datasets.insert
 *
 * @param {ApiArgs}  args           Function args.
 * @param {string}   args.projectId Project ID.
 * @param {Dataset=} args.dataset   Dataset resource to insert.
 *
 * @return {Promise<Object>} The API result or error.
 */
const insertDataset = pipe(
  setCommonArgs,
  updateKeyPaths({
    projectId: ['params', 'projectId'],
    dataset: ['params', 'resource']
  }),
  fetchApiResult(bigQuery.datasets.insert.bind(bigQuery.datasets))
);

/**
 * Updates information in an existing dataset. The update method replaces the
 * entire dataset resource, whereas the patch method only replaces fields that
 * are provided in the submitted dataset resource.
 *
 * @see bigquery.datasets.update
 *
 * @param {ApiArgs} args           Function args.
 * @param {string}  args.projectId Project ID.
 * @param {string}  args.datasetId Dataset ID.
 * @param {Dataset} args.dataset   Dataset resource (replaces existing dataset).
 *
 * @return {Promise<Object>} The API result or error.
 */
const updateDataset = pipe(
  setCommonArgs,
  updateKeyPaths({
    projectId: ['params', 'projectId'],
    datasetId: ['params', 'datasetId'],
    dataset: ['params', 'resource']
  }),
  fetchApiResult(bigQuery.datasets.update.bind(bigQuery.datasets))
);

/**
 * Updates information in an existing dataset. The update method replaces the
 * entire dataset resource, whereas the patch method only replaces fields that
 * are provided in the submitted dataset resource. This method supports patch
 * semantics.
 *
 * @see bigquery.datasets.patch
 *
 * @param {ApiArgs} args           Function args.
 * @param {string}  args.projectId Project ID.
 * @param {string}  args.datasetId Dataset ID.
 * @param {Dataset} args.dataset   Dataset resource (patches existing dataset).
 *
 * @return {Promise<Object>} The API result or error.
 */
const patchDataset = pipe(
  setCommonArgs,
  updateKeyPaths({
    projectId: ['params', 'projectId'],
    datasetId: ['params', 'datasetId'],
    dataset: ['params', 'resource']
  }),
  fetchApiResult(bigQuery.datasets.patch.bind(bigQuery.datasets))
);

/**
 * Deletes the dataset specified by the datasetId value. Before you can delete
 * a dataset, you must delete all its tables, either manually or by specifying
 * deleteContents. Immediately after deletion, you can create another dataset
 * with the same name.
 *
 * @see bigquery.datasets.delete
 *
 * @param {Object}  args                Function args.
 * @param {string}  args.projectId      Project ID.
 * @param {string}  args.datasetId      Dataset ID.
 * @param {boolean} args.deleteContents If true and the dataset has tables, they will be deleted.
 *
 * @return {Promise<Object>} The API result or error.
 */
const deleteDataset = pipe(
  setCommonArgs,
  updateKeyPaths({
    projectId: ['params', 'projectId'],
    datasetId: ['params', 'datasetId'],
    deleteContents: ['params', 'deleteContents']
  }),
  fetchApiResult(bigQuery.datasets.delete.bind(bigQuery.datasets))
);

/**
 * Gets the specified table resource by table ID. This method does not return
 * the data in the table, it only returns the table resource, which describes
 * the structure of this table.
 *
 * @see bigquery.tables.get
 *
 * @param {ApiArgs} args                Function args.
 * @param {string}  args.projectId      Project ID.
 * @param {string}  args.datasetId      Dataset ID.
 * @param {string}  args.tableId        Table ID.
 * @param {string}  args.selectedFields Comma-separated list of fields to include in results.
 *                                      Defaults to all fields if not specified.
 *
 * @return {Promise<Object>} The API result or error.
 */
const getTable = pipe(
  setCommonArgs,
  updateKeyPaths({
    projectId: ['params', 'projectId'],
    datasetId: ['params', 'datasetId'],
    tableId: ['params', 'tableId'],
    selectedFields: ['params', 'selectedFields']
  }),
  fetchApiResult(bigQuery.tables.get.bind(bigQuery.tables))
);

/**
 * Lists all tables in the specified dataset. Requires the READER dataset role.
 *
 * @see bigquery.tables.list
 *
 * @param {ApiArgs} args            Function args.
 * @param {string}  args.projectId  Project ID.
 * @param {string}  args.datasetId  Dataset ID.
 * @param {number}  args.maxResults Max number of results to return.
 *
 * @return {Promise<Object>} The API result or error.
 */
const listTables = pipe(
  setCommonArgs,
  updateKeyPaths({
    projectId: ['params', 'projectId'],
    datasetId: ['params', 'datasetId'],
    maxResults: ['params', 'maxResults']
  }),
  fetchApiResult(bigQuery.tables.list.bind(bigQuery.tables))
);

/**
 * Creates a new, empty table in the dataset.
 *
 * @see bigquery.tables.insert
 *
 * @param {ApiArgs} args           Function args.
 * @param {string}  args.projectId Project ID.
 * @param {string}  args.datasetId Dataset ID.
 * @param {Table=}  args.table     Table resource to insert.
 *
 * @return {Promise<Object>} The API result or error.
 */
const insertTable = pipe(
  setCommonArgs,
  updateKeyPaths({
    projectId: ['params', 'projectId'],
    datasetId: ['params', 'datasetId'],
    table: ['params', 'resource']
  }),
  fetchApiResult(bigQuery.tables.insert.bind(bigQuery.tables))
);

/**
 * Updates information in an existing table. The update method replaces the
 * entire table resource, whereas the patch method only replaces fields that
 * are provided in the submitted table resource.
 *
 * @see bigquery.tables.update
 *
 * @param {ApiArgs} args           Function args.
 * @param {string}  args.projectId Project ID.
 * @param {string}  args.datasetId Dataset ID.
 * @param {string}  args.tableId   Table ID.
 * @param {Table}   args.table     Table resource (replaces existing data table).
 *
 * @return {Promise<Object>} The API result or error.
 */
const updateTable = pipe(
  setCommonArgs,
  updateKeyPaths({
    projectId: ['params', 'projectId'],
    datasetId: ['params', 'datasetId'],
    tableId: ['params', 'tableId'],
    table: ['params', 'resource']
  }),
  fetchApiResult(bigQuery.tables.update.bind(bigQuery.tables))
);

/**
 * Updates information in an existing table. The update method replaces the
 * entire table resource, whereas the patch method only replaces fields that
 * are provided in the submitted table resource. This method supports patch
 * semantics.
 *
 * @see bigquery.tables.patch
 *
 * @param {ApiArgs} args           Function args.
 * @param {string}  args.projectId Project ID.
 * @param {string}  args.datasetId Dataset ID.
 * @param {string}  args.tableId   Table ID.
 * @param {Table}   args.table     Table resource (patches existing data table).
 *
 * @return {Promise<Object>} The API result or error.
 */
const patchTable = pipe(
  setCommonArgs,
  updateKeyPaths({
    projectId: ['params', 'projectId'],
    datasetId: ['params', 'datasetId'],
    tableId: ['params', 'tableId'],
    table: ['params', 'resource']
  }),
  fetchApiResult(bigQuery.tables.patch.bind(bigQuery.tables))
);

/**
 * Deletes the table specified by tableId from the dataset. If the table
 * contains data, all the data will be deleted.
 *
 * @see bigquery.tables.delete
 *
 * @param {ApiArgs} args           Function args.
 * @param {string}  args.projectId Project ID.
 * @param {string}  args.datasetId Dataset ID.
 * @param {string}  args.tableId   Table ID.
 *
 * @return {Promise<Object>} The API result or error.
 */
const deleteTable = pipe(
  setCommonArgs,
  updateKeyPaths({
    projectId: ['params', 'projectId'],
    datasetId: ['params', 'datasetId'],
    tableId: ['params', 'tableId']
  }),
  fetchApiResult(bigQuery.tables.delete.bind(bigQuery.tables))
);


/**
 * Retrieves table data from a specified set of rows. Requires the READER
 * dataset role.
 *
 * @see bigquery.tabledata.list
 *
 * @param {ApiArgs} args                Function args.
 * @param {string}  args.projectId      Project ID.
 * @param {string}  args.datasetId      Dataset ID.
 * @param {string}  args.tableId        Table ID.
 * @param {number}  args.maxResults     Max number of results to include.
 * @param {string}  args.selectedFields Comma-separated list of fields to include in results.
 *                                      Defaults to all fields if not specified.
 * @param {number}  args.startIndex     Zero-based index of the starting row to read.
 *
 * @return {Promise<Object>} The API result or error.
 */
const listTableData = pipe(
  setCommonArgs,
  updateKeyPaths({
    projectId: ['params', 'projectId'],
    datasetId: ['params', 'datasetId'],
    tableId: ['params', 'tableId'],
    maxResults: ['params', 'maxResults'],
    selectedFields: ['params', 'selectedFields'],
    startIndex: ['params', 'startIndex']
  }),
  fetchApiResult(bigQuery.tabledata.list.bind(bigQuery.tabledata))
);


/**
 * Streams data into BigQuery one record at a time without needing to run a
 * load job. Requires the WRITER dataset role.
 *
 * @see bigquery.tabledata.insertAll
 *
 * @param {ApiArgs}   args           Function args.
 * @param {string}    args.projectId Project ID.
 * @param {string}    args.datasetId Dataset ID.
 * @param {string}    args.tableId   Table ID.
 * @param {TableData} args.tableData Table data resource.
 *
 * @return {Promise<Object>} The API result or error.
 */
const insertTableData = pipe(
  setCommonArgs,
  updateKeyPaths({
    projectId: ['params', 'projectId'],
    datasetId: ['params', 'datasetId'],
    tableId: ['params', 'tableId'],
    tableData: ['params', 'resource']
  }),
  fetchApiResult(bigQuery.tabledata.insertAll.bind(bigQuery.tabledata))
);

export const API_ACTIONS = {
  jobs: {
    query: getQueryResult
  },
  datasets: {
    get: getDataset,
    list: listDatasets,
    insert: insertDataset,
    update: updateDataset,
    patch: patchDataset,
    delete: deleteDataset
  },
  tables: {
    get: getTable,
    list: listTables,
    insert: insertTable,
    update: updateTable,
    patch: patchTable,
    delete: deleteTable
  },
  tabledata: {
    list: listTableData,
    insertAll: insertTableData
  }
};
