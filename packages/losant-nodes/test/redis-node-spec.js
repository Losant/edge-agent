import { describeService, restoreEnv, sinon } from './common.js';
import RedisNode from '../src/redis-node.js';
import tls from 'tls';
import net from 'net';
import { Redis } from 'ioredis';
import { defer, filter } from 'omnibelt';
import { fakeRedisCert, fakeRedisKey } from 'losant-nodejs-utils/test/utils/fake-ssl-alt-names.js';

/*
const host = 'pub-redis-12092.us-east-1-1.2.ec2.garantiadata.com';
const port = '12092';
const password = 'losanttest';
const dbNumber = 0;*/

const host = process.env.REDIS_HOST_CI || 'localhost';
const port = process.env.REDIS_PORT_CI || '';
const password = '';
const dbNumber = '10';

describeService('redis', 'RedisNode', () => {
  let redisClient;

  before(async () => {
    redisClient = new Redis({
      host,
      port: port || 6379,
      password,
      dropBufferSupport: true,
      lazyConnect: true
    });
    await redisClient.select(dbNumber);
    await redisClient.acl('SETUSER', 'testSuite', 'on', 'allkeys', '+@all', '>testSuite');
    await redisClient.auth('testSuite', 'testSuite');

    await redisClient.acl('SETUSER', 'testUserWithPass', 'on', 'allkeys', '+@all', '>foobar');
    await redisClient.acl('SETUSER', 'testUserNoPass', 'on', 'allkeys', '+@all', 'nopass');
  });

  after(async () => {
    await redisClient.quit();
    redisClient = null;
  });

  afterEach(async () => {
    await redisClient.flushdb();
    await redisClient.config('set', 'requirepass', password);
  });

  it('should correctly close clients for various reasons', async () => {
    await redisClient.config('set', 'requirepass', 'p@ss$12E45');
    const getClientLines = async () => {
      const currentList = await redisClient.client('list');
      return filter((line) => { return !!line; }, currentList.split('\n'));
    };
    const originalNumberOfClients = (await getClientLines()).length;
    originalNumberOfClients.should.aboveOrEqual(1);
    let count = 0;
    const runNode = () => {
      const isOdd = (count % 2) === 1;
      const setNode = new RedisNode('id', [[4]], {
        host,
        dbNumber: (isOdd ? '0' : '1'),
        port,
        password: (isOdd ? '' : 'p@ss$12E45'),
        command: 'invalid command',
        resultPath: 'result'
      });
      setNode.validCommands = new Set(['invalid command' ]);
      setNode.getArity = () => { return 1; };
      return setNode.run({}, {}).catch((e) => { return e; });
    };
    while (count < 100) {
      const res = await runNode(); // eslint-disable-line no-await-in-loop
      res.message.should.be.oneOf(
        'ERR unknown command `invalid command`, with args beginning with: ',
        'ERR unknown command \'invalid command\', with args beginning with: ',
        'ERR unknown command \'invalid command\''
      );
      count++;
      const res2 = await runNode(); // eslint-disable-line no-await-in-loop
      res2.message.should.equal('NOAUTH Authentication required.');
      count++;
      const clientLines = await getClientLines(); // eslint-disable-line no-await-in-loop
      clientLines.length.should.belowOrEqual(3);
    }
  });

  it('should correctly use username and password', async () => {
    const setNode = new RedisNode('id', [[4]], {
      host: '{{hostName}}',
      dbNumber: '{{dbNumber}}',
      port: '{{port}}',
      password: '{{password}}',
      username: '{{username}}',
      command: 'set',
      arguments: ['{{setArg1}}', '{{setArg2}}'],
      resultPath: 'result'
    });

    await setNode.run({}, {
      hostName: host,
      dbNumber,
      username: 'notAUser',
      password: 'foobar',
      port,
      setArg1: 'myKey',
      setArg2: 12
    }).should.be.rejectedWith({ message: 'WRONGPASS invalid username-password pair or user is disabled.' });

    await setNode.run({}, {
      hostName: host,
      dbNumber,
      username: 'testUserWithPass',
      port,
      setArg1: 'myKey',
      setArg2: 12
    }).should.be.rejectedWith({ message: 'WRONGPASS invalid username-password pair or user is disabled.' });

    await setNode.run({}, {
      hostName: host,
      dbNumber,
      password: 'notPassword',
      username: 'testUserWithPass',
      port,
      setArg1: 'myKey',
      setArg2: 12
    }).should.be.rejectedWith({ message: 'WRONGPASS invalid username-password pair or user is disabled.' });

    const [setOids, setP] = await setNode.run({}, {
      hostName: host,
      dbNumber,
      password: 'foobar',
      username: 'testUserWithPass',
      port,
      setArg1: 'myKey',
      setArg2: 12
    });
    setOids.should.deepEqual([[4]]);
    setP.should.deepEqual({
      hostName: host,
      dbNumber,
      password: 'foobar',
      username: 'testUserWithPass',
      port,
      setArg1: 'myKey',
      setArg2: 12,
      result: 'OK'
    });
  });

  it('should render the key template and write it to the intended key', async () => {
    const setNode = new RedisNode('id', [[4]], {
      host: '{{hostName}}',
      dbNumber: '{{dbNumber}}',
      port: '{{port}}',
      password: '{{password}}',
      command: 'set',
      arguments: ['{{setArg1}}', '{{setArg2}}'],
      resultPath: 'result'
    });

    await setNode.run({}, {
      hostName: host,
      dbNumber,
      password,
      port,
      setArg1: 'myKey',
      setArg2: 12
    });
    (await redisClient.get('myKey')).should.equal('12');
    (await redisClient.exists('')).should.equal(0);
    await RedisNode.shutdown();
  });

  it('should correctly use username with no password', async () => {
    const setNode = new RedisNode('id', [[4]], {
      host: '{{hostName}}',
      dbNumber: '{{dbNumber}}',
      port: '{{port}}',
      password: '{{password}}',
      username: '{{username}}',
      command: 'set',
      arguments: ['{{setArg1}}', '{{setArg2}}'],
      resultPath: 'result'
    });

    let [setOids, setP] = await setNode.run({}, {
      hostName: host,
      dbNumber,
      username: 'testUserNoPass',
      port,
      setArg1: 'myKey',
      setArg2: 12
    });
    setOids.should.deepEqual([[4]]);
    setP.should.deepEqual({
      hostName: host,
      dbNumber,
      username: 'testUserNoPass',
      port,
      setArg1: 'myKey',
      setArg2: 12,
      result: 'OK'
    });

    [setOids, setP] = await setNode.run({}, {
      hostName: host,
      dbNumber,
      password: 'allowedToBeAnything',
      username: 'testUserNoPass',
      port,
      setArg1: 'myKey',
      setArg2: 12
    });
    setOids.should.deepEqual([[4]]);
    setP.should.deepEqual({
      hostName: host,
      dbNumber,
      password: 'allowedToBeAnything',
      username: 'testUserNoPass',
      port,
      setArg1: 'myKey',
      setArg2: 12,
      result: 'OK'
    });
  });

  it('should correctly auth with only a password (default user)', async () => {
    await redisClient.config('set', 'requirepass', 'thePass');

    const setNode = new RedisNode('id', [[4]], {
      host: '{{hostName}}',
      dbNumber: '{{dbNumber}}',
      port: '{{port}}',
      password: '{{password}}',
      command: 'set',
      arguments: ['{{setArg1}}', '{{setArg2}}'],
      resultPath: 'result'
    });

    await setNode.run({}, {
      hostName: host,
      dbNumber,
      password: 'notPassword',
      port,
      setArg1: 'myKey',
      setArg2: 12
    }).should.be.rejectedWith({ message: 'WRONGPASS invalid username-password pair or user is disabled.' });

    await setNode.run({}, {
      hostName: host,
      dbNumber,
      port,
      setArg1: 'myKey',
      setArg2: 12
    }).should.be.rejectedWith({ message: 'NOAUTH Authentication required.' });

    const [setOids, setP] = await setNode.run({}, {
      hostName: host,
      dbNumber,
      password: 'thePass',
      port,
      setArg1: 'myKey',
      setArg2: 12
    });
    setOids.should.deepEqual([[4]]);
    setP.should.deepEqual({
      hostName: host,
      dbNumber,
      password: 'thePass',
      port,
      setArg1: 'myKey',
      setArg2: 12,
      result: 'OK'
    });
  });

  it('should correctly auth with no password (default user)', async () => {
    await redisClient.config('set', 'requirepass', '');

    const setNode = new RedisNode('id', [[4]], {
      host: '{{hostName}}',
      dbNumber: '{{dbNumber}}',
      port: '{{port}}',
      password: '{{password}}',
      command: 'set',
      arguments: ['{{setArg1}}', '{{setArg2}}'],
      resultPath: 'result'
    });

    await setNode.run({}, {
      hostName: host,
      dbNumber,
      password: 'notPassword',
      port,
      setArg1: 'myKey',
      setArg2: 12
    }).should.be.rejectedWith({ message: 'ERR AUTH <password> called without any password configured for the default user. Are you sure your configuration is correct?' });

    const [setOids, setP] = await setNode.run({}, {
      hostName: host,
      dbNumber,
      port,
      setArg1: 'myKey',
      setArg2: 12
    });
    setOids.should.deepEqual([[4]]);
    setP.should.deepEqual({
      hostName: host,
      dbNumber,
      port,
      setArg1: 'myKey',
      setArg2: 12,
      result: 'OK'
    });
  });

  it('should not produce an unhandled rejection when reconnect SELECT fails with NOAUTH', async () => {
    // ioredis tracks the selected db internally (condition.select). On reconnect it
    // calls self.select(condition.select) in readyHandler WITHOUT a .catch() handler.
    // If Redis now requires auth that ioredis doesn't know about (because auth was
    // done manually, not via options), SELECT gets NOAUTH → unhandled rejection →
    // process exits in production.

    let firstClientSocket = null;
    const server = net.createServer((clientSocket) => {
      const redisSocket = net.createConnection(Number(port) || 6379, host);
      clientSocket.pipe(redisSocket);
      redisSocket.pipe(clientSocket);
      redisSocket.on('error', () => {});
      clientSocket.on('error', () => {});
      redisSocket.on('close', () => clientSocket.destroy());
      clientSocket.on('close', () => redisSocket.destroy());
      if (!firstClientSocket) { firstClientSocket = clientSocket; }
    });

    const listenDeferred = defer();
    server.listen(0, () => listenDeferred.resolve());
    await listenDeferred.promise;
    const proxyPort = server.address().port;

    const node = new RedisNode('id', [[4]], {
      host: 'localhost',
      port: String(proxyPort),
      dbNumber: '2',
      command: 'set',
      arguments: ['foo', 'bar'],
      resultPath: 'result'
    });

    // First connection: proxy to Redis, selects db 2.
    // This sets ioredis's internal condition.select = 2.
    await node.run({}, {});

    // Now require a password. On reconnect ioredis won't know to send AUTH
    // (credentials were passed manually, not via ioredis options), so SELECT
    // will be rejected with NOAUTH.
    await redisClient.config('set', 'requirepass', 'reconnectPass');

    // Force the TCP connection to drop; ioredis will schedule a reconnect.
    firstClientSocket.destroy();

    // Wait for ioredis to reconnect, run readyHandler, and issue SELECT 2.
    await new Promise((resolve) => setTimeout(resolve, 500));

    const closeDeferred = defer();
    server.close(() => closeDeferred.resolve());
    await closeDeferred.promise;
  });

  it('should correctly get arguments from payload path', async () => {
    const node = new RedisNode('id', [[4]], {
      host: '{{hostName}}',
      dbNumber: '{{dbNumber}}',
      port: '{{port}}',
      password: '{{password}}',
      command: '{{command}}',
      argumentsPath: 'myArgs',
      resultPath: 'result'
    });

    const result = await node.run({}, {
      hostName: host,
      dbNumber: dbNumber,
      password: password,
      port: port,
      command: 'lpush',
      myArgs: ['myKey', 'foo', 12, [], true, false, null, {}]
    });
    result.should.deepEqual([
      [[4]],
      {
        hostName: host,
        dbNumber: dbNumber,
        password: password,
        port: port,
        command: 'lpush',
        myArgs: ['myKey', 'foo', 12, [], true, false, null, {}],
        result: 7
      }
    ]);

    (await redisClient.lrange('myKey', 0, -1)).should.deepEqual(['[object Object]', 'null', 'false', 'true', '', '12', 'foo']);
  });

  it('should correctly do redis operations', async () => {
    const delNode = new RedisNode('id', [[4]], {
      host: '{{hostName}}',
      dbNumber: '{{dbNumber}}',
      port: '{{port}}',
      password: '{{password}}',
      command: 'del',
      arguments: ['setKey', 'myKey'],
      resultPath: 'result'
    });

    const setNode = new RedisNode('id', [[4]], {
      host: '{{hostName}}',
      dbNumber: '{{dbNumber}}',
      port: '{{port}}',
      password: '{{password}}',
      command: 'set',
      arguments: ['{{setArg1}}', '{{setArg2}}'],
      resultPath: 'result'
    });

    const getNode = new RedisNode('id', [[4]], {
      host: '{{hostName}}',
      dbNumber: '{{dbNumber}}',
      port: '{{port}}',
      password: '{{password}}',
      command: 'get',
      arguments: ['{{getArg1}}'],
      resultPath: 'result'
    });

    const saddNode = new RedisNode('id', [[4]], {
      host: '{{hostName}}',
      dbNumber: '{{dbNumber}}',
      port: '{{port}}',
      password: '{{password}}',
      command: 'sadd',
      arguments: ['setKey', 'v1', 'v2', 'v3', 'v4'],
      resultPath: 'result'
    });

    const smembersNode = new RedisNode('id', [[4]], {
      host: '{{hostName}}',
      dbNumber: '{{dbNumber}}',
      port: '{{port}}',
      password: '{{password}}',
      command: 'smembers',
      arguments: ['setKey'],
      resultPath: 'result'
    });

    const xaddNode = new RedisNode('id', [[4]], {
      host: '{{hostName}}',
      dbNumber: '{{dbNumber}}',
      port: '{{port}}',
      password: '{{password}}',
      command: 'xadd',
      arguments: ['{{setKey}}', '{{id}}', '{{key1}}', '{{key2}}', '{{key3}}', '{{key4}}'],
      resultPath: 'result'
    });

    const xrangeNode = new RedisNode('id', [[4]], {
      host: '{{hostName}}',
      dbNumber: '{{dbNumber}}',
      port: '{{port}}',
      password: '{{password}}',
      command: 'xrange',
      arguments: ['{{setKey}}', '{{startId}}', '{{endId}}'],
      resultPath: 'result'
    });

    const xrevrangeNode = new RedisNode('id', [[4]], {
      host: '{{hostName}}',
      dbNumber: '{{dbNumber}}',
      port: '{{port}}',
      password: '{{password}}',
      command: 'xrevrange',
      arguments: ['{{setKey}}', '{{startId}}', '{{endId}}'],
      resultPath: 'result'
    });

    const [delOids, delP] = await delNode.run({}, {
      hostName: host,
      dbNumber: dbNumber,
      password: password,
      port: port
    });

    delOids.should.deepEqual([[4]]);
    delP.should.deepEqual({
      hostName: host,
      dbNumber: dbNumber,
      password: password,
      port: port,
      result: delP.result
    });

    const [setOids, setP] = await setNode.run({}, {
      hostName: host,
      dbNumber: dbNumber,
      password: password,
      port: port,
      setArg1: 'myKey',
      setArg2: 12
    });
    setOids.should.deepEqual([[4]]);
    setP.should.deepEqual({
      hostName: host,
      dbNumber: dbNumber,
      password: password,
      port: port,
      setArg1: 'myKey',
      setArg2: 12,
      result: 'OK'
    });

    const [getOids, getP] = await getNode.run({}, {
      hostName: host,
      dbNumber: dbNumber,
      password: password,
      port: port,
      getArg1: 'myKey'
    });
    getOids.should.deepEqual([[4]]);
    getP.should.deepEqual({
      hostName: host,
      dbNumber: dbNumber,
      password: password,
      port: port,
      getArg1: 'myKey',
      result: '12'
    });

    const [sAddOids, sAddP] = await saddNode.run({}, {
      hostName: host,
      dbNumber: dbNumber,
      password: password,
      port: port
    });
    sAddOids.should.deepEqual([[4]]);
    sAddP.should.deepEqual({
      hostName: host,
      dbNumber: dbNumber,
      password: password,
      port: port,
      result: 4
    });

    const [sMemOids, sMemP] = await smembersNode.run({}, {
      hostName: host,
      dbNumber: dbNumber,
      password: password,
      port: port
    });
    sMemOids.should.deepEqual([[4]]);
    sMemP.result.slice().sort().should.deepEqual(['v1', 'v2', 'v3', 'v4']);
    sMemP.should.deepEqual({
      hostName: host,
      dbNumber: dbNumber,
      password: password,
      port: port,
      result: sMemP.result
    });


    // Adding stream entry
    await xaddNode.run({}, {
      hostName: host,
      dbNumber: dbNumber,
      password: password,
      port: port,
      setKey: 'testKey2',
      id: '*',
      key1: 'name',
      key2: 'Bob',
      key3: 'surname',
      key4: 'Gates'
    });

    await xaddNode.run({}, {
      hostName: host,
      dbNumber: dbNumber,
      password: password,
      port: port,
      setKey: 'testKey2',
      id: '*',
      key1: 'name',
      key2: 'Mark',
      key3: 'surname',
      key4: 'Walburg'
    });

    // XRANGE TEST #1
    const [xRangeOids1, xRangeP1] = await xrangeNode.run({}, {
      hostName: host,
      dbNumber: dbNumber,
      password: password,
      port: port,
      setKey: 'testKey2',
      startId: '-',
      endId: '+'
    });
    xRangeOids1.should.deepEqual([[4]]);
    xRangeP1.result[0][1].should.deepEqual(['name', 'Bob', 'surname', 'Gates']);
    xRangeP1.result[1][1].should.deepEqual(['name', 'Mark', 'surname', 'Walburg']);
    xRangeP1.should.deepEqual({
      hostName: host,
      dbNumber: dbNumber,
      password: password,
      port: port,
      setKey: 'testKey2',
      startId: '-',
      endId: '+',
      result: xRangeP1.result
    });
    // XREVRANGE TEST #1
    const [xRevRangOids, xRevRangP] = await xrevrangeNode.run({}, {
      hostName: host,
      dbNumber: dbNumber,
      password: password,
      port: port,
      setKey: 'testKey2',
      startId: '+',
      endId: '-'
    });
    xRevRangOids.should.deepEqual([[4]]);
    xRevRangP.result[0][1].should.deepEqual(['name', 'Mark', 'surname', 'Walburg']);
    xRevRangP.result[1][1].should.deepEqual(['name', 'Bob', 'surname', 'Gates']);
    xRevRangP.should.deepEqual({
      hostName: host,
      dbNumber: dbNumber,
      password: password,
      port: port,
      setKey: 'testKey2',
      startId: '+',
      endId: '-',
      result: xRevRangP.result
    });
  });

  it('should correctly yell about invalid ports', async () => {
    const delNode = new RedisNode('id', [[4]], {
      host,
      dbNumber,
      port: '{{port}}',
      password,
      command: 'del',
      arguments: ['key']
    });

    await delNode.run({}, { port: 'nope' }).should.be
      .rejectedWith({ name: 'ValidationError', message: 'Redis port number (nope) is invalid.' });

    await delNode.run({}, { port: 0 }).should.be
      .rejectedWith({ name: 'ValidationError', message: 'Redis port number (0) is invalid.' });

    await delNode.run({}, { port: 2 ** 20 }).should.be
      .rejectedWith({ name: 'ValidationError', message: 'Redis port number (1048576) is invalid.' });
  });

  it('should correctly yell about invalid db numbers', async () => {
    const delNode = new RedisNode('id', [[4]], {
      host,
      dbNumber: '{{dbNumber}}',
      password,
      command: 'del',
      arguments: ['key']
    });

    await delNode.run({}, { dbNumber: 'nope' }).should.be
      .rejectedWith({ name: 'ValidationError', message: 'Redis DB number (nope) is invalid.' });

    await delNode.run({}, { dbNumber: -1 }).should.be
      .rejectedWith({ name: 'ValidationError', message: 'Redis DB number (-1) is invalid.' });

    await delNode.run({}, { dbNumber: 2 ** 31 + 1 }).should.be
      .rejectedWith({ name: 'ValidationError', message: 'Redis DB number (2147483649) is invalid.' });
  });

  it('should correctly deal with bad database numbers', () => {
    const delNode = new RedisNode('id', [[4]], {
      host: '{{hostName}}',
      dbNumber: '12345',
      port: '{{port}}',
      password: '{{password}}',
      command: 'del',
      arguments: ['setKey', 'myKey'],
      resultPath: 'result'
    });

    return delNode.run({}, {
      hostName: host,
      dbNumber: dbNumber,
      password: password,
      port: port
    }).catch((e) => {
      e.name.should.equal('RedisNodeReplyError');
      e.message.should.be.oneOf('ERR DB index is out of range', 'ERR invalid DB index');
    });
  });

  it('should correctly place errors on the payload path', async () => {
    const delNode = new RedisNode('id', [[4]], {
      host: '{{hostName}}',
      dbNumber: '12345',
      port: '{{port}}',
      password: '{{password}}',
      command: 'del',
      arguments: ['setKey', 'myKey'],
      resultPath: 'result',
      errorPath: 'error',
      errorBehavior: 'payloadPath'
    });

    const result = await delNode.run({}, {
      hostName: host,
      dbNumber: dbNumber,
      password: password,
      port: port
    });
    result[1].should.deepEqual({
      error: {
        message: 'ERR DB index is out of range',
        type: 'RedisNodeReplyError'
      },
      hostName: host,
      dbNumber: dbNumber,
      password: password,
      port: port
    });
  });

  it('should correctly yell about timeouts larger than the external timeout', async () => {
    const setNode = new RedisNode('id', [[4]], {
      host,
      dbNumber,
      port,
      password,
      command: 'set',
      arguments: ['myKey', 'bar'],
      resultPath: 'result',
      timeoutTemplate: '{{timeout}}'
    });

    await setNode.run({ externalTimeout: 30000 }, { timeout: 30001 }).should.be
      .rejectedWith({ name: 'ValidationError', message: 'timeoutTemplate cannot be greater than 30 seconds.' });

    const errorPathNode = new RedisNode('id', [[4]], {
      host,
      dbNumber,
      port,
      password,
      command: 'set',
      arguments: ['myKey', 'bar'],
      resultPath: 'result',
      errorPath: 'error',
      errorBehavior: 'payloadPath',
      timeoutTemplate: '60000'
    });

    const result = await errorPathNode.run({ externalTimeout: 30000 }, {});
    result.should.deepEqual([
      [[4]],
      {
        error: {
          message: 'timeoutTemplate cannot be greater than 30 seconds.',
          type: 'Validation'
        }
      }
    ]);
  });

  it('should correctly run with a configured timeout under the external timeout', async () => {
    const setNode = new RedisNode('id', [[4]], {
      host,
      dbNumber,
      port,
      password,
      command: 'set',
      arguments: ['myKey', 'bar'],
      resultPath: 'result',
      timeoutTemplate: '{{timeout}}'
    });

    const [oids, resultP] = await setNode.run({ externalTimeout: 30000 }, { timeout: 5000 });
    oids.should.deepEqual([[4]]);
    resultP.result.should.equal('OK');
    (await redisClient.get('myKey')).should.equal('bar');
  });

  it('should time out a command that takes longer than the configured timeout', async () => {
    const blpopNode = new RedisNode('id', [[4]], {
      host,
      dbNumber,
      port,
      password,
      command: 'blpop',
      // block on redis for 2 seconds, which is well past our 500ms command timeout.
      // the redis side block resolving on its own keeps the cached client from staying blocked.
      arguments: ['emptyList', '2'],
      resultPath: 'result',
      errorPath: 'error',
      errorBehavior: 'payloadPath',
      timeoutTemplate: '500'
    });

    const result = await blpopNode.run({ externalTimeout: 30000 }, {});
    result.should.deepEqual([
      [[4]],
      {
        error: {
          message: 'Command timed out',
          type: 'RedisNodeError'
        }
      }
    ]);
  });

  describe('RedisNode TLS', () => {
    let tlsServer, redisSocket, tlsSocket;
    restoreEnv('NODE_TLS_REJECT_UNAUTHORIZED');
    beforeEach(() => {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    });

    before(async () => {
      tlsServer = tls.createServer({ key: fakeRedisKey, cert: fakeRedisCert }, (socket) => {
        tlsSocket = socket;
        redisSocket = net.createConnection(Number(port) || 6379, host, () => {
          tlsSocket.pipe(redisSocket);
          redisSocket.pipe(tlsSocket);
        });
      });
      const deferred = defer();
      tlsServer.listen(54322, () => {
        deferred.resolve();
      });
      await deferred.promise;
    });

    after(async () => {
      await RedisNode.shutdown();
      redisSocket.destroy();
      tlsSocket.destroy();
      const deferred = defer();
      tlsServer.close(() => {
        deferred.resolve();
      });
      await deferred.promise;
    });

    it('should get and set through a tls proxy', async () => {
      const setNode = new RedisNode('id', [[4]], {
        host: '{{hostName}}',
        dbNumber: '{{dbNumber}}',
        port: '{{port}}',
        password: '{{password}}',
        command: 'set',
        arguments: ['key', 'foo'],
        resultPath: 'result',
        tlsOn: true
      });
      const getNode = new RedisNode('id', [[4]], {
        host: '{{hostName}}',
        dbNumber: '{{dbNumber}}',
        port: '{{port}}',
        password: '{{password}}',
        command: 'get',
        arguments: ['key'],
        resultPath: 'result',
        tlsOn: true
      });

      await setNode.run({}, {
        hostName: 'localhost',
        dbNumber: dbNumber,
        password: password,
        port: 54322
      });
      const result = await getNode.run({}, {
        hostName: 'localhost',
        dbNumber: dbNumber,
        password: password,
        port: 54322
      });
      result[1].should.deepEqual({
        hostName: 'localhost',
        dbNumber: '10',
        password: '',
        port: 54322,
        result: 'foo'
      });
    });
  });

  describe('RedisNode CA Cert', () => {
    let tlsServer, redisSocket, tlsSocket;
    before(async () => {
      tlsServer = tls.createServer({ key: fakeRedisKey, cert: fakeRedisCert, requireCert: true, ca: [fakeRedisCert] }, (socket) => {
        tlsSocket = socket;
        redisSocket = net.createConnection(Number(port) || 6379, host, () => {
          tlsSocket.pipe(redisSocket);
          redisSocket.pipe(tlsSocket);
        });
      });
      const deferred = defer();
      tlsServer.listen(54323, () => {
        deferred.resolve();
      });
      await deferred.promise;
    });

    after(async () => {
      await RedisNode.shutdown();
      redisSocket.destroy();
      tlsSocket.destroy();
      const deferred = defer();
      tlsServer.close(() => {
        deferred.resolve();
      });
      await deferred.promise;
    });

    it('should get and set through a tls proxy with a ca cert', async () => {
      const setNode = new RedisNode('id', [[4]], {
        host: '{{hostName}}',
        dbNumber: '{{dbNumber}}',
        port: '{{port}}',
        password: '{{password}}',
        command: 'set',
        arguments: ['newKey', 'bar'],
        resultPath: 'result',
        tlsOn: true,
        caCertTemplate: '{{caCertTemplate}}'
      });
      const getNode = new RedisNode('id', [[4]], {
        host: '{{hostName}}',
        dbNumber: '{{dbNumber}}',
        port: '{{port}}',
        password: '{{password}}',
        command: 'get',
        arguments: ['newKey'],
        resultPath: 'result',
        tlsOn: true,
        caCertTemplate: '{{caCertTemplate}}'
      });

      await setNode.run({}, {
        hostName: 'localhost',
        dbNumber: dbNumber,
        password: password,
        port: 54323,
        caCertTemplate: fakeRedisCert
      });
      const result = await getNode.run({}, {
        hostName: 'localhost',
        dbNumber: dbNumber,
        password: password,
        port: 54323,
        caCertTemplate: fakeRedisCert
      });
      result[1].should.deepEqual({
        hostName: 'localhost',
        dbNumber: '10',
        password: '',
        port: 54323,
        result: 'bar',
        caCertTemplate: fakeRedisCert
      });
    });
  });

  it('should require at least one cluster member', async () => {
    const node = new RedisNode('id', [[4]], {
      clusterMembers: [],
      command: 'del',
      arguments: ['myKey'],
      resultPath: 'result',
      isCluster: true,
      errorPath: 'error',
      errorBehavior: 'payloadPath'
    });

    const result = await node.run({}, {});
    result.should.deepEqual([
      [[4]],
      {
        error: {
          message: 'Must provide at least one cluster member.',
          type: 'Validation'
        }
      }
    ]);
  });

  it('should correctly fail to connect to a cluster', async () => {
    const node = new RedisNode('id', [[4]], {
      clusterMembers: [{ host: '127.0.0.1', port: 1 }],
      command: 'del',
      arguments: ['myKey'],
      resultPath: 'result',
      isCluster: true,
      errorPath: 'error',
      errorBehavior: 'payloadPath'
    });

    const result = await node.run({}, {});
    result.should.deepEqual([
      [[4]],
      {
        error: {
          message: 'None of startup nodes is available',
          type: 'RedisNodeError'
        }
      }
    ]);
  });
});

