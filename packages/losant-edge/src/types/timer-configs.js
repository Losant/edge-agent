import t from 'tcomb';
import TimerConfig from './timer-config.js';

const TimerConfigs = t.list(TimerConfig);

export default TimerConfigs;
