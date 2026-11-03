import { nock, contextify } from './common.js';
import WhatsAppNode from '../src/whatsapp-node.js';

describe('WhatsAppNode', () => {

  it('should send a WhatsApp template message correctly with api key', async () => {
    const node = new WhatsAppNode('id', [[4]], {
      accessTokenTemplate: 'fakeAccessToken',
      toNumberTemplates: ['+18125550133'],
      fromNumberIdTemplate: '292998420553897',
      messageSourceMethod: 'jsonTemplate',
      messageSourceValue: '{{a}}',
      templateNameTemplate: '{{b}}',
      resultsPath: 'res'
    });

    nock('https://graph.facebook.com:443', { encodedQueryParams: true })
      .post('/v19.0/292998420553897/messages', {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        type: 'template',
        template: {
          name: 'example',
          language: { code: 'en_US' },
          components: [{
            type: 'body',
            parameters: [
              { type: 'text', text: 'Alice' },
              { type: 'text', text: 'Bob' }
            ]
          }]
        },
        to: '+18125550133'
      })
      .reply(200, {
        messaging_product: 'whatsapp',
        contacts: [{ input: '+18125550133', wa_id: '18125550133' }],
        messages: [{ id: 'aMessageId', message_status: 'accepted' }]
      });

    const templateJson = `{
      "type": "body",
      "parameters": [
        {
          "type": "text",
          "text": "Alice"
        },
        {
          "type": "text",
          "text": "Bob"
        }
      ]
    }`;
    const [oids, p] = await node.run(contextify(), {
      a: templateJson,
      b: 'example'
    });
    oids.should.deepEqual([[4]]);
    p.should.deepEqual({
      a: templateJson,
      b: 'example',
      res: [ {
        success: true,
        number: '+18125550133',
        messageId: 'aMessageId'
      } ]
    });
  });

  it('should send a WhatsApp message correctly with api key', async () => {
    const node = new WhatsAppNode('id', [[4]], {
      accessTokenTemplate: 'fakeAccessToken',
      toNumberTemplates: ['+18125550133', '{{b}}'],
      fromNumberIdTemplate: '292998420553897',
      messageSourceMethod: 'string',
      messageSourceValue: 'testing if the api works',
      resultsPath: 'res'
    });

    nock('https://graph.facebook.com:443', { encodedQueryParams: true })
      .post('/v19.0/292998420553897/messages', {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        type: 'text',
        text: { preview_url: false, body: 'testing if the api works' },
        to: '+18125550133'
      })
      .reply(200, {
        messaging_product: 'whatsapp',
        contacts: [{ input: '+18125550133', wa_id: '+18125550133' }],
        messages: [{ id: 'aMessageId1' }]
      });

    nock('https://graph.facebook.com:443', { encodedQueryParams: true })
      .post('/v19.0/292998420553897/messages', {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        type: 'text',
        text: { preview_url: false, body: 'testing if the api works' },
        to: '+18125550134'
      })
      .reply(200, {
        messaging_product: 'whatsapp',
        contacts: [{ input: '+18125550134', wa_id: '+18125550134' }],
        messages: [{ id: 'aMessageId2' }]
      });

    const [oids, p] = await node.run(contextify(), { b: ['812 555 0134'] });
    oids.should.deepEqual([[4]]);
    p.should.deepEqual({
      b: ['812 555 0134'],
      res: [ {
        success: true,
        number: '+18125550133',
        messageId: 'aMessageId1'
      }, {
        success: true,
        number: '+18125550134',
        messageId: 'aMessageId2'
      }]
    });
  });

  it('should not send if no valid numbers', async () => {
    const node = new WhatsAppNode('id', [[4]], {
      accessTokenTemplate: 'theAuthToken',
      toNumberTemplates: ['8', ''],
      fromNumberIdTemplate: '292998420553897',
      messageSourceMethod: 'string',
      messageSourceValue: 'testing if the api works',
      resultsPath: 'tResults'
    });
    const [oids, p] = await node.run(contextify(), {});
    oids.should.deepEqual([[4]]);
    p.should.deepEqual({
      tResults: [
        { error: true, message: 'Phone number invalid', number: '8' },
        { error: true, message: 'Phone number invalid', number: '' }]
    });
  });

  it('should properly manage message timeouts', async () => {
    const node = new WhatsAppNode('id', [[4]], {
      accessTokenTemplate: 'fakeAccessToken',
      toNumberTemplates: ['+18125550133', '+18125550134', '+18125550135'],
      fromNumberIdTemplate: '292998420553897',
      messageSourceMethod: 'string',
      messageSourceValue: 'testing if the api works',
      resultsPath: 'res'
    });

    nock('https://graph.facebook.com:443', { encodedQueryParams: true })
      .post('/v19.0/292998420553897/messages', {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        type: 'text',
        text: { preview_url: false, body: 'testing if the api works' },
        to: '+18125550133'
      })
      .delayBody(100)
      .reply(200, {
        messaging_product: 'whatsapp',
        contacts: [{ input: '+18125550133', wa_id: '+18125550133' }],
        messages: [{ id: 'aMessageId1' }]
      });

    nock('https://graph.facebook.com:443', { encodedQueryParams: true })
      .post('/v19.0/292998420553897/messages', {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        type: 'text',
        text: { preview_url: false, body: 'testing if the api works' },
        to: '+18125550134'
      })
      .delayBody(200)
      .reply(200, {
        messaging_product: 'whatsapp',
        contacts: [{ input: '+18125550134', wa_id: '+18125550134' }],
        messages: [{ id: 'aMessageId2' }]
      });


    const [oids, p] = await node.run(contextify({
      runStart: Date.now() - 59750
    }), { });
    oids.should.deepEqual([[4]]);
    p.should.deepEqual({
      res: [
        { success: true, number: '+18125550133', messageId: 'aMessageId1' },
        { error: true, number: '+18125550134', message: 'Timeout' }, // axios call timeout
        { error: true, number: '+18125550135', message: 'Timeout' } // time out before call
      ]
    });
  });

  it('should correctly deal with blank components input', async () => {
    const node = new WhatsAppNode('id', [[4]], {
      accessTokenTemplate: 'fakeAccessToken',
      toNumberTemplates: ['+18125550133'],
      fromNumberIdTemplate: '292998420553897',
      messageSourceMethod: 'jsonTemplate',
      messageSourceValue: '{{a}}',
      templateNameTemplate: '{{b}}',
      resultsPath: 'res'
    });

    nock('https://graph.facebook.com:443', { encodedQueryParams: true })
      .post('/v19.0/292998420553897/messages', {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        type: 'template',
        template: {
          name: 'example',
          language: { code: 'en_US' },
          components: []
        },
        to: '+18125550133'
      })
      .reply(200, {
        messaging_product: 'whatsapp',
        contacts: [{ input: '+18125550133', wa_id: '18125550133' }],
        messages: [{ id: 'aMessageId', message_status: 'accepted' }]
      });

    const [oids, p] = await node.run(contextify(), {
      a: '',
      b: 'example'
    });
    oids.should.deepEqual([[4]]);
    p.should.deepEqual({
      a: '',
      b: 'example',
      res: [ {
        success: true,
        number: '+18125550133',
        messageId: 'aMessageId'
      } ]
    });
  });

});
