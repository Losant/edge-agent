import './common.js';
import should from 'should';
import IdNode from '../src/generate-id-node.js';
import errors from 'losant-nodejs-utils/src/errors.js';
import { isValidObjectId } from 'losant-nodejs-utils/src/bson.js';

describe('GenerateIdNode', () => {
  [ 1, 3, 4, 5 ].forEach((num) => {
    it(`should create a uuidv${num}`, async () => {
      const config = { idTypeTemplate: `uuidv${num}`, destinationPath: 'result' };
      if (num === 3 || num === 5) {
        config.namespaceTemplate = '1b671a64-40d5-491e-99b0-da01ff1f3341';
        config.valueTemplate = 'hello world';
      }
      const node = new IdNode('id', [[1]], config);
      const output = await node.run({}, {});
      should.exist(output[1].result);
    });
  });
  it('should create a nanoid', async () => {
    const config = { idTypeTemplate: 'nanoid', destinationPath: 'result', numCharactersTemplate: 100 };
    const node = new IdNode('id', [[1]], config);
    const output = await node.run({}, {});
    should.exist(output[1].result);
    output[1].result.length.should.equal(config.numCharactersTemplate);
  });
  it('should create an objectId', async () => {
    const config = { idTypeTemplate: 'objectId', destinationPath: 'result' };
    const node = new IdNode('id', [[1]], config);
    const output = await node.run({}, {});
    (isValidObjectId(output[1].result)).should.be.true();
  });
  it('should throw an error when a non valid id type is given', async () => {
    const config = { idTypeTemplate: 'notvalid', destinationPath: 'result' };
    const node = new IdNode('id', [[1]], config);
    let err;
    try {
      await node.run({}, {});
    } catch (e) {
      err = e;
    }
    err.should.deepEqual(errors.Validation({ type: 'INVALID_ID_TYPE', message: '"notvalid" is not a valid ID Type, only uuidv1, uuidv3, uuidv4, uuidv5, objectid, nanoid are valid.' }));
  });
  it('should error if namespaceTemplate is missing for uuidv3', async () => {
    const config = { idTypeTemplate: 'uuidv3', destinationPath: 'result' };
    const node = new IdNode('id', [[1]], config);
    let err;
    try {
      await node.run({}, {});
    } catch (e) {
      err = e;
    }
    err.should.deepEqual(errors.Validation({ type: 'MISSING_FIELD', message: 'namespaceTemplate is required to generate a uuidv3 or uuidv5.' }));
  });
  it('should error if valueTemplate is missing for uuidv3', async () => {
    const config = { idTypeTemplate: 'uuidv3', namespaceTemplate: '{{namespace}}', destinationPath: 'result' };
    const node = new IdNode('id', [[1]], config);
    let err;
    try {
      await node.run({}, { namespace: '1b671a64-40d5-491e-99b0-da01ff1f3341' });
    } catch (e) {
      err = e;
    }
    err.should.deepEqual(errors.Validation({ type: 'MISSING_FIELD', message: 'valueTemplate is required to generate a uuidv3 or uuidv5.' }));
  });
  it('should error if numCharactersTemplate is too big', async () => {
    const config = { idTypeTemplate: 'nanoid', numCharactersTemplate: '500', destinationPath: 'result' };
    const node = new IdNode('id', [[1]], config);
    let err;
    try {
      await node.run({}, {});
    } catch (e) {
      err = e;
    }
    err.should.deepEqual(errors.Validation({ type: 'INVALID_FIELD', message: 'numCharactersTemplate should be greater than 0 and less than 257.' }));
  });

  it('it should error properly if the id could not be generated', async () => {
    const config = { idTypeTemplate: 'uuidv3', namespaceTemplate: 'Template', valueTemplate: 'value', destinationPath: 'data.value' };
    const node = new IdNode('id', [[1]], config);
    let err;
    try {
      await node.run({}, {});
    } catch (e) {
      err = e;
    }
    err.should.deepEqual(errors.Validation({ type: 'Validation', message: 'Invalid UUID', statusCode: 400, name: 'ValidationError', fullType: 'Validation' }));
  });
});
