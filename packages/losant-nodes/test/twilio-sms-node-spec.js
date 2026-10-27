import { nock, contextify } from './common.js';
import TwilioSmsNode from '../src/twilio-sms-node.js';

describe('TwilioSmsNode', () => {
  it('should send a twilio sms correctly with auth token', async () => {
    const node = new TwilioSmsNode('id', [[4]], {
      accountSid: 'ACtheAccountSid',
      authToken: 'theAuthToken',
      toNumbers: [
        '8125550134',
        '(812) 555-0135',
        '+19024030130',
        '19024030131',
        '9024030132',
        '(902) 403-0133',
        '1 (902) 403-0134',
        '+1 (566) 403-0135'
      ],
      fromNumber: '+12346547612',
      bodyTemplate: 'the body {{attr.a}}',
      resultsPath: 'tResults'
    });

    const responses = [
      { To: '+18125550134', From: '+12346547612', Body: 'the body z' },
      { To: '+18125550135', From: '+12346547612', Body: 'the body z' },
      { To: '+19024030130', From: '+12346547612', Body: 'the body z' },
      { To: '+19024030131', From: '+12346547612', Body: 'the body z' },
      { To: '+19024030132', From: '+12346547612', Body: 'the body z' },
      { To: '+19024030133', From: '+12346547612', Body: 'the body z' },
      { To: '+19024030134', From: '+12346547612', Body: 'the body z' },
      { To: '+15664030135', From: '+12346547612', Body: 'the body z' }
    ];
    let index = 0;

    nock('https://api.twilio.com')
      .replyContentLength()
      .post('/2010-04-01/Accounts/ACtheAccountSid/Messages.json', (body) => {
        body = JSON.parse(JSON.stringify(body));
        responses[index++].should.deepEqual(body);
        return true;
      }).times(8).reply(201, {});

    const [oids, p] = await node.run(contextify(), { attr: { a: 'z', b: 'y' } });
    oids.should.deepEqual([[4]]);
    p.should.deepEqual({
      attr: { a: 'z', b: 'y' },
      tResults: [
        { success: true, number: '+18125550134' },
        { success: true, number: '+18125550135' },
        { success: true, number: '+19024030130' },
        { success: true, number: '+19024030131' },
        { success: true, number: '+19024030132' },
        { success: true, number: '+19024030133' },
        { success: true, number: '+19024030134' },
        { success: true, number: '+15664030135' }
      ]
    });
    index.should.equal(8);
  });

  it('should send a twilio sms correctly with api key', async () => {
    const node = new TwilioSmsNode('id', [[4]], {
      accountSid: 'ACaccountSID',
      username: 'SKthatAPIboi',
      authToken: 'lilsecret',
      toNumbers: ['2604631351'],
      fromNumber: '+12346547612',
      bodyTemplate: 'wow such message',
      resultsPath: 'res'
    });

    nock('https://api.twilio.com')
      .replyContentLength()
      .post('/2010-04-01/Accounts/ACaccountSID/Messages.json', (body) => {
        body= JSON.parse(JSON.stringify(body));
        body.should.deepEqual({ To: '+12604631351', From: '+12346547612', Body: 'wow such message' });
        return true;
      }).reply(201, {});

    const [oids, p] = await node.run(contextify(), { attr: { a: 'z', b: 'y' } });
    oids.should.deepEqual([[4]]);
    p.should.deepEqual({
      attr: { a: 'z', b: 'y' },
      res: [
        { success: true, number: '+12604631351' }]
    });
  });

  it('should not send if no valid numbers', async () => {
    const node = new TwilioSmsNode('id', [[4]], {
      accountSid: 'ACtheAccountSid',
      authToken: 'theAuthToken',
      toNumbers: ['8', ''],
      fromNumber: '+12346547612',
      bodyTemplate: 'the body {{attr.a}}',
      resultsPath: 'tResults'
    });
    const [oids, p] = await node.run(contextify(), { attr: { a: 'z', b: 'y' } });
    oids.should.deepEqual([[4]]);
    p.should.deepEqual({
      attr: { a: 'z', b: 'y' },
      tResults: [
        { error: true, message: 'Phone number invalid', number: '8' },
        { error: true, message: 'Phone number invalid', number: '' }]
    });
  });

  it('should error correctly', async () => {
    const node = new TwilioSmsNode('id', [[4]], {
      accountSid: 'ACtheAccountSid',
      authToken: 'theAuthToken',
      toNumbers: ['8125550134', '(812) 555-0135'],
      fromNumber: '+12346547612',
      bodyTemplate: 'the body {{attr.a}}',
      resultsPath: 'tResults'
    });

    const responses = [
      { To: '+18125550134', From: '+12346547612', Body: 'the body z' },
      { To: '+18125550135', From: '+12346547612', Body: 'the body z' }
    ];
    let index = 0;

    nock('https://api.twilio.com')
      .replyContentLength()
      .post('/2010-04-01/Accounts/ACtheAccountSid/Messages.json', (body) => {
        body = JSON.parse(JSON.stringify(body));
        responses[index++].should.deepEqual(body);
        return true;
      }).times(2).reply(500, {});

    const [oids, p] = await node.run(contextify(), { attr: { a: 'z', b: 'y' } });
    oids.should.deepEqual([[4]]);
    p.should.deepEqual({
      attr: { a: 'z', b: 'y' },
      tResults: [
        { error: true, message: '500 Error from Twilio', number: '+18125550134' },
        { error: true, message: '500 Error from Twilio', number: '+18125550135' }]
    });
  });

  it('should properly manage message timeouts', async () => {
    const node = new TwilioSmsNode('id', [[4]], {
      accountSid: 'ACtheAccountSid',
      authToken: 'theAuthToken',
      toNumbers:  ['+18125550133', '+18125550134', '+18125550135'],
      fromNumber: '+12346547612',
      bodyTemplate: 'the body',
      resultsPath: 'res'
    });

    nock('https://api.twilio.com')
      .replyContentLength()
      .post('/2010-04-01/Accounts/ACtheAccountSid/Messages.json', {
        To: '+18125550133', From: '+12346547612', Body: 'the body'
      })
      .delayBody(100)
      .reply(200, {});

    nock('https://api.twilio.com')
      .replyContentLength()
      .post('/2010-04-01/Accounts/ACtheAccountSid/Messages.json', {
        To: '+18125550134', From: '+12346547612', Body: 'the body'
      })
      .delayBody(200)
      .reply(200, {});

    const [oids, p] = await node.run(contextify({
      runStart: Date.now() - 59750
    }), { });
    oids.should.deepEqual([[4]]);
    p.should.deepEqual({
      res: [
        { success: true, number: '+18125550133' },
        { error: true, number: '+18125550134', message: 'Timeout' },
        { error: true, number: '+18125550135', message: 'Timeout' }
      ]
    });
  });

});
