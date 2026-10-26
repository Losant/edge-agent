import * as payloadHelper from 'losant-handlebars';
import moment from 'moment-timezone';
import errors from 'losant-nodejs-utils/src/errors.js';
const { InvalidEnumValue, MissingField } = errors;

/*
Example Config:
{
  operation:            < String - Required: One of the operations listed in the OPERATIONS const below: add, daysInMonth, diff, format, getDatePart, setDatePart, subtract, startOfTime, toArray, toObject, unixTimestampMilliseconds, unixTimestampSeconds >,
  sourcePath:           < Payload Path - Optional: Payload path to the source date. When blank, the current time is used. If the path points to a missing or invalid date, the error object is written to resultPath instead of throwing >,
  sourceFormatString:   < String - Optional: Moment format string used to parse the value at sourcePath. When blank, the value is parsed as a standard date string or timestamp >,
  numberValue:          < String | Template - Required for the 'add', 'setDatePart', and 'subtract' operations, ignored otherwise:
                          The number to add, subtract, or set >,
  unit:                 < String - Required for the 'add', 'getDatePart', 'setDatePart', 'startOfTime', and 'subtract' operations, ignored otherwise:
                          The unit to operate on. One of year, quarter, month, week, dayOfYear, day, dayOfWeek, hour, minute, second, millisecond (see the UNITS const below).
                          dayOfYear and dayOfWeek are not valid for 'add', 'subtract', or 'startOfTime' >,
  diffDataPath:         < Payload Path - Optional ('diff' operation only): Payload path to the date to compare against. When blank, the current time is used >,
  diffDataFormatString: < String - Optional ('diff' operation only): Moment format string used to parse the value at diffDataPath >,
  resultFormatString:   < String | Template - Optional ('add', 'format', 'getDatePart', 'setDatePart', 'startOfTime', and 'subtract' operations): Moment format string for the result. When blank, the result is a JavaScript Date >,
  timezone:             < String | Template - Optional ('add', 'daysInMonth', 'format', 'getDatePart', 'setDatePart', 'startOfTime', 'subtract', 'toArray', and 'toObject' operations): IANA timezone name to convert the date to before the operation. When blank, the date is not converted >,
  resultPath:           < Payload Path - Optional: Payload path to place the result. Nothing is written when blank >
}
Notes:
  Result by operation:
    add, setDatePart, startOfTime, subtract, format: a formatted string when resultFormatString is set, otherwise a Date.
    getDatePart, daysInMonth, unixTimestampMilliseconds, unixTimestampSeconds: a number.
    diff: the difference in milliseconds between the source and diff dates, as a number.
    toArray: an array of date parts. toObject: an object of date parts.
  An invalid or missing source or diff date does not throw. The result written to resultPath is { type: 'InvalidType', message: 'Invalid date: <value>' }.
  A missing or invalid operation, unit, or number value throws.
*/

// Config properties
const SOURCE_PATH             = 'sourcePath';
const SOURCE_FORMAT_STRING    = 'sourceFormatString';
const OPERATION               = 'operation';
const NUMBER_VALUE            = 'numberValue';
const UNIT                    = 'unit';
const DIFF_DATA_PATH          = 'diffDataPath';
const DIFF_DATA_FORMAT_STRING = 'diffDataFormatString';
const RESULT_FORMAT_STRING    = 'resultFormatString';
const TIMEZONE                = 'timezone';
const RESULT_PATH             = 'resultPath';

// Enum-ish object for all valid operation names
const OPERATIONS = {
  ADD: 'add',
  DAYS_IN_MONTH: 'daysInMonth',
  DIFF: 'diff',
  FORMAT: 'format',
  GET_DATE_PART: 'getDatePart',
  SET_DATE_PART: 'setDatePart',
  SUBTRACT: 'subtract',
  START_OF_TIME: 'startOfTime',
  TO_ARRAY: 'toArray',
  TO_OBJECT: 'toObject',
  UNIX_TIMESTAMP_MS: 'unixTimestampMilliseconds',
  UNIX_TIMESTAMP_S: 'unixTimestampSeconds'
};

// Enum-ish object for all valid time units
const UNITS = {
  YEAR: 'year',
  QUARTER: 'quarter',
  MONTH: 'month',
  WEEK: 'week',
  DAY_OF_YEAR: 'dayOfYear', // not valid for add/subtract/startOfTime
  DAY_OF_MONTH: 'day',
  DAY_OF_WEEK: 'dayOfWeek', // not valid for add/subtract/startOfTime
  HOUR: 'hour',
  MINUTE: 'minute',
  SECOND: 'second',
  MILLISECOND: 'millisecond'
};

