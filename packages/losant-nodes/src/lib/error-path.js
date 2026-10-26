import * as payloadHelper from 'losant-handlebars';
import errors from 'losant-nodejs-utils/src/errors.js';
import { shouldRollbarError } from 'losant-nodejs-utils/src/utils/error-helpers.js';

export default (error, node, payload) => {
  if (node.errorBehavior === 'payloadPath') {
    if (shouldRollbarError(error)) {
      throw error;
    }
    if (node.errorPath) {
      error = { type: error.type || error.name, message: error.message };
      return payloadHelper.set(node.errorPath, error, payload);
    } else {
      return payload;
    }
  } else if (node.errorBehavior === 'throw') {
    throw error;
  } else {
    throw errors.Validation({
      message: `Invalid Error Behavior "${node.errorBehavior}". Must be one of: payloadPath or throw.`
    });
  }
};
