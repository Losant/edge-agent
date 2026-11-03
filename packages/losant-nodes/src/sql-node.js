import 'mssql'; // knex tedious driver globals workaround
import Knex from 'knex';
import { DatabaseSync } from 'node:sqlite';
import * as payloadHelper from 'losant-handlebars';
import errors from 'losant-nodejs-utils/src/errors.js';
import cleanError from 'losant-nodejs-utils/src/utils/clean-error.js';
import verifyHosts from 'losant-nodejs-utils/src/utils/verify-hosts.js';
import LJSON from 'losant-nodejs-utils/src/ljson.js';
import { is, toNumber, clampPositive } from 'omnibelt';
import { renderToNetworkPort } from './lib/common.js';
import stableJSON from 'json-stable-stringify';
import niceBooleanCast from 'losant-nodejs-utils/src/utils/nice-boolean-cast.js';
import nextTick from 'losant-nodejs-utils/src/utils/next-tick.js';

const validSystems = new Set(['mssql', 'mysql', 'pg', 'sqlite3']);

const MAX_POOL_SIZE = clampPositive(toNumber(process.env.MAX_SQL_NODE_CLIENT_POOL_SIZE) || 7);

const maxClientUnused = 70*1000;
const sqlClientCache = new Map();

const cleanSqlError = function(error) {
  const clean = cleanError(error);
  clean.name = `SQLNode${clean.name}`;
  throw clean;
};

const removeSqlClient = async function(cacheKey, resolvedClient) {
  const clientWrapper = await sqlClientCache.get(cacheKey);
  if (!clientWrapper) { return; }

  sqlClientCache.delete(cacheKey);
  try {
    if (!resolvedClient) {
      resolvedClient = await clientWrapper.client;
    }
    await resolvedClient.destroy();
  } catch {}
};

const updateLastUsed = function(cacheKey) {
  const clientWrapper = sqlClientCache.get(cacheKey);
  if (!clientWrapper) { return; }
  clientWrapper.lastUsed = Date.now();
};

const getSqlClient = function({ system, connectionConfig, externalTimeout }) {
  const cacheKey = stableJSON(connectionConfig);

  if (sqlClientCache.has(cacheKey)) {
    const clientWrapper = sqlClientCache.get(cacheKey);
    return { clientP: clientWrapper.client, cacheKey };
  }

  let promise;
  if (system === 'sqlite3') {
    promise = async () => {
      try {
        const db = new DatabaseSync(connectionConfig.filename,
          {
            timeout: externalTimeout,
            enableDoubleQuotedStringLiterals: true,
            enableForeignKeyConstraints: true // for legacy dbs
          });
        await nextTick();
        db.prepare('SELECT 1').get();
        await nextTick();
        return db;
      } catch (err) {
        removeSqlClient(cacheKey);
        throw errors.NotFound({ message: err.message });
      }
    };
  } else {
    const knexConfig = {
      client: system,
      pool: { min: 1, max: MAX_POOL_SIZE },
      connection: {
        ...connectionConfig,
        localInfile: false, // disable MySQL local data (security risk)
        multipleStatements: true // only used by the mysql driver
      },
      acquireConnectionTimeout: externalTimeout
    };
    let sqlClient;
    promise = async () => {
      try {
        if (connectionConfig.host) {
          await verifyHosts(connectionConfig.host);
        }
        sqlClient = new Knex(knexConfig);
        await sqlClient.select(1).timeout(externalTimeout);
        return sqlClient;
      } catch (err) {
        removeSqlClient(cacheKey, sqlClient);
        // each error is unique to the db or db driver
        switch (err.code) {
          case 'ESOCKET':
          case 'ECONNREFUSED':
            throw errors.NotFound({ message: err.sqlMessage || err.message });
          case 'ER_ACCESS_DENIED_ERROR':
          case 'ER_DBACCESS_DENIED_ERROR':
          case 'ELOGIN':
          case '28P01':
            throw errors.AuthenticationError({ message: err.sqlMessage || err.message });
          case 'ER_BAD_DB_ERROR':
          case '3D000':
            throw errors.BadRequest({ message: err.sqlMessage || err.message });
          default:
            cleanSqlError(err);
        }
      }
    };
  }
  const clientP = promise();
  sqlClientCache.set(cacheKey, { client: clientP, lastUsed: Date.now() });

  return { clientP, cacheKey };

};

const cleanSqlClients = function(max) {
  const cutoff = (max || Date.now()) - maxClientUnused;
  sqlClientCache.forEach((clientWrapper, cacheKey) => {
    if (clientWrapper.lastUsed < cutoff) {
      removeSqlClient(cacheKey);
    }
  });
};

let cleanerIntervalId = setInterval(cleanSqlClients, maxClientUnused);

