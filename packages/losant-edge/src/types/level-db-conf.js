import { STORE_PATH_DEFAULT } from '../constants.js';
import Struct from './lib/struct.js';
import FilePath from './file-path.js';

const LevelDbConf = Struct({
  path: FilePath
}, {
  name: 'LevelDbConf',
  defaultProps: {
    path: STORE_PATH_DEFAULT
  }
});

export default LevelDbConf;
