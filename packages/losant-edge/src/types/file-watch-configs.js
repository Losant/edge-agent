import t from 'tcomb';
import FileWatchConfig from './file-watch-config.js';

const FileWatchConfigs = t.list(FileWatchConfig);

export default FileWatchConfigs;
