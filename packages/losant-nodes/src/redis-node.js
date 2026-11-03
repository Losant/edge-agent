import { Redis } from 'ioredis';
import * as payloadHelper from 'losant-handlebars';
import rCommands from '@ioredis/commands/built/commands.json' with { type: 'json' };
import errors from 'losant-nodejs-utils/src/errors.js';
import cleanError from 'losant-nodejs-utils/src/utils/clean-error.js';
import verifyHosts from 'losant-nodejs-utils/src/utils/verify-hosts.js';
import errorPath from './lib/error-path.js';
import { renderToNetworkPort, renderToIntegerRange, getTimeoutTemplate } from './lib/common.js';

/* Commands intentionally not allowed:
[
  'acl',          'asking',     'auth',           'bgrewriteaof',
  'bgsave',       'blmpop',     'bzmpop',         'client',
  'cluster',      'command',    'config',         'debug',
  'discard',      'dump',       'echo',           'eval',
  'eval_ro',      'evalsha',    'evalsha_ro',     'exec',
  'failover',     'flushall',   'flushdb',        'function',
  'hello',        'info',       'lastsave',       'latency',
  'lmpop',        'lolwut',     'memory',         'migrate',
  'module',       'monitor',    'multi',          'object',
  'pfdebug',      'pfselftest', 'ping',           'psubscribe',
  'psync',        'pubsub',     'punsubscribe',   'quit',
  'readonly',     'readwrite',  'replconf',       'replicaof',
  'reset',        'restore',    'restore-asking', 'role',
  'save',         'script',     'select',         'shutdown',
  'slaveof',      'slowlog',    'ssubscribe',     'subscribe',
  'sunsubscribe', 'swapdb',     'sync',           'unsubscribe',
  'unwatch',      'wait',       'watch',          'xsetid',
  'zmpop'
]
*/

const VALID_COMMANDS = new Set([
  'append', 'bitcount', 'bitfield', 'bitfield_ro', 'bitop', 'bitpos', 'blmove', 'blpop', 'brpop',
  'brpoplpush', 'bzpopmax', 'bzpopmin', 'copy', 'dbsize', 'decr', 'decrby', 'del', 'exists',
  'expire', 'expireat', 'expiretime', 'fcall', 'fcall_ro', 'geoadd', 'geodist', 'geohash', 'geopos',
  'georadius', 'georadius_ro', 'georadiusbymember', 'georadiusbymember_ro', 'geosearch',
  'geosearchstore', 'get', 'getbit', 'getdel', 'getex', 'getrange', 'getset', 'hdel', 'hexists',
  'hget', 'hgetall', 'hincrby', 'hincrbyfloat', 'hkeys', 'hlen', 'hmget', 'hmset', 'hrandfield',
  'hscan', 'hset', 'hsetnx', 'hstrlen', 'hvals', 'incr', 'incrby', 'incrbyfloat', 'keys', 'lcs',
  'lindex', 'linsert', 'llen', 'lmove', 'lpop', 'lpos', 'lpush', 'lpushx', 'lrange', 'lrem', 'lset',
  'ltrim', 'mget', 'move', 'mset', 'msetnx', 'persist', 'pexpire', 'pexpireat', 'pexpiretime',
  'pfadd', 'pfcount', 'pfmerge', 'psetex', 'pttl', 'publish', 'randomkey', 'rename', 'renamenx',
  'rpop', 'rpoplpush', 'rpush', 'rpushx', 'sadd', 'scan', 'scard', 'sdiff', 'sdiffstore', 'set',
  'setbit', 'setex', 'setnx', 'setrange', 'sinter', 'sintercard', 'sinterstore', 'sismember',
  'smembers', 'smismember', 'smove', 'sort', 'sort_ro', 'spop', 'spublish', 'srandmember', 'srem',
  'sscan', 'stralgo', 'strlen', 'substr', 'sunion', 'sunionstore', 'time', 'touch', 'ttl', 'type',
  'unlink', 'xack', 'xadd', 'xautoclaim', 'xclaim', 'xdel', 'xgroup', 'xinfo', 'xlen', 'xpending',
  'xrange', 'xread', 'xreadgroup', 'xrevrange', 'xtrim', 'zadd', 'zcard', 'zcount', 'zdiff',
  'zdiffstore', 'zincrby', 'zinter', 'zintercard', 'zinterstore', 'zlexcount', 'zmscore', 'zpopmax',
  'zpopmin', 'zrandmember', 'zrange', 'zrangebylex', 'zrangebyscore', 'zrangestore', 'zrank',
  'zrem', 'zremrangebylex', 'zremrangebyrank', 'zremrangebyscore', 'zrevrange', 'zrevrangebylex',
  'zrevrangebyscore', 'zrevrank', 'zscan', 'zscore', 'zunion', 'zunionstore'
]);

