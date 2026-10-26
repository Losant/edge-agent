import { T } from 'omnibelt';
import t from 'tcomb';

const MqttStoreType = t.refinement(t.Any, T, 'MqttStoreType');

export default MqttStoreType;
