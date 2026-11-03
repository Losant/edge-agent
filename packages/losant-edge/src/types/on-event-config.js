import t from 'tcomb';

const EVENT_LIST = [
  'onBoot',
  'onConnect',
  'onDisconnect',
  'onSync'
];
const EVENT = t.enums.of(EVENT_LIST, 'EVENT');
EVENT.allows = EVENT_LIST;

const SYNC_TYPE_LIST = [
  'device',
  'application',
  'peripheral'
];
const SYNC_TYPE = t.enums.of(SYNC_TYPE_LIST, 'SYNC_TYPE');
SYNC_TYPE.allows = SYNC_TYPE_LIST;
const SyncTypes = t.list(SYNC_TYPE);

const OnEventConfig = t.struct({
  eventId: t.String,
  event: EVENT,
  syncTypes: t.maybe(SyncTypes)
});

export default OnEventConfig;