const maxClientUnused = 70*1000;
const redisClientCache = new Map();

const cleanRedisErrorWrap = async function(func) {
  try {
    return await func();
  } catch (e) {
    const clean = cleanError(e);
    clean.name = `RedisNode${clean.name}`;
    throw clean;
  }
};

const removeRedisClient = async function(cacheKey, resolvedClient) {
  const clientWrapper = redisClientCache.get(cacheKey);
  if (!clientWrapper) { return; }

  redisClientCache.delete(cacheKey);
  try {
    if (!resolvedClient) {
      resolvedClient = await clientWrapper.client;
    }
    resolvedClient?.disconnect();
    resolvedClient?.connector?.stream?.destroy();
  } catch {}
};
const updateLastUsed = function(cacheKey) {
  const clientWrapper = redisClientCache.get(cacheKey);
  if (!clientWrapper) { return; }
  clientWrapper.lastUsed = Date.now();
};

const getRedisClient = function({
  hostConfig, dbNumber, password, username, tls, timeout, isCluster, caCert
}) {
  const cacheKeyArray = [hostConfig, dbNumber, password, username, tls, timeout, isCluster];
  if (caCert) {
    cacheKeyArray.push(caCert);
  }
  const cacheKey = JSON.stringify(cacheKeyArray);

  if (redisClientCache.has(cacheKey)) {
    const clientWrapper = redisClientCache.get(cacheKey);
    return { clientP: clientWrapper.client, cacheKey };
  }

  const redisOptions = {
    tls,
    enableReadyCheck: false,
    dropBufferSupport: true,
    lazyConnect: true,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 0,
    connectTimeout: timeout,
    commandTimeout: timeout,
    // auth and db selection are done manually after connect so we can distinguish
    // those errors. ioredis does not know the credentials, so if it auto-reconnects
    // it will re-send SELECT without AUTH first → NOAUTH unhandled rejection.
    // Disable reconnection entirely; error/end handlers clean up the cache entry.
    // Both of these are required to cover all reconnection cases
    retryStrategy: () => false,
    reconnectOnError: false
  };

  let redis;

  const promise = verifyHosts(hostConfig.map((member) => member.host))
    .then(async () => {
      if (isCluster) {
        // in a cluster, we need to set auth info in the initial config,
        // as it is used to figure out info about the cluster in general
        if (username) {
          redisOptions.username = username;
        }
        if (password) {
          redisOptions.password = password;
        }

        if (redisOptions.tls && hostConfig.length) {
          // For redis cluster, when connecting by TLS, we have to be a bit fancy
          // The SLOTS command always returns IPs, and so ioredis will try to connect
          // directly to those IPs and not use a hostname - which will cause a classic
          // "Hostname/IP does not match certificate's altnames" error
          // So we set the default hostname to use to the first host in the host config.
          // This works perfectly for Azure/AWS, where you would only provide one host
          // and all cluster members are behind this one hostname (on different ports)
          redisOptions.tls = { servername: hostConfig[0].host };
          if (caCert) {
            redisOptions.tls.ca = caCert;
          }
          if (hostConfig.length > 1) {
            // If you are providing more than one host, however, you run into this issue:
            // https://github.com/luin/ioredis/issues/1114
            // which has no fix in the library. As a workaround, certificate
            // verification is disabled (rejectUnauthorized is false) whenever
            // more than one cluster host is configured.
            redisOptions.tls.rejectUnauthorized = false;
          }
        }

        redis = new Redis.Cluster(hostConfig, {
          clusterRetryStrategy: () => false,
          enableOfflineQueue: false,
          enableReadyCheck: false,
          retryDelayOnClusterDown: false,
          lazyConnect: true,
          redisOptions // these are options for the connections to the individual nodes
        });
      } else {
        if (redisOptions.tls && caCert) {
          redisOptions.tls = { ca: caCert };
        }
        redis = new Redis({
          ...redisOptions,
          host: hostConfig[0].host,
          port: hostConfig[0].port
        });
      }

      // make sure no one tries to reuse a dead connection
      const onClose = () => removeRedisClient(cacheKey, redis);
      redis.on('error', onClose); // any error
      redis.once('close', onClose); // any socket close
      redis.once('end', onClose); // ioredis' own ending event

      await cleanRedisErrorWrap(async () => {
        await redis.connect();

        if (!isCluster) {
          // For standalone authentication and database selection
          // is done explicitly instead of as part of the base redisOptions
          // options so that we can better handle the errors
          if (username || password) {
            if (username) {
              await redis.auth(username, password || '');
            } else {
              await redis.auth(password);
            }
          }
          await redis.select(dbNumber);
        }
      });
      return redis;
    })
    .catch((e) => {
      // we don't cache error-ed connections
      removeRedisClient(cacheKey, redis);
      redis = null;
      throw e;
    });

  redisClientCache.set(cacheKey, { client: promise, lastUsed: Date.now() });

  return { clientP: promise, cacheKey };
};

