import './common.js';
import SqlNode from '../src/sql-node.js';

describe('SqlNode', () => {

  // check host, port, database validation
  it('should correctly validate db server configs', async () => {
    let queryNode = new SqlNode('id', [[4]], {
      systemTemplate: '{{system}}',
      hostTemplate: '{{host}}',
      portTemplate: '{{port}}',
      userTemplate: '{{user}}',
      passwordTemplate: '{{pass}}',
      databaseTemplate: '{{database}}',
      query: '{{{template query}}}',
      resultPath: '{{result}}'
    });
    await queryNode.run({ externalTimeout: 10000 }, { system: 'Superfly', host: 'host', user: 'user', database: 'db' }).should.be.rejectedWith({
      name: 'ValidationError',
      message: 'Superfly is not a supported Database.'
    });
    await queryNode.run({ externalTimeout: 10000 }, { system: 'mssql' }).should.be.rejectedWith({
      name: 'ValidationError',
      message: 'Host is required.'
    });
    await queryNode.run({ externalTimeout: 10000 }, { system: 'mssql', host: 'localhost' }).should.be.rejectedWith({
      name: 'ValidationError',
      message: 'Username is required.'
    });
    await queryNode.run({ externalTimeout: 10000 }, { system: 'mssql', host: 'localhost', user: 'bob', pass: 'password' }).should.be.rejectedWith({
      name: 'ValidationError',
      message: 'Database Name is required.'
    });

    queryNode = new SqlNode('id', [[4]], {
      systemTemplate: 'mssql',
      hostTemplate: 'localhost',
      userTemplate: 'bob',
      passwordTemplate: 'password',
      databaseTemplate: 'db1',
      sslOn: '{{ssl}}',
      sslDataMethod: '{{sslDataMethod}}',
      sslDataTemplate: 'huh',
      query: 'something',
      resultPath: 'somewhere'
    });
    await queryNode.run({ externalTimeout: 10000 }, {
      sslOn: true,
      sslDataMethod: 'payloadPath',
      huh: 'what'
    }).should.be.rejectedWith({
      name: 'InvalidJsonError',
      message: 'SSL Config template did not render to valid JSON'
    });
  });

  it('should correctly return the connection configuration', async () => {
    const queryNode = new SqlNode('id', [[4]], {
      systemTemplate: '{{system}}',
      hostTemplate: '{{host}}',
      portTemplate: '{{port}}',
      userTemplate: '{{user}}',
      passwordTemplate: '{{pass}}',
      databaseTemplate: '{{database}}',
      query: '{{{template query}}}',
      resultPath: '{{result}}',
      instanceNameTemplate: '{{ iname }}',
      sslOn: true
    });

    let result = await queryNode.resolveConnectionConfig({ externalTimeout: 10000 }, {
      system: 'mssql',
      host: 'localhost',
      port: 1433,
      user: 'sa',
      pass: 'complexPassword4Me',
      database: 'knextest',
      iname: 'instancename'
    });
    result.system.should.equal('mssql');
    result.connectionConfig.should.deepEqual({
      host: 'localhost',
      user: 'sa',
      port: 1433,
      password: 'complexPassword4Me',
      options: { encrypt: true, instanceName: 'instancename' },
      database: 'knextest'
    });

    result = await queryNode.resolveConnectionConfig({ externalTimeout: 10000 }, {
      system: 'mssql',
      host: 'localhost',
      port: 1433,
      user: 'sa',
      pass: 'complexPassword4Me',
      database: 'knextest'
    });
    result.system.should.equal('mssql');
    result.connectionConfig.should.deepEqual({
      host: 'localhost',
      user: 'sa',
      port: 1433,
      password: 'complexPassword4Me',
      options: { encrypt: true, instanceName: '' },
      database: 'knextest'
    });

    const noSSLNode = new SqlNode('id', [[4]], {
      systemTemplate: '{{system}}',
      hostTemplate: '{{host}}',
      portTemplate: '{{port}}',
      userTemplate: '{{user}}',
      passwordTemplate: '{{pass}}',
      databaseTemplate: '{{database}}',
      query: '{{{template query}}}',
      resultPath: '{{result}}',
      instanceNameTemplate: '{{ iname }}',
      sslOn: false
    });

    result = await noSSLNode.resolveConnectionConfig({ externalTimeout: 10000 }, {
      system: 'mssql',
      host: 'localhost',
      port: 1433,
      user: 'sa',
      pass: 'complexPassword4Me',
      database: 'knextest',
      iname: 'instancename'
    });
    result.system.should.equal('mssql');
    result.connectionConfig.should.deepEqual({
      host: 'localhost',
      user: 'sa',
      port: 1433,
      password: 'complexPassword4Me',
      options: { instanceName: 'instancename' },
      database: 'knextest'
    });

    result = await noSSLNode.resolveConnectionConfig({ externalTimeout: 10000 }, {
      system: 'mssql',
      host: 'localhost',
      port: 1433,
      user: 'sa',
      pass: 'complexPassword4Me',
      database: 'knextest'
    });
    result.system.should.equal('mssql');
    result.connectionConfig.should.deepEqual({
      host: 'localhost',
      user: 'sa',
      port: 1433,
      password: 'complexPassword4Me',
      options: { instanceName: '' },
      database: 'knextest'
    });
  });

  it('should correctly validate if on edge for sqlite', async () => {
    const queryNode = new SqlNode('id', [[4]], {
      systemTemplate: 'sqlite3',
      hostTemplate: './packages/losant-nodes/test/__fixtures__/mydb.sqlite',
      query: '{{{template query}}}',
      resultPath: 'result'
    });
    await queryNode.run({ externalTimeout: 10000 }, {}).should.be.rejectedWith({
      name: 'ValidationError',
      message: 'SQLite is only supported on Edge Devices.'
    });
  });

  describe('sqlite3 allowed', () => {
    let oldAllowSqlite3;
    before(() => {
      oldAllowSqlite3 = SqlNode.allowSqlite3;
      SqlNode.allowSqlite3 = true;
    });

    after(() => {
      SqlNode.allowSqlite3 = oldAllowSqlite3;
    });

    it('handles sqlite3 bad host templates', async () => {
      const queryNode = new SqlNode('id', [[4]], {
        systemTemplate: 'sqlite3',
        hostTemplate: '////',
        query: '{{{template query}}}',
        resultPath: 'result'
      });
      await queryNode.run({ externalTimeout: 10000 }, {
        query: 'drop table if exists tUsers'
      }).should.be.rejectedWith({
        name: 'NotFoundError',
        message: 'unable to open database file'
      });
    });

    it('should correctly validate multi-statements in sqlite', async () => {
      const queryNode = new SqlNode('id', [[4]], {
        systemTemplate: 'sqlite3',
        hostTemplate: './packages/losant-nodes/test/__fixtures__/mydb.sqlite',
        query: '{{{template query}}}',
        resultPath: 'result'
      });
      const del = await queryNode.run({ externalTimeout: 10000 }, {
        query: 'drop table if exists tUsers'
      });
      del[1].result.should.deepEqual(['success']);
      const create = await queryNode.run({ externalTimeout: 10000 }, {
        query: `CREATE TABLE tUsers(
        userid PRIMARY KEY,
        name VARCHAR (255) UNIQUE NOT NULL
       );`
      });
      create[1].result.should.deepEqual(['success']);
      const in1 = await queryNode.run({ externalTimeout: 10000 }, {
        userName: 'bob dobbs',
        query: 'insert into tUsers (userid, name) values (1, \'{{{userName}}}\')'
      });
      in1[1].result.should.deepEqual(['success']);
      await queryNode.run({ externalTimeout: 10000 }, {
        query: 'UPDATE tUsers SET name = \'bob freakin dobbs\' WHERE name = \'bob dobbs\'; \n select * from tUsers'
      }).should.be.rejectedWith({
        name: 'ValidationError',
        message: 'Multi-statement queries are not supported.'
      });
      const up1 = await queryNode.run({ externalTimeout: 10000 }, {
        query: 'UPDATE tUsers SET name = \'bob;freakin;dobbs\' WHERE name = "bob;dobbs";'
      });
      up1[1].result.should.deepEqual(['success']);
      await queryNode.run({ externalTimeout: 10000 }, {
        query: 'UPDATE tUsers SET name = \'bob;freakin dobbs\' WHERE name = "bob dobbs"; \n select * from tUsers'
      }).should.be.rejectedWith({
        name: 'ValidationError',
        message: 'Multi-statement queries are not supported.'
      });
    });

    it('should correctly do SQLite queries', async () => {
      const queryNode = new SqlNode('id', [[4]], {
        systemTemplate: 'sqlite3',
        hostTemplate: './packages/losant-nodes/test/__fixtures__/mydb.sqlite',
        query: '{{{template query}}}',
        resultPath: 'result'
      });
      const del = await queryNode.run({ externalTimeout: 10000 }, {
        query: 'drop table if exists tUsers'
      });
      del[1].result.should.deepEqual(['success']);
      const create = await queryNode.run({ externalTimeout: 10000 }, {
        query: `CREATE TABLE tUsers(
        userid PRIMARY KEY,
        name VARCHAR (255) UNIQUE NOT NULL
       );`
      });
      create[1].result.should.deepEqual(['success']);
      const in1 = await queryNode.run({ externalTimeout: 10000 }, {
        userName: 'bob dobbs',
        query: 'insert into tUsers (userid, name) values (1, \'{{{userName}}}\')'
      });
      in1[1].result.should.deepEqual(['success']);
      await queryNode.run({ externalTimeout: 10000 }, {
        userName: 'bob dobbs2',
        query: 'insert into tUsers (userid, name) values (2, \'{{{userName}}}\')'
      });
      await queryNode.run({ externalTimeout: 10000 }, {
        userName: 'bob dobbs3',
        query: 'insert into tUsers (userid, name) values (3, \'{{{userName}}}\')'
      });
      await queryNode.run({ externalTimeout: 10000 }, {
        userName: 'bob dobbs4',
        query: 'insert into tUsers (userid, name) values (3, \'{{{userName}}}\')'
      });
      const sel1 = await queryNode.run({ externalTimeout: 10000 }, {
        query: 'select * from tUsers'
      });
      sel1[1].result.should.deepEqual([
        { userid: 1, name: 'bob dobbs' },
        { userid: 2, name: 'bob dobbs2' },
        { userid: 3, name: 'bob dobbs3' }
      ]);
      const up1 = await queryNode.run({ externalTimeout: 10000 }, {
        query: 'UPDATE tUsers SET name = \'bob fing dobbs\' WHERE name = \'bob dobbs\''
      });
      up1[1].result.should.deepEqual(['success']);
      const sel2 = await queryNode.run({ externalTimeout: 10000 }, {
        query: 'select * from tUsers'
      });
      sel2[1].result.should.deepEqual([
        { userid: 1, name: 'bob fing dobbs' },
        { userid: 2, name: 'bob dobbs2' },
        { userid: 3, name: 'bob dobbs3' }
      ]);
      const broken = await queryNode.run({ externalTimeout: 10000 }, {
        query: 'select * covfefe'
      });
      broken[1].result.should.deepEqual({
      errors: 'near \"covfefe\": syntax error' //eslint-disable-line
      });
    });
  });

  it.skip('should correctly do MySQL queries', async () => {
    // To setup a container for testing, one possible way:
    // docker run --name some-mysql -e MYSQL_ROOT_PASSWORD=my-secret-pw -p 3306:3306 -d mysql --default-authentication-plugin=mysql_native_password
    // docker exec -i some-mysql mysql -uroot -p
    // my-secret-pw
    // CREATE DATABASE knextest;
    //
    const queryNode = new SqlNode('id', [[4]], {
      systemTemplate: 'mysql',
      hostTemplate: 'localhost',
      //portTemplate: 5432,
      userTemplate: 'root',
      passwordTemplate: 'my-secret-pw',
      databaseTemplate: 'knextest',
      query: '{{{template query}}}',
      resultPath: 'result'
    });
    await queryNode.run({ externalTimeout: 10000 }, {
      query: 'drop table if exists tUsers'
    });
    const create = await queryNode.run({ externalTimeout: 10000 }, {
      query: `CREATE TABLE tUsers(
        userid serial PRIMARY KEY,
        name VARCHAR (255) UNIQUE NOT NULL
       );`
    });
    create[1].result.should.deepEqual(['success']);
    const in1 = await queryNode.run({ externalTimeout: 10000 }, {
      userName: 'bob dobbs',
      query: 'insert into tUsers (name) values (\'{{{userName}}}\')'
    });
    in1[1].result.should.deepEqual(['success']);
    await queryNode.run({ externalTimeout: 10000 }, {
      userName: 'bob dobbs2',
      query: 'insert into tUsers (name) values (\'{{{userName}}}\')'
    });
    await queryNode.run({ externalTimeout: 10000 }, {
      userName: 'bob dobbs3',
      query: 'insert into tUsers (name) values (\'{{{userName}}}\')'
    });
    await queryNode.run({ externalTimeout: 10000 }, {
      userName: 'bob dobbs4',
      query: 'insert into tUsers (name) values (\'{{{userName}}}\')'
    });
    const sel1 = await queryNode.run({ externalTimeout: 10000 }, {
      query: 'select * from tUsers'
    });
    sel1[1].result.should.deepEqual([
      { userid: 1, name: 'bob dobbs' },
      { userid: 2, name: 'bob dobbs2' },
      { userid: 3, name: 'bob dobbs3' },
      { userid: 4, name: 'bob dobbs4' }
    ]);

    // multi-statement test, sends an array of results
    const sel2 = await queryNode.run({ externalTimeout: 10000 }, {
      query: 'select * from tUsers; select count(*) as totalCount from tUsers;'
    });
    sel2[1].result.should.deepEqual([
      { userid: 1, name: 'bob dobbs' },
      { userid: 2, name: 'bob dobbs2' },
      { userid: 3, name: 'bob dobbs3' },
      { userid: 4, name: 'bob dobbs4' },
      { totalCount: 4 }
    ]);

    // multi-statement test, sends an array of results
    const up1 = await queryNode.run({ externalTimeout: 10000 }, {
      query: 'UPDATE tUsers SET name = \'bob fing dobbs\' WHERE name = \'bob dobbs\'; select * from tUsers;'
    });
    up1[1].result.should.deepEqual([
      'success',
      { userid: 2, name: 'bob dobbs2' },
      { userid: 3, name: 'bob dobbs3' },
      { userid: 4, name: 'bob dobbs4' },
      { userid: 1, name: 'bob fing dobbs' }
    ]);
    const broken = await queryNode.run({ externalTimeout: 10000 }, {
      query: 'select * covfefe'
    });
    broken[1].result.should.deepEqual({
      errors: 'You have an error in your SQL syntax; check the manual that corresponds to your MySQL server version for the right syntax to use near \'covfefe\' at line 1'
    });

    // to check local infile is disabled from client:
    //   docker exec -i some-mysql mysql -uroot -p
    //   my-secret-pw
    //   SET GLOBAL local_infile = 'ON';
    const filledHole = await queryNode.run( { externalTimeout: 10000 }, {
      query: 'load data local infile \'abc.csv\' into table tUsers'
    });
    filledHole[1].result.should.deepEqual({
      errors: 'Loading local data is disabled; this must be enabled on both the client and server sides'
    });
  });

  it.skip('should correctly do MSSQL queries', async () => {
    // To setup a container for testing, one possible way:
    // docker run --cap-add SYS_PTRACE -e 'ACCEPT_EULA=1' -e 'MSSQL_SA_PASSWORD=complexPassword4Me' -p 1433:1433 --name some-mssql -d mcr.microsoft.com/azure-sql-edge
    // then in a node terminal run the following commands
    // import knex from 'knex';
    // let k = new knex({ client: 'mssql', connection: { host: 'localhost', user: 'sa', port: 1433, password: 'complexPassword4Me' } });
    // await k.raw('CREATE DATABASE knextest;');
    const queryNode = new SqlNode('id', [[4]], {
      systemTemplate: 'mssql',
      hostTemplate: 'localhost',
      portTemplate: 1433,
      userTemplate: 'sa',
      passwordTemplate: 'complexPassword4Me',
      databaseTemplate: 'knextest',
      query: '{{{template query}}}',
      resultPath: 'result'
    });
    const del = await queryNode.run({ externalTimeout: 10000 }, {
      query: 'drop table if exists tUsers'
    });
    del[1].result.should.deepEqual([]);
    const create = await queryNode.run({ externalTimeout: 10000 }, {
      query: `CREATE TABLE tUsers
        (userid int IDENTITY PRIMARY KEY NOT NULL,
        name varchar(25) NOT NULL
      );`
    });
    create[1].result.should.deepEqual([]);
    const in1 = await queryNode.run({ externalTimeout: 10000 }, {
      userName: 'bob dobbs',
      query: 'insert into tUsers (name) values (\'{{{userName}}}\')'
    });
    in1[1].result.should.deepEqual([]);
    const sel1 = await queryNode.run({ externalTimeout: 10000 }, {
      query: 'select * from tUsers'
    });
    sel1[1].result.should.deepEqual([{
      userid: 1,
      name: 'bob dobbs'
    }]);
    // multi-statement test - mssql is weird it only returns the first reply
    const up1 = await queryNode.run({ externalTimeout: 10000 }, {
      query: 'UPDATE tUsers SET name = \'bob fing dobbs\' WHERE name = \'bob dobbs\'; select * from tUsers;'
    });
    up1[1].result.should.deepEqual([
      { userid: 1, name: 'bob fing dobbs' }
    ]);
    const broken = await queryNode.run({ externalTimeout: 10000 }, {
      query: 'select * covfefe'
    });
    broken[1].result.should.deepEqual({
      errors: 'select * covfefe - Incorrect syntax near \'covfefe\'.'
    });
  });

  it.skip('should correctly do MSSQL queries on Azure', async () => {
    const queryNode = new SqlNode('id', [[4]], {
      systemTemplate: 'mssql',
      hostTemplate: 'losant-test.database.windows.net',
      portTemplate: 1433,
      userTemplate: 'losant-test',
      passwordTemplate: 'getPasswordFromQaSpreadsheet',
      databaseTemplate: 'losant-test',
      query: '{{{template query}}}',
      resultPath: 'result',
      sslOn: true
    });
    const del = await queryNode.run({ externalTimeout: 10000 }, {
      query: 'drop table if exists tUsers'
    });
    del[1].result.should.deepEqual([]);
    const create = await queryNode.run({ externalTimeout: 10000 }, {
      query: `CREATE TABLE tUsers
        (userid int IDENTITY PRIMARY KEY NOT NULL,
        name varchar(25) NOT NULL
      );`
    });
    create[1].result.should.deepEqual([]);
    const in1 = await queryNode.run({ externalTimeout: 10000 }, {
      userName: 'bob dobbs',
      query: 'insert into tUsers (name) values (\'{{{userName}}}\')'
    });
    in1[1].result.should.deepEqual([]);
    await queryNode.run({ externalTimeout: 10000 }, {
      userName: 'bob dobbs2',
      query: 'insert into tUsers (name) values (\'{{{userName}}}\')'
    });
    await queryNode.run({ externalTimeout: 10000 }, {
      userName: 'bob dobbs3',
      query: 'insert into tUsers (name) values (\'{{{userName}}}\')'
    });
    await queryNode.run({ externalTimeout: 10000 }, {
      userName: 'bob dobbs4',
      query: 'insert into tUsers (name) values (\'{{{userName}}}\')'
    });
    const sel1 = await queryNode.run({ externalTimeout: 10000 }, {
      query: 'select * from tUsers'
    });
    sel1[1].result.should.deepEqual([
      { userid: 1, name: 'bob dobbs' },
      { userid: 2, name: 'bob dobbs2' },
      { userid: 3, name: 'bob dobbs3' },
      { userid: 4, name: 'bob dobbs4' }
    ]);
    const up1 = await queryNode.run({ externalTimeout: 10000 }, {
      query: 'UPDATE tUsers SET name = \'bob fing dobbs\' WHERE name = \'bob dobbs\''
    });
    up1[1].result.should.deepEqual([]);
    const sel2 = await queryNode.run({ externalTimeout: 10000 }, {
      query: 'select * from tUsers'
    });
    sel2[1].result.should.deepEqual([
      { userid: 1, name: 'bob fing dobbs' },
      { userid: 2, name: 'bob dobbs2' },
      { userid: 3, name: 'bob dobbs3' },
      { userid: 4, name: 'bob dobbs4' }
    ]);
    const broken = await queryNode.run({ externalTimeout: 10000 }, {
      query: 'select * covfefe'
    });
    broken[1].result.should.deepEqual({
      errors: 'select * covfefe - Incorrect syntax near \'covfefe\'.'
    });
  });

  it.skip('should correctly do PostgreSQL queries', async () => {
    // To setup a container for testing, one possible way:
    // docker run -d -p 5431:5432 --name my-postgres -e POSTGRES_PASSWORD=mysecretpassword postgres
    //
    // docker exec -it my-postgres bash
    // psql -U postgres
    // CREATE DATABASE knextest;
    //
    const queryNode = new SqlNode('id', [[4]], {
      systemTemplate: 'pg',
      hostTemplate: 'localhost',
      portTemplate: 5431,
      userTemplate: 'postgres',
      passwordTemplate: 'mysecretpassword',
      databaseTemplate: 'knextest',
      query: '{{{template query}}}',
      resultPath: 'result'
    });
    const del = await queryNode.run({ externalTimeout: 10000 }, {
      query: 'drop table if exists tUsers'
    });
    del[1].result.should.deepEqual(['success']);
    const create = await queryNode.run({ externalTimeout: 10000 }, {
      query: `CREATE TABLE tUsers(
        userID serial PRIMARY KEY,
        name VARCHAR (255) UNIQUE NOT NULL
       );`
    });
    create[1].result.should.deepEqual(['success']);
    const in1 = await queryNode.run({ externalTimeout: 10000 }, {
      userName: 'bob dobbs',
      query: 'insert into tUsers (name) values (\'{{{userName}}}\')'
    });
    in1[1].result.should.deepEqual(['success']);
    await queryNode.run({ externalTimeout: 10000 }, {
      userName: 'bob dobbs2',
      query: 'insert into tUsers (name) values (\'{{{userName}}}\')'
    });
    await queryNode.run({ externalTimeout: 10000 }, {
      userName: 'bob dobbs3',
      query: 'insert into tUsers (name) values (\'{{{userName}}}\')'
    });
    await queryNode.run({ externalTimeout: 10000 }, {
      userName: 'bob dobbs4',
      query: 'insert into tUsers (name) values (\'{{{userName}}}\')'
    });
    const sel1 = await queryNode.run({ externalTimeout: 10000 }, {
      query: 'select * from tUsers'
    });
    sel1[1].result.should.deepEqual([
      { userid: 1, name: 'bob dobbs' },
      { userid: 2, name: 'bob dobbs2' },
      { userid: 3, name: 'bob dobbs3' },
      { userid: 4, name: 'bob dobbs4' }
    ]);
    // multi-statement test - returns multiple results
    const up1 = await queryNode.run({ externalTimeout: 10000 }, {
      query: 'UPDATE tUsers SET name = \'bob fing dobbs\' WHERE name = \'bob dobbs\'; select * from tUsers;'
    });
    up1[1].result.should.deepEqual([
      'success',
      { userid: 2, name: 'bob dobbs2' },
      { userid: 3, name: 'bob dobbs3' },
      { userid: 4, name: 'bob dobbs4' },
      { userid: 1, name: 'bob fing dobbs' }
    ]);
    const broken = await queryNode.run({ externalTimeout: 10000 }, {
      query: 'select * covfefe'
    });
    broken[1].result.should.deepEqual({
      errors: 'select * covfefe - syntax error at or near "covfefe"'
    });

    // special data types
    const sel2 = await queryNode.run({ externalTimeout: 10000 }, {
      query: "SELECT time '10:00' - time '02:00';"
    });
    sel2[1].result.should.deepEqual([
      { '?column?': { hours: 8 } }
    ]);
  });

});
