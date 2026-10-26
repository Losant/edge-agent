import * as common from '../common.js';
import main from '../../src/main.js';
import LJSON from 'losant-nodejs-utils/src/ljson.js';
import DeviceChangeStateNode from '../../src/nodes/device-change-state-node.js';

describe('DeviceChangeStateNode', () => {

  it('should correctly send message to deviceId', async () => {
    // also testing that things still work correctly in 'simple' form with
    // attributes that have special names like data/time

    const messages = [];
    const payload = { a: 'b', time: new Date(1234) };
    const outputIds = [['nid1']];

    const context = {
      flowId: 'myFlowId',
      applicationId: '5630dcbe103f8e485c9d0010',
      sendMqttMessage: ({ topic, message }) => { messages.push({ topic, buffer: message }); }
    };
    const nodeData = {
      deviceId: '5630dcbe103f8e485c9d0010',
      attrInfos: [
        { key: 'data', valueTemplate: '{{a}}' },
        { key: 'time', valueTemplate: 1 }
      ]
    };

    const dmn = new DeviceChangeStateNode('id', outputIds, nodeData);
    const [oids, p] = await dmn.run(context, payload);
    oids.should.deepEqual(outputIds);
    p.should.deepEqual(payload);

    messages.length.should.equal(1);
    messages[0].topic.should.equal('losant/5630dcbe103f8e485c9d0010/state');
    const msg = LJSON.parse(messages[0].buffer);
    msg.should.deepEqual({ data: { data: 'b', time: 1 }, time: 1234 });
  });

  it('should correctly send message to deviceId (payloadPath) (array)', async () => {
    const messages = [];
    const payload = { b: [{ var1: 'b' }, { var2: 1 }], time: new Date(1234) };
    const outputIds = [['nid1']];
    const context = {
      flowId: 'myFlowId',
      applicationId: '5630dcbe103f8e485c9d0010',
      sendMqttMessage: ({ topic, message }) => { messages.push({ topic, buffer: message }); }
    };
    const nodeData = {
      deviceId: '5a694a14fee35016f25b6647',
      attrDataMethod: 'payloadPath',
      attrPayloadPath: 'b'
    };

    const dmn = new DeviceChangeStateNode('id', outputIds, nodeData);
    const [oids, p] = await dmn.run(context, payload);
    oids.should.deepEqual(outputIds);
    p.should.deepEqual(payload);

    messages.length.should.equal(1);
    messages[0].topic.should.equal('losant/5a694a14fee35016f25b6647/state');

    const msg = LJSON.parse(messages[0].buffer);
    msg.should.deepEqual([
      { time: 1234, data: { var1: 'b' } },
      { time: 1234, data: { var2: 1 } }
    ]);
  });

  it('should correctly send message to deviceId (payloadPath) (array) (full form)', async () => {
    const messages = [];
    const payload = {
      b: [
        { time: 345, data: { var1: 'b' } },
        { meta: 'hi', data: { var2: 1 } }
      ],
      time: new Date(1234)
    };
    const outputIds = [['nid1']];
    const context = {
      flowId: 'myFlowId',
      applicationId: '5630dcbe103f8e485c9d0010',
      sendMqttMessage: ({ topic, message }) => { messages.push({ topic, buffer: message }); }
    };
    const nodeData = {
      deviceId: '5a694a14fee35016f25b6647',
      attrDataMethod: 'payloadPath',
      attrPayloadPath: 'b'
    };

    const dmn = new DeviceChangeStateNode('id', outputIds, nodeData);
    const [oids, p] = await dmn.run(context, payload);
    oids.should.deepEqual(outputIds);
    p.should.deepEqual(payload);

    messages.length.should.equal(1);
    messages[0].topic.should.equal('losant/5a694a14fee35016f25b6647/state');

    const msg = LJSON.parse(messages[0].buffer);
    msg.should.deepEqual([
      { time: 345, data: { var1: 'b' } },
      { time: 1234, meta: 'hi', data: { var2: 1 } }
    ]);
  });

  it('should correctly send message to deviceId (jsonTemplate)', async () => {
    const messages = [];
    const payload = { a: 'b', time: new Date(1234) };
    const outputIds = [['nid1']];
    const context = {
      flowId: 'myFlowId',
      applicationId: '5630dcbe103f8e485c9d0010',
      sendMqttMessage: ({ topic, message }) => { messages.push({ topic, buffer: message }); }
    };
    const nodeData = {
      deviceId: '5a694b422450ad17a4942cde',
      attrDataMethod: 'jsonTemplate',
      attrJsonTemplate: JSON.stringify({ var1: '{{a}}', var2: 1 })
    };

    const dmn = new DeviceChangeStateNode('id', outputIds, nodeData);
    const [oids, p] = await dmn.run(context, payload);
    oids.should.deepEqual(outputIds);
    p.should.deepEqual(payload);

    messages.length.should.equal(1);
    messages[0].topic.should.equal('losant/5a694b422450ad17a4942cde/state');

    const msg = LJSON.parse(messages[0].buffer);
    msg.should.deepEqual({ data: { var1: 'b', var2: 1 }, time: 1234 });
  });

  it('should correctly send message to deviceId (jsonTemplate) (full form)', async () => {
    const messages = [];
    const payload = { a: 'b', time: new Date(1234) };
    const outputIds = [['nid1']];
    const context = {
      flowId: 'myFlowId',
      applicationId: '5630dcbe103f8e485c9d0010',
      sendMqttMessage: ({ topic, message }) => { messages.push({ topic, buffer: message }); }
    };
    const nodeData = {
      deviceId: '5a694b422450ad17a4942cde',
      attrDataMethod: 'jsonTemplate',
      flowVersionTemplate: 'zv',
      attrJsonTemplate: JSON.stringify({
        time: 789,
        data: { var1: '{{a}}', var2: 1 }
      })
    };

    const dmn = new DeviceChangeStateNode('id', outputIds, nodeData);
    const [oids, p] = await dmn.run(context, payload);
    oids.should.deepEqual(outputIds);
    p.should.deepEqual(payload);

    messages.length.should.equal(1);
    messages[0].topic.should.equal('losant/5a694b422450ad17a4942cde/state');

    const msg = LJSON.parse(messages[0].buffer);
    msg.should.deepEqual({ data: { var1: 'b', var2: 1 }, time: 789, flowVersion: 'zv' });
  });

  it('should correctly send message to deviceId with specific time', async () => {
    const messages = [];
    const payload = { a: 'b', time: new Date(), otherTime: '123456' };
    const outputIds = [['nid1']];
    const context = {
      flowId: 'myFlowId',
      applicationId: '5630dcbe103f8e485c9d0010',
      sendMqttMessage: ({ topic, message }) => { messages.push({ topic, buffer: message }); }
    };
    const nodeData = {
      deviceId: '5a694c5892a720182e41a8e4',
      timeSourceType: 'payloadPath',
      timeSourcePath: 'otherTime',
      attrInfos: [ { key: 'var1', valueTemplate: '{{a}}' },
        { key: 'var2', valueTemplate: 1 } ]
    };

    const dmn = new DeviceChangeStateNode('id', outputIds, nodeData);
    const [oids, p] = await dmn.run(context, payload);
    oids.should.deepEqual(outputIds);
    p.should.deepEqual(payload);
    messages.length.should.equal(1);
    messages[0].topic.should.equal('losant/5a694c5892a720182e41a8e4/state');
    const msg = LJSON.parse(messages[0].buffer);
    msg.should.deepEqual({ data: { var1: 'b', var2: 1 }, time: 123456000 });
  });

  it('should correctly send message to deviceId with meta', async () => {
    const messages = [];
    const payload = { a: 'b', time: new Date(1234) };
    const outputIds = [['nid1']];
    const context = {
      flowId: 'myFlowId',
      applicationId: '5630dcbe103f8e485c9d0010',
      sendMqttMessage: ({ topic, message }) => { messages.push({ topic, buffer: message }); }
    };
    const nodeData = {
      deviceId: '5a694c5892a720182e41a8e4',
      metaTemplate: '{ "a": "the{{a}}"}',
      metaTemplateType: 'jsonTemplate',
      attrInfos: [ { key: 'var1', valueTemplate: '{{a}}' },
        { key: 'var2', valueTemplate: 1 } ]
    };

    const dmn = new DeviceChangeStateNode('id', outputIds, nodeData);
    const [oids, p] = await dmn.run(context, payload);

    oids.should.deepEqual(outputIds);
    p.should.deepEqual(payload);
    messages.length.should.equal(1);
    messages[0].topic.should.equal('losant/5a694c5892a720182e41a8e4/state');
    const msg = LJSON.parse(messages[0].buffer);
    msg.should.deepEqual({ data: { var1: 'b', var2: 1 }, meta: { a: 'theb' }, time: 1234 });
  });

  it('should correctly set errors to payload with resultPath', async () => {
    const messages = [];
    const payload = { a: 'b', time: new Date(1234) };
    const outputIds = [['nid1']];

    const context = {
      flowId: 'myFlowId',
      applicationId: '5630dcbe103f8e485c9d0010',
      sendMqttMessage: ({ topic, message }) => { messages.push({ topic, buffer: message }); }
    };
    const nodeData = {
      deviceId: '1 2 3',
      attrInfos: [
        { key: 'data', valueTemplate: '{{a}}' },
        { key: 'time', valueTemplate: 1 }
      ],
      resultPath: 'res'
    };

    const dmn = new DeviceChangeStateNode('id', outputIds, nodeData);
    const [oids, p] = await dmn.run(context, payload);
    oids.should.deepEqual(outputIds);
    messages.length.should.equal(0);

    p.res.error.should.deepEqual({
      type: 'Validation',
      message: 'Invalid device ID: 1 2 3.'
    });
  });

  it('should error when sending a too large device state', async () => {
    const { gateway, shutdown } = await main({ confPath: common.pathToEdgeTestToml });
    let bigOleMessage = '';
    for (let i = 0; i < 8500; i++) {
      bigOleMessage += 'ThisIsALargeMessageThatWillError';
    }


    const payload = { a: 'b', time: new Date(1234) };
    const outputIds = [['nid1']];

    const context = {
      flowId: 'myFlowId',
      applicationId: '5630dcbe103f8e485c9d0010',
      sendMqttMessage: ({ topic, message }) => {
        return (gateway())._publish(topic, message);
      }
    };
    const nodeData = {
      deviceId: '5630dcbe103f8e485c9d0010',
      attrInfos: [
        { key: 'data', valueTemplate: bigOleMessage },
        { key: 'time', valueTemplate: 1 }
      ]
    };

    const node = new DeviceChangeStateNode('id', outputIds, nodeData);
    await node.run(context, payload).should.be.rejectedWith({ message: 'Payload size cannot exceed 262144' });
    await shutdown();
  });

  it('should nicely error tooLarge errors to the payload when resultPath is set', async () => {
    const { gateway, shutdown } = await main({ confPath: common.pathToEdgeTestToml });
    let bigOleMessage = '';
    for (let i = 0; i < 8500; i++) {
      bigOleMessage += 'ThisIsALargeMessageThatWillError';
    }


    const payload = { a: 'b', time: new Date(1234) };
    const outputIds = [['nid1']];

    const context = {
      flowId: 'myFlowId',
      applicationId: '5630dcbe103f8e485c9d0010',
      sendMqttMessage: ({ topic, message }) => {
        return gateway()._publish(topic, message);
      }
    };
    const nodeData = {
      deviceId: '5630dcbe103f8e485c9d0010',
      resultPath: 'result',
      attrInfos: [
        { key: 'data', valueTemplate: bigOleMessage },
        { key: 'time', valueTemplate: 1 }
      ]
    };

    const node = new DeviceChangeStateNode('id', outputIds, nodeData);
    const result = await node.run(context, payload);
    await shutdown();
    result[1].result.should.deepEqual({
      error: {
        type: 'Validation',
        message: 'Payload size cannot exceed 262144'
      }
    });
  });
});