class SqlNode {
  /* Example Config:
  {
    credentialNameTemplate: <String - Optional: name template of a stored sql credential. If set, the system, host, port, username, password, and SSL settings come from the credential and the corresponding keys below are ignored. databaseTemplate is still required>,
    systemTemplate: <String - Required unless credentialNameTemplate is set: database system, one of mysql|mssql|pg|sqlite3. sqlite3 is only available on Edge>,
    hostTemplate: <String - Required unless credentialNameTemplate is set: host of the database server. For sqlite3, this is the database file name>,
    portTemplate: <String - Optional: port of the database server. Ignored for sqlite3>,
    userTemplate: <String - Required unless credentialNameTemplate is set: username for the database. Ignored for sqlite3>,
    passwordTemplate: <String - Optional: password for the database. May be blank for anonymous connections. Ignored for sqlite3>,
    instanceNameTemplate: <String - Optional: instance of the SQL Server Database Engine. Only used for mssql>,
    databaseTemplate: <String - Required: database name. Ignored for sqlite3>,
    sslOn: <Boolean - Optional: whether to use SSL for the connection. Default false. Ignored for sqlite3 and when credentialNameTemplate is set>,
    sslDataMethod: <String - Optional: jsonTemplate|payloadPath. How sslDataTemplate is resolved>,
    sslDataTemplate: <String - Optional: JSON template, or payload path, for additional SSL options. Only used when sslOn is true>,
    query: <String - Required: SQL query text with template payload data fields>,
    resultPath: <String - Required: payload path for the result. An array of rows, or ['success'] if the query returns no rows. If the query fails, { errors: <message> }>
  }
  Notes:
    Query failures do not throw. The database error message is stored at resultPath as { errors: <message> }.
    Only connection errors (host not found or refused, authentication, invalid configuration) throw.
    sqlite3 does not support multi-statement queries.
  */

  constructor(id, outputIds, config) {
    this.id = id;
    this.outputIds = outputIds;
    this.credentialNameTemplate = config.credentialNameTemplate;

    this.systemTemplate = config.systemTemplate;
    this.hostTemplate = config.hostTemplate;
    this.portTemplate = config.portTemplate;
    this.userTemplate = config.userTemplate;
    this.passwordTemplate = config.passwordTemplate;
    this.sslOn = config.sslOn;
    this.sslDataMethod = config.sslDataMethod;
    this.sslDataTemplate = config.sslDataTemplate;

    // MSSQL specific
    this.instanceNameTemplate = config.instanceNameTemplate;

    this.databaseTemplate = config.databaseTemplate;
    this.query = config.query;
    this.resultPath = config.resultPath;
  }

  buildSSLConfig(payload) {
    const sslDataMethod = payloadHelper.renderToString(this.sslDataMethod, payload);

    let sslConfig;
    if (sslDataMethod === 'payloadPath') {
      sslConfig = payloadHelper.lookup(this.sslDataTemplate, payload);
    } else if (sslDataMethod === 'jsonTemplate') {
      sslConfig = payloadHelper.render(this.sslDataTemplate, payload);
    }

    if (!is(String, sslConfig)) { return sslConfig; }

    sslConfig = sslConfig.trim();
    if (!sslConfig) { return; }

    try {
      sslConfig = sslConfig && JSON.parse(sslConfig);
    } catch {
      throw errors.InvalidJsonTemplate({ title: 'SSL Config' });
    }

    return sslConfig;
  }

  async resolveConnectionConfig(context, payload) {
    let system;
    let connectionConfig = { };

    if (this.credentialNameTemplate) {
      const credInfo = await context.loadCredential({
        credentialNameTemplate: this.credentialNameTemplate,
        type: 'sql',
        applicationId: context.applicationId,
        payload
      });
      system = credInfo.system;
      connectionConfig.host = credInfo.host;
      connectionConfig.user = credInfo.username;
      connectionConfig.password = credInfo.password;
      if (credInfo.port) { connectionConfig.port = credInfo.port; }

      if (credInfo.secureConnection) {
        if (system === 'mssql') {
          connectionConfig.options = {
            encrypt: true,
            trustServerCertificate: !!credInfo.disableSSLVerification
          };
          if (credInfo.caCertificate) {
            connectionConfig.options.cryptoCredentialsDetails = { ca: credInfo.caCertificate };
          }
        } else {
          connectionConfig.ssl = { rejectUnauthorized: !credInfo.disableSSLVerification };
          if (credInfo.caCertificate) {
            connectionConfig.ssl.ca = credInfo.caCertificate;
          }
        }
      }
    } else {
      system = payloadHelper.renderToString(this.systemTemplate, payload);
      if (!system) { throw errors.Validation({ message: 'DB System is required.' }); }

      connectionConfig.host = payloadHelper.renderToString(this.hostTemplate, payload).trim();
      if (!connectionConfig.host) { throw errors.Validation({ message: 'Host is required.' }); }

      if (system !== 'sqlite3') {
        connectionConfig.user = payloadHelper.renderToString(this.userTemplate, payload);
        if (!connectionConfig.user) { throw errors.Validation({ message: 'Username is required.' }); }


        const port = renderToNetworkPort({ template: this.portTemplate, payload, fieldName: 'Port', defaultValue: undefined });
        if (port) { connectionConfig.port = port; }

        connectionConfig.password = payloadHelper.renderToString(this.passwordTemplate, payload);
        // password could be blank for anonymous connections

        if (this.sslOn) {
          const sslConfig = this.buildSSLConfig(payload);
          if (system === 'mssql') {
            // minimal MSSQL SSL options; sslConfig can override or extend them
            connectionConfig.options = { encrypt: true, ...(sslConfig || {}) };
          } else if (system === 'pg') {
            // default rejectUnauthorized to false to preserve legacy behavior; sslConfig can override
            connectionConfig.ssl = { rejectUnauthorized: false, ...(sslConfig || {}) };
          } else if (sslConfig) {
            connectionConfig.ssl = sslConfig;
          } else {
            connectionConfig.ssl = true;
          }
        }
      }
    }

    if (system === 'mssql' && this.instanceNameTemplate) {
      if (!connectionConfig.options) { connectionConfig.options = {}; }
      connectionConfig.options.instanceName = payloadHelper.renderToString(this.instanceNameTemplate, payload);
    }

    if (!validSystems.has(system)) {
      throw errors.Validation({ message: `${system} is not a supported Database.` });
    }

    if (system === 'sqlite3') {
      if (!SqlNode.allowSqlite3) {
        throw errors.Validation({ message: 'SQLite is only supported on Edge Devices.' });
      }
      connectionConfig = { filename: connectionConfig.host };
    } else {
      connectionConfig.database = payloadHelper.renderToString(this.databaseTemplate, payload);
      if (!connectionConfig.database) { throw errors.Validation({ message: 'Database Name is required.' }); }
    }

    return { system, connectionConfig };
  }

