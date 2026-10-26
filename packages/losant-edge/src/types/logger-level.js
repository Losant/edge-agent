import Enums from './lib/enums.js';

const LoggerLevel = Enums(
  [
    'error',
    'warn',
    'info',
    'verbose'
    // 'debug',
    // 'silly',
  ],
  'LoggerLevel'
);


export default LoggerLevel;
