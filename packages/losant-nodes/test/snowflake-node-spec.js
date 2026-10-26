import { Readable } from 'node:stream';
import snowflake from 'snowflake-sdk';
import { nock, sinon } from './common.js';
import SnowflakeNode from '../src/snowflake-node.js';
const ID = 'id';
const OUTPUT_IDS = [[4]];

const fakeClientSslKey = `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCrFZUVdMMRZuYh
b3GxoFLBcNLC+FOxnybzpmXg7Ds+HuKtVveB4Gyz8tx60IA8S86EEm+cTUGz3TUZ
28BBAh4aTDMU3934da2i/WGYk9udMQgeCrNzVH8us8Yp2gXo5Vn/1AnNuEn3tBcx
Ojn0fNxxiwVTQenv8dlq9sTDuL+rirfvyDw827rrnqz366RnrqasyQgtzLCuZT5w
YbMKuI1nQOjrbDeFWqaXPbW7Fqz+uvO4flJEorXaplZmEGG4KyGiKXP6L3Zm1MnU
EBEyitS/E/4txVETIOBt7Yj08Pobw1/vkl/qos50SqvrJiPQ98BtOhL1LXFefhPg
LB/qh5ePAgMBAAECggEAPII+nz8TuvTk0dCDqqokesw3jsObfkfm0+f3Qmzqqxbr
XxlSIrpIWAC+YCWcJTc+jFGk7egZI89J96JURenE0dI/gtOGw1iDmBD70qYA14C+
+TkZrOGmtdLZdHXq/ysXALdy3DKg3p3wUfXhB4qdwP7FXGQEpFuqZP1wLDUMfVPX
lPhg61kbvQv5mlY5HnIvq7X/6nvka8eRRpCyHb/zOD4oOf+AIjUjUJGTF1+JIPum
977QgmXBiea2YjDLBEPikqFh3z9AzOf0E1Aqwr+yqvzmjrwJ65oU8wb73fLxgJiA
xmZIeotgwQenIhVHp6MmkZevb56waoER2tQm1/4IUQKBgQDWH5gX5yWg4oP2GERk
93d6o3XStAHRF8Urlbh207BtI7TzM5z6sQsKB1jVu8Xk25eCfJUxOPFTrVsklrsU
bvR6MixvDvXave/RNDuczJ3e7vYxdr4sm3sda8vi37DxGNDqvXk16PlbQ8LVA3lt
kDKbhso77fmHa13vbpbQjHbd6QKBgQDMiyvpwgY00+gAgPW5j5FCs2nl+7jLbL6n
u3XyuyrLhHZGOwVdeuRR2XOVn9cTvfZezrSLIvjDwjnL3tOgWdNSYNMk3+cuvMFP
C2DcwiRX+tGyejA1queod5zAb5XEvVhALBbmvIk9r4P7r56OSLDuMx2rMHEFx5gJ
ilseys+GtwKBgFbbCf7oLENOnui8f0HVgAmnNKv7iKEgW0KKwQCybeZXjZb5YLvw
BOJUiJxqRqPGz3aGwp3s0zd2Inp9CfYH6/OFVrDWCLRqR1U9MtEvzvoXRJZb7Fh7
2Tzd9R5aTpP91QDjSr+reTqkCewONLtUurKLwoz8wzNDQh9VZKfD0pPBAoGAdHr4
qejE8gaOwuKtjFt2pF5Zew+rP6UQuaImW/E8QKORWxM3TfGy3e2QRe+9Yk+2Ym0i
IW3r7kbH9RJSv6kHj4z2ELS1CUeSafoX0f95BOUfz5yHobhOrgBXsrqYtm4BOKIi
9Ij/OrKd3ZE4INzCbROM3LT8WAc+zIgOte1W2ucCgYEAvCwMTFH/dwba1mH/sTbX
N92ms+Ig02PZII3Z4NHOAaV2F2TuHKNCXaATq43BAZtNgQ3UuK1XYlEgZlQ/6jaH
ERip2diOAScXyIHmOHeUqg3VpVPeEUCzGU9usjTHQUiJ6px2hT+nKLrPjexFgySj
ve4pM7ISUnS1P3iNA7ikQk0=
-----END PRIVATE KEY-----`;

