import t from 'tcomb';
import { DebuggingKey } from './lib/refinements.js';

const DebugMessage = t.dict(DebuggingKey, t.Boolean);

export default DebugMessage;
