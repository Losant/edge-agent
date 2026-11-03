import {
  validateRenderReadInstructions,
  runBacnetReadInstructions,
  cleanBacnetClients
} from '../lib/bacnet-utils.js';
import { getTimeoutFieldTemplate } from 'losant-nodes/src/lib/common.js';


class BacnetReadNode {

  /* Example Config:
  {
    hostTemplate: <String - Required: host name or IP address of the BACnet device to send the message to>,
    hostPortTemplate: <String - Optional: port on the host to send the BACnet message to. Default 47808>,
    portTemplate: <String - Optional: legacy input, used as incomingPortTemplate when incomingPortTemplate is not set. Default 47808>,
    incomingPortTemplate: <String - Optional: receiving port on the edge agent side for the response to the BACnet message. Default 47808>,
    apduTimeout: <String - Optional: template for the timeout in ms until a transaction is interpreted as an error. Defaults to context.externalTimeout (normally 30 seconds) and cannot be greater than it>,
    destinationPath: <String - Required: payload path at which to place the results of the reads. Results are discarded if it is not set>,
    readInstructionsType: <String - Optional: how readInstructions is provided (array|payloadPath). Default array; any value other than payloadPath is treated as array>,
    readInstructions: <[Object]|String - Required: for array, the list of read instructions to complete. For payloadPath, a payload path to that list>,
    readInstructions.key: <String - Required: key at which to place the result of the read within the destination object. Treated as a payload path underneath the destination. Cannot be errors (or start with errors.)>,
    readInstructions.typeTemplate: <Integer - Required: the BACnet object type to read, 0-59>,
    readInstructions.instanceTemplate: <Integer - Required: the BACnet object instance to read, 0-4194302>,
    readInstructions.propertyIdTemplate: <Integer - Required: the BACnet property id in the specified object to read, 0-491. 8 reads all properties>
  }
  Notes:
    In payloadPath mode each instruction uses unsuffixed keys: key, type, instance,
    and propertyId (not typeTemplate, instanceTemplate, propertyIdTemplate).
    On success the result at destinationPath is { <key>: <values returned for that read>, ... }.
    On a BACnet or connection failure it is { error: { type: 'BACNET_READ_ERROR', message } }.
    Invalid configuration or instructions throw a validation error, while BACnet
    failures are written to destinationPath and do not throw.
  */

  constructor(id, outputIds, config) {
    this.id = id;
    this.outputIds = outputIds;
    this.hostTemplate = config.hostTemplate; // Host name or IP address of the BACnet device.
    this.hostPortTemplate = config.hostPortTemplate;
    this.incomingPortTemplate = config.incomingPortTemplate || config.portTemplate;
    this.apduTimeout = config.apduTimeout;
    this.destinationPath = config.destinationPath;
    this.readInstructionsType = config.readInstructionsType;
    this.readInstructions = config.readInstructions;
  }

  async run(context, payload) {
    const reads = await validateRenderReadInstructions(this.readInstructions, payload, this.readInstructionsType);
    const timeout = getTimeoutFieldTemplate('apduTimeout', this, payload, context.externalTimeout);
    payload = await runBacnetReadInstructions(payload, reads, this, timeout);
    return [this.outputIds, payload];
  }

  static shutdown() {
    return cleanBacnetClients();
  }
}

export default BacnetReadNode;
