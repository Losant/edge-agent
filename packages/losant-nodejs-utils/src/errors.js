import typedError from 'error/typed.js';
import { type, omit } from 'omnibelt';

// http response code reference:
// 400 BAD REQUEST              401 UNAUTHORIZED                    402 PAYMENT REQUIRED
// 403 FORBIDDEN                404 NOT FOUND                       405 METHOD NOT ALLOWED
// 406 NOT ACCEPTABLE           407 PROXY AUTHENTICATION REQUIRED   408 REQUEST TIMEOUT
// 409 CONFLICT                 410 GONE                            411 LENGTH REQUIRED
// 412 PRECONDITION FAILED      413 REQUEST ENTITY TOO LARGE        414 REQUEST URI TOO LONG
// 415 UNSUPPORTED MEDIA TYPE   416 REQUEST RANGE NOT SATISFIABLE   417 EXPECTATION FAILED
// 429 TOO MANY REQUESTS
//
// 500 INTERNAL SERVER ERROR    501 NOT IMPLEMENTED                 502 BAD GATEWAY
// 503 SERVICE UNAVAILABLE      504 GATEWAY TIMEOUT                 505 HTTP VERSION NOT SUPPORTED

const Validation = typedError({
  type: 'Validation',
  statusCode: 400,
  message: 'Validation Error'
});

export default {
  InvalidType: (args = {}) => {
    const { value, ...restArgs } = args;

    const InvalidTypeError = typedError({
      type: 'InvalidType',
      title: null,
      expectedType: null,
      actualType: null,
      message: 'Type of {title} is invalid (expected {expectedType} but got {actualType})'
    });

    return InvalidTypeError({
      ...restArgs,
      actualType: type(value)
    });
  },

  InvalidEnumValue: (args = {}) => {
    const { allowedValues = [], ...restArgs } = args;

    const InvalidEnumValueError = typedError({
      type: 'InvalidEnumValue',
      field: null,
      allowedValues: null,
      actualValue: null,
      message: 'Unexpected value for field {field} (expected one of {allowedValues} but got {actualValue})'
    });

    return InvalidEnumValueError({
      ...restArgs,
      allowedValues: allowedValues.join('/')
    });
  },

  InvalidJsonTemplate: typedError({
    type: 'InvalidJson',
    title: null,
    message: '{title} template did not render to valid JSON',
    statusCode: 400
  }),

  InvalidJsonSource: typedError({
    type: 'InvalidJson',
    title: null,
    message: 'Source did not contain valid JSON: {title}'
  }),

  InvalidYamlSource: typedError({
    type: 'InvalidYaml',
    title: null,
    message: 'Source did not contain valid YAML: {title}'
  }),

  AuthenticationError: typedError({
    type: 'Authentication',
    title: null,
    message: 'Authorization credentials are missing or invalid for node: {title}'
  }),

  InfiniteLoop: typedError({
    type: 'InfiniteLoop',
    title: null,
    message: 'Workflow Reentrant Loop For {title}'
  }),

  MissingField: typedError({
    type: 'MissingField',
    title: null,
    message: 'Missing {title}',
    statusCode: 400
  }),

  SlackError: typedError({
    type: 'Slack',
    message: 'Slack Error'
  }),

  AWSLambdaError: typedError({
    type: 'AWSLambda',
    message: 'AWSLambda Error'
  }),

  GeoError: typedError({
    type: 'Geo',
    message: 'Geo Error'
  }),

  TooLarge: typedError({
    type: 'TooLarge',
    maximum: null,
    size: null,
    title:  null,
    message: 'Size of {title} ({size}) is greater than maximum allowed ({maximum})',
    statusCode: 413
  }),

  NodeTimeout: typedError({
    type: 'NodeTimeout',
    message: 'Timeout running {title} node',
    title: null
  }),

  FlowTimeout: typedError({
    type: 'FlowTimeout',
    message: 'Timeout running workflow'
  }),

  CustomNodeTimeout: typedError({
    type: 'CustomNodeTimeout',
    message: 'Timeout running custom node'
  }),

  NodeError: typedError({
    type: 'Node',
    message: 'Error running node'
  }),

  CustomNodeError: typedError({
    type: 'CustomNode',
    message: 'Error running custom node'
  }),

  MissingNode: typedError({
    type: 'MissingNode',
    title: null,
    message: 'Missing Node ID {title}'
  }),

  UnknownNodeType: typedError({
    type: 'UnknownNodeType',
    title: null,
    message: 'Type {title} is not a known type of node'
  }),

  WorkflowStorage: typedError({
    type: 'WorkflowStorage',
    message: 'Workflow Storage Error',
    statusCode: 400
  }),

  NodeMaxRetryReached: typedError({
    type: 'NodeMaxRetryReached',
    message: 'Attempted to run {title} {times} times without success.'
  }),

  BadRequest: typedError({
    type: 'BadRequest',
    message: 'Request was malformed',
    statusCode: 400
  }),

  NotFound: typedError({
    type: 'NotFound',
    message: '{title} was not found',
    title: null,
    statusCode: 404
  }),

  Unauthorized: typedError({
    type: 'Unauthorized',
    message: 'Unauthorized',
    statusCode: 401
  }),

  Validation: (args = {}) => {
    const { message } = args;

    const vError = Validation(omit([ 'message' ], args));
    if (message) {
      vError.message = message;
    }
    return vError;
  },

  JWTSign: typedError({
    type: 'JWTSign',
    message: 'Token could not be signed',
    statusCode: 400
  }),

  ExternalStorage: (args = {}) => {
    const { storage, isServerError, isNotFoundError, message, possibleRegion } = args;
    const errObj = {
      type: 'ExternalStorage',
      message: message || 'Storage Error',
      storage,
      isServerError,
      isNotFoundError,
      statusCode: 400
    };
    if (possibleRegion) {
      errObj.possibleRegion = possibleRegion;
    }
    const sError = typedError(errObj);
    return sError({});
  },

  UnsupportedNode: typedError({
    type: 'UnsupportedNode',
    statusCode: 405,
    message: 'Node not supported.'
  }),

  UnserializablePayload: typedError({
    type: 'UnserializablePayload',
    statusCode: 400,
    message: 'Unserializable payload.'
  }),

  RustCompilation: typedError({
    type: 'RustCompilation',
    message: 'Rust Compilation Error',
    allErrors: [],
    statusCode: 400
  }),
  // only used in the throw error node
  Thrown: typedError({
    type: 'Thrown',
    message: 'Unknown error from ThrowErrorNode'
  }),

  ServiceUnavailable: typedError({
    type: 'ServiceUnavailable',
    message: 'Service unavailable',
    statusCode: 503
  })
};
