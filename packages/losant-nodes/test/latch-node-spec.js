import { contextify, kvStore } from './common.js';
import abstractLatchNodeTests from './abstract/latch-node-spec.js';
import ScopedStore from '../src/lib/scoped-key-value-store.js';

describe('LatchNode Using Fake kvStore', () => {
  abstractLatchNodeTests(() => { return { contextify, kvStore }; });

  describe('wrapped with scoped store', () => {
    const scopedStore = new ScopedStore(kvStore, 'myScope');
    abstractLatchNodeTests(() => {
      return {
        kvStore: scopedStore,
        contextify: (obj) => {
          obj = contextify(obj);
          obj.kvStore = scopedStore;
          return obj;
        }
      };
    });
  });
});
