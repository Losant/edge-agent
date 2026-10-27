import { __, T, pipe, path, propEq, append, cond, objOf, defaultTo, timeoutP } from 'omnibelt';

import { set } from './lib/fp-payload-helper.js';

import {
  getNodeTimeout,
  handleNodeTimeoutError
} from './lib/common.js';

import {
  getJwtAuthClient,
  isGoogleAuthError,
  handleGoogleAuthError,
  validateAndGetProjectId
} from './lib/google-auth.js';

import {
  AUTH_SCOPES,
  TIMEOUT_MESSAGE,
  API_ACTIONS,
  validateAndParseConfig
} from './lib/google-big-query.js';

const NODE_TITLE = 'Google BigQuery';

class GoogleBigQueryNode {

  /* Example Config:
  {
    credentialNameTemplate: <String - Optional: Template for the name of a GCP credential to authenticate with. If set, the jwt keys are ignored>,
    projectIdTemplate: <String - Optional: Template for a project ID that overrides the project ID in the credential or JWT>,
    jwtDataMethod: <String - Required unless credentialNameTemplate is set: Either jsonTemplate or payloadPath>,
    jwtJsonTemplate: <String - Required when jwtDataMethod is jsonTemplate: JSON template for the Service Account JWT>,
    jwtPayloadPath: <String - Required when jwtDataMethod is payloadPath: Payload path to the Service Account JWT>,
    resource: <String - Required: The API resource to act on. One of jobs, datasets, tables, or tabledata>,
    action: <String - Required: The action to take on the resource. Valid actions by resource:
      jobs: query
      datasets: get, list, insert, update, patch, delete
      tables: get, list, insert, update, patch, delete
      tabledata: list, insertAll>,
    resultPath: <String - Required: Payload path where the result is written. See Notes>,
    datasetId: <String - Optional: Template for the dataset ID. Required by datasets.(get|update|patch|delete), tables.*, and tabledata.*>,
    tableId: <String - Optional: Template for the table ID. Required by tables.(get|update|patch|delete) and tabledata.*>,
    queryRequest: <String - Optional: JSON template for the query request. Required by jobs.query>,
    dataset: <String - Optional: JSON template for the dataset resource. Required by datasets.(update|patch), optional for datasets.insert>,
    table: <String - Optional: JSON template for the table resource. Required by tables.(update|patch), optional for tables.insert>,
    tableData: <String - Optional: JSON template for the table data resource. Required by tabledata.insertAll>,
    includeHidden: <Boolean - Optional: Whether to include hidden datasets. Used by datasets.list. Default false>,
    filter: <String - Optional: Filter expression template. Used by datasets.list>,
    maxResults: <Number - Optional: Max results to be returned. Used by datasets.list, tables.list, and tabledata.list>,
    deleteContents: <Boolean - Optional: If true and the dataset has tables, they are deleted. Used by datasets.delete. Default false>,
    selectedFields: <String - Optional: Comma-separated list of fields to include in results. Used by tables.get and tabledata.list>,
    startIndex: <Number - Optional: Zero-based index of the starting row to read. Used by tabledata.list>
  }
  Notes:
    JWT refers to a Service Account JWT generated via the Cloud Platform Console.
    Result: The API response is written to resultPath. If the API returns an empty response, { success: true } is written instead.
    If the API request fails, { error } is written to resultPath instead of throwing.
    Invalid or missing config values (resource, action, resultPath, and the required keys above), authentication
      failures, and node timeouts throw.
  */

  constructor(id, outputIds, config) {
    this.id = id;
    this.outputIds = outputIds;
    this.config = config;
  }

  async run(context, payload) {
    const {
      resource,
      action,
      resultPath,
      authCredentials,
      ...restConfig
    } = await validateAndParseConfig(payload, this.config, context);

    const authClient = getJwtAuthClient(authCredentials, AUTH_SCOPES);

    const projectId = validateAndGetProjectId(authCredentials, this.config.projectIdTemplate, payload);

    const nodeTimeout = getNodeTimeout(context);

    const apiAction = path([resource, action], API_ACTIONS);
    const apiActionArgs = {
      ...restConfig,
      authClient,
      projectId,
      timeout: nodeTimeout
    };

    const setResult = pipe(
      set(payload, resultPath),
      append(__, [this.outputIds])
    );

    const handleApiActionSuccess = pipe(
      defaultTo({ success: true }),
      setResult
    );

    const handleAuthSuccess = () => {
      return apiAction(apiActionArgs).then(handleApiActionSuccess);
    };

    const isNodeTimeoutError = propEq(TIMEOUT_MESSAGE, 'code');

    const handleError = cond([
      [isGoogleAuthError, handleGoogleAuthError(NODE_TITLE)],
      [isNodeTimeoutError, handleNodeTimeoutError(NODE_TITLE)],
      [T, pipe(
        objOf('error'),
        setResult
      )]
    ]);

    try {
      return await timeoutP(nodeTimeout,
        authClient.authorize().then(handleAuthSuccess)
      );
    } catch (e) {
      return handleError(e);
    }
  }
}

export default GoogleBigQueryNode;
