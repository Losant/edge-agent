import LJSON from 'losant-nodejs-utils/src/ljson.js';
import { PLATFORM_TOPIC_BASE } from '../constants.js';
import BaseDeviceChangeStateNode from 'losant-nodes/src/lib/base-device-change-state-node.js';

class DeviceChangeStateNode extends BaseDeviceChangeStateNode {

  async sendState(context, deviceId, state) {
    const topic = `${PLATFORM_TOPIC_BASE}/${deviceId}/state`;
    const message = LJSON.stringify(state);
    await context.sendMqttMessage({ brokerType: 'losant', topic, message });
    return true;
  }
}

export default DeviceChangeStateNode;
