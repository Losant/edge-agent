import Transport from 'winston-transport';
import { LEVEL, MESSAGE } from 'triple-beam';
import { compact } from 'omnibelt';
import { ONE_MEGABYTE } from 'losant-nodejs-utils/src/constants/size.js';

const MAX_ENTRIES = 256;
const MAX_BUFFER_SIZE = ONE_MEGABYTE;
const BATCH_TIME = 5 * 1000;
const STREAM_TIME = 3 * 60 * 1000;

const levelToBuffers = {
  error: ['error', 'warn', 'info', 'verbose'],
  warn: ['warn', 'info', 'verbose'],
  info: ['info', 'verbose'],
  verbose: ['verbose']
};

class LogBuffer extends Transport {

  constructor(opts) {
    super(opts);
    this.reset();
  }

  reset() {
    if (this._streamTimeoutId) { clearInterval(this._streamTimeoutId); }

    this._buffers = {
      error: { lines: [], index: 0, size: 0 },
      warn: { lines: [], index: 0, size: 0 },
      info: { lines: [], index: 0, size: 0 },
      verbose: { lines: [], index: 0, size: 0 }
    };

    this._streamRequests = {
      error: { listeners: new Set(), until: 0 },
      warn: { listeners: new Set(), until: 0 },
      info: { listeners: new Set(), until: 0 },
      verbose: { listeners: new Set(), until: 0 }
    };

    this._lastTs = 0;
    this._lastTsIndex = 0;
    this._lastStreamPublish = 0;
    this._streamTimeoutId = null;
    this._streamBuffer = [];
  }

  async log(info, callback) {
    const level = info[LEVEL];
    const writeTo = levelToBuffers[level];
    if (!writeTo) { return; }

    const timestamp = Number(new Date(info.timestamp));
    if (timestamp === this._lastTs) {
      this._lastTsIndex++;
    } else {
      this._lastTsIndex = 0;
      this._lastTs = timestamp;
    }

    let message = info[MESSAGE];
    if (message.length > MAX_BUFFER_SIZE) {
      message = message.substring(0, MAX_BUFFER_SIZE);
    }

    const entry = { timestamp, level, message };
    if (this._lastTsIndex) { entry.tsIndex = this._lastTsIndex; }

    let shouldStream = false;
    writeTo.forEach((bufferLevel) => {
      const buffer = this._buffers[bufferLevel];
      if (buffer.lines[buffer.index]) {
        buffer.size -= buffer.lines[buffer.index].message.length;
      }
      buffer.lines[buffer.index++] = entry;
      buffer.size += entry.message.length;
      if (buffer.index >= MAX_ENTRIES) {
        buffer.index = 0;
      }

      if (buffer.size > MAX_BUFFER_SIZE) {
        let clearIndex = buffer.index;
        let cycles = 0;
        while (buffer.size > MAX_BUFFER_SIZE && cycles < 2) {
          if (clearIndex === buffer.index) { cycles++; }
          if (buffer.lines[clearIndex]) {
            buffer.size -= buffer.lines[clearIndex].message.length;
            buffer.lines[clearIndex] = undefined;
          }
          clearIndex++;
          if (clearIndex >= MAX_ENTRIES) {
            clearIndex = 0;
          }
        }
      }

      const streamRequests = this._streamRequests[bufferLevel];
      if (streamRequests.listeners.size > 0) {
        if (streamRequests.until >= this._lastTs) {
          shouldStream = true;
        } else {
          streamRequests.listeners.clear();
        }
      }
    });


    if (shouldStream) {
      await this.queueStreamPublish(entry);
    }

    callback();
  }

  getBuffer(level) {
    const buffer = this._buffers[level];
    if (!buffer) { return []; }
    if (!buffer.index) { return compact(buffer); }

    return compact(buffer.lines.slice(buffer.index) // move old lines at end to front
      .concat(buffer.lines.slice(0, buffer.index))); // and move new lines at front to end
  }

  async queueStreamPublish(msg) {
    if (!this._streamTimeoutId && msg.timestamp - this._lastStreamPublish < BATCH_TIME) {
      this._streamTimeoutId = setTimeout(() => { this.streamPublish(); }, BATCH_TIME);
    }

    this._streamBuffer.push(msg);
    if (this._streamBuffer.length >= MAX_ENTRIES || !this._streamTimeoutId) {
      await this.streamPublish();
    }
  }

  async streamPublish() {
    if (this._streamTimeoutId) { clearTimeout(this._streamTimeoutId); }
    this._streamTimeoutId = null;
    if (!this._streamBuffer.length) { return; }
    const toPublish = this._streamBuffer;
    this._streamBuffer = [];
    this._lastStreamPublish = toPublish.at(-1).timestamp;
    if (this._gateway) {
      await this._gateway.publish('logs', toPublish, { qos: 0 });
    }
  }

  async onLogsRequest(gateway, message) {
    this._gateway = gateway;
    if (message.sendLogBuffer) {
      const currentBuffer = this.getBuffer(message.logLevel);
      await this._gateway.publish('logs', currentBuffer, { qos: 0 });
    }
    const levelStreamReq = this._streamRequests[message.logLevel];
    if (message.requestId && levelStreamReq) {
      if (message.streamLogs) {
        levelStreamReq.listeners.add(message.requestId);
        levelStreamReq.until = Date.now() + STREAM_TIME;
      } else if (message.streamLogs === false) {
        levelStreamReq.listeners.delete(message.requestId);
      }
    }
  }
}

export default new LogBuffer();
