import t from 'tcomb';
import RequestTriggerConfig from './request-trigger-config.js';

const RequestTriggerConfigs = t.list(RequestTriggerConfig);

export default RequestTriggerConfigs;
