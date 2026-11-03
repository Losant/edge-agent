import t from 'tcomb';
import FilePath from './file-path.js';

const FileWatchConfig = t.struct({
  watchId: t.String, // watch ids are globally uniq, they contain the flow ID
  path: FilePath,
  fileAdded: t.maybe(t.Boolean),
  fileChanged: t.maybe(t.Boolean),
  fileRemoved: t.maybe(t.Boolean),
  directoryAdded: t.maybe(t.Boolean),
  directoryRemoved: t.maybe(t.Boolean)
}, {
  name: 'FileWatchConfig',
  strict: true
});

export default FileWatchConfig;