const cleanRedisClients = function(max) {
  const cutoff = (max || Date.now()) - maxClientUnused;
  redisClientCache.forEach((clientWrapper, cacheKey) => {
    if (clientWrapper.lastUsed < cutoff) {
      removeRedisClient(cacheKey);
    }
  });
};

let cleanerIntervalId = setInterval(cleanRedisClients, maxClientUnused);

class RedisNode {
  /* Example Config:
  {
    host: <String - Required when isCluster is false: template for host name>,
    port: <String - Optional: template for port number. Default 6379>,
    clusterMembers: [ used when isCluster is true; at least one member with a host is required
      {
        host: <String - Required: template for host name>,
        port: <String - Optional: template for port number. Default 6379>
      }
    ],
    dbNumber: <String - Optional: template for the database number. Default 0. Ignored when isCluster is true>,
    password: <String - Optional: template for password>,
    username: <String - Optional: template for username>,
    command: <String - Required: template for the command. Must be one of the allowed commands (see VALID_COMMANDS)>,
    tlsOn: <Boolean - Optional: if true, the node connects to Redis over TLS. Default false>,
    isCluster: <Boolean - Optional: If the connection is to a redis cluster. Default false>,
    arguments: [ <String - Required: template for one command argument> ],
    argumentsPath: <String - Optional: Payload path of an array of command arguments. When set, it is used instead of arguments, and the values are converted to strings>,
    resultPath: <String - Optional: Payload path for the command's reply>,
    errorBehavior: <String - Optional: behavior when the node has errors (throw|payloadPath). Default throw>,
    errorPath: <String - Optional: Payload path for { type, message } of a caught error when errorBehavior is payloadPath>,
    caCertTemplate: <String - Optional: template for the CA Cert. Only read when tlsOn is true. (edge >= 1.41.0)>,
    timeoutTemplate: <String - Optional: template for the connect/command timeout in milliseconds,
      defaults to the external call timeout, which is also the maximum allowed value>
  }
  Notes:
    The number of arguments must match the command's arity, otherwise the node errors.
    The reply is stored at resultPath as returned by Redis (utf8-decoded).
    With errorBehavior payloadPath, errors are written to errorPath, except errors that are not user-correctable, which are still thrown.
    When isCluster is true and tlsOn is true, the first host is used as the TLS server name, and certificate
    verification is disabled if more than one cluster member is configured.
  */

  constructor(id, outputIds, config) {
    this.id = id;
    this.outputIds = outputIds;
    this.host = config.host;
    this.port = config.port;
    this.clusterMembers = config.clusterMembers || [];
    this.dbNumber = config.dbNumber;
    this.password = config.password;
    this.username = config.username;
    this.command = config.command;
    this.arguments = config.arguments || [];
    this.argumentsPath = config.argumentsPath;
    this.resultPath = config.resultPath;
    this.tlsOn = config.tlsOn || false;
    this.isCluster = config.isCluster || false;
    this.errorBehavior = config.errorBehavior || 'throw';
    this.errorPath = config.errorPath;
    this.caCertTemplate = config.caCertTemplate;
    this.timeoutTemplate = config.timeoutTemplate;

    this.validCommands = VALID_COMMANDS;
  }