const getSetDatePart = {
  [UNITS.YEAR]:         (data, value) => data.year(value),
  [UNITS.QUARTER]:      (data, value) => data.quarter(value),
  [UNITS.MONTH]:        (data, value) => data.month(value),
  [UNITS.WEEK]:         (data, value) => data.week(value),
  [UNITS.DAY_OF_YEAR]:  (data, value) => data.dayOfYear(value),
  [UNITS.DAY_OF_MONTH]: (data, value) => data.date(value),
  [UNITS.DAY_OF_WEEK]:  (data, value) => data.day(value),
  [UNITS.HOUR]:         (data, value) => data.hour(value),
  [UNITS.MINUTE]:       (data, value) => data.minute(value),
  [UNITS.SECOND]:       (data, value) => data.second(value),
  [UNITS.MILLISECOND]:  (data, value) => data.millisecond(value)
};

const operations = {
  [OPERATIONS.ADD]:               ({ data, value, unit }) => data.add(value, unit),
  [OPERATIONS.DAYS_IN_MONTH]:     ({ data }) => data.daysInMonth(),
  [OPERATIONS.DIFF]:              ({ data, value }) => data.diff(value),
  [OPERATIONS.FORMAT]:            ({ data }) => data, // format happens elsewhere
  [OPERATIONS.GET_DATE_PART]:     ({ data, unit }) => getSetDatePart[unit](data),
  [OPERATIONS.SET_DATE_PART]:     ({ data, value, unit }) => getSetDatePart[unit](data, value),
  [OPERATIONS.SUBTRACT]:          ({ data, value, unit }) => data.subtract(value, unit),
  [OPERATIONS.START_OF_TIME]:     ({ data, unit }) => data.startOf(unit),
  [OPERATIONS.TO_ARRAY]:          ({ data }) => data.toArray(),
  [OPERATIONS.TO_OBJECT]:         ({ data }) => data.toObject(),
  [OPERATIONS.UNIX_TIMESTAMP_MS]: ({ data }) => data.valueOf(),
  [OPERATIONS.UNIX_TIMESTAMP_S]:  ({ data }) => data.unix()
};

const operationFields = {
  [OPERATIONS.ADD]:               { [RESULT_FORMAT_STRING]: true, [TIMEZONE]: true, [NUMBER_VALUE]: true, [UNIT]: true },
  [OPERATIONS.DAYS_IN_MONTH]:     { [TIMEZONE]: true },
  [OPERATIONS.DIFF]:              { [DIFF_DATA_PATH]: true },
  [OPERATIONS.FORMAT]:            { [TIMEZONE]: true, [RESULT_FORMAT_STRING]: true },
  [OPERATIONS.GET_DATE_PART]:     { [RESULT_FORMAT_STRING]: true, [TIMEZONE]: true, [UNIT]: true },
  [OPERATIONS.SET_DATE_PART]:     { [RESULT_FORMAT_STRING]: true, [TIMEZONE]: true, [NUMBER_VALUE]: true, [UNIT]: true },
  [OPERATIONS.SUBTRACT]:          { [RESULT_FORMAT_STRING]: true, [TIMEZONE]: true, [NUMBER_VALUE]: true, [UNIT]: true },
  [OPERATIONS.START_OF_TIME]:     { [RESULT_FORMAT_STRING]: true, [TIMEZONE]: true, [UNIT]: true },
  [OPERATIONS.TO_ARRAY]:          { [TIMEZONE]: true },
  [OPERATIONS.TO_OBJECT]:         { [TIMEZONE]: true },
  [OPERATIONS.UNIX_TIMESTAMP_MS]: { },
  [OPERATIONS.UNIX_TIMESTAMP_S]:  { }
};

const validateRequired = (value, title) => {
  if (!value) {
    throw MissingField({ title });
  }
};

const validateEnum = (enumObject, actualType, field) => {
  const allowedValues = Object.values(enumObject);
  const isValidUnit = allowedValues.includes(actualType);

  if (!isValidUnit) {
    throw InvalidEnumValue({ allowedValues, actualType, field });
  }
};

const renderFormatString = (value, payload) => {
  const format = payloadHelper.renderToString(value, payload);
  return format ? format : undefined;
};

