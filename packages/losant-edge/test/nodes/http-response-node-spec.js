import { levelManager } from '../common.js';
import { defer, noop } from 'omnibelt';
import fs from 'fs-extra';
import path from 'node:path';
import NodeRunner from '../../src/node-runner.js';
import HttpResponseNode from '../../src/nodes/http-response-node.js';

const FIXTURE_PATH = '/tmp/http-response-node-spec-weights.bin';

let nodeRunner, contextify;

describe('HttpResponseNode', () => {

  before(async function() {
    nodeRunner = NodeRunner(levelManager.keyValueStore, { fireOnError: noop }, {}, {}, {
      sendMqttMessage: noop, sendDebugMessage: noop, sendStatsMessage: noop
    });
    await nodeRunner.initialize();
    contextify = nodeRunner.contextify;
  });

  after(async function() {
    await nodeRunner.shutdown();
  });

  it('should correct send reply', async () => {
    const node = new HttpResponseNode('id', [[1]], {
      bodyTemplate: '{{hello}}',
      bodyTemplateType: 'string',
      responseCodeTemplate: '{{goodbye}}',
      headerInfo: [{ keyTemplate: 'one{{foo}}', valueTemplate: 'two{{foo}}' }],
      cookieInfo: [{ nameTemplate: 'one{{foo}}', valueTemplate: 'two{{foo}}', maxAgeTemplate: 1, pathTemplate: 'three{{foo}}' }]
    });

    const deferred = defer();

    const context = contextify({
      flowId: 'myFlowId',
      applicationId: 'myAppId',
      originalPayload: { data: { replyId: 'fakeId' } },
      flowHttpResponse: (replyId, response) => {
        replyId.should.equal('fakeId');
        deferred.resolve(response);
      }
    });

    const [oids, p] = await node.run(context,
      { foo: 'RspId', hello: '1', goodbye: '222' }
    );
    oids.should.deepEqual([[1]]);
    p.should.deepEqual({ foo: 'RspId', hello: '1', goodbye: '222' });

    const response = await deferred.promise;
    response.should.deepEqual({
      body: '1',
      headers: [ { key: 'oneRspId', value: 'twoRspId' } ],
      responseCode: 222,
      cookies: [{ name: 'oneRspId', value: 'twoRspId', ttl: 1, path: 'threeRspId' }]
    });
  });

  describe('diskPath body type', () => {

    beforeEach(async () => {
      return fs.copy(path.resolve(import.meta.dirname, '..', '__fixtures__', 'weights.bin'), FIXTURE_PATH);
    });
    afterEach(async () => {
      return fs.remove(FIXTURE_PATH);
    });

    const contextForReply = () => {
      const deferred = defer();
      const context = contextify({
        originalPayload: { data: { replyId: 'fakeId' } },
        flowHttpResponse: (replyId, response) => deferred.resolve(response)
      });
      return { context, deferred };
    };

    it('should send the file\'s raw bytes as a Buffer, defaulting to binary encoding', async () => {
      const node = new HttpResponseNode('id', [[1]], {
        bodyTemplateType: 'diskPath',
        bodyTemplate: '{{ filename }}'
      });
      const { context, deferred } = contextForReply();

      await node.run(context, { filename: FIXTURE_PATH });
      const response = await deferred.promise;

      const expected = await fs.readFile(FIXTURE_PATH);
      Buffer.isBuffer(response.body).should.be.true();
      Buffer.compare(response.body, expected).should.equal(0);
    });

    it('should honor an explicit encodingTemplate', async () => {
      const node = new HttpResponseNode('id', [[1]], {
        bodyTemplateType: 'diskPath',
        bodyTemplate: '{{ filename }}',
        encodingTemplate: 'latin1'
      });
      const { context, deferred } = contextForReply();

      await node.run(context, { filename: FIXTURE_PATH });
      const response = await deferred.promise;

      const expected = await fs.readFile(FIXTURE_PATH);
      Buffer.compare(response.body, expected).should.equal(0);
    });

    it('should throw a validation error for an invalid encodingTemplate', async () => {
      const node = new HttpResponseNode('id', [[1]], {
        bodyTemplateType: 'diskPath',
        bodyTemplate: '{{ filename }}',
        encodingTemplate: 'bogus'
      });
      const { context } = contextForReply();

      let error;
      try {
        await node.run(context, { filename: FIXTURE_PATH });
      } catch (e) {
        error = e;
      }
      error.message.should.equal('Encoding must be one of the following: ascii, utf8, utf16le, ucs2, base64, latin1, binary, hex.');
    });

    it('should throw if the file does not exist', async () => {
      const node = new HttpResponseNode('id', [[1]], {
        bodyTemplateType: 'diskPath',
        bodyTemplate: '{{ filename }}'
      });
      const { context } = contextForReply();
      const filename = '/tmp/THIS IS NOT A FILE THAT EXISTS...';

      let error;
      try {
        await node.run(context, { filename });
      } catch (e) {
        error = e;
      }
      error.message.should.equal(`No file exists at "${filename}"`);
    });

  });

});
