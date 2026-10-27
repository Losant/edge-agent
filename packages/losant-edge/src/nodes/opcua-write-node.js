import {
  runOpcuaWriteInstructions,
  validateRenderWriteInstructions,
  cleanOpcuaClients
} from '../lib/opcua-client-utils.js';

class OpcUaWriteNode {

  /* Example Config:
  { uriTemplate: <String - Required: template for the OPC UA endpoint URI (opc.tcp:, http:, or https: protocol). Connections are shared, but each workflow uses a unique session>,
    securityPolicyTemplate: <String - Optional: template for the security policy (None|Basic128|Basic192|Basic192Rsa15|Basic256Rsa15|Basic256|Basic256Sha256). Default None. Basic128Rsa15 is rejected with a Validation error (deprecated as of 1.44.0). A value that is not a recognized policy is treated as None>,
    securityModeTemplate: <String - Optional: template for the message security mode (None|Sign|SignAndEncrypt, case-insensitive). Default None. A policy other than None requires a mode other than None, a mode other than None requires a policy other than None, and a policy other than None requires certTemplate and privateKeyTemplate>,
    usernameTemplate: <String - Optional: template for the username of the OPC UA session>,
    passwordTemplate: <String - Optional: template for the password of the OPC UA session>,
    certTemplate: <String - Optional: template for the PEM certificate. Required if privateKeyTemplate is set or the security policy is not None>,
    privateKeyTemplate: <String - Optional: template for the PEM private key. Required if certTemplate is set or the security policy is not None>,
    destinationPath: <String - Required: payload path at which to place the results of the writes. Always set, even when every write fails>,
    writeInstructionsType: <String - Optional: how writeInstructions is provided (array|payloadPath). Default array>,
    writeInstructions: <[Object] | String - Required: the write instruction objects, or when writeInstructionsType is payloadPath, a payload path that resolves to an array of them>,
    writeInstructions.nameSpaceTemplate: <String - Required: template for the namespace index (0 - 255) of the node to write>,
    writeInstructions.identifierTemplate: <String - Required: template for the identifier of the node to write>,
    writeInstructions.sourceTypeTemplate: <String - Optional: 'path'|'string'. A blank value is treated as string, meaning valueTemplate is rendered as a template. With path, valueTemplate is a payload path>,
    writeInstructions.valueTemplate: <String|Number|Boolean|Array - Required: the value to write. A string, number, or boolean template, or an array when sourceTypeTemplate is path. Must be an array when the target node is an array node>
  }
  Notes:
    When writeInstructionsType is payloadPath, each instruction object uses the unsuffixed keys (nameSpace, identifier, value), where value is a literal.
    Result placed at destinationPath is { write: 'success' } when at least one write succeeded (the key is not per-instruction).
    Invalid configuration, connection failures, and session failures throw. Errors from individual writes (including a non-Good status) do not throw: they are
    collected in an errors array of { type: 'OPC-UA_WRITE_ERROR', message } on the result object.
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
    this.writeInstructionsType = config.writeInstructionsType || 'array';
    this.writeInstructions = config.writeInstructions;
  }

  async run(context, payload) {
    const writes = validateRenderWriteInstructions(this.writeInstructions, payload, this.writeInstructionsType);

    payload = await runOpcuaWriteInstructions(context.flowVersionId, payload, writes, this);
    return [this.outputIds, payload];
  }

  static shutdown() {
    return cleanOpcuaClients();
  }

}

export default OpcUaWriteNode;

