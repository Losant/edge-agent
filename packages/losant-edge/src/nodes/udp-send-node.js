import * as payloadHelper from 'losant-handlebars';
import dgram from 'dgram';
import errors from 'losant-nodejs-utils/src/errors.js';
import { trim, toInteger, defer } from 'omnibelt';
import verifyHosts from 'losant-nodejs-utils/src/utils/verify-hosts.js';
import niceBooleanCast from 'losant-nodejs-utils/src/utils/nice-boolean-cast.js';
import { checkEncoding } from '../utils.js';
import { addressToUdpSocketType } from 'losant-nodejs-utils/src/utils/ip-helpers.js';

class UdpSendNode {

  /* Example Config:
  {
    hostTemplate: <String - Required: template or string of the address to send to>,
    portTemplate: <String - Required: template or string of the port to send to, an integer from 1 to 65535>,
    encodingTemplate: <String - Optional: encoding type to use for the message. Default utf8>,
    messageTemplate: <String - Required: template or string of message>,
    resultPath: <String - Optional: payload path for { success: true } or { error: { type, message } }. If blank, the result is discarded>,
    broadcastTemplate: <String/Boolean - Optional: whether to broadcast message (true) or send only to specific address (false). Default false>
  }
  Notes:
    A missing host, an invalid port, or an unsupported encoding throws.
    A host that fails verification (for example, a blocked or unresolvable address) does not throw: the
    Validation error is written to resultPath as { error: { type: 'Validation', message } }. Without a
    resultPath it is dropped silently. Errors from sending are written to resultPath as
    { error: { type: 'UdpSendError', message } }.
  */

  constructor(id, outputIds, config) {
    this.id = id;
    this.outputIds = outputIds;
    this.hostTemplate = config.hostTemplate;
    this.portTemplate = config.portTemplate;
    this.encodingTemplate = config.encodingTemplate || 'utf8';
    this.messageTemplate = config.messageTemplate;
    this.resultPath = config.resultPath;
    this.broadcastTemplate = config.broadcastTemplate || false;
  }

  buildResult(client, deferred, err) {
    const result = err ?
      { error: { type: 'UdpSendError', message: err.message } } :
      { success: true };
    try {
      client.close(deferred.resolve);
    } catch {
      deferred.resolve();
    }
    return result;
  }

  async run(context, payload) {
    const host = payloadHelper.renderToString(this.hostTemplate, payload);
    if (!host) { throw errors.MissingField({ title: 'Host' }); }

    const strPort = payloadHelper.renderToString(this.portTemplate, payload);
    const port = toInteger(trim(strPort));
    if (!isFinite(port) || port < 1 || port > 65535) {
      throw errors.Validation({ message: `Invalid port: ${strPort}` });
    }

    const encoding = payloadHelper.renderToString(this.encodingTemplate, payload);
    checkEncoding(encoding);

    const message = Buffer.from(
      payloadHelper.renderToString(this.messageTemplate, payload),
      encoding
    );

    const broadcast = niceBooleanCast(payloadHelper.render(this.broadcastTemplate, payload));

    let addresses, result;
    try {
      addresses = await verifyHosts(host);
    } catch (e) {
      // Validation errors from host verification are reported through the result.
      // Any other error type is rethrown.
      if (e.type !== 'Validation') { throw e; }
      result = { error: { type: e.type, message: e.message } };
    }

    if (!result) {
      const destination = addresses[0];
      const client = dgram.createSocket(addressToUdpSocketType(destination));
      const deferred = defer();
      client.on('error', (err) => {
        result = this.buildResult(client, deferred, err);
      });
      if (broadcast) {
        // must bind socket before setting broadcast value and sending:
        // https://nodejs.org/api/dgram.html#dgram_socket_setbroadcast_flag
        try {
          client.bind(() => {
            client.setBroadcast(broadcast);
            client.send(message, port, destination, (err) => {
              result = this.buildResult(client, deferred, err);
            });
          });
        } catch (err) {
          result = this.buildResult(client, deferred, err);
        }
      } else {
        client.send(message, port, destination, (err) => {
          result = this.buildResult(client, deferred, err);
        });
      }
      await deferred.promise;
    }

    if (this.resultPath) {
      payload = payloadHelper.set(this.resultPath, result, payload);
    }
    return [this.outputIds, payload];
  }

}

export default UdpSendNode;
