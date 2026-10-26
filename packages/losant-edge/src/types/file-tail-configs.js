import t from 'tcomb';
import FileTailConfig from './file-tail-config.js';

const FileTailConfigs = t.list(FileTailConfig);

export default FileTailConfigs;
