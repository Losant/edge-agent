import { sinon } from './common.js';
import jsforce from '@jsforce/jsforce-node';
import SalesforceNode from '../src/salesforce-node.js';

// jsforce is mocked directly with sinon rather than through nock: nock's
// global net.Socket/tls.TLSSocket patching races with the real background
// TLS connection jsforce's HTTP client opens, which can crash the process
// when the mocked hostname actually resolves. Stubbing jsforce.Connection
// avoids any real network activity entirely.
const stubConnection = (methods) => {
  const login = sinon.stub().resolves();
  const sobject = sinon.stub().returns(methods);
  sinon.stub(jsforce, 'Connection').callsFake(() => ({ login, sobject }));
  return { login, sobject };
};

describe('SalesforceNode', () => {
  it('should correctly do a salesforce create', async function() {
    const create = sinon.stub().resolves({ id: '500000000000001AAA', success: true, errors: [] });
    const { login, sobject } = stubConnection({ create });

    const createNode = new SalesforceNode('id', [[4]], {
      username: 'test@example.com',
      password: 'myPassword',
      token: 'myToken',
      resultPath: 'result',
      sobjectType: 'Case',
      action: 'create',
      params: [{
        name: 'record',
        type: 'json',
        value: '{"Subject":"Case From Test","Description":"Hi There","Origin":"Web"}'
      }]
    });
    const [ oids, p ] = await createNode.run({}, {});
    oids.should.deepEqual([[4]]);
    p.should.deepEqual({
      result: {
        errors: [],
        id: '500000000000001AAA',
        success: true
      }
    });
    login.firstCall.args.should.deepEqual(['test@example.com', 'myPasswordmyToken']);
    sobject.firstCall.args.should.deepEqual(['Case']);
    create.firstCall.args.should.deepEqual([{ Subject: 'Case From Test', Description: 'Hi There', Origin: 'Web' }]);
  });

  it('should correctly do a salesforce destroy', async function() {
    const destroy = sinon.stub().resolves({ id: '500000000000002AAA', success: true, errors: [] });
    stubConnection({ destroy });

    const createNode = new SalesforceNode('id', [[4]], {
      username: 'test@example.com',
      password: 'myPassword',
      token: 'myToken',
      resultPath: 'result',
      sobjectType: 'Case',
      action: 'destroy',
      params: [{
        name: 'recordId',
        type: 'string',
        value: '500000000000002AAA'
      }]
    });

    const [ oids, p ] = await createNode.run({}, {});
    oids.should.deepEqual([[4]]);
    p.should.deepEqual({
      result: {
        errors: [],
        id: '500000000000002AAA',
        success: true
      }
    });
    destroy.firstCall.args.should.deepEqual(['500000000000002AAA']);
  });

  it('should correctly do a salesforce find', async function() {
    const records = [
      { attributes: { type: 'Case', url: '/services/data/v50.0/sobjects/Case/500000000000002AAA' }, Id: '500000000000002AAA', CaseNumber: '00001030' },
      { attributes: { type: 'Case', url: '/services/data/v50.0/sobjects/Case/500000000000003AAA' }, Id: '500000000000003AAA', CaseNumber: '00001000' }
    ];
    const find = sinon.stub().resolves(records);
    stubConnection({ find });

    const createNode = new SalesforceNode('id', [[4]], {
      username: 'test@example.com',
      password: 'myPassword',
      token: 'myToken',
      resultPath: 'result',
      sobjectType: 'Case',
      action: 'find',
      params: [{
        name: '{{b}}',
        type: 'string',
        value: '{{a}}'
      },
      { name: 'fields', type: 'string', value: 'Id,CaseNumber' }
      ]
    });

    const [ oids, p ] = await createNode.run({}, { a: 2, b: 'limit' });
    oids.should.deepEqual([[4]]);
    p.result.should.deepEqual({
      errors: [],
      items: records,
      success: true
    });
    find.firstCall.args.should.deepEqual([{}, 'Id,CaseNumber', { limit: 2 }]);
  });

  it('should correctly do a salesforce count', async function() {
    const count = sinon.stub().resolves(31);
    stubConnection({ count });

    const createNode = new SalesforceNode('id', [[4]], {
      username: '{{a}}',
      password: '{{b}}',
      token: '{{c}}',
      resultPath: 'result',
      sobjectType: '{{d}}',
      action: '{{e}}',
      params: []
    });

    const [ oids, p ] = await createNode.run({}, {
      a: 'test@example.com',
      b: 'myPassword',
      c: 'myToken',
      d: 'Case',
      e: 'count'
    });
    oids.should.deepEqual([[4]]);
    p.result.should.deepEqual({ count: 31, errors: [], success: true });
    count.firstCall.args.should.deepEqual([{}]);
  });

  it('should correctly do a salesforce update', async function() {
    const update = sinon.stub().resolves({ id: '500000000000002AAA', success: true, errors: [] });
    stubConnection({ update });

    const createNode = new SalesforceNode('id', [[4]], {
      username: '{{a}}',
      password: '{{b}}',
      token: '{{c}}',
      resultPath: 'result',
      sobjectType: '{{d}}',
      action: '{{e}}',
      params: [{
        name: '{{f}}',
        type: 'path',
        value: 'g'
      }]
    });

    const [ oids, p ] = await createNode.run({}, {
      a: 'test@example.com',
      b: 'myPassword',
      c: 'myToken',
      d: 'Case',
      e: 'update',
      f: 'record',
      g: { Id: '500000000000002AAA', Status: 'Working' }
    });
    oids.should.deepEqual([[4]]);
    p.result.should.deepEqual({
      errors: [],
      id: '500000000000002AAA',
      success: true
    });
    update.firstCall.args.should.deepEqual([{ Id: '500000000000002AAA', Status: 'Working' }]);
  });

  it('should correctly deal with sf errors', async function() {
    const login = sinon.stub().rejects(new Error('INVALID_LOGIN: Invalid username, password, security token; or user locked out.'));
    sinon.stub(jsforce, 'Connection').callsFake(() => ({ login }));

    const createNode = new SalesforceNode('id', [[4]], {
      username: '{{a}}',
      password: '{{b}}',
      token: '{{c}}',
      resultPath: 'result',
      sobjectType: '{{d}}',
      action: '{{e}}',
      params: [{
        name: '{{f}}',
        type: 'path',
        value: 'g'
      }]
    });

    const [ oids, p ] = await createNode.run({}, {
      a: 'test@example.com',
      b: 'myPassword',
      c: 'myToken',
      d: 'Case',
      e: 'update',
      f: 'record',
      g: { Id: '500000000000002AAA', Status: 'Working' }
    });
    oids.should.deepEqual([[4]]);
    p.result.should.deepEqual({
      errors: [
        'Error: INVALID_LOGIN: Invalid username, password, security token; or user locked out.'
      ],
      success: false
    });
  });
});
