import t from 'tcomb';

const TriggerType = t.enums.of([
  'customNodeStart',
  'deviceCommand',
  'fileTail',
  'fileWatch',
  'flowError',
  'mqttTopic',
  'onBoot',
  'onConnect',
  'onDisconnect',
  'onSync',
  'opcua',
  'redis',
  'request',
  'serial',
  'snmpTrap',
  'timer',
  'udp',
  'virtualButton',
  'beckhoff'
], 'TriggerType');

export default TriggerType;
