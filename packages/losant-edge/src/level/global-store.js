import LJSON from 'losant-nodejs-utils/src/ljson.js';

const GlobalStore = (sublevelDb) => {

  const initialize = async () => sublevelDb.open();

  const set = async (key, value) => {
    await sublevelDb.put(key, LJSON.stringify(value));
    return value;
  };

  const get = async (key, type) => {
    try {
      return type(LJSON.parse((await sublevelDb.get(key)) || '{}'));
    } catch {
      await sublevelDb.del(key);
      return type({});
    }
  };

  return {
    // :: () => Promise<>
    initialize,
    // :: (String, TcombStruct a) -> Promise<a>
    get,
    // :: (String, Object) -> Promise<Object>
    set
  };
};

// :: (subLevelDb) -> GlobalStore
export default GlobalStore;
