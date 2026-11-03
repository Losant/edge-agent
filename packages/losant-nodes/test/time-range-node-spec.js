import './common.js';
import TimeRangeNode from '../src/time-range-node.js';

describe('TimeRangeNode', () => {
  it('should basic range branch correctly', () => {
    const node = new TimeRangeNode('id', [[5], [4]], {
      startTimeTemplate: '{{start}}',
      endTimeTemplate: '{{end}}',
      timeZoneTemplate: '{{zone}}',
      daysPath: 'days',
      daysType: 'path',
      sourcePath: 'check',
      branchPath: 'result'
    });

    let results = node.run({}, {
      zone: 'America/Boise',
      days: [1, 1, 1, 1, 1, 1, 1],
      start: '16:57',
      end: '16:59',
      check: 'Mon Mar 28 2016 18:58:06 GMT-0400 (EDT)'
    });
    results[0].should.deepEqual([4]);
    results[1].should.deepEqual({
      zone: 'America/Boise',
      start: '16:57',
      days: [1, 1, 1, 1, 1, 1, 1],
      end: '16:59',
      check: 'Mon Mar 28 2016 18:58:06 GMT-0400 (EDT)',
      result: true
    });

    results = node.run({}, {
      zone: 'America/Boise',
      start: '16:57',
      days: [1, 1, 1, 1, 1, 1, 1],
      end: '16:58',
      check: 'Mon Mar 28 2016 18:58:06 GMT-0400 (EDT)'
    });
    results[0].should.deepEqual([5]);
    results[1].should.deepEqual({
      zone: 'America/Boise',
      start: '16:57',
      days: [1, 1, 1, 1, 1, 1, 1],
      end: '16:58',
      check: 'Mon Mar 28 2016 18:58:06 GMT-0400 (EDT)',
      result: false
    });
  });

  it('should basic day branch correctly', () => {
    const node = new TimeRangeNode('id', [[5], [4]], {
      timeZoneTemplate: 'Pacific/Honolulu',
      days: [0, 1, 0, 1, 0, 0, 0],
      daysType: 'array',
      sourcePath: 'check',
      branchPath: 'result'
    });

    let results = node.run({}, { check: 'Mon Mar 28 2016 18:58:06 GMT-0400 (EDT)' });
    results[0].should.deepEqual([4]);
    results[1].should.deepEqual({
      check: 'Mon Mar 28 2016 18:58:06 GMT-0400 (EDT)',
      result: true
    });

    results = node.run({}, { check: 'Wed Mar 30 2016 2:58:06 GMT-0400 (EDT)' });
    results[0].should.deepEqual([5]);
    results[1].should.deepEqual({
      check: 'Wed Mar 30 2016 2:58:06 GMT-0400 (EDT)',
      result: false
    });

    results = node.run({}, { check: 'Wed Mar 30 2016 12:58:06 GMT-0400 (EDT)' });
    results[0].should.deepEqual([4]);
    results[1].should.deepEqual({
      check: 'Wed Mar 30 2016 12:58:06 GMT-0400 (EDT)',
      result: true
    });
  });

  it('should default to the payload time', () => {
    const node = new TimeRangeNode('id', [[5], [4]], {
      timeZoneTemplate: 'Pacific/Honolulu',
      startTimeTemplate: '12:00',
      endTimeTemplate: '14:00',
      days: [1, 1, 1, 1, 1, 1, 1],
      daysType: 'array',
      branchPath: 'result'
    });

    let results = node.run({ originalPayload: { time: 1459205886000 } }, { });
    results[0].should.deepEqual([4]);
    results[1].should.deepEqual({ result: true });

    results = node.run({ originalPayload: { time: 1459205886000 + 2*60*60*1000 } }, { });
    results[0].should.deepEqual([5]);
    results[1].should.deepEqual({ result: false });
  });

  it('inclusive on start, not on end', () => {
    const node = new TimeRangeNode('id', [[5], [4]], {
      timeZoneTemplate: 'Pacific/Honolulu',
      startTimeTemplate: '12:02',
      endTimeTemplate: '14:01',
      days: [1, 0, 0, 0, 0, 0, 0],
      daysType: 'array',
      branchPath: 'result'
    });

    let results = node.run({ originalPayload: { time: new Date('Sun Mar 27 2016 17:01:59 GMT-0500') } }, { });
    results[0].should.deepEqual([5]);
    results[1].should.deepEqual({ result: false });

    results = node.run({ originalPayload: { time: new Date('Sun Mar 27 2016 17:02:00 GMT-0500') } }, { });
    results[0].should.deepEqual([4]);
    results[1].should.deepEqual({ result: true });

    results = node.run({ originalPayload: { time: new Date('Sun Mar 27 2016 17:02:01 GMT-0500') } }, { });
    results[0].should.deepEqual([4]);
    results[1].should.deepEqual({ result: true });

    results = node.run({ originalPayload: { time: new Date('Sun Mar 27 2016 19:00:59 GMT-0500') } }, { });
    results[0].should.deepEqual([4]);
    results[1].should.deepEqual({ result: true });

    results = node.run({ originalPayload: { time: new Date('Sun Mar 27 2016 19:01:00 GMT-0500') } }, { });
    results[0].should.deepEqual([5]);
    results[1].should.deepEqual({ result: false });

    results = node.run({ originalPayload: { time: new Date('Sun Mar 27 2016 19:01:01 GMT-0500') } }, { });
    results[0].should.deepEqual([5]);
    results[1].should.deepEqual({ result: false });
  });
  it('should throw an error on invalid timezone', () => {
    const node = new TimeRangeNode('id', [[5], [4]], {
      timeZoneTemplate: '{{ data.zone }}',
      startTimeTemplate: '12:00',
      endTimeTemplate: '14:00',
      days: [1, 1, 1, 1, 1, 1, 1],
      daysType: 'array',
      branchPath: 'result'
    });
    (() => {
      return node.run({ originalPayload: { time: 1459205886000 } }, { data: { zone: 'NOTATIMEZONE' } });
    }).should.throw({
      type: 'Validation',
      message: 'Invalid timezone : non-existing time zone name \'NOTATIMEZONE\'',
      statusCode: 400,
      name: 'ValidationError',
      fullType: 'Validation'
    });
  });
  it('should format hours and minutes properly when not in correct format', () => {
    const node = new TimeRangeNode('id', [[5], [4]], {
      startTimeTemplate: '{{start}}',
      endTimeTemplate: '{{end}}',
      timeZoneTemplate: '{{zone}}',
      daysPath: 'days',
      daysType: 'path',
      sourcePath: 'check',
      branchPath: 'result'
    });

    const results = node.run({}, {
      zone: 'America/Boise',
      days: [1, 1, 1, 1, 1, 1, 1],
      start: '9',
      end: '19:5',
      check: 'Mon Mar 28 2016 18:58:06 GMT-0400 (EDT)'
    });
    results[0].should.deepEqual([4]);
    results[1].should.deepEqual({
      zone: 'America/Boise',
      start: '9',
      days: [1, 1, 1, 1, 1, 1, 1],
      end: '19:5',
      check: 'Mon Mar 28 2016 18:58:06 GMT-0400 (EDT)',
      result: true
    });
  });

  it('should handle start time before midnight and end time after midnight properly', () => {
    const node = new TimeRangeNode('id', [[5], [4]], {
      startTimeTemplate: '{{start}}',
      endTimeTemplate: '{{end}}',
      timeZoneTemplate: '{{zone}}',
      daysPath: 'days',
      daysType: 'path',
      sourcePath: 'check',
      branchPath: 'result'
    });

    const results = node.run({}, {
      zone: 'America/Boise',
      days: [true, true, true, true, true, true, true],
      start: '23:00',
      end: '06:00',
      check: 'Tues Mar 28 2016 02:58:06 GMT-0400 (EDT)'
    });
    results[0].should.deepEqual([4]);
    results[1].should.deepEqual({
      zone: 'America/Boise',
      days: [true, true, true, true, true, true, true],
      start: '23:00',
      end: '06:00',
      check: 'Tues Mar 28 2016 02:58:06 GMT-0400 (EDT)',
      result: true
    });
  });

  it('should move startTime to the previous day when end time is less than start time and end time is ahead of check time and should evaluate to false', () => {
    const node = new TimeRangeNode('id', [[5], [4]], {
      startTimeTemplate: '{{start}}',
      endTimeTemplate: '{{end}}',
      timeZoneTemplate: '{{zone}}',
      daysPath: 'days',
      daysType: 'path',
      sourcePath: 'check',
      branchPath: 'result'
    });

    const results = node.run({}, {
      zone: 'America/Boise',
      days: [true, true, true, true, true, true, true],
      start: '10:00',
      end: '02:00',
      check: 'Tues Mar 28 2016 05:58:06 GMT-0400 (EDT)'
    });
    results[0].should.deepEqual([5]);
    results[1].should.deepEqual({
      zone: 'America/Boise',
      days: [true, true, true, true, true, true, true],
      start: '10:00',
      end: '02:00',
      check: 'Tues Mar 28 2016 05:58:06 GMT-0400 (EDT)',
      result: false
    });
  });

  it('should move startTime to the previous day when end time is less than start time and end time is ahead of check time and should evaluate to true', () => {
    const node = new TimeRangeNode('id', [[5], [4]], {
      startTimeTemplate: '{{start}}',
      endTimeTemplate: '{{end}}',
      timeZoneTemplate: '{{zone}}',
      daysPath: 'days',
      daysType: 'path',
      sourcePath: 'check',
      branchPath: 'result'
    });

    const results = node.run({}, {
      zone: 'America/Boise',
      days: [true, true, true, true, true, true, true],
      start: '07:00',
      end: '06:00',
      check: 'Tues Mar 28 2016 02:58:06 GMT-0400 (EDT)'
    });
    results[0].should.deepEqual([4]);
    results[1].should.deepEqual({
      zone: 'America/Boise',
      days: [true, true, true, true, true, true, true],
      start: '07:00',
      end: '06:00',
      check: 'Tues Mar 28 2016 02:58:06 GMT-0400 (EDT)',
      result: true
    });
  });

  it('should move endTime to the next day when end time is less than start time and behind check time and evaluate to true', () => {
    const node = new TimeRangeNode('id', [[5], [4]], {
      startTimeTemplate: '{{start}}',
      endTimeTemplate: '{{end}}',
      timeZoneTemplate: '{{zone}}',
      daysPath: 'days',
      daysType: 'path',
      sourcePath: 'check',
      branchPath: 'result'
    });

    const results = node.run({}, {
      zone: 'America/Boise',
      days: [true, true, true, true, true, true, true],
      start: '12:00',
      end: '01:00',
      check: 'Tues Mar 28 2016 15:58:06 GMT-0400 (EDT)'
    });
    results[0].should.deepEqual([4]);
    results[1].should.deepEqual({
      zone: 'America/Boise',
      days: [true, true, true, true, true, true, true],
      start: '12:00',
      end: '01:00',
      check: 'Tues Mar 28 2016 15:58:06 GMT-0400 (EDT)',
      result: true
    });
  });
});
