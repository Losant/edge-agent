import * as payloadHelper from 'losant-handlebars';
import errors from 'losant-nodejs-utils/src/errors.js';
import { trimLower } from './lib/common.js';
import { either, equals } from 'omnibelt';
import { ObjectId } from 'losant-nodejs-utils/src/bson.js';
import { v1 as uuidv1, v3 as uuidv3, v4 as uuidv4, v5 as uuidv5 } from 'uuid';
import { nanoid } from 'nanoid';
const ID_ALGS = {
  uuidv1,
  uuidv3,
  uuidv4,
  uuidv5,
  objectid: () => { return (new ObjectId()).toString(); },
  nanoid
};

const isuuidV3OrV5 = either(equals('uuidv3'), equals('uuidv5'));

const VALID_ID_ALGS_STR = Object.keys(ID_ALGS).join(', ');

class GenerateIdNode {

  /* Example Config:
  {
    idTypeTemplate: <String - Required: the id type to generate, one of uuidv1, uuidv3, uuidv4, uuidv5, objectid, or nanoid. Case-insensitive>,
    namespaceTemplate: <String - Required for uuidv3 and uuidv5, ignored otherwise: the namespace, which must be a valid UUID>,
    valueTemplate: <String - Required for uuidv3 and uuidv5, ignored otherwise: the name that is hashed within the namespace to produce the id>,
    numCharactersTemplate: <Number - Optional, nanoid only: length of the id from 1 to 256. Default 21. A blank or non-numeric value uses the default>,
    destinationPath: <String - Required: payload path to place the generated id string>
  }
  Notes:
    uuidv3 and uuidv5 are deterministic: the same namespace and value always produce the same id.
    An invalid id type, a missing namespace or value, an invalid namespace, or a numCharactersTemplate outside 1 to 256 throws.
  */

  constructor(id, outputIds, config) {
    this.id = id;
    this.outputIds = outputIds;
    this.idTypeTemplate = config.idTypeTemplate;
    this.namespaceTemplate = config.namespaceTemplate;
    this.valueTemplate = config.valueTemplate;
    this.numCharactersTemplate = config.numCharactersTemplate;
    this.destinationPath = config.destinationPath;
  }

  async run(context, payload) {
    const idType = trimLower(payloadHelper.renderToString(this.idTypeTemplate, payload));
    if (!ID_ALGS[idType]) {
      throw errors.Validation({ type: 'INVALID_ID_TYPE', message: `"${idType}" is not a valid ID Type, only ${VALID_ID_ALGS_STR} are valid.` });
    }
    const args = [];
    if (idType === 'nanoid') {
      const numCharacters = parseInt(payloadHelper.renderToString(this.numCharactersTemplate, payload), 10);
      if (numCharacters < 1 || numCharacters > 256) {
        throw errors.Validation({ type: 'INVALID_FIELD', message: 'numCharactersTemplate should be greater than 0 and less than 257.' });
      }
      if (isFinite(numCharacters)) {
        // blank or non-numeric values are skipped so nanoid uses its default of 21
        args.push(numCharacters);
      }
    } else if (isuuidV3OrV5(idType)) {
      const namespace = payloadHelper.renderToString(this.namespaceTemplate, payload);
      const value = payloadHelper.renderToString(this.valueTemplate, payload);
      if (!namespace) {
        throw errors.Validation({ type: 'MISSING_FIELD', message: 'namespaceTemplate is required to generate a uuidv3 or uuidv5.' });
      }
      if (!value) {
        throw errors.Validation({ type: 'MISSING_FIELD', message: 'valueTemplate is required to generate a uuidv3 or uuidv5.' });
      }
      args.push(value, namespace);
    }
    let result;
    try {
      result = ID_ALGS[idType](...args);
    } catch (err) {
      throw errors.Validation({ message: err.message });
    }
    payload = payloadHelper.set(this.destinationPath, result, payload);
    return [ this.outputIds, payload ];
  }

}

export default GenerateIdNode;