const fakeSslEncryptedKey = `-----BEGIN ENCRYPTED PRIVATE KEY-----
MIIFJTBfBgkqhkiG9w0BBQ0wUjAxBgkqhkiG9w0BBQwwJAQQMiZQvkadCBHWI3iU
6DeSBgICCAAwDAYIKoZIhvcNAgkFADAdBglghkgBZQMEASoEEH9Wls3s/5sSDTBL
O/bsWSoEggTAngQ0j0S4UOXsjvlQNLiOJ3Abei6AKBTSDoCA03jvBJ8b3xMv2B/j
+5FVOkmT21V1qR05O41ry+hEUMkL1d7RH5fLwLt6DJoRpNBe4CumlcRy+4yl0OFI
oYCtOTNzqGbW4dCFQ1DiWGuYrXbT3WZxtr091E1w40LGTycTeJhXDYACFsSUIXwv
WrUUhq6/Vccj57LWb9ncOFxkjMgC7PcwCLp1VcEMQti052/9WlH5YFDfqNwl4m5t
9ublKlUsAlPXZI0fkqw8SwwSH3j68GJxaeegTnAs5uLs9EdU7+jQxbm+sE418IDq
qbyM9WWWQlM2VPNFkgbeD4pKYmWXrjIL/mfMnwH2opt+F36MFP3d9Mm9z4eYI1cE
yqA8xq65rJNS5kisOOtXUy/TrpZrwZOccV5m5QGi9E0LfS0myG+lkZGyfWwTVgnL
eJAmOL5R67Hfe5z5RRCGMSBOXX17or/gVNT1d/KHlb6R3JLuju8STKFNk0Ezm0Xl
adZijYr64c4MbkVuRZVGLU+ztlrzdw3x3drZ3uqabKyuLnG391hu+Izo18SIEXT2
ILr2uX3fFXRaGK7v+js45jFNSh17lMMMCABQZoFjAHeTimL1veemoWN0aGgn4aAu
iu/5EMRw/43zEO4fIf/dEaR3ZEzWv6pqDkwVfs0D2Y90YDfZQs0y6fpcxUWCAcwf
3z5b3TdqV4KpTyV/fLlLiFv2e5djC+YbrPUAQy6wmzvybPS7csTtcjJsrgc+j117
x2yBBKZjB4jlEtKDxCZj2urTsoH79eUYw1zmcQmLl7gPS7sBYuUQQVUsp/HzGUS7
zlMkPgxmyPpz+s16K2LHPmZ4b+V4Rr9DUGsPZSfLqIgWKnRpj/RsOuUgpcWk5jkG
d0OP4LUskALNBCwgMoq/7e2SZq1f6AzXORJ5HsQtZsR5aCAxMKo0j0/GW7XOchUq
ocdx9DempcqAnkokMx9Yw/c1P9yFeDRqn44aMmIT55CCqNDXPqiWlAEVjU4YYXAs
dx2BJ8ZhNSldPryyFN+Cu22DpSS0jKeKoYypunNeGgzkvSudW4PQX/atSVYFfr/t
FUEmthlzfLMSLS160EqsZ7ZEsi086O6RkKEJhp8x9Dar6QQ85YXqLlA/46yQLO/g
HwZP+sKpKdQfHBAXT4m+4TOKqT1HOhqJCn1OTn1ebZSw8zD7K3eL3w+Au+dV8sS8
Qy7cmx2u7saHJy/01FDZAegHbMKjEpPmis11CWmCK3L1ZMSwwUv5vYJL2BcliMUo
MsKei57SdamHSfCXrmbsbNClOC/M8WvnazCy1OSuPzLlAnxASMFv5xwBLLK8xPJx
SqqWlGeoMDSL31cWmXGQ6ymeYZdOeyX/zTEuPNaWYCvrmnDYr03NTAKUgdzw5qjE
XfyUL76q8bVOQw/idxy/YEHOl8g1iii6xsngilo6gyS5OGAM1MIm+wlt22e5YLig
CI8KAe2CNYJWWb3psltNDZU+0ZpKcllVeGFgmMyeYA26zmlzOOeUHbJkA/2ddjAl
qa8Nfkq7VGOJfHtCSA6G0cvjpt5cJFesyZxRVsSegCi5FREXVUUjrqP0d5BaD0uW
iW4hEH5JHT3cmuh6bAxJaJAAD2gLBqXn/A==
-----END ENCRYPTED PRIVATE KEY-----
`;

