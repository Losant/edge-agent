import * as payloadHelper from 'losant-handlebars';
import validateUserMqttTopic from 'losant-nodejs-utils/src/utils/validate-user-mqtt-topic.js';
import errors from 'losant-nodejs-utils/src/errors.js';
import { PLATFORM_TOPIC_BASE } from '../constants.js';

const VALID_BROKER_TYPES = new Set([ 'losant', 'local', 'external' ]);

class MqttMessageNode {

  /* Example Config:
  {
    topicTemplate: <String - Required: template for the MQTT topic>,
    messageTemplate: <String - Optional: template for the MQTT message. Renders to an empty message when not provided>,
    integrationId: <String - Optional: template for the broker to use (losant|local|external). Default losant. Any other rendered value throws a Validation error>,
    configNameTemplate: <String - Required when integrationId is external, otherwise ignored: template for the MQTT Client config name to use>
  }
  Notes:
    When integrationId is losant, the topic is validated against the platform topic rules.
    A missing topic, an invalid integrationId, or a missing config name for an external broker throws a Validation error.
    No result is written to the payload. The payload is passed unchanged to all outputIds.
  */

  constructor(id, outputIds, config) {
    this.id = id;
    this.outputIds = outputIds;
    this.topicTemplate = config.topicTemplate;
    this.messageTemplate = config.messageTemplate;
    this.integrationId = config.integrationId || 'losant';
    this.configNameTemplate = config.configNameTemplate;
  }

  async run(context, payload) {
    const brokerType = payloadHelper.renderToString(this.integrationId, payload).trim();
    if (!VALID_BROKER_TYPES.has(brokerType)) {
      throw errors.Validation({ message: `Integration ID ${brokerType} is invalid. Only losant, local or external is valid.` });
    }
    const topic = payloadHelper.renderToString(this.topicTemplate, payload);
    if (!topic) {
      throw errors.Validation({ message: 'A topic must be provided.' });
    }

    const message = Buffer.from(payloadHelper.renderToString(this.messageTemplate, payload), 'binary');
    let configName;

    if (brokerType === 'external') {
      configName = payloadHelper.renderToString(this.configNameTemplate, payload);
      if (!configName) {
        throw errors.Validation({ message: 'A MQTT Client config name must be provided for external brokers.' });
      }
    } else if (brokerType === 'losant') {
      validateUserMqttTopic(topic, PLATFORM_TOPIC_BASE);
    }

    await context.sendMqttMessage({ brokerType, configName, topic, message });

    return [this.outputIds, payload];
  }

}

export default MqttMessageNode;
