import {
  runOpcuaReadInstructions,
  validateRenderReadInstructions,
  cleanOpcuaClients
} from '../lib/opcua-client-utils.js';

class OpcUaReadNode {

  /* Example Config:
  { uriTemplate: <String - Required: template for the OPC UA endpoint URI (opc.tcp:, http:, or https: protocol). Connections are shared, but each workflow uses a unique session>,
    securityPolicyTemplate: <String - Optional: template for the security policy (None|Basic128|Basic192|Basic192Rsa15|Basic256Rsa15|Basic256|Basic256Sha256). Default None. Basic128Rsa15 is rejected with a Validation error (deprecated as of 1.44.0). A value that is not a recognized policy is treated as None>,
    securityModeTemplate: <String - Optional: template for the message security mode (None|Sign|SignAndEncrypt, case-insensitive). Default None. A policy other than None requires a mode other than None, a mode other than None requires a policy other than None, and a policy other than None requires certTemplate and privateKeyTemplate>,
    usernameTemplate: <String - Optional: template for the username of the OPC UA session>,
    passwordTemplate: <String - Optional: template for the password of the OPC UA session>,
    certTemplate: <String - Optional: template for the PEM certificate. Required if privateKeyTemplate is set or the security policy is not None>,
    privateKeyTemplate: <String - Optional: template for the PEM private key. Required if certTemplate is set or the security policy is not None>,
    destinationPath: <String - Required: payload path at which to place the results of the reads>,
    readInstructionsType: <String - Optional: how readInstructions is provided (array|payloadPath). Default array>,
    readInstructions: <[Object] | String - Required: the read instruction objects, or when readInstructionsType is payloadPath, a payload path that resolves to an array of them>,
    readInstructions.nameSpaceTemplate: <String - Required: template for the namespace index (0 - 255) of the node to read>,
    readInstructions.identifierTemplate: <String - Required: template for the identifier of the node to read>,
    readInstructions.key: <String - Optional: payload path, relative to the destination object, at which the value is placed. Defaults to the last segment of the identifier. Cannot be 'errors' or start with 'errors.'>
  }
  Notes:
    When readInstructionsType is payloadPath, each instruction object uses the unsuffixed keys (nameSpace, identifier, key).
    Result placed at destinationPath is an object keyed by each instruction key, holding the value read from the node.
    Invalid configuration, connection failures, and session failures throw. Errors from individual reads (including a non-Good status) do not throw: they are
    collected in an errors array of { type: 'OPC-UA_READ_ERROR', message } on the result object.
  */

  constructor(id, outputIds, config) {
    this.id = id;
    this.outputIds = outputIds;
    this.uriTemplate = config.uriTemplate;
    this.securityPolicyTemplate = config.securityPolicyTemplate;
    this.securityModeTemplate = config.securityModeTemplate;
    this.usernameTemplate = config.usernameTemplate;
    this.passwordTemplate = config.passwordTemplate;
    this.certTemplate = config.certTemplate;
    this.privateKeyTemplate = config.privateKeyTemplate;
    this.destinationPath = config.destinationPath;
    this.readInstructionsType = config.readInstructionsType || 'array';
    this.readInstructions = config.readInstructions;
  }

  async run(context, payload) {
    const reads = validateRenderReadInstructions(this.readInstructions, payload, this.readInstructionsType);

    payload = await runOpcuaReadInstructions(context.flowVersionId, payload, reads, this);
    return [this.outputIds, payload];
  }

  static shutdown() {
    return cleanOpcuaClients();
  }

}

export default OpcUaReadNode;

