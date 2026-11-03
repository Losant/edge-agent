import t from 'tcomb';

const MqttMessage = t.union([t.Object, t.String, t.Array]);

export default MqttMessage;