describe('SnowflakeNode', () => {

  describe('validation errors', () => {
    it('should throw an error when account is missing', async () => {
      const node = new SnowflakeNode(ID, OUTPUT_IDS, {
        hostTemplate: '{{ foo }}',
        usernameTemplate: 'Losant',
        sqlSourceValue: 'SELECT * FROM TURBOFAN LIMIT 10',
        sqlSourceType: 'stringTemplate',
        databaseTemplate: 'IOT',
        schemaTemplate: 'TELEMETRY',
        resultPath: 'result'
      });
      await node.run({}, {}).should.be.rejectedWith({
        message: 'Missing Host'
      });
    });
    it('should throw an error when username is missing', async () => {
      const node = new SnowflakeNode(ID, OUTPUT_IDS, {
        hostTemplate: 'fake-account.snowflakecomputing.com',
        usernameTemplate: '{{ whatuser }}',
        sqlSourceValue: 'SELECT * FROM TURBOFAN LIMIT 10',
        sqlSourceType: 'stringTemplate',
        databaseTemplate: 'IOT',
        schemaTemplate: 'TELEMETRY',
        resultPath: 'result'
      });
      await node.run({}, {}).should.be.rejectedWith({
        message: 'Missing Username'
      });
    });
    it('should throw an error when privateKey is missing', async () => {
      const node = new SnowflakeNode(ID, OUTPUT_IDS, {
        hostTemplate: 'fake-account.snowflakecomputing.com',
        usernameTemplate: '{{ user }}',
        sqlSourceValue: 'SELECT * FROM TURBOFAN LIMIT 10',
        sqlSourceType: 'stringTemplate',
        databaseTemplate: 'IOT',
        schemaTemplate: 'TELEMETRY',
        resultPath: 'result'
      });
      await node.run({}, { user: 'me' }).should.be.rejectedWith({
        message: 'Missing Private Key'
      });
    });
    it('should throw an error when database is missing', async () => {
      const node = new SnowflakeNode(ID, OUTPUT_IDS, {
        hostTemplate: 'fake-account.snowflakecomputing.com',
        usernameTemplate: '{{ user }}',
        privateKeyTemplate: fakeClientSslKey,
        databaseTemplate: '{{ db }}',
        schemaTemplate: 'TELEMETRY',
        resultPath: 'result'
      });
      await node.run({}, { user: 'me' }).should.be.rejectedWith({
        message: 'Missing Database'
      });
    });
    it('should throw an error when private key cannot be parsed for the public key', async () => {
      const node = new SnowflakeNode(ID, OUTPUT_IDS, {
        hostTemplate: 'fake-account.snowflakecomputing.com',
        usernameTemplate: '{{ user }}',
        privateKeyTemplate: fakeSslEncryptedKey,
        privateKeyPasswordTemplate: 'f00b@R',
        resultPath: 'result'
      });
      await node.run({}, { user: 'me' }).should.be.rejectedWith({
        message: 'Private Key is not in the correct format.'
      });
    });
    it('should throw an error when sql statement is missing', async () => {
      const node = new SnowflakeNode(ID, OUTPUT_IDS, {
        hostTemplate: 'fake-account.snowflakecomputing.com',
        usernameTemplate: '{{ user }}',
        privateKeyTemplate: fakeClientSslKey,
        privateKeyPasswordTemplate: 'testing1234!',
        databaseTemplate: '{{ db }}',
        schemaTemplate: 'TELEMETRY',
        sqlSourceType: 'payloadPath',
        sqlSourceValue: 'foo',
        resultPath: 'result'
      });
      await node.run({}, { user: 'me', db: 'myDatabase' }).should.be.rejectedWith({
        message: 'Missing SQL Statement'
      });
    });
    it('should throw an error when sql statement is missing', async () => {
      const node = new SnowflakeNode(ID, OUTPUT_IDS, {
        hostTemplate: 'fake-account.snowflakecomputing.com',
        usernameTemplate: '{{ user }}',
        privateKeyTemplate: fakeClientSslKey,
        privateKeyPasswordTemplate: 'testing1234!',
        databaseTemplate: '{{ db }}',
        schemaTemplate: 'TELEMETRY',
        sqlSourceType: 'stringTemplate',
        sqlSourceValue: '{{foo}}',
        resultPath: 'result'
      });
      await node.run({}, { user: 'me', db: 'myDatabase' }).should.be.rejectedWith({
        message: 'Missing SQL Statement'
      });
    });
    it('should throw an error when sql statement is missing', async () => {
      const node = new SnowflakeNode(ID, OUTPUT_IDS, {
        hostTemplate: 'fake-account.snowflakecomputing.com',
        usernameTemplate: '{{ user }}',
        privateKeyTemplate: fakeClientSslKey,
        privateKeyPasswordTemplate: 'testing1234!',
        databaseTemplate: '{{ db }}',
        schemaTemplate: 'TELEMETRY',
        sqlSourceType: 'stringTemplate',
        sqlSourceValue: '',
        resultPath: 'result'
      });
      await node.run({}, { user: 'me', db: 'myDatabase' }).should.be.rejectedWith({
        message: 'Missing SQL Statement'
      });
    });
    it('should timeout around the timeout time', async () => {
      const snowflakeCall = nock('https://fake-account.snowflakecomputing.com:443', { encodedQueryParams: true })
        .post('/session/v1/login-request', () => { return true; })
        .once()
        .query(() => { return true; })
        .reply(404);

      const node = new SnowflakeNode(ID, OUTPUT_IDS, {
        hostTemplate: 'FAKE-ACCOUNT.snowflakecomputing.com',
        usernameTemplate: 'Losant',
        privateKeyTemplate: fakeClientSslKey,
        sqlSourceValue: 'SELECT * FROM TURBOFAN LIMIT {{ limit }}',
        sqlSourceType: 'stringTemplate',
        databaseTemplate: 'IOT',
        schemaTemplate: 'TELEMETRY',
        timeoutTemplate: '1000',
        resultPath: 'result'
      });
      const results = await node.run({ externalTimeout: 30000 }, { limit: 10 });
      snowflakeCall.isDone().should.equal(true);
      results[1].result.error.message.should.equal('Request to Snowflake failed.');
    });
  });

  describe('with a stubbed connection', () => {
    let connection, statement;

    const stubConnection = (stream) => {
      statement = {
        streamRows: () => stream,
        cancel: sinon.spy((cb) => setImmediate(cb))
      };
      connection = {
        connect: (cb) => setImmediate(() => cb(null, connection)),
        execute: ({ complete }) => setImmediate(() => complete(null, { getQueryId: () => 'query-id' })),
        getResultsFromQueryId: sinon.stub().resolves(statement),
        isUp: () => true,
        destroy: sinon.spy((cb) => setImmediate(cb))
      };
      sinon.stub(snowflake, 'createConnection').returns(connection);
    };

    const newNode = (config = {}) => new SnowflakeNode(ID, OUTPUT_IDS, {
      hostTemplate: 'fake-account.snowflakecomputing.com',
      usernameTemplate: 'tester',
      privateKeyTemplate: fakeClientSslKey,
      sqlSourceValue: 'SELECT * FROM READINGS LIMIT {{ limit }}',
      sqlSourceType: 'stringTemplate',
      databaseTemplate: 'IOT',
      schemaTemplate: 'TELEMETRY',
      resultPath: 'result',
      ...config
    });

    it('should return the streamed rows', async () => {
      const rows = Array.from({ length: 10 }, (_, i) => ({ ID: i, VALUE: `row ${i}` }));
      stubConnection(Readable.from(rows));

      const results = await newNode().run({ externalTimeout: 10000 }, { limit: 10 });

      results[1].result.should.deepEqual({ rows });
      snowflake.createConnection.firstCall.args[0].should.containEql({
        authenticator: 'SNOWFLAKE_JWT',
        username: 'TESTER',
        host: 'fake-account.snowflakecomputing.com',
        database: 'IOT',
        schema: 'TELEMETRY'
      });
      connection.getResultsFromQueryId.firstCall.args[0].should.deepEqual({ queryId: 'query-id' });
      statement.cancel.called.should.be.false();
      connection.destroy.calledOnce.should.be.true();
    });

    it('should error and cancel the statement when the result exceeds 5MB', async () => {
      // each row stringifies to just over 1MB, so the fifth row crosses 5MB
      const bigRow = { VALUE: 'x'.repeat(1024 * 1024) };
      stubConnection(Readable.from(Array.from({ length: 10 }, () => bigRow)));

      const results = await newNode().run({ externalTimeout: 10000 }, { limit: 10 });

      results[1].result.should.deepEqual({
        error: { message: 'Size of SQL Result (5.0MB) is greater than maximum allowed (5MB)' }
      });
      statement.cancel.calledOnce.should.be.true();
      connection.destroy.calledOnce.should.be.true();
    });

    it('should cancel a statement when in the middle of a query', async () => {
      const stream = new Readable({ objectMode: true, read() {} });
      stubConnection(stream);

      const results = await newNode({ timeoutTemplate: '100' }).run({ externalTimeout: 10000 }, { limit: 10 });

      results[1].result.should.deepEqual({ error: { message: 'Promise timed out after 100 ms' } });
      stream.destroyed.should.be.true();
      statement.cancel.calledOnce.should.be.true();
      connection.destroy.calledOnce.should.be.true();
    });
  });
});
