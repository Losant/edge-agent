// simplified version of https://github.com/mcollina/mqtt-level-store
// that works with the latest leveldb
import msgpack from 'msgpack5';
import { ValueStream } from 'level-read-stream';

const MqttStore = (sublevelDb) => {

  const packer = msgpack();

  let streamReverse = false;
  const levelOpts = {
    valueEncoding: {
      encode: function(data) {
        return packer.encode(data);
      },
      decode: function(data) {
        data = packer.decode(data);
        // the previous library double encoded values
        if (Buffer.isBuffer(data)) {
          data = packer.decode(data);
        }
        return data;
      },
      buffer: true,
      type: 'msgpack'
    }
  };

  const self = {};
  self.initialize = async () => sublevelDb.open();

  self.put = (packet, cb) => {
    sublevelDb.put(`${packet.messageId}`, packet, levelOpts)
      .then((result) => cb?.(null, result))
      .catch((err) => cb?.(err));
    return self;
  };

  self.get = (packet, cb) => {
    sublevelDb.get(`${packet.messageId}`, levelOpts)
      .then((result) => {
        // maintain previous behavior of throwing an error on key that does not exist
        return result ? cb(null, result) : cb(new Error('Not Found'));
      })
      .catch((err) => cb?.(err));
    return self;
  };

  self.del = (packet, cb) => {
    sublevelDb.del(`${packet.messageId}`)
      .then(() => cb?.(null, packet))
      .catch((err) => cb?.(err));
    return self;
  };

  self.createStream = () => {
    return new ValueStream(sublevelDb, { ...levelOpts, reverse: streamReverse });
  };

  self.setReplayOrder = (newReplayOrder) => {
    streamReverse = newReplayOrder === 'newestFirst';
  };

  // intentionally do nothing
  // the level manager manages opening and
  // closing the actual level db
  self.close = (cb) => cb?.();

  return self;
};

export default MqttStore;
