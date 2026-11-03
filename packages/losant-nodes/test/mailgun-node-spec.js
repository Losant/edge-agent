import { contextify, nock } from './common.js';
import MailgunNode from '../src/mailgun-node.js';
import nockMultipartParser from 'losant-nodejs-utils/test/utils/nock-multipart-parser.js';

describe('MailgunNode', function() {
  it('should send a sendgrid email correctly', async () => {
    const node = new MailgunNode('id', [[4]], {
      bodyTemplate: 'the body {{attr.a}}',
      subjectTemplate: 'the subject {{attr.b}}',
      fromTemplate: 'losantFrom@{{attr.b}}.com',
      replyToTemplate: 'ReplyToLosant@{{attr.b}}.com',
      toAddresses: ['Test <to1@example.com>', '', 'to2@{{attr.a}}.com', '{{attr.c}}'],
      ccAddresses: ['cc1@example.com', '', 'cc2@{{attr.a}}.com'],
      bccAddresses: ['bcc1@example.com', '', 'bcc2@{{attr.a}}.com'],
      mailgunApiKey: 'myMailgunApiKey',
      resultPath: 'result.here'
    });

    const { bodyPromise, nockFunc } = nockMultipartParser();
    nock('https://api.mailgun.net:443')
      .post('/v3/y.com/messages', nockFunc).reply(200, {
        id: 'message-id',
        message: 'Queued. Thank you.'
      });

    const [oids, p] = await node.run(contextify(), { attr: { a: 'example', b: 'y', c: ['to3@example.com, to4@example.com', 'to5@example.com'] } });
    oids.should.deepEqual([[4]]);
    p.should.deepEqual({
      attr: {
        a: 'example',
        b: 'y',
        c: ['to3@example.com, to4@example.com', 'to5@example.com']
      },
      result: { here: { id: 'message-id', message: 'Queued. Thank you.' } }
    });

    (await bodyPromise).should.deepEqual({
      'v:applicationId': '000000000000000000000002',
      'v:workflowId': '000000000000000000000001',
      'v:workflowVersion': 'develop',
      'subject': 'the subject y',
      'html': 'the body example',
      'from': 'losantFrom@y.com',
      'h:Reply-To': 'ReplyToLosant@y.com',
      'to': 'Test <to1@example.com>, to2@example.com, to3@example.com, to4@example.com, to5@example.com',
      'cc': 'cc1@example.com, cc2@example.com',
      'bcc': 'bcc1@example.com, bcc2@example.com'
    });
  });

  it('should deal with attachments properly with content template', async () => {
    const node = new MailgunNode('id', [[4]], {
      bodyTemplate: 'the body {{attr.a}}',
      subjectTemplate: 'the subject {{attr.b}}',
      fromTemplate: 'losantFrom@{{attr.b}}.com',
      toAddresses: ['Test <to1@example.com>'],
      mailgunApiKey: 'myMailgunApiKey',
      attachments: [
        { contentTemplate: '{{a1}}', filenameTemplate: 'foo.png' },
        { contentTemplate: '{{a2}}' },
        { contentTemplate: '{{a3}}' }
      ],
      resultPath: 'result.here'
    });

    const { bodyPromise, nockFunc } = nockMultipartParser();
    nock('https://api.mailgun.net:443')
      .post('/v3/y.com/messages', nockFunc).reply(200, {
        id: 'message-id',
        message: 'Queued. Thank you.'
      });

    const [oids, p] = await node.run(contextify(), { attr: { a: 'example', b: 'y' }, a1: 'one', a3: 'dGhyZWU=' });
    oids.should.deepEqual([[4]]);
    p.should.deepEqual({
      attr: {
        a: 'example',
        b: 'y'
      },
      a1: 'one',
      a3: 'dGhyZWU=',
      result: { here: { id: 'message-id', message: 'Queued. Thank you.' } }
    });

    (await bodyPromise).should.deepEqual({
      'v:applicationId': '000000000000000000000002',
      'v:workflowId': '000000000000000000000001',
      'v:workflowVersion': 'develop',
      'subject': 'the subject y',
      'html': 'the body example',
      'from': 'losantFrom@y.com',
      'to': 'Test <to1@example.com>',
      'attachment': [ {
        filename: 'foo.png',
        headers: {
          'content-disposition': 'form-data; name="attachment"; filename="foo.png"',
          'content-type': 'image/png'
        },
        payload: Buffer.from([ 0x6f, 0x6e, 0x65 ])
      },
      {
        filename: 'attachment-0.bin',
        headers: {
          'content-disposition': 'form-data; name="attachment"; filename="attachment-0.bin"',
          'content-type': 'application/octet-stream'
        },
        payload: Buffer.from([ 0x74, 0x68, 0x72, 0x65, 0x65 ])
      }]
    });
  });

  it('should deal with attachments properly with urls', async () => {
    const node = new MailgunNode('id', [[4]], {
      bodyTemplate: 'a',
      subjectTemplate: 'b',
      fromTemplate: 'c@d.com',
      toAddresses: ['e@f.com'],
      mailgunApiKey: 'myMailgunApiKey',
      attachments: [
        { urlTemplate: '{{a1}}', filenameTemplate: 'foo.png' },
        { urlTemplate: '{{a2}}' },
        { urlTemplate: '{{a3}}' }
      ],
      resultPath: 'result.here'
    });

    nock('https://example.com:443', { encodedQueryParams: true })
      .defaultReplyHeaders({ 'Content-Type': 'text/plain' })
      .get('/what')
      .reply(200, Buffer.from('goodbye'));

    nock('https://example.com:443', { encodedQueryParams: true })
      .get('/where.png')
      .reply(200, Buffer.from('hello'));

    const { bodyPromise, nockFunc } = nockMultipartParser();
    nock('https://api.mailgun.net:443')
      .post('/v3/d.com/messages', nockFunc).reply(200, {
        id: 'message-id',
        message: 'Queued. Thank you.'
      });

    const [oids, p] = await node.run(contextify(), { a1: 'https://example.com/what', a3: 'https://example.com/where.png' });
    oids.should.deepEqual([[4]]);
    p.should.deepEqual({
      a1: 'https://example.com/what',
      a3: 'https://example.com/where.png',
      result: { here: { id: 'message-id', message: 'Queued. Thank you.' } }
    });

    (await bodyPromise).should.deepEqual({
      'v:applicationId': '000000000000000000000002',
      'v:workflowId': '000000000000000000000001',
      'v:workflowVersion': 'develop',
      'subject': 'b',
      'html': 'a',
      'from': 'c@d.com',
      'to': 'e@f.com',
      'attachment': [
        {
          filename: 'foo.png',
          headers: {
            'content-disposition': 'form-data; name="attachment"; filename="foo.png"',
            'content-type': 'text/plain'
          },
          payload: 'goodbye'
        },
        {
          filename: 'where.png',
          headers: {
            'content-disposition': 'form-data; name="attachment"; filename="where.png"',
            'content-type': 'image/png'
          },
          payload: Buffer.from('hello')
        }
      ]
    });
  });

  it('should deal with attachments properly with invalid urls', async () => {
    const node = new MailgunNode('id', [[4]], {
      bodyTemplate: 'a',
      subjectTemplate: 'b',
      fromTemplate: 'c@d.com',
      toAddresses: ['e@f.com'],
      mailgunApiKey: 'myMailgunApiKey',
      attachments: [
        { urlTemplate: '{{a1}}' }
      ],
      resultPath: 'result.here'
    });

    const [oids, p] = await node.run(contextify(), { a1: 'not a url' });
    oids.should.deepEqual([[4]]);
    p.should.deepEqual({
      a1: 'not a url',
      result: { here: { error: 'Invalid URL: not a url' } }
    });
  });

  it('should deal with attachments properly with axios error', async () => {
    const node = new MailgunNode('id', [[4]], {
      bodyTemplate: 'a',
      subjectTemplate: 'b',
      fromTemplate: 'c@d.com',
      toAddresses: ['e@f.com'],
      mailgunApiKey: 'myMailgunApiKey',
      attachments: [
        { urlTemplate: '{{a1}}' }
      ],
      resultPath: 'result.here'
    });

    nock('https://example.com:443', { encodedQueryParams: true })
      .get('/where.png')
      .reply(500);

    const [oids, p] = await node.run(contextify(), { a1: 'https://example.com/where.png' });
    oids.should.deepEqual([[4]]);
    p.should.deepEqual({
      a1: 'https://example.com/where.png',
      result: { here: { error: 'Request failed with status code 500' } }
    });
  });

  it('should deal with attachments properly with axios error', async () => {
    const node = new MailgunNode('id', [[4]], {
      bodyTemplate: 'a',
      subjectTemplate: 'b',
      fromTemplate: 'c@d.com',
      toAddresses: ['{{applicationId}}'],
      mailgunApiKey: 'myMailgunApiKey',
      resultPath: 'result.here'
    });

    nock('https://api.mailgun.net:443', { encodedQueryParams: true })
      .post('/v3/d.com/messages', /.*/)
      .reply(400, { message: 'to parameter is missing' });

    const [oids, p] = await node.run(contextify(), { applicationId: 'appId1234' });
    oids.should.deepEqual([[4]]);
    p.should.deepEqual({
      applicationId: 'appId1234',
      result: { here: { error: 'to parameter is missing' } }
    });
  });
});
