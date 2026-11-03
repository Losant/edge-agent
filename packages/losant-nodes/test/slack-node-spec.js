import { nock } from './common.js';
import SlackNode from '../src/slack-node.js';
const ID = 'id';
const OUTPUT_IDS = [[4]];

describe('SlackNode', () => {
  it('should return if no path is given', async () => {
    const node = new SlackNode(ID, OUTPUT_IDS, {
      urlPathTemplate: '{{ data.url }}'
    });
    await node.run({}, { data: { url: '' } }).should.be.fulfilled();
  });
  it('should return if no path is given', async () => {
    const node = new SlackNode(ID, OUTPUT_IDS, {
      urlPathTemplate: '{{ data.url }}',
      resultPath: 'myResult'
    });
    const output = await node.run({}, { data: { url: '' } });
    output[1].myResult.should.deepEqual({ success: true, sent: 0 });
  });
  it('should return success if the slack message was sent', async () => {
    const node = new SlackNode(ID, OUTPUT_IDS, {
      urlPathTemplate: 'mySlackId',
      channelTemplate: '{{ data.myChannel }}',
      textTemplate: '{{ data.text }}',
      resultPath: 'result'
    });
    nock('https://hooks.slack.com')
      .post('/services/mySlackId', (body) => {
        body.should.deepEqual({ text: 'hello world', channel: 'aChannel' });
        return true;
      })
      .reply(200);
    const result = await node.run({}, {
      data: { myChannel: 'aChannel', text: 'hello world' }
    });
    result[1].result.should.deepEqual({ success: true, sent: 1 });
  });
  it('should return the error if the slack call errors', async () => {
    nock('https://hooks.slack.com:443', { encodedQueryParams: true })
      .post('/services/T03TUDY8D/B0GH8JXJM/7SsF2cGEmcTYde3DLlfoDnuf', { text: 'Hello World', channel: 'missing-channel' })
      .reply(404, 'no_active_hooks');

    const node = new SlackNode(ID, OUTPUT_IDS, {
      urlPathTemplate: 'T03TUDY8D/B0GH8JXJM/7SsF2cGEmcTYde3DLlfoDnuf',
      channelTemplate: 'missing-channel',
      textTemplate: 'Hello World',
      resultPath: 'result'
    });
    const result = await node.run({}, {});
    result[1].result.should.deepEqual({ success: false, sent: 0, error: { message: 'no_active_hooks' } });
  });
  it('should not throw an error that was not originally being thrown', async () => {
    nock('https://hooks.slack.com:443', { encodedQueryParams: true })
      .post('/services/T03TUDY8D/B0GH8JXJM/7SsF2cGEmcTYde3DLlfoDnuf', { text: 'Hello World', channel: 'missing-channel' })
      .reply(404, 'no_active_hooks');
    const node = new SlackNode(ID, OUTPUT_IDS, {
      urlPathTemplate: 'T03TUDY8D/B0GH8JXJM/7SsF2cGEmcTYde3DLlfoDnuf',
      channelTemplate: 'missing-channel',
      textTemplate: 'Hello World',
      resultPath: 'result'
    });
    await node.run({}, {});
  });

  it('should return the error if the slack call errors', async () => {
    const node = new SlackNode(ID, OUTPUT_IDS, {
      urlPathTemplate: 'mySlackId',
      channelTemplate: '{{ data.myChannel }}',
      textTemplate: '{{ data.text }}',
      resultPath: 'result'
    });
    nock('https://hooks.slack.com')
      .post('/services/mySlackId', (body) => {
        body.should.deepEqual({ text: 'hello world', channel: 'aChannel' });
        return true;
      })
      .replyWithError(new Error('mySlackId was not found.'));
    const result = await node.run({}, {
      data: { myChannel: 'aChannel', text: 'hello world' }
    });
    result[1].result.should.deepEqual({ success: false, sent: 0, error: { message: 'mySlackId was not found.' } });
  });
  it('should return a time out error', async () => {
    const node = new SlackNode(ID, OUTPUT_IDS, {
      urlPathTemplate: 'mySlackId',
      channelTemplate: '{{ data.myChannel }}',
      textTemplate: '{{ data.text }}',
      resultPath: 'result'
    });
    nock('https://hooks.slack.com')
      .post('/services/mySlackId', (body) => {
        body.should.deepEqual({ text: 'hello world', channel: 'aChannel' });
        return true;
      })
      .delay(500)
      .reply(200);
    const result = await node.run({
      externalTimeout: 250
    }, {
      data: { myChannel: 'aChannel', text: 'hello world' }
    });
    result[1].result.should.deepEqual({ success: false, sent: 0, error: { message: 'Timeout running Slack node' } });
  });
});
