import { compose, converge, path as rPath, list, applySpec, apply } from 'omnibelt';
import t from 'tcomb';
import path from 'node:path';
import Struct from './lib/struct.js';
import LevelDbPath from './level-db-path.js';

const LevelManagerConf = Struct({
  path: LevelDbPath,
  basePath: t.String
}, {
  name: 'LevelManagerConf',
  strict: true
});

const pathFromArgs = compose(
  apply(path.resolve),
  converge(list, [
    rPath(['store', 'path']),
    rPath(['gateway', 'id'])
  ])
);

// :: Args -> LevelManagerConf
LevelManagerConf.fromArgs =
  compose(
    LevelManagerConf.unary,
    applySpec({
      path: pathFromArgs,
      basePath: rPath(['store', 'path'])
    })
  );

export default LevelManagerConf;
