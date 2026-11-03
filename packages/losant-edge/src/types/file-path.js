import { T } from 'omnibelt';
import t from 'tcomb';

const FilePath = t.refinement(t.String, T, 'FilePath');

export default FilePath;
