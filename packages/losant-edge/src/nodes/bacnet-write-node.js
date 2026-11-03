import {
  validateRenderWriteInstructions,
  runBacnetWriteInstructions,
  cleanBacnetClients
} from '../lib/bacnet-utils.js';
import { getTimeoutFieldTemplate } from 'losant-nodes/src/lib/common.js';

class BacnetWriteNode {

  /* Example Config:
  {
    hostTemplate: <String - Required: host name or IP address of the BACnet device to send the message to>,
    hostPortTemplate: <String - Optional: port on the host to send the BACnet message to. Default 47808>,
    portTemplate: <String - Optional: legacy input, used as incomingPortTemplate when incomingPortTemplate is not set. Default 47808>,
    incomingPortTemplate: <String - Optional: receiving port on the edge agent side for the response to the BACnet message. Default 47808>,
    apduTimeout: <String - Optional: template for the timeout in ms until a transaction is interpreted as an error. Defaults to context.externalTimeout (normally 30 seconds) and cannot be greater than it>,
    destinationPath: <String - Optional: payload path at which to place the result. Nothing is written when it is not set>,
    writeInstructionsType: <String - Optional: how writeInstructions is provided (array|payloadPath). Default array; any value other than payloadPath is treated as array>,
    writeInstructions: <[Object]|String - Required: for array, the list of write instructions to complete. For payloadPath, a payload path to that list>,
    writeInstructions.typeTemplate: <Integer - Required: the BACnet object type to write, 0-59>,
    writeInstructions.instanceTemplate: <Integer - Required: the BACnet object instance to write, 0-4194302>,
    writeInstructions.propertyIdTemplate: <Integer - Required: the BACnet property id in the specified object to write, 0-491>,
    writeInstructions.propertyIndexTemplate: <Integer - Required by BACnet: the 1-based array index of the property to be written. Not validated when omitted; when provided it must be 1 or greater>,
    writeInstructions.writeValueTypeTemplate: <Integer - Required: the BACnet application tag (data type) of the value to be written>,
    writeInstructions.writeValueTemplate: <String - Required: the value to be written, rendered to a string>,
    writeInstructions.writePriorityTemplate: <Integer - Optional: priority to use when writing to the property, 1-16. Default 16>
  }
  Notes:
    In payloadPath mode each instruction uses unsuffixed keys: type, instance,
    propertyId, propertyIndex, writeValueType, writeValue, and writePriority (not the
    Template-suffixed names). The default priority of 16 only applies to array mode,
    so writePriority must be provided in payloadPath mode.
    On success the result at destinationPath is { write: 'success' }. On a BACnet or
    connection failure it is { write: 'fail', error: { type: 'BACNET_WRITE_ERROR', message } }.
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
    this.writeInstructions = config.writeInstructions;
    this.writeInstructionsType = config.writeInstructionsType;
    this.destinationPath = config.destinationPath;
  }

  async run(context, payload) {
    const writes = await validateRenderWriteInstructions(this.writeInstructions, payload, this.writeInstructionsType);
    const timeout = getTimeoutFieldTemplate('apduTimeout', this, payload, context.externalTimeout);
    payload = await runBacnetWriteInstructions(payload, writes, this, timeout);
    return [this.outputIds, payload];
  }
  static shutdown() {
    return cleanBacnetClients();
  }
}

export default BacnetWriteNode;