  getArity(commandName) {
    return (rCommands[commandName]).arity;
  }

  async run(context, payload) {
    let results;

    try {
      const hostConfig = [];
      let dbNumber = 0;
      if (this.isCluster) {
        if (!Array.isArray(this.clusterMembers)) {
          throw errors.Validation({ message: 'clusterMembers must be an array.' });
        }
        this.clusterMembers.forEach((clusterMember) => {
          if (!clusterMember?.host) { return; }
          const host = payloadHelper.renderToString(clusterMember.host, payload);
          if (!host) { return; }
          const port = renderToNetworkPort({ template: clusterMember.port, payload, fieldName: 'Redis port', defaultValue: 6379 });
          hostConfig.push({ host, port });
        });
        if (!hostConfig.length) {
          throw errors.Validation({ message: 'Must provide at least one cluster member.' });
        }
      } else {
        const host = payloadHelper.renderToString(this.host, payload);
        if (!host) { throw errors.MissingField({ title: 'Host' }); }

        const port = renderToNetworkPort({ template: this.port, payload, fieldName: 'Redis port', defaultValue: 6379 });
        hostConfig.push({ host, port });

        dbNumber = renderToIntegerRange({
          // there is technically no max DB number - redis tends to not work over a few million
          // but let's just keep it in 32 bit signed integer range
          template: this.dbNumber, payload, fieldName: 'Redis DB', defaultValue: 0, min: 0, max: 2**31
        });
      }

      const password = payloadHelper.renderToString(this.password, payload) || null;
      const username = payloadHelper.renderToString(this.username, payload) || null;
      let caCert;
      if (this.tlsOn) {
        caCert = payloadHelper.renderToString(this.caCertTemplate, payload) || null;
      }

      const commandName = payloadHelper.renderToString(this.command, payload);
      if (!this.validCommands.has(commandName)) {
        throw errors.MissingField({ title: 'Command Name' });
      }
      const arity = this.getArity(commandName);

      let redisArgs;
      if (this.argumentsPath) {
        redisArgs = payloadHelper.lookup(this.argumentsPath, payload) || [];
        if (!Array.isArray(redisArgs)) {
          throw errors.Validation({ message: 'Redis arguments must be provided as an array.' });
        }
        redisArgs = redisArgs.map(String);
      } else {
        if (!Array.isArray(this.arguments)) {
          throw errors.Validation({ message: 'Redis arguments must be provided as an array.' });
        }
        redisArgs = this.arguments.map((argument) => payloadHelper.renderToString(argument, payload));
      }

      if (arity >= 0 && (redisArgs.length + 1) !== arity) {
        throw errors.Validation({ message: 'Wrong number of arguments for command.' });
      }
      if (arity < 0 && (redisArgs.length + 1) < -arity) {
        throw errors.Validation({ message: 'Wrong number of arguments for command.' });
      }

      const timeout = getTimeoutTemplate(this, payload, context.externalTimeout);

      const { cacheKey, clientP } = getRedisClient({
        hostConfig, dbNumber, password, username, tls: this.tlsOn, timeout, isCluster: this.isCluster, caCert
      });
      const resolvedClient = await clientP;
      const command = new Redis.Command(commandName, redisArgs, { replyEncoding: 'utf8' });
      results = await cleanRedisErrorWrap(() => resolvedClient.sendCommand(command));
      updateLastUsed(cacheKey);
    } catch (err) {
      payload = errorPath(err, this, payload);
      return [this.outputIds, payload];
    }

    payload = payloadHelper.set(this.resultPath, results, payload);
    return [this.outputIds, payload];
  }

  static shutdown() {
    if (cleanerIntervalId) {
      clearInterval(cleanerIntervalId);
      cleanerIntervalId = null;
    }
    cleanRedisClients(Infinity);
  }

}

export default RedisNode;
