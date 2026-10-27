import { oneLine } from 'common-tags';
import { fakeGoogleCredentials } from 'losant-nodejs-utils/test/utils/testing-constants.js';

export default {
  invalidData: {
    jwt: JSON.stringify({
      project_id: fakeGoogleCredentials.project_id,
      private_key: 'this is not valid',
      client_email: 'herp@derp.com'
    }),
    singleResultQueryRequest: {
      kind: 'bigquery#queryRequest',
      query: oneLine`
        SELECT *
        FROM [invalid_dataset.invalid_table]
        LIMIT 1
      `
    }
  },
  validData: {
    accessToken: 'ya29.fake-token',
    jwt: fakeGoogleCredentials,
    singleResultQueryRequest: {
      kind: 'bigquery#queryRequest',
      maxResults: 10,
      query: oneLine`
        SELECT *
        FROM [for_testing_only.gsod1929_copy]
        WHERE stn = '031590'
          AND year = '1929'
          AND mo = '10'
          AND da = '20'
        LIMIT 10
      `
    },
    insertDatasetRequest: {
      kind: 'bigquery#dataset',
      datasetReference: {
        projectId: fakeGoogleCredentials.project_id,
        datasetId: 'auto_generated_dataset'
      },
      description: 'insert'
    },
    updateDatasetRequest: {
      kind: 'bigquery#dataset',
      datasetReference: {
        projectId: fakeGoogleCredentials.project_id,
        datasetId: 'auto_generated_dataset'
      },
      description: 'update'
    },
    patchDatasetRequest: {
      description: 'patch'
    },
    insertTableRequest: {
      kind: 'bigquery#table',
      tableReference: {
        projectId: fakeGoogleCredentials.project_id,
        datasetId: 'for_testing_only',
        tableId: 'auto_generated_table'
      },
      description: 'insert'
    },
    updateTableRequest: {
      kind: 'bigquery#table',
      tableReference: {
        projectId: fakeGoogleCredentials.project_id,
        datasetId: 'for_testing_only',
        tableId: 'auto_generated_table'
      },
      description: 'update'
    },
    patchTableRequest: {
      description: 'patch'
    },
    insertTableDataRequest: {
      kind: 'bigquery#tableDataInsertAllRequest',
      skipInvalidRows: true,
      rows: [
        {
          insertId: '1',
          json: {
            foo: 'bar'
          }
        }
      ]
    }
  }
};
