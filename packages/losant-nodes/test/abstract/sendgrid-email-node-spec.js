export default function(SendgridEmailNode, { nock, contextify }) {
  it('should send a sendgrid email correctly', async () => {
    const node = new SendgridEmailNode('id', [[4]], {
      bodyTemplate: 'the body {{attr.a}}',
      subjectTemplate: 'the subject {{attr.b}}',
      fromTemplate: 'losantFrom@{{attr.b}}.com',
      replyToTemplate: 'ReplyToLosant@{{attr.b}}.com',
      toAddresses: ['Test <to1@example.com>', '', 'to2@{{attr.a}}.com', '{{attr.c}}'],
      ccAddresses: ['cc1@example.com', '', 'cc2@{{attr.a}}.com'],
      bccAddresses: ['bcc1@example.com', '', 'bcc2@{{attr.a}}.com'],
      sendgridApiKey: 'SG.mySendgridApiKey',
      resultPath: 'result.here'
    });

    nock('https://api.sendgrid.com:443', {
      reqheaders: {
        authorization: 'Bearer SG.mySendgridApiKey'
      }
    })
      .post('/v3/mail/send', {
        personalizations: [{
          to: [{ name: 'Test', email: 'to1@example.com' },
            { email: 'to2@example.com' }, { email: 'to3@example.com' },
            { email: 'to4@example.com' }, { email: 'to5@example.com' }],
          bcc: [{ email: 'bcc1@example.com' }, { email: 'bcc2@example.com' }],
          cc: [{ email: 'cc1@example.com' }, { email: 'cc2@example.com' }]
        }],
        subject: 'the subject y',
        from: { email: 'losantFrom@y.com' },
        content: [{ type: 'text/html', value: 'the body example' }],
        reply_to: { email: 'ReplyToLosant@y.com' },
        custom_args: {
          applicationId: '000000000000000000000002',
          workflowId: '000000000000000000000001',
          workflowVersion: 'develop'
        }
      })
      .reply(202, '');

    const [oids, p] = await node.run(contextify(), { attr: { a: 'example', b: 'y', c: ['to3@example.com, to4@example.com', 'to5@example.com'] } });
    oids.should.deepEqual([[4]]);
    p.should.deepEqual({
      attr: {
        a: 'example',
        b: 'y',
        c: ['to3@example.com, to4@example.com', 'to5@example.com']
      },
      result: { here: { message: 'success' } }
    });
  });

  it('should disallow bad from/reply to emails', async () => {
    const node = new SendgridEmailNode('id', [[4]], {
      bodyTemplate: 'the body',
      subjectTemplate: 'the subject',
      fromTemplate: 'notGonnaHappen@hello.losant.com',
      replyToTemplate: 'nope@thisIsTotallyNotLosantYo.org',
      toAddresses: ['allowedhere@losant.com'],
      ccAddresses: ['alsook@hello.losant.com'],
      bccAddresses: ['stillok@thisIsTotallyNotLosantYo.org'],
      sendgridApiKey: 'SG.mySendgridApiKey',
      resultPath: 'result.here'
    });

    nock('https://api.sendgrid.com:443', { encodedQueryParams: true })
      .post('/v3/mail/send', {
        personalizations: [{
          to: [{ email: 'allowedhere@losant.com' }],
          cc: [{ email: 'alsook@hello.losant.com' }],
          bcc: [{ email: 'stillok@thisIsTotallyNotLosantYo.org' }]
        }],
        subject: 'the subject',
        from: { email: 'theFlowId@workflows.losant.com' },
        content: [{ type: 'text/html', value: 'the body' }],
        custom_args: {
          applicationId: '000000000000000000000002',
          workflowId: 'theFlowId',
          workflowVersion: 'develop'
        }
      })
      .reply(202, '');

    const [oids, p] = await node.run(contextify({ flowId: 'theFlowId' }), { });
    oids.should.deepEqual([[4]]);
    p.should.deepEqual({
      result: { here: { message: 'success' } }
    });
  });

  it('should deal with attachments properly with content template', async () => {
    const node = new SendgridEmailNode('id', [[4]], {
      bodyTemplate: 'the body {{attr.a}}',
      subjectTemplate: 'the subject {{attr.b}}',
      fromTemplate: 'losantFrom@{{attr.b}}.com',
      toAddresses: ['Test <to1@example.com>'],
      sendgridApiKey: 'SG.mySendgridApiKey',
      attachments: [
        { contentTemplate: '{{a1}}', filenameTemplate: 'foo.png' },
        { contentTemplate: '{{a2}}' },
        { contentTemplate: '{{a3}}' }
      ],
      resultPath: 'result.here'
    });

    nock('https://api.sendgrid.com:443', { encodedQueryParams: true })
      .post('/v3/mail/send', {
        personalizations: [{
          to: [{ name: 'Test', email: 'to1@example.com' }]
        }],
        subject: 'the subject y',
        from: { email: 'losantFrom@y.com' },
        content: [{ type: 'text/html', value: 'the body example' }],
        attachments: [
          { content: 'b25l', filename: 'foo.png', type: 'image/png' },
          { content: 'dGhyZWU=', filename: 'attachment-0.bin', type: 'application/octet-stream' }
        ],
        custom_args: {
          applicationId: '000000000000000000000002',
          workflowId: '000000000000000000000001',
          workflowVersion: 'develop'
        }
      })
      .reply(202, '');

    const [oids, p] = await node.run(contextify(), { attr: { a: 'example', b: 'y' }, a1: 'one', a3: 'dGhyZWU=' });
    oids.should.deepEqual([[4]]);
    p.should.deepEqual({
      attr: {
        a: 'example',
        b: 'y'
      },
      a1: 'one',
      a3: 'dGhyZWU=',
      result: { here: { message: 'success' } }
    });
  });

  it('should deal with attachments properly with urls', async () => {
    const node = new SendgridEmailNode('id', [[4]], {
      bodyTemplate: 'a',
      subjectTemplate: 'b',
      fromTemplate: 'c@d.com',
      toAddresses: ['e@f.com'],
      sendgridApiKey: 'SG.mySendgridApiKey',
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

    nock('https://api.sendgrid.com:443', { encodedQueryParams: true })
      .post('/v3/mail/send', {
        personalizations: [{
          to: [{ email: 'e@f.com' }]
        }],
        subject: 'b',
        from: { email: 'c@d.com' },
        content: [{ type: 'text/html', value: 'a' }],
        attachments: [
          { content: Buffer.from('goodbye').toString('base64'), filename: 'foo.png', type: 'text/plain' },
          { content: Buffer.from('hello').toString('base64'), filename: 'where.png', type: 'image/png' }
        ],
        custom_args: {
          applicationId: '000000000000000000000002',
          workflowId: '000000000000000000000001',
          workflowVersion: 'develop'
        }
      })
      .reply(202, '');

    const [oids, p] = await node.run(contextify(), { a1: 'https://example.com/what', a3: 'https://example.com/where.png' });
    oids.should.deepEqual([[4]]);
    p.should.deepEqual({
      a1: 'https://example.com/what',
      a3: 'https://example.com/where.png',
      result: { here: { message: 'success' } }
    });
  });

  it('should deal with attachments properly with invalid urls', async () => {
    const node = new SendgridEmailNode('id', [[4]], {
      bodyTemplate: 'a',
      subjectTemplate: 'b',
      fromTemplate: 'c@d.com',
      toAddresses: ['e@f.com'],
      sendgridApiKey: 'SG.mySendgridApiKey',
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
    const node = new SendgridEmailNode('id', [[4]], {
      bodyTemplate: 'a',
      subjectTemplate: 'b',
      fromTemplate: 'c@d.com',
      toAddresses: ['e@f.com'],
      sendgridApiKey: 'SG.mySendgridApiKey',
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
}
