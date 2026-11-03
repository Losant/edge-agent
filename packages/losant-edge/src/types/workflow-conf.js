import t from 'tcomb';
import { prop } from 'omnibelt';
import { WORKFLOW_DIRECTORY_DEFAULT } from '../constants.js';

const WorkflowConfig = t.struct({
  directory: t.maybe(t.String)
}, {
  name: 'WorkflowConfig',
  strict: true,
  defaultProps: {
    directory: WORKFLOW_DIRECTORY_DEFAULT
  }
});

WorkflowConfig.fromArgs = prop('workflow');
export default WorkflowConfig;