describeService('redisCluster', 'RedisNode against a cluster', () => {
  const clusterHost = process.env.REDIS_HOST_CLUSTER || 'localhost';
  const clusterPort = 7379;
  const auth = { username: 'tester', password: 'tester-pass' };
  let redisClient;

  const runNode = (config, command, args) => new RedisNode('id', [[4]], {
    command,
    arguments: args,
    resultPath: 'result',
    errorBehavior: 'payloadPath',
    errorPath: 'error',
    isCluster: true,
    ...auth,
    ...config
  }).run({}, {});

  before(() => {
    redisClient = new Redis({ host: clusterHost, port: clusterPort, ...auth, lazyConnect: true });
  });

  after(async () => {
    await redisClient.quit();
    redisClient = null;
  });

  afterEach(async () => {
    await redisClient.flushall();
  });

  it('should run commands against a redis cluster', async () => {
    const RealCluster = Redis.Cluster;
    const clusterSpy = sinon.spy(function(...args) { return new RealCluster(...args); });
    sinon.stub(Redis, 'Cluster').get(() => clusterSpy);
    const config = { clusterMembers: [{ host: clusterHost, port: clusterPort }] };

    (await runNode(config, 'set', ['clusterKey', 'clusterValue'])).should.deepEqual([[[4]], { result: 'OK' }]);
    (await runNode(config, 'get', ['clusterKey'])).should.deepEqual([[[4]], { result: 'clusterValue' }]);
    (await redisClient.get('clusterKey')).should.equal('clusterValue');
    clusterSpy.calledOnce.should.be.true();
    clusterSpy.firstCall.args[0].should.deepEqual([{ host: clusterHost, port: clusterPort }]);
  });

  it('should fail with the wrong cluster password', async () => {
    const config = { clusterMembers: [{ host: clusterHost, port: clusterPort }] };

    // ioredis reports any startup failure the same way, so check the right password works first
    (await runNode(config, 'get', ['probeKey'])).should.deepEqual([[[4]], { result: null }]);
    (await runNode({ ...config, password: 'wrong-pass' }, 'get', ['probeKey'])).should.deepEqual([[[4]], {
      error: { type: 'RedisNodeError', message: 'None of startup nodes is available' }
    }]);
  });
});
