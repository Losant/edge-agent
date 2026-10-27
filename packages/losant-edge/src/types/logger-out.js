import t from 'tcomb';
import FilePath from './file-path.js';
import LoggerOutSymbol from './logger-out-symbol.js';

const LoggerOut = t.union([LoggerOutSymbol, FilePath]);

export default LoggerOut;
