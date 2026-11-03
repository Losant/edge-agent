import * as payloadHelper from 'losant-handlebars';
import errors from 'losant-nodejs-utils/src/errors.js';
import axios from 'losant-nodejs-utils/src/axios.js';
import { includes } from 'omnibelt';

class SlackNode {

  /* Example Config:
  {
    textTemplate: <String - Optional: template for the message. If not set, the full payload is sent as a JSON code block>,
    channelTemplate: <String - Optional: template for the channel name. If it renders empty, the webhook's default channel is used>,
    urlPathTemplate: <String - Required: template for the webhook path, the part of the URL after https://hooks.slack.com/services/>,
    resultPath: <String - Optional: payload path for the result { success: Boolean, sent: Number, error?: { message } }>
  }
  Notes:
    If urlPathTemplate renders empty, nothing is sent and resultPath (if set) receives { success: true, sent: 0 }.
    A non-200 response or a request failure produces { success: false, sent: 0, error: { message } }.
    Request failures (including timeouts) are written to resultPath if it is set, and are thrown only when resultPath is not set.
  */

  constructor(id, outputIds, config) {
    this.id = id;
    this.outputIds = outputIds;
    this.textTemplate = config.textTemplate;
    this.channelTemplate = config.channelTemplate;
    this.urlPathTemplate = config.urlPathTemplate;
    this.resultPath = config.resultPath;
  }

  async run(context, payload) {
    const path = payloadHelper.renderToString(this.urlPathTemplate, payload).trim();
    if (!path) {
      if (this.resultPath) {
        payload = payloadHelper.set(this.resultPath, { success: true, sent: 0 }, payload);
      }
      return [this.outputIds, payload];
    }

    const body = {};
    if (this.textTemplate === undefined) {
      body.text = `\`\`\`${JSON.stringify(payload, null, 2)}\`\`\``;
    } else {
      body.text = payloadHelper.renderToString(this.textTemplate, payload);
    }

    const channel = payloadHelper.renderToString(this.channelTemplate, payload).trim();
    if (channel) { body.channel = channel; }

    const requestOptions = {
      method: 'POST',
      url: `https://hooks.slack.com/services/${path}`,
      data: body,
      timeout: context.externalTimeout
    };

    let result, resultError;
    try {
      const response = await axios(requestOptions, {
        allStatusCodesAreValid: true
      });
      result = { success: true, sent: 1 };
      if (response.status !== 200) {
        result = { success: false, sent: 0, error: { message: response.data || response.status } };
      }
    } catch (err) {
      if (err.code === 'ETIMEDOUT' || (err.code === 'ECONNABORTED' && includes('timeout', err.message))) {
        resultError = errors.NodeTimeout({ title: 'Slack' });
      } else {
        resultError = errors.SlackError({ message: err.message });
      }
    }
    if (resultError) {
      result = {
        success: false,
        sent: 0,
        error: {
          message: resultError.message
        }
      };
    }
    if (this.resultPath) {
      payload = payloadHelper.set(this.resultPath, result, payload);
    } else if (resultError) {
      throw resultError;
    }

    return [this.outputIds, payload];
  }

}

export default SlackNode;
