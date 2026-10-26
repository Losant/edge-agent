import { compose, last, split } from 'omnibelt';
import t from 'tcomb';
import FilePath from './file-path.js';
import { ObjectIdStr } from './lib/refinements.js';

const LevelDbPath = t.refinement(
  FilePath,
  compose(ObjectIdStr.is, last, split('/')),
  'LevelDbPath'
);

export default LevelDbPath;
