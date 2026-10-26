import { createRequire } from 'module';

// bson ships separate ESM (lib/bson.node.mjs) and CJS (lib/bson.cjs) builds, each
// defining its own ObjectId class. The mongodb driver is CJS and loads bson via
// require(), so importing bson via ESM here would give us a *different* ObjectId
// class than the one attached to real driver query results - same package/version,
// two incompatible classes (a "dual package hazard"). Forcing require() here makes
// both sides resolve the identical bson.cjs module.
const require = createRequire(import.meta.url);
const { ObjectId: _ObjectId, EJSON } = require('bson');

export const ObjectId = _ObjectId;
export { EJSON };

export const isValidObjectId = (id) => {
  if (!id) { return false; }
  if (typeof id === 'string' && id.length !== 24) {
    return false;
  }
  return ObjectId.isValid(id);
};
