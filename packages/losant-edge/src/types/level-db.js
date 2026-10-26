import { T } from 'omnibelt';
import t from 'tcomb';

const LevelDb = t.refinement(t.Any, T, 'LevelDb');

export default LevelDb;
