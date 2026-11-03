import { validateSSLKey } from './validate-ssl.js';
import errors from '../errors.js';
import isValidHostname from './is-valid-hostname.js';

export const validatePrivateKey = async (privateKey) => {
  if (
    !privateKey.startsWith('-----BEGIN PRIVATE KEY') ||
    !(privateKey.endsWith('END PRIVATE KEY-----\n') || privateKey.endsWith('END PRIVATE KEY-----'))
  ) {
    throw errors.Validation({ message: 'Private Key is not in the correct format.' });
  }
  try {
    return await validateSSLKey(privateKey, { password: ' ', skipFormatValidation: true });
  } catch {
    throw errors.Validation({ message: 'Private Key could not be parsed properly.' });
  }
};

const snowflakeRegExp = new RegExp('^(?:"(?:[^"]|"")+"|[a-zA-Z_][a-zA-Z0-9_$]*)$');

export const isValidSnowflakeString = (str) => {
  return snowflakeRegExp.test(str);
};

export const isValidSnowflakeHost = (str) => {
  return isValidHostname(str) && (
    str?.endsWith('.snowflakecomputing.com') ||
    str?.endsWith('.snowflakecomputing.cn')
  );
};