const renderMomentFromPath = (value, formatValue, payload) => {
  // If a literal falsy value is passed, default to "now"
  if (!value) { return moment().clone(); }

  const pathDate = payloadHelper.lookup(value, payload);
  const format = renderFormatString(formatValue);
  const error = { type: 'InvalidType', message: `Invalid date: ${pathDate}` };

  // If a path is passed that *points* to a falsy value, return an error
  if (!pathDate) { return { error }; }
  if (pathDate && !format) {
    // Moment prints a deprecation warning when it falls back to the native Date
    // parser for an unparseable value without a format string, so validate first.
    const jsDate = Date.parse(pathDate);
    if (isNaN(jsDate)) {
      return { error };
    }
  }

  // Moment uses a single moment object throughout its lifetime, so we want to
  // make sure we don't directly mutate that object at all.
  const data = moment(pathDate, format).clone();

  return data.isValid() ? data : { error };
};

const renderUnit = (value, payload) => {
  const field = 'Unit';
  const unit = payloadHelper.renderToString(value, payload);
  validateRequired(unit, field);
  validateEnum(UNITS, unit, field);
  return unit;
};

const renderNumber = (value, payload) => {
  const number = payloadHelper.renderToString(value, payload);
  validateRequired(number, 'Number');
  return Number(number);
};

class DateTimeNode {
  constructor(id, outputIds, config) {
    this.id = id;
    this.outputIds = outputIds;

    this[SOURCE_PATH] = config[SOURCE_PATH];
    this[SOURCE_FORMAT_STRING] = config[SOURCE_FORMAT_STRING];
    this[OPERATION] = config[OPERATION];
    this[UNIT] = config[UNIT];
    this[NUMBER_VALUE] = config[NUMBER_VALUE];
    this[DIFF_DATA_PATH] = config[DIFF_DATA_PATH];
    this[DIFF_DATA_FORMAT_STRING] = config[DIFF_DATA_FORMAT_STRING];
    this[RESULT_FORMAT_STRING] = config[RESULT_FORMAT_STRING];
    this[TIMEZONE] = config[TIMEZONE];
    this[RESULT_PATH] = config[RESULT_PATH];
  }

  run(context, payload) {
    let result, error, resultFormat, value, unit;

    // Renders the operation config to string and checks that it's there and one of
    // the allowed operation types
    const operation = payloadHelper.renderToString(this[OPERATION], payload);
    validateRequired(operation, 'Operation');
    validateEnum(OPERATIONS, operation, 'Operation');

    if (operationFields[operation][RESULT_FORMAT_STRING]) {
      resultFormat = renderFormatString(this[RESULT_FORMAT_STRING], payload);
    }

    if (operationFields[operation][UNIT]) {
      unit = renderUnit(this[UNIT], payload);
    }

    let data = renderMomentFromPath(this[SOURCE_PATH], this[SOURCE_FORMAT_STRING], payload);
    error = data.error ? data : undefined;

    if (!error) {
      if (operationFields[operation][TIMEZONE]) {
        const zone = renderFormatString(this[TIMEZONE], payload);
        if (zone) { data = data.tz(zone); }
      }

      if (operationFields[operation][NUMBER_VALUE]) {
        value = renderNumber(this[NUMBER_VALUE], payload);
      } else if (operationFields[operation][DIFF_DATA_PATH]) {
        value = renderMomentFromPath(this[DIFF_DATA_PATH], this[DIFF_DATA_FORMAT_STRING], payload);
        error = value.error ? value : undefined;
      }
    }

    if (error) {
      result = error;
    } else {
      result = operations[operation]({ data, value, unit });
      if (moment.isMoment(result)) {
        if (resultFormat) {
          result = result.format(resultFormat);
        } else {
          // We can't return a moment object on the payload since the payload is
          // immutable. Moment creates one mutable object that is used throughout
          // its entire lifetime, so returning that object and then freezing it
          // on the payload causes errors elsewhere.
          result = result.toDate();
        }
      }
    }

    if (this[RESULT_PATH]) {
      payload = payloadHelper.set(this[RESULT_PATH], result, payload);
    }

    return [ this.outputIds, payload ];
  }
}

DateTimeNode.OPERATIONS = OPERATIONS;
DateTimeNode.UNITS = UNITS;
DateTimeNode.CONFIG_PROPS = {
  SOURCE_PATH,
  SOURCE_FORMAT_STRING,
  OPERATION,
  RESULT_PATH,
  NUMBER_VALUE,
  UNIT,
  DIFF_DATA_PATH,
  DIFF_DATA_FORMAT_STRING,
  TIMEZONE,
  RESULT_FORMAT_STRING
};

export default DateTimeNode;