  async run(context, payload) {
    const { system, connectionConfig } = await this.resolveConnectionConfig(context, payload);

    const query = payloadHelper.renderToString(this.query, payload);
    if (!query) { throw errors.Validation({ message: 'Query is required.' }); }

    // sqlite error on multi-statement queries
    if (system === 'sqlite3') {
      const statements = query.replace(/'[^']*'|"[^']*"/g, '').split(';');
      if (statements.length > 1 && statements[1].trim()) {
        throw errors.Validation({ message: 'Multi-statement queries are not supported.' });
      }
    }

    const { cacheKey, clientP } = getSqlClient({
      system,
      connectionConfig,
      externalTimeout: context.externalTimeout
    });
    const resolvedClient = await clientP;

    let results = [], sqlReply;
    try {
      if (system === 'sqlite3') {
        sqlReply = resolvedClient.prepare(query).all();
        await nextTick();
      } else {
        sqlReply = await resolvedClient.raw(query).timeout(context.externalTimeout);
      }
      updateLastUsed(cacheKey);
    } catch (err) {
      // just in case there was a disconnect
      if (err.code === 'ESOCKET' || err.code === 'ECONNREFUSED') {
        removeSqlClient(cacheKey);
        throw errors.NotFound({ message: err.sqlMessage || err.message });
      }
      payload = payloadHelper.set(this.resultPath, { errors: err.sqlMessage || err.message }, payload);
      return [this.outputIds, payload];
    }
    // returned object is different depending on db management system
    // we just care about the returned data rows
    // if no data is returned (e.g. insert, update) just send back a success
    switch (system) {
      case 'mssql':
        if (sqlReply) {
          let i = 0;
          while (i < sqlReply.length) {
            results.push(sqlReply[i]);
            i++;
          }
        } else {
          results.push('success');
        }
        break;
      case 'mysql':
        if (sqlReply[1]) {
          (Array.isArray(sqlReply[0]) ? sqlReply[0] : [ sqlReply[0] ]).forEach((res) => {
            res = res.constructor.name === 'OkPacket' ? 'success' : res;
            if (Array.isArray(res)) {
              results = results.concat(res);
            } else {
              results.push(res);
            }
          });
        } else {
          results.push('success');
        }
        break;
      case 'pg':
        (sqlReply.rows ? [ sqlReply ] : sqlReply).forEach((res) => {
          results = results.concat(res.rows.length ? res.rows : ['success']);
        });
        break;
      case 'sqlite3':
        if (sqlReply.length > 0) {
          results = sqlReply;
        } else {
          results.push('success');
        }
        break;
      default:
        break;
    }

    // convert non-normal-object results into clean things
    // like ArrayBuffers or MySQL's RowDataPacket object
    results = LJSON.parse(LJSON.stringify(results));
    payload = payloadHelper.set(this.resultPath, results, payload);
    return [this.outputIds, payload];
  }

  static shutdown() {
    if (cleanerIntervalId) {
      clearInterval(cleanerIntervalId);
      cleanerIntervalId = null;
    }
    cleanSqlClients(Infinity);
  }

}

SqlNode.allowSqlite3 = niceBooleanCast(process.env.ENABLE_EDGE_AGENT_FEATURES);

export default SqlNode;
