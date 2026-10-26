import t from 'tcomb';

const TimerConfig = t.struct({
  timerId: t.String, // timer ids are globally uniq, they contain the flow ID
  cron: t.maybe(t.String),
  seconds: t.maybe(t.Number),
  tz: t.maybe(t.String)
}, {
  name: 'TimerConfig',
  strict: true
});

export default TimerConfig;
