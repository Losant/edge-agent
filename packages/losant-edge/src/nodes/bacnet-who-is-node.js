import {
  getBacnetClient,
  cleanBacnetClients,
  validateInstanceNumber,
  DEFAULT_PORT
} from '../lib/bacnet-utils.js';
import * as payloadHelper from 'losant-handlebars';
import { getTimeoutFieldTemplate, renderToNetworkPort } from 'losant-nodes/src/lib/common.js';
import { defer } from 'omnibelt';
import verifyHosts from 'losant-nodejs-utils/src/utils/verify-hosts.js';
const DEFAULT_BROADCAST_ADDRESS = '255.255.255.255';

class BacnetWhoIsNode {

  /* Example Config:
  {
    broadcastAddressTemplate: <String - Optional: broadcast IP address, or the address of a single device, to send the Who-Is message to. Blank defaults to 255.255.255.255>,
    hostPortTemplate: <String - Optional: port to send the broadcast scan on. Default 47808>,
    incomingPortTemplate: <String - Optional: receiving port on the edge agent side for the responses to the BACnet message. Default 47808>,
    scanTimeMsTemplate: <String - Optional: time in ms to wait for results. Default 30000; cannot be greater than context.externalTimeout>,
    scanCountTemplate: <String - Optional: stop the scan early after finding this many devices. Blank, non-numeric, or non-positive values are ignored (scan runs for the full scan time)>,
    lowLimitTemplate: <String - Optional: minimal device instance number to search for, 0-4194302>,
    highLimitTemplate: <String - Optional: maximal device instance number to search for, 0-4194302>,
    destinationPath: <String - Required: payload path at which to place the results of the Who-Is call>
  }
  Notes:
    On success the result at destinationPath is
    { [deviceId]: { address, port, forwardedFrom, vendorId } }, with one entry per
    device that answered with an I-Am message (port defaults to 47808 when the sender
    address has none). If the BACnet client cannot be started the result is
    { error: { type: 'BACNET_DISCOVER_ERROR', message } }. If the scan time is less
    than 1 the node returns without setting destinationPath. Invalid ports, hosts, or
    limits throw a validation error.
  */

  constructor(id, outputIds, config) {
    this.id = id;
    this.outputIds = outputIds;
    this.broadcastAddressTemplate = config.broadcastAddressTemplate;
    this.hostPortTemplate = config.hostPortTemplate;
    this.incomingPortTemplate = config.incomingPortTemplate;
    this.scanTimeMsTemplate = config.scanTimeMsTemplate || 30000;
    this.scanCountTemplate = config.scanCountTemplate;
    this.lowLimitTemplate = config.lowLimitTemplate;
    this.highLimitTemplate = config.highLimitTemplate;
    this.destinationPath = config.destinationPath;
  }

  async run(context, payload) {
    const incomingPort = renderToNetworkPort({ template: this.incomingPortTemplate, payload, fieldName: 'Incoming port', defaultValue: DEFAULT_PORT });
    const broadcastPort = renderToNetworkPort({ template: this.hostPortTemplate, payload, fieldName: 'Broadcast port', defaultValue: DEFAULT_PORT });

    let broadcastAddress = payloadHelper.renderToString(this.broadcastAddressTemplate, payload).trim();
    if (broadcastAddress) { // blank falls back to DEFAULT_BROADCAST_ADDRESS
      await verifyHosts(broadcastAddress);
    } else {
      broadcastAddress = DEFAULT_BROADCAST_ADDRESS;
    }

    let scanCount, lowLimit, highLimit;
    if (this.scanCountTemplate) {
      scanCount = Number(payloadHelper.render(this.scanCountTemplate, payload));
      if (!isFinite(scanCount) || scanCount <= 0) { scanCount = undefined; }
    }
    if (this.lowLimitTemplate) {
      lowLimit = Number(payloadHelper.render(this.lowLimitTemplate, payload));
      validateInstanceNumber('Low limit', lowLimit);
    }
    if (this.highLimitTemplate) {
      highLimit = Number(payloadHelper.render(this.highLimitTemplate, payload));
      validateInstanceNumber('High limit', highLimit);
    }

    const scanTime = getTimeoutFieldTemplate('scanTimeMsTemplate', this, payload, context.externalTimeout);
    if (scanTime < 1) {
      return [this.outputIds, payload];
    }

    const getClient = await getBacnetClient(incomingPort, scanTime);
    if (getClient.error) {
      payload = payloadHelper.set(this.destinationPath, {
        error: { type: 'BACNET_DISCOVER_ERROR', message: getClient.error.message }
      }, payload);
      return [this.outputIds, payload];
    }
    const client = getClient.baClient;

    const deferred = defer();
    let timeoutId;

    const deviceResults = {};
    let deviceCount = 0;
    const onIAm = (msg) => {
      if (!msg?.payload?.deviceId) { return; }
      if (!msg?.header?.sender?.address) { return; }
      if (deviceResults[msg.payload.deviceId]) { return; }

      // The address:port split assumes IPv4 because the BACnet client does not
      // support IPv6.
      const [address, port] = `${msg.header.sender.address}`.split(':');
      deviceResults[msg.payload.deviceId] = {
        address,
        port: Number(port) || DEFAULT_PORT,
        forwardedFrom: msg.header.sender.forwardedFrom,
        vendorId: msg.payload.vendorId
      };
      deviceCount++;

      if (scanCount && deviceCount >= scanCount) {
        clearTimeout(timeoutId);
        deferred.resolve();
      }
    };

    client.on('iAm', onIAm);

    // Notes:
    // Passing 'net' forces the client to set an allowed hop count on the header. See:
    // https://github.com/BiancoRoyal/node-bacstack/blob/5e221994923df3cecf36295563c7f1c579af9a3b/lib/npdu.js#L113
    // 0xFFFF is the value used by the Windows BACnet discovery tool.
    //
    // For a broadcast, no address is passed to whoIs. Instead the client's general
    // broadcastAddress setting is overridden, so the message is sent with the proper
    // "func" header. See:
    // https://github.com/BiancoRoyal/node-bacstack/blob/5e221994923df3cecf36295563c7f1c579af9a3b/lib/client.js#L1615
    //
    // The previous broadcast address is saved and restored so the override does not
    // leak into later calls on the cached client.

    if (broadcastAddress.endsWith('.255')) { // treated as a broadcast
      const previousBroadcastAddress = client._transport._settings.broadcastAddress;
      try {
        client._transport._settings.broadcastAddress = `${broadcastAddress}:${broadcastPort}`;
        client.whoIs({ net: 0xFFFF }, { highLimit, lowLimit });
      } finally {
        client._transport._settings.broadcastAddress = previousBroadcastAddress;
      }
    } else {
      // An address not ending in .255 is treated as a unicast target. This is a
      // heuristic: whether an address is a broadcast depends on the subnet mask, so
      // some broadcast addresses do not end in 255.
      client.whoIs(
        { address: `${broadcastAddress}:${broadcastPort}`, net: 0xFFFF },
        { highLimit, lowLimit }
      );
    }

    timeoutId = setTimeout(deferred.resolve, scanTime);

    await deferred.promise;

    client.removeListener('iAm', onIAm);

    payload = payloadHelper.set(this.destinationPath, deviceResults, payload);

    return [this.outputIds, payload];
  }

  static shutdown() {
    return cleanBacnetClients();
  }
}

export default BacnetWhoIsNode;
