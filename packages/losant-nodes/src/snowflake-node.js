import * as payloadHelper from 'losant-handlebars';
import errors from 'losant-nodejs-utils/src/errors.js';
import { defer, timeoutP, toUpper } from 'omnibelt';
import snowflake from 'snowflake-sdk';
import { getTimeoutTemplate } from './lib/common.js';
import { ONE_MEGABYTE, FIVE_MEGABYTES } from 'losant-nodejs-utils/src/constants/size.js';
import LJSON from 'losant-nodejs-utils/src/ljson.js';
import resolveValueByLookupType from './lib/resolve-value-by-lookup-type.js';

import {
  validatePrivateKey,
  isValidSnowflakeString,
  isValidSnowflakeHost
} from 'losant-nodejs-utils/src/utils/validate-snowflake.js';

const MAX_RESULT_SIZE = FIVE_MEGABYTES;
const MAX_SQL_STATEMENT_SIZE = ONE_MEGABYTE;

snowflake.configure({
  logLevel: 'OFF',
  additionalLogToConsole: false
});

class SnowflakeNode {

  /* Example Config:
  {
    // Credential mode: connection details come from a stored snowflake credential
    credentialNameTemplate: <String - Optional: name template of the snowflake credential to use. If set, hostTemplate, usernameTemplate, and privateKeyTemplate are ignored>,
    // Inline credentials mode: used when credentialNameTemplate is not set.
    // See https://docs.snowflake.com/en/developer-guide/node-js/nodejs-driver-options#label-nodejs-auth-options
    hostTemplate: <String - Required unless credentialNameTemplate is set: Snowflake account host name>,
    usernameTemplate: <String - Required unless credentialNameTemplate is set: username of the Snowflake account>,
    privateKeyTemplate: <String - Required unless credentialNameTemplate is set: private key used to generate the JWT for key-pair authentication>,
    databaseTemplate: <String - Required: name of the database to query>,
    schemaTemplate: <String - Optional: name of the schema to query. If empty, no schema is set on the session>,
    warehouseTemplate: <String - Optional: default virtual warehouse to use for the session after connecting>,
    roleTemplate: <String - Optional: default security role to use for the session after connecting>,
    timeoutTemplate: <String - Optional: time in milliseconds allowed to connect and run the query. Defaults to, and cannot exceed, the external timeout>,
    sqlSourceType: <String - Optional: payloadPath|stringTemplate. How sqlSourceValue is resolved. Default stringTemplate>,
    sqlSourceValue: <String - Required: the SQL statement template, or payload path to the SQL statement, depending on sqlSourceType. Maximum 1MB>,
    resultPath: <String - Required: payload path for { rows: [...] } on success or { error: { message } } on failure>
  }
  Notes:
    Authentication always uses key-pair (JWT) authentication.
    Connection, query, timeout, and result-size (5MB maximum) failures do not throw. They are written to resultPath as { error: { message } }.
    Configuration problems (missing or invalid host, username, private key, database, role, warehouse, or SQL statement) throw.
  */

  constructor(id, outputIds, config) {
    this.id = id;
    this.outputIds = outputIds;
    // credential mode
    this.credentialNameTemplate = config.credentialNameTemplate;
    // inline credentials mode
    this.hostTemplate = config.hostTemplate;
    this.usernameTemplate = config.usernameTemplate;
    this.privateKeyTemplate = config.privateKeyTemplate;

    this.databaseTemplate = config.databaseTemplate;
    this.schemaTemplate = config.schemaTemplate;
    this.warehouseTemplate = config.warehouseTemplate;
    this.roleTemplate = config.roleTemplate;
    this.timeoutTemplate = config.timeoutTemplate;

    this.sqlSourceType = config.sqlSourceType || 'stringTemplate'; // stringTemplate or payloadPath
    this.sqlSourceValue = config.sqlSourceValue;

    this.resultPath = config.resultPath;
  }

  async resolveCredentials(context, payload) {
    if (this.credentialNameTemplate) {
      return context.loadCredential({
        credentialNameTemplate: this.credentialNameTemplate,
        type: 'snowflake',
        applicationId: context.applicationId,
        payload
      });
    } else {
      const host = payloadHelper.renderToString(this.hostTemplate, payload).trim();
      if (!host) {
        throw errors.MissingField({ title: 'Host' });
      }
      if (!isValidSnowflakeHost(host)) {
        throw errors.Validation({ message: 'Host is invalid.' });
      }
      const username = payloadHelper.renderToString(this.usernameTemplate, payload).trim();
      if (!username) {
        throw errors.MissingField({ title: 'Username' });
      }
      const privateKey = payloadHelper.renderToString(this.privateKeyTemplate, payload);
      if (!privateKey) {
        throw errors.MissingField({ title: 'Private Key' });
      }
      await validatePrivateKey(privateKey);
      return { host, username, privateKey };
    }
  }

