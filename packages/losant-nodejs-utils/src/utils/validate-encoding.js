import errors from '../errors.js';
import isBase64 from 'is-base64';
import ENCODING_LIST from '../constants/encoding-list.js';
import { test } from 'omnibelt';

const isHexadecimal = test(/^[0-9A-F]*$/i);

export const validateEncodingCurry = (encodingList) => {
  return (encoding, encodedData) => {
    if (!encodingList.includes(encoding)) {
      throw errors.Validation({ message: `Encoding must be one of the following: ${encodingList.join(', ')}.` });
    }

    if (encodedData !== undefined) {
      if (encoding === 'hex' && !isHexadecimal(encodedData)) { throw errors.Validation({ message: 'Invalid hexadecimal string.' }); }
      if (encoding === 'base64' && !isBase64(encodedData)) { throw errors.Validation({ message: 'Invalid base64 string.' }); }
    }
  };
};

export const validateEncoding = validateEncodingCurry(ENCODING_LIST);
