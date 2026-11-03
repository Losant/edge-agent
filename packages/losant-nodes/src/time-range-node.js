import * as payloadHelper from 'losant-handlebars';
import tc from 'timezonecomplete';
import errors from 'losant-nodejs-utils/src/errors.js';

const ensureHoursMinutes = (time) => {
  if (time.length < 4) {
    const timeSplit = time.split(':');
    const hours = timeSplit[0] || '00';
    const minutes= timeSplit[1] || '00';
    time = [ hours, minutes ].join(':');
  }
  return time;
};

class TimeRangeNode {

  /* Example Config:
  { startTimeTemplate: <String - Optional: template or value for the start time, hh:mm. Default 00:00>,
    endTimeTemplate: <String - Optional: template or value for the end time, hh:mm. Default 00:00>,
    timeZoneTemplate: <String - Required: template or value for the time zone name. Invalid names throw>,
    days: [<array of 7 booleans, each representing a day of the week, index 0 is Sunday>],
    daysPath: <String - Optional: payload path to a valid array of 7 booleans. Used when daysType is path>,
    daysType: <String - Optional: path|array. Whether days or daysPath is used. Default array>,
    sourcePath: <String - Optional: payload path to the time value to check. If blank, uses the time of the original trigger payload>,
    branchPath: <String - Optional: payload path for where to put a boolean of which branch was taken> }

  Notes: outputIds[0] is the false path and outputIds[1] is the true path. The true path is taken
  when the time falls on a selected day and within the time range, both evaluated in the given time zone.
  The time value can be a date string, or a number of seconds or milliseconds since the epoch.
  If start and end are equal, the whole day matches. If end is before start, the range runs past midnight.
  Start is inclusive and end is exclusive. days must be an array of exactly 7 items or the node throws.
  */

  constructor(id, outputIds, config) {
    this.id = id;
    this.outputIds = outputIds;
    this.startTimeTemplate = config.startTimeTemplate;
    this.endTimeTemplate = config.endTimeTemplate;
    this.timeZoneTemplate = config.timeZoneTemplate;
    this.days = config.days;
    this.daysPath = config.daysPath;
    this.daysType = config.daysType || 'array';
    this.sourcePath = config.sourcePath;
    this.branchPath = config.branchPath;
  }

  convertToDate(val) {
    let date;
    let valNum = Number(val);
    if (!isFinite(valNum) || valNum <= 0) {
      date = new Date(val);
    } else {
      // they handed in seconds since epoch
      if (valNum < 1000000000000) { valNum = valNum * 1000; }
      date = new Date(valNum);
    }

    if (date.toString() === 'Invalid Date') {
      throw errors.Validation({ message: `Invalid Date: ${val}` });
    }

    return new tc.DateTime(date, tc.DateFunctions.GetUTC, tc.zone('UTC'));
  }

  checkRange(start, end, check, payload) {
    start = (payloadHelper.renderToString(start, payload).trim() || '00:00');
    end = (payloadHelper.renderToString(end, payload).trim() || '00:00');
    if (start === end) { return true; }
    start = ensureHoursMinutes(start);
    end = ensureHoursMinutes(end);
    try {
      start = tc.DateTime.parse(start, 'HH:mm');
    } catch {
      throw errors.Validation({ message: 'Invalid start time format must be HH:mm' });
    }
    start = new tc.DateTime(check.year(), check.month(), check.day(),
      start.hour(), start.minute(), 0, 0, check.zone());
    try {
      end = tc.DateTime.parse(end, 'HH:mm');
    } catch {
      throw errors.Validation({ message: 'Invalid end time format must be HH:mm' });
    }
    end = new tc.DateTime(check.year(), check.month(), check.day(),
      end.hour(), end.minute(), 0, 0, check.zone());

    if (end.lessEqual(start)) {
      if (end.greaterThan(check)) {
        start = start.addLocal(-1, tc.TimeUnit.Day);
      } else {
        end = end.addLocal(1, tc.TimeUnit.Day);
      }
    }
    return start.lessEqual(check) && end.greaterThan(check);
  }

  run(context, payload) {
    let timeToCheck;
    if (this.sourcePath) {
      timeToCheck = payloadHelper.lookup(this.sourcePath, payload);
    } else {
      timeToCheck = context.originalPayload.time;
    }
    timeToCheck = this.convertToDate(timeToCheck);
    let zone;
    try {
      zone = tc.zone(payloadHelper.renderToString(this.timeZoneTemplate, payload));
    } catch (err) {
      throw errors.Validation({ message: `Invalid timezone : ${err.message}` });
    }
    timeToCheck = timeToCheck.toZone(zone);

    let days;
    if (this.daysType === 'path') {
      days = payloadHelper.lookup(this.daysPath, payload);
    } else {
      days = this.days;
    }

    if (!Array.isArray(days)) {
      throw errors.Validation({ message: 'days must be an array' });
    }

    if (days.length !== 7) {
      throw errors.Validation({ message: 'days must be an array with 7 items' });
    }

    const validDay = !!days[timeToCheck.weekDay()];
    const validRange = this.checkRange(this.startTimeTemplate,
      this.endTimeTemplate, timeToCheck, payload);

    const result = !!(validDay && validRange);
    if (this.branchPath) { payload = payloadHelper.set(this.branchPath, result, payload); }

    const resultIds = this.outputIds[Number(result)];
    return [resultIds, payload];
  }

}

export default TimeRangeNode;
