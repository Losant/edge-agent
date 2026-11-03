import {
  runOpcuaBrowseInstructions,
  validateRenderBrowseInstructions,
  cleanOpcuaClients
} from '../lib/opcua-client-utils.js';

class OpcUaBrowseNode {

  /* Example Config:
  { uriTemplate: <String - Required: template for the OPC UA endpoint URI (opc.tcp:, http:, or https: protocol). Connections are shared, but each workflow uses a unique session>,
    securityPolicyTemplate: <String - Optional: template for the security policy (None|Basic128|Basic192|Basic192Rsa15|Basic256Rsa15|Basic256|Basic256Sha256). Default None. Basic128Rsa15 is rejected with a Validation error (deprecated as of 1.44.0). A value that is not a recognized policy is treated as None>,
    securityModeTemplate: <String - Optional: template for the message security mode (None|Sign|SignAndEncrypt, case-insensitive). Default None. A policy other than None requires a mode other than None, a mode other than None requires a policy other than None, and a policy other than None requires certTemplate and privateKeyTemplate>,
    usernameTemplate: <String - Optional: template for the username of the OPC UA session>,
    passwordTemplate: <String - Optional: template for the password of the OPC UA session>,
    certTemplate: <String - Optional: template for the PEM certificate. Required if privateKeyTemplate is set or the security policy is not None>,
    privateKeyTemplate: <String - Optional: template for the PEM private key. Required if certTemplate is set or the security policy is not None>,
    destinationPath: <String - Required: payload path at which to place the results of the browse>,
    browseInstructionsType: <String - Optional: how browseInstructions is provided (array|payloadPath). Default array>,
    browseInstructions: <[Object] | String - Optional: an array containing the browse instruction object (only the first instruction is used), or when browseInstructionsType is payloadPath, a payload path that resolves to such an array. When empty, the root folder is browsed>,
    browseInstructions.nameSpaceTemplate: <String - Optional: template for the namespace index (0 - 255) of the parent node whose children are listed. When blank and an identifier is set, the identifier is treated as a browse path from the root folder>,
    browseInstructions.identifierTemplate: <String - Optional: template for the identifier of the parent node whose children are listed. Required when a namespace is set>
  }
  Notes:
    When browseInstructionsType is payloadPath, the instruction object uses the unsuffixed keys (nameSpace, identifier).
    Result placed at destinationPath is an object keyed by the parent node's name (the last segment of its identifier, prefixed with i_ if it starts with a digit,
    or RootFolder), whose value is an array of the child nodes:
    { browseName, displayName, nodeId, namespace, identifier, identifierType, namespaceUri, isForward, nodeClass }.
    Invalid configuration, connection failures, and session failures throw. Errors from the browse itself do not throw: they are collected in an errors array of
    { type: 'OPC-UA_BROWSE_ERROR', message } on the result object. A failed browse path lookup falls back to browsing the root folder and records an error.
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
    this.browseInstructionsType = config.browseInstructionsType || 'array';
    this.browseInstructions = config.browseInstructions;
  }

  async run(context, payload) {
    const browse = validateRenderBrowseInstructions(this.browseInstructions, payload, this.browseInstructionsType);

    payload = await runOpcuaBrowseInstructions(context.flowVersionId, payload, browse, this);
    return [this.outputIds, payload];
  }

  static shutdown() {
    return cleanOpcuaClients();
  }

}

export default OpcUaBrowseNode;

