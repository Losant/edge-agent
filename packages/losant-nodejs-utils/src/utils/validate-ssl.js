import {
  validateSSLKey as _validateSSLKey,
  validateSSL as _validateSSL,
  validateCertKeyPair as _validateCertKeyPair
} from 'ssl-validator';
import errors from '../errors.js';

export const wrapLibFunc = (func, addPassword) => {
  return async (certOrKey, options = {}) => {
    if (addPassword && !options.password) { options.password = ' '; }
    try {
      return await func(certOrKey, options);
    } catch (e) {
      if (e.message.startsWith('Invalid openssl exit code')) {
        // there is probably stack trace in the message
        throw errors.Validation({ message: 'Invalid key or certificate.' });
      } else {
        throw errors.Validation({ message: e.message });
      }
    }
  };
};

export const validateSSLKey = wrapLibFunc(_validateSSLKey, true); // (key, options)
export const validateSSL = wrapLibFunc(_validateSSL, true); // (cert, options)
export const validateCertKeyPair = _validateCertKeyPair;
