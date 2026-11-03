import '../common.js';
import UdpSendNode from '../../src/nodes/udp-send-node.js';
import dgram from 'dgram';
import { defer } from 'omnibelt';

describe('UdpSendNode', async () => {
  it('should correctly send udp message', async () => {
    const node = new UdpSendNode('id', [[1]], {
      hostTemplate: '{{a}}',
      portTemplate: '{{b}}',
      encodingTemplate: '{{c}}',
      messageTemplate: '{{d}}',
      resultPath: 'e'
    });

    const server = dgram.createSocket('udp4');

    const deferredMsg = defer();
    server.on('message', (msg) => {
      server.close(() => {
        deferredMsg.resolve(msg);
      });
    });

    const deferredStartup = defer();
    server.bind(14243, deferredStartup.resolve);
    await deferredStartup.promise;

    const [oids, p] = await node.run({}, {
      a: '127.0.0.1',
      b: '14243',
      c: 'utf8',
      d: 'a message'
    });

    oids.should.deepEqual([[1]]);
    p.should.deepEqual({
      a: '127.0.0.1',
      b: '14243',
      c: 'utf8',
      d: 'a message',
      e: { success: true }
    });

    (await deferredMsg.promise).toString('utf8').should.deepEqual('a message');
  });

  it('should correctly fail on a bad host', async () => {
    const node = new UdpSendNode('id', [[1]], {
      hostTemplate: '{{a}}',
      portTemplate: '{{b}}',
      encodingTemplate: '{{c}}',
      messageTemplate: '{{d}}',
      resultPath: 'e'
    });

    const [oids, p] = await node.run({}, {
      a: 'totally|not|a|host',
      b: '14243',
      c: 'utf8',
      d: 'a message'
    });

    oids.should.deepEqual([[1]]);
    p.should.deepEqual({
      a: 'totally|not|a|host',
      b: '14243',
      c: 'utf8',
      d: 'a message',
      e: {
        error: {
          message: 'Cannot resolve host: totally|not|a|host',
          type: 'Validation'
        }
      }
    });
  });

  it('should allow broadcast messages', async () => {
    const node = new UdpSendNode('id', [[1]], {
      hostTemplate: '{{a}}',
      portTemplate: '{{b}}',
      encodingTemplate: '{{c}}',
      messageTemplate: '{{d}}',
      resultPath: 'e',
      broadcastTemplate: '{{f}}'
    });
    const [oids, p] = await node.run({}, {
      a: '255.255.255.255',
      b: '55131',
      c: 'utf8',
      d: 'a message',
      f: 'true'
    });
    oids.should.deepEqual([[1]]);
    p.should.deepEqual({
      a: '255.255.255.255',
      b: '55131',
      c: 'utf8',
      d: 'a message',
      e: { success: true },
      f: 'true'
    });
  });

  it('should still allow messages to non-broadcast addresses when broadcast is true', async () => {
    const node = new UdpSendNode('id', [[1]], {
      hostTemplate: '{{a}}',
      portTemplate: '{{b}}',
      encodingTemplate: '{{c}}',
      messageTemplate: '{{d}}',
      resultPath: 'e',
      broadcastTemplate: '{{f}}'
    });
    const [oids, p] = await node.run({}, {
      a: '127.0.0.1',
      b: '55131',
      c: 'utf8',
      d: 'a message',
      f: 'true'
    });
    oids.should.deepEqual([[1]]);
    p.should.deepEqual({
      a: '127.0.0.1',
      b: '55131',
      c: 'utf8',
      d: 'a message',
      e: { success: true },
      f: 'true'
    });
  });

});
