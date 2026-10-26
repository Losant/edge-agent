import { nock } from './common.js';
import SalesforceNode from '../src/salesforce-node.js';

describe('SalesforceNode', () => {
  it('should correctly do a salesforce create', async function() {
    nock('https://login.salesforce.com:443').post('/services/Soap/u/50.0',
      '<se:Envelope xmlns:se="http://schemas.xmlsoap.org/soap/envelope/"><se:Header/><se:Body><login xmlns="urn:partner.soap.sforce.com"><username>test@example.com</username><password>myPasswordmyToken</password></login></se:Body></se:Envelope>')
      .reply(200,
        '<?xml version="1.0" encoding="UTF-8"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns="urn:partner.soap.sforce.com" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><soapenv:Body><loginResponse><result><metadataServerUrl>https://na35.salesforce.com/services/Soap/m/50.0/00D000000000000</metadataServerUrl><passwordExpired>false</passwordExpired><sandbox>false</sandbox><serverUrl>https://na35.salesforce.com/services/Soap/u/50.0/00D000000000000</serverUrl><sessionId>00D000000000000!fakeSessionId</sessionId><userId>005000000000000AAA</userId><userInfo><accessibilityMode>false</accessibilityMode><currencySymbol>$</currencySymbol><orgAttachmentFileSizeLimit>5242880</orgAttachmentFileSizeLimit><orgDefaultCurrencyIsoCode>USD</orgDefaultCurrencyIsoCode><orgDisallowHtmlAttachments>false</orgDisallowHtmlAttachments><orgHasPersonAccounts>false</orgHasPersonAccounts><organizationId>00D000000000000EAA</organizationId><organizationMultiCurrency>false</organizationMultiCurrency><organizationName>Example Org</organizationName><profileId>00e000000000000AAA</profileId><roleId xsi:nil="true"/><sessionSecondsValid>7200</sessionSecondsValid><userDefaultCurrencyIsoCode xsi:nil="true"/><userEmail>test@example.com</userEmail><userFullName>Test User</userFullName><userId>005000000000000AAA</userId><userLanguage>en_US</userLanguage><userLocale>en_US</userLocale><userName>test@example.com</userName><userTimeZone>America/Los_Angeles</userTimeZone><userType>Standard</userType><userUiSkin>Theme3</userUiSkin></userInfo></result></loginResponse></soapenv:Body></soapenv:Envelope>',
        { 'content-type': 'text/xml;charset=UTF-8' });

    nock('https://na35.salesforce.com:443').post('/services/data/v50.0/sobjects/Case',
      { Subject: 'Case From Test', Description: 'Hi There', Origin: 'Web' } )
      .reply(201, { id: '500000000000001AAA', success: true, errors: [] },
        { 'content-type': 'application/json;charset=UTF-8' });

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
  });

  it('should correctly do a salesforce destroy', async function() {
    nock('https://login.salesforce.com:443').post('/services/Soap/u/50.0',
      '<se:Envelope xmlns:se="http://schemas.xmlsoap.org/soap/envelope/"><se:Header/><se:Body><login xmlns="urn:partner.soap.sforce.com"><username>test@example.com</username><password>myPasswordmyToken</password></login></se:Body></se:Envelope>')
      .reply(200,
        '<?xml version="1.0" encoding="UTF-8"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns="urn:partner.soap.sforce.com" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><soapenv:Body><loginResponse><result><metadataServerUrl>https://na35.salesforce.com/services/Soap/m/50.0/00D000000000000</metadataServerUrl><passwordExpired>false</passwordExpired><sandbox>false</sandbox><serverUrl>https://na35.salesforce.com/services/Soap/u/50.0/00D000000000000</serverUrl><sessionId>00D000000000000!fakeSessionId</sessionId><userId>005000000000000AAA</userId><userInfo><accessibilityMode>false</accessibilityMode><currencySymbol>$</currencySymbol><orgAttachmentFileSizeLimit>5242880</orgAttachmentFileSizeLimit><orgDefaultCurrencyIsoCode>USD</orgDefaultCurrencyIsoCode><orgDisallowHtmlAttachments>false</orgDisallowHtmlAttachments><orgHasPersonAccounts>false</orgHasPersonAccounts><organizationId>00D000000000000EAA</organizationId><organizationMultiCurrency>false</organizationMultiCurrency><organizationName>Example Org</organizationName><profileId>00e000000000000AAA</profileId><roleId xsi:nil="true"/><sessionSecondsValid>7200</sessionSecondsValid><userDefaultCurrencyIsoCode xsi:nil="true"/><userEmail>test@example.com</userEmail><userFullName>Test User</userFullName><userId>005000000000000AAA</userId><userLanguage>en_US</userLanguage><userLocale>en_US</userLocale><userName>test@example.com</userName><userTimeZone>America/Los_Angeles</userTimeZone><userType>Standard</userType><userUiSkin>Theme3</userUiSkin></userInfo></result></loginResponse></soapenv:Body></soapenv:Envelope>',
        { 'content-type': 'text/xml;charset=UTF-8' });

    nock('https://na35.salesforce.com:443')
      .delete('/services/data/v50.0/sobjects/Case/500000000000002AAA')
      .reply(204, '');

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
  });

  it('should correctly do a salesforce find', async function() {
    nock('https://login.salesforce.com:443').post('/services/Soap/u/50.0',
      '<se:Envelope xmlns:se="http://schemas.xmlsoap.org/soap/envelope/"><se:Header/><se:Body><login xmlns="urn:partner.soap.sforce.com"><username>test@example.com</username><password>myPasswordmyToken</password></login></se:Body></se:Envelope>')
      .reply(200,
        '<?xml version="1.0" encoding="UTF-8"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns="urn:partner.soap.sforce.com" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><soapenv:Body><loginResponse><result><metadataServerUrl>https://na35.salesforce.com/services/Soap/m/50.0/00D000000000000</metadataServerUrl><passwordExpired>false</passwordExpired><sandbox>false</sandbox><serverUrl>https://na35.salesforce.com/services/Soap/u/50.0/00D000000000000</serverUrl><sessionId>00D000000000000!fakeSessionId</sessionId><userId>005000000000000AAA</userId><userInfo><accessibilityMode>false</accessibilityMode><currencySymbol>$</currencySymbol><orgAttachmentFileSizeLimit>5242880</orgAttachmentFileSizeLimit><orgDefaultCurrencyIsoCode>USD</orgDefaultCurrencyIsoCode><orgDisallowHtmlAttachments>false</orgDisallowHtmlAttachments><orgHasPersonAccounts>false</orgHasPersonAccounts><organizationId>00D000000000000EAA</organizationId><organizationMultiCurrency>false</organizationMultiCurrency><organizationName>Example Org</organizationName><profileId>00e000000000000AAA</profileId><roleId xsi:nil="true"/><sessionSecondsValid>7200</sessionSecondsValid><userDefaultCurrencyIsoCode xsi:nil="true"/><userEmail>test@example.com</userEmail><userFullName>Test User</userFullName><userId>005000000000000AAA</userId><userLanguage>en_US</userLanguage><userLocale>en_US</userLocale><userName>test@example.com</userName><userTimeZone>America/Los_Angeles</userTimeZone><userType>Standard</userType><userUiSkin>Theme3</userUiSkin></userInfo></result></loginResponse></soapenv:Body></soapenv:Envelope>',
        { 'content-type': 'text/xml;charset=UTF-8' });

    nock('https://na35.salesforce.com:443')
      .get('/services/data/v50.0/query')
      .query({ q: 'SELECT Id, CaseNumber FROM Case LIMIT 2' })
      .reply(200, {
        totalSize: 2,
        done: true,
        records: [
          { attributes: { type: 'Case', url: '/services/data/v50.0/sobjects/Case/500000000000002AAA' }, Id: '500000000000002AAA', CaseNumber: '00001030' },
          { attributes: { type: 'Case', url: '/services/data/v50.0/sobjects/Case/500000000000003AAA' }, Id: '500000000000003AAA', CaseNumber: '00001000' }
        ]
      }, { 'content-type': 'application/json;charset=UTF-8' });

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
      items: [
        {
          CaseNumber: '00001030',
          Id: '500000000000002AAA',
          attributes: {
            type: 'Case',
            url: '/services/data/v50.0/sobjects/Case/500000000000002AAA'
          }
        },
        {
          CaseNumber: '00001000',
          Id: '500000000000003AAA',
          attributes: {
            type: 'Case',
            url: '/services/data/v50.0/sobjects/Case/500000000000003AAA'
          }
        }
      ],
      success: true
    });
  });


  it('should correctly do a salesforce count', async function() {
    nock('https://login.salesforce.com:443').post('/services/Soap/u/50.0',
      '<se:Envelope xmlns:se="http://schemas.xmlsoap.org/soap/envelope/"><se:Header/><se:Body><login xmlns="urn:partner.soap.sforce.com"><username>test@example.com</username><password>myPasswordmyToken</password></login></se:Body></se:Envelope>')
      .reply(200,
        '<?xml version="1.0" encoding="UTF-8"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns="urn:partner.soap.sforce.com" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><soapenv:Body><loginResponse><result><metadataServerUrl>https://na35.salesforce.com/services/Soap/m/50.0/00D000000000000</metadataServerUrl><passwordExpired>false</passwordExpired><sandbox>false</sandbox><serverUrl>https://na35.salesforce.com/services/Soap/u/50.0/00D000000000000</serverUrl><sessionId>00D000000000000!fakeSessionId</sessionId><userId>005000000000000AAA</userId><userInfo><accessibilityMode>false</accessibilityMode><currencySymbol>$</currencySymbol><orgAttachmentFileSizeLimit>5242880</orgAttachmentFileSizeLimit><orgDefaultCurrencyIsoCode>USD</orgDefaultCurrencyIsoCode><orgDisallowHtmlAttachments>false</orgDisallowHtmlAttachments><orgHasPersonAccounts>false</orgHasPersonAccounts><organizationId>00D000000000000EAA</organizationId><organizationMultiCurrency>false</organizationMultiCurrency><organizationName>Example Org</organizationName><profileId>00e000000000000AAA</profileId><roleId xsi:nil="true"/><sessionSecondsValid>7200</sessionSecondsValid><userDefaultCurrencyIsoCode xsi:nil="true"/><userEmail>test@example.com</userEmail><userFullName>Test User</userFullName><userId>005000000000000AAA</userId><userLanguage>en_US</userLanguage><userLocale>en_US</userLocale><userName>test@example.com</userName><userTimeZone>America/Los_Angeles</userTimeZone><userType>Standard</userType><userUiSkin>Theme3</userUiSkin></userInfo></result></loginResponse></soapenv:Body></soapenv:Envelope>',
        { 'content-type': 'text/xml;charset=UTF-8' });

    nock('https://na35.salesforce.com:443')
      .get('/services/data/v50.0/query')
      .query({ q: 'SELECT count() FROM Case' })
      .reply(200, { totalSize: 31, done: true, records: [] },
        { 'content-type': 'application/json;charset=UTF-8' });

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
  });

  it('should correctly do a salesforce update', async function() {
    nock('https://login.salesforce.com:443').post('/services/Soap/u/50.0',
      '<se:Envelope xmlns:se="http://schemas.xmlsoap.org/soap/envelope/"><se:Header/><se:Body><login xmlns="urn:partner.soap.sforce.com"><username>test@example.com</username><password>myPasswordmyToken</password></login></se:Body></se:Envelope>')
      .reply(200,
        '<?xml version="1.0" encoding="UTF-8"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns="urn:partner.soap.sforce.com" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><soapenv:Body><loginResponse><result><metadataServerUrl>https://na35.salesforce.com/services/Soap/m/50.0/00D000000000000</metadataServerUrl><passwordExpired>false</passwordExpired><sandbox>false</sandbox><serverUrl>https://na35.salesforce.com/services/Soap/u/50.0/00D000000000000</serverUrl><sessionId>00D000000000000!fakeSessionId</sessionId><userId>005000000000000AAA</userId><userInfo><accessibilityMode>false</accessibilityMode><currencySymbol>$</currencySymbol><orgAttachmentFileSizeLimit>5242880</orgAttachmentFileSizeLimit><orgDefaultCurrencyIsoCode>USD</orgDefaultCurrencyIsoCode><orgDisallowHtmlAttachments>false</orgDisallowHtmlAttachments><orgHasPersonAccounts>false</orgHasPersonAccounts><organizationId>00D000000000000EAA</organizationId><organizationMultiCurrency>false</organizationMultiCurrency><organizationName>Example Org</organizationName><profileId>00e000000000000AAA</profileId><roleId xsi:nil="true"/><sessionSecondsValid>7200</sessionSecondsValid><userDefaultCurrencyIsoCode xsi:nil="true"/><userEmail>test@example.com</userEmail><userFullName>Test User</userFullName><userId>005000000000000AAA</userId><userLanguage>en_US</userLanguage><userLocale>en_US</userLocale><userName>test@example.com</userName><userTimeZone>America/Los_Angeles</userTimeZone><userType>Standard</userType><userUiSkin>Theme3</userUiSkin></userInfo></result></loginResponse></soapenv:Body></soapenv:Envelope>',
        { 'content-type': 'text/xml;charset=UTF-8' });

    nock('https://na35.salesforce.com:443')
      .patch('/services/data/v50.0/sobjects/Case/500000000000002AAA', { Status: 'Working' })
      .reply(204, '');

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
  });

  it('should correctly deal with sf errors', async function() {
    nock('https://login.salesforce.com:443').post('/services/Soap/u/50.0',
      '<se:Envelope xmlns:se="http://schemas.xmlsoap.org/soap/envelope/"><se:Header/><se:Body><login xmlns="urn:partner.soap.sforce.com"><username>test@example.com</username><password>myPasswordmyToken</password></login></se:Body></se:Envelope>')
      .reply(500, '<?xml version="1.0" encoding="UTF-8"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:sf="urn:fault.partner.soap.sforce.com" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><soapenv:Body><soapenv:Fault><faultcode>sf:INVALID_LOGIN</faultcode><faultstring>INVALID_LOGIN: Invalid username, password, security token; or user locked out.</faultstring><detail><sf:LoginFault xsi:type="sf:LoginFault"><sf:exceptionCode>INVALID_LOGIN</sf:exceptionCode><sf:exceptionMessage>Invalid username, password, security token; or user locked out.</sf:exceptionMessage></sf:LoginFault></detail></soapenv:Fault></soapenv:Body></soapenv:Envelope>',
        { 'content-type': 'text/xml;charset=UTF-8' });

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
