import typedError from 'error/typed.js';

export default {
  ExpressionError: typedError({
    type: 'Expression',
    message: 'Expression Error'
  }),

  InvalidTemplate: typedError({
    type: 'InvalidTemplate',
    message: 'Invalid Template'
  }),

  InvalidPayloadPath: typedError({
    type: 'InvalidPayloadPath',
    message: 'Invalid Payload Path: {path}',
    path: null
  }),

  PayloadPathMismatch: typedError({
    type: 'PayloadPathMismatch',
    message: 'Given path is not valid for payload'
  }),

  InvalidView: typedError({
    type: 'InvalidView',
    message: 'Invalid View'
  }),

  ViewRenderTimeout: typedError({
    type: 'ViewRenderTimeout',
    message: 'Timeout rendering view'
  })

};
