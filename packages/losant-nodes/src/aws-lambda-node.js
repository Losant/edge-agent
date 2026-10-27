import * as payloadHelper from 'losant-handlebars';
import errors from 'losant-nodejs-utils/src/errors.js';
import { trim, timeoutP } from 'omnibelt';
import errorPath from './lib/error-path.js';
import resolveValueByLookupType from './lib/resolve-value-by-lookup-type.js';
import { getTimeoutTemplate } from './lib/common.js';
import AwsNodeBase from './lib/base-aws-node.js';
import nextTick from 'losant-nodejs-utils/src/utils/next-tick.js';

const LAMBDA_ERRORS_TO_WRAP = new Set([
  'InternalFailure',
  'NetworkingError',
  'ResourceNotFoundException',
  'ServiceUnavailableException',
  'ServiceException',
  'UnknownEndpoint',
  'UnknownError',
  'UnrecognizedClientException'
]);

const validSourceMethods = new Set(['payloadPath', 'jsonTemplate', 'workflowPayload']);

class AwsLambdaNode extends AwsNodeBase {

  /* Example Config:
  {
    credentialNameTemplate: <String - Optional: name of the AWS credential to auth with. When set, the access key, secret, and region keys below are ignored>,
    awsAccessKeyId: <String - Required unless credentialNameTemplate is set: Amazon Access Key (template). Alias of accessKeyIdTemplate>,
    awsSecretAccessKey: <String - Required unless credentialNameTemplate is set: Amazon Access Key Secret (template). Alias of secretAccessKeyTemplate>,
    awsRegion: <String - Required unless credentialNameTemplate is set: Amazon Region (template). Alias of regionTemplate>,
    functionName: <String - Required: Lambda function name (template)>,
    sourceMethod: <String - Optional: one of jsonTemplate|payloadPath|workflowPayload. How to construct the data sent to the function. Default workflowPayload (the whole payload is sent). Any other value is treated as workflowPayload. jsonTemplate and payloadPath require sourceData>,
    sourceData: <String - Required for jsonTemplate|payloadPath: a JSON template or a payload path, depending on sourceMethod. Ignored for workflowPayload>,
    timeoutTemplate: <String - Optional: template resolving to the number of milliseconds to wait before timing out. Capped by the workflow's remaining time / external timeout>,
    resultPath: <String - Optional: payload path for the invocation result. If blank, the result is discarded. The result is the Lambda invoke response ({ StatusCode, FunctionError, ExecutedVersion, LogResult, Payload }) with LogResult decoded from base64 to a string, Payload parsed as JSON when possible (otherwise left as raw bytes), and $metadata removed>,
    errorBehavior: <String - Optional: throw|payloadPath. Default throw>,
    errorPath: <String - Optional: payload path for caught errors as { type, message }. Only used when errorBehavior is payloadPath>
  }
  Notes:
  A single output is used (outputIds).
  The function is invoked synchronously (RequestResponse) and the node waits for it to finish.
  A function that runs but fails (a FunctionError in the response) is not treated as a node error; inspect the result at resultPath.
  Errors (missing function name/credentials, invalid source data, timeout, AWS service errors) are thrown when errorBehavior is throw. With payloadPath they are written to errorPath, and resultPath is not written. Some internal error types are still thrown regardless of errorBehavior.
  A failed lookup caused by a transient DNS error (EAI_AGAIN) is retried once.
  */

  constructor(id, outputIds, config) {
    super(id, outputIds, config);
    this.functionName = config.functionName;
    this.timeoutTemplate = config.timeoutTemplate;
    this.sourceMethod =
      validSourceMethods.has(config.sourceMethod) ?
        config.sourceMethod :
        'workflowPayload';
    this.sourceData = config.sourceData;
    this.resultPath = config.resultPath;
    this.errorBehavior = config.errorBehavior || 'throw';
    this.errorPath = config.errorPath;
  }

  async run(context, payload) {
    let error, request, result;
    try {
      const timeout = getTimeoutTemplate(this, payload, context.externalTimeout);
      const lambda = await this.createLambdaInstance(context, payload);
      const functionName = trim(payloadHelper.renderToString(this.functionName, payload));
      if (!functionName) {
        throw errors.MissingField({ title: 'Function Name' });
      }

      const body = resolveValueByLookupType({
        lookupType: this.sourceMethod,
        inputValue: this.sourceData,
        payload,
        title: 'Source Data',
        errorOnMissing: true,
        defaultLookup: 'workflowPayload'
      });
      const invokeRetry = async (isRetry = false) => {
        request = lambda.invoke({
          FunctionName: functionName,
          InvocationType: 'RequestResponse',
          LogType: 'Tail',
          Payload: JSON.stringify(body)
        });
        try {
          return await timeoutP(timeout, request);
        } catch (e) {
          if (!isRetry && (e.code === 'EAI_AGAIN' || e.message?.includes('EAI_AGAIN'))) {
            context.I?.increment('flow.AwsLambdaNode.errorRetry');
            await nextTick();
            return invokeRetry(true);
          }
          throw e;
        }
      };
      result = await invokeRetry();
    } catch (err) {
      error = err;
      if (request) {
        try {
          request.abort();
        } catch {}
      }
      if (error.code === 'ETIMEDOUT') {
        error = errors.NodeTimeout({ title: 'AWS Lambda' });
      }
      if (LAMBDA_ERRORS_TO_WRAP.has(err.name)) {
        error = errors.AWSLambdaError({ message: err.message });
      }
      payload = errorPath(error, this, payload);
    }
    if (!error && this.resultPath) {
      if (result.LogResult) {
        result.LogResult = Buffer.from(result.LogResult, 'base64').toString();
      }
      if (result.Payload) {
        try {
          result.Payload = JSON.parse(Buffer.from(result.Payload).toString());
        } catch {}
      }
      delete result.$metadata;
      payload = payloadHelper.set(this.resultPath, result, payload);
    }

    return [this.outputIds, payload];
  }

}

export default AwsLambdaNode;