  async run(context, payload) {
    const credInfo = await this.resolveCredentials(context, payload);
    const database = payloadHelper.renderToString(this.databaseTemplate, payload).trim();
    if (!database) {
      throw errors.MissingField({ title: 'Database' });
    }
    const role = payloadHelper.renderToString(this.roleTemplate, payload);
    if (role && !isValidSnowflakeString(role)) {
      throw errors.Validation({ message: 'Snowflake role contains invalid characters.' });
    }
    const warehouse = payloadHelper.renderToString(this.warehouseTemplate, payload);
    if (warehouse && !isValidSnowflakeString(warehouse)) {
      throw errors.Validation({ message: 'Snowflake warehouse contains invalid characters.' });
    }

    const schema = payloadHelper.renderToString(this.schemaTemplate, payload).trim();
    const timeout = getTimeoutTemplate(this, payload, context.externalTimeout);

    const sqlText = resolveValueByLookupType({
      lookupType: this.sqlSourceType,
      inputValue: this.sqlSourceValue,
      title: 'SQL Statement',
      payload,
      errorOnMissing: true
    });
    if (!sqlText) {
      throw errors.MissingField({ title: 'SQL Statement' });
    } else if (sqlText.length > MAX_SQL_STATEMENT_SIZE) {
      throw errors.TooLarge({
        title: 'SQL Statement',
        size: `${(sqlText.length / ONE_MEGABYTE).toFixed(1)}MB`,
        maximum: '1MB'
      });
    }

    let connection, stream, queryId, statement;
    let aborted = false;
    try {
      const rows = [];
      await timeoutP(timeout, (async () => {
        connection = snowflake.createConnection({
          authenticator: 'SNOWFLAKE_JWT',
          username: toUpper(credInfo.username),
          host: credInfo.host,
          privateKey: credInfo.privateKey,
          database,
          schema,
          role,
          warehouse,
          timeout,
          clientSessionKeepAlive: false,
          keepAlive: false,
          sfRetryMaxLoginRetries: 0 // default is 7
        });

        const waitForConnection = defer();
        connection.connect((err, conn) => {
          if (aborted || err) { return waitForConnection.reject(err ?? new Error('aborted')); }
          return waitForConnection.resolve(conn);
        });
        await waitForConnection.promise;
        const waitForQueryResults = defer();
        connection.execute({
          sqlText,
          asyncExec: true,
          complete: (err, stmt) => {
            // process.nextTick may fire this after the connection is destroyed; reject
            // rather than leaving waitForQueryResults pending indefinitely.
            if (aborted || err) { return waitForQueryResults.reject(err ?? new Error('aborted')); }
            return waitForQueryResults.resolve(stmt.getQueryId());
          }
        });
        queryId = await waitForQueryResults.promise;
        statement = await connection.getResultsFromQueryId({ queryId: queryId });
        let totalSize = 0;
        await new Promise((resolve, reject) => {
          stream = statement.streamRows();
          stream.on('error', (err) => {
            reject(err);
          });
          stream.on('data', (row) => {
            stream.pause();
            const stringified = LJSON.stringify(row);
            totalSize += stringified.length;
            if (totalSize > MAX_RESULT_SIZE) {
              stream.destroy(errors.TooLarge({
                title: 'SQL Result',
                size: `${(totalSize / ONE_MEGABYTE).toFixed(1)}MB`,
                maximum: '5MB'
              }));
              return;
            }
            rows.push(LJSON.parse(stringified));
            stream.resume();
          });
          stream.on('end', () => {
            resolve();
          });
        });
      })());
      payload = payloadHelper.set(this.resultPath, { rows }, payload);
    } catch (e) {
      aborted = true;
      payload = payloadHelper.set(this.resultPath, { error: { message: e.message } }, payload);
      try {
        await timeoutP(timeout, (async () => {
          if (stream && !stream.destroyed) {
            stream.pause();
            const waitForDestroy = defer();
            stream.removeAllListeners();
            stream.on('close', () => {
              waitForDestroy.resolve();
            });
            stream.destroy();
            await waitForDestroy.promise;
          }
          if (statement) {
            const waitForCancel = defer();
            statement.cancel(() => {
              waitForCancel.resolve();
            });
            await waitForCancel.promise;
          }
        })());
      } catch {}
    } finally {
      aborted = true;
      if (connection?.isUp()) {
        const waitForDisconnect = defer();
        connection.destroy(() => {
          waitForDisconnect.resolve();
        });
        try {
          await timeoutP(timeout, waitForDisconnect.promise);
        } catch {}
      }
    }
    return [this.outputIds, payload];
  }

}

export default SnowflakeNode;
