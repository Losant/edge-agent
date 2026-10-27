import Enums from './lib/enums.js';

const ReplayOrderOptions = Enums(
  [
    'oldestFirst',
    'newestFirst'
  ],
  'ReplayOrderOptions'
);

export default ReplayOrderOptions;
