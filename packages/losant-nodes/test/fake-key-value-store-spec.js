import { kvStore } from './common.js';
import abstractKeyValueStoreTests from './abstract/key-value-store-spec.js';

describe('Fake (In Process) KeyValueStore Spec', function() {
  abstractKeyValueStoreTests(() => kvStore);
});
