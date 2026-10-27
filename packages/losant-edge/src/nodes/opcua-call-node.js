import {
  runOpcuaCallInstructions,
  validateRenderCallInstructions,
  cleanOpcuaClients
} from '../lib/opcua-client-utils.js';

class OpcUaCallNode {

  /* Example Config:
  { uriTemplate: <String - Required: template for the OPC UA endpoint URI (opc.tcp:, http:, or https: protocol). Connections are shared, but each workflow uses a unique session>,
    securityPolicyTemplate: <String - Optional: template for the security policy (None|Basic128|Basic192|Basic192Rsa15|Basic256Rsa15|Basic256|Basic256Sha256). Default None. Basic128Rsa15 is rejected with a Validation error (deprecated as of 1.44.0). A value that is not a recognized policy is treated as None>,
    securityModeTemplate: <String - Optional: template for the message security mode (None|Sign|SignAndEncrypt, case-insensitive). Default None. A policy other than None requires a mode other than None, a mode other than None requires a policy other than None, and a policy other than None requires certTemplate and privateKeyTemplate>,
    usernameTemplate: <String - Optional: template for the username of the OPC UA session>,
    passwordTemplate: <String - Optional: template for the password of the OPC UA session>,
    certTemplate: <String - Optional: template for the PEM certificate. Required if privateKeyTemplate is set or the security policy is not None>,
    privateKeyTemplate: <String - Optional: template for the PEM private key. Required if certTemplate is set or the security policy is not None>,
    destinationPath: <String - Required: payload path at which to place the result of the called method>,
    callInstructionsType: <String - Optional: how callInstructions is provided (array|payloadPath). Default array.
      Unlike the read/write/browse nodes, 'array' here means a single instruction object (not an array); the label describes the source of the data
      (template strings vs. payload path) rather than its shape. The runtime only branches on 'payloadPath' vs. everything else>,
    callInstructions: <Object | String - Required: the call instruction object, or when callInstructionsType is payloadPath, a payload path that resolves to that object>,
    callInstructions.nameSpaceTemplate: <String - Required: template for the namespace index (0 - 255) of the object that owns the method>,
    callInstructions.identifierTemplate: <String - Required: template for the identifier of the object that owns the method>,
    callInstructions.methodNsTemplate: <String - Required: template for the namespace index (0 - 255) of the method to call>,
    callInstructions.methodIdTemplate: <String - Required: template for the identifier of the method to call>,
    callInstructions.methodArguments: <[Object] - Required: argument objects for the called method. Must be an array, which may be empty>,
    callInstructions.methodArguments.dataTypeTemplate: <String - Required: template for the OPC UA data type of the argument>,
    callInstructions.methodArguments.arrayTypeTemplate: <String - Optional: template for the OPC UA array type of the argument>,
    callInstructions.methodArguments.sourceTypeTemplate: <String - Optional: 'path'|'string'. A blank value is treated as string, meaning valueTemplate is rendered as a template. With path, valueTemplate is a payload path>,
    callInstructions.methodArguments.valueTemplate: <String|Number|Boolean|Array - Required: the argument value. A string, number, or boolean template, or an array when sourceTypeTemplate is path>
  }
  Notes:
    When callInstructionsType is payloadPath, the instruction object uses the unsuffixed keys (nameSpace, identifier, methodNs, methodId, methodArguments),
    and each argument uses dataType, arrayType, and value (a literal value, not a template or path).
    Result placed at destinationPath is { result: [<one converted value per method output argument>] }.
    Invalid configuration, connection failures, and session failures throw. Errors from the call itself do not throw: they are collected in an errors array of
    { type: 'OPC-UA_CALL_ERROR', message } on the result object.
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
    this.callInstructionsType = config.callInstructionsType || 'array';
    this.callInstructions = config.callInstructions;
  }

  async run(context, payload) {
    const caller = validateRenderCallInstructions(this.callInstructions, payload, this.callInstructionsType);

    payload = await runOpcuaCallInstructions(context.flowVersionId, payload, caller, this);
    return [this.outputIds, payload];
  }

  static shutdown() {
    return cleanOpcuaClients();
  }

}

export default OpcUaCallNode;

