import { tk } from './common.js';
import DateTimeNode from '../src/date-time-node.js';
import moment from 'moment';

const {
  CONFIG_PROPS,
  OPERATIONS,
  UNITS
} = DateTimeNode;

const GENERIC_OIDS = [[1]];
const TEST_DATE_STRING = '2019-07-23 05:00:00'; // July 23, 2019 5am
const TEST_DATE_FORMAT = 'YYYY-MM-DD HH:mm:ss';
const TEST_MANIPULATION_VALUE = 2; // Can be any random integer

const ERROR_TYPES = {
  MISSING: 'MissingField',
  INVALID_ENUM: 'InvalidEnumValue',
  INVALID_TYPE: 'InvalidType'
};

// Throws all the string values of each valid unit into an array
const units = Object.values(UNITS);

// Returns a new moment instance with the base test data (instead of `now`)
const testMoment = () => moment(TEST_DATE_STRING, TEST_DATE_FORMAT).clone();
const transformMomentDataToReturn = (data) => data.toDate();

// Condenses all node test logic into one function. The majority of the
// work in all of these tests happens here, just with different parameters.
// Returns the outputIds and payload if needed.
const checkNode = ({ operation, result, config = {}, extraDataIn = {} }) => {
  const node = new DateTimeNode(
    'id',
    GENERIC_OIDS,
    {
      [CONFIG_PROPS.SOURCE_PATH]: 'data.in',
      [CONFIG_PROPS.RESULT_PATH]: 'data.out',
      [CONFIG_PROPS.SOURCE_FORMAT_STRING]: TEST_DATE_FORMAT,
      [CONFIG_PROPS.OPERATION]: operation,
      ...config
    }
  );

  const dataIn = { in: TEST_DATE_STRING, ...extraDataIn };
  const dataOut = { out: result };

  const [ outputIds, payload ] = node.run({}, {
    data: { ...dataIn }
  });

  outputIds.should.deepEqual(GENERIC_OIDS);
  payload.should.deepEqual({
    data: {
      ...dataIn,
      ...dataOut
    }
  });

  // Makes sure that no moment object is ever stored on the payload,
  // as that causes Problems™
  moment.isMoment(dataOut).should.be.exactly(false);

  return [outputIds, payload];
};

// Helper function to make sure manipulation methods work with all available units.
const checkAllUnitsManipulation = (operation, resultCallback) => {
  const toCheck = [];
  units.forEach((unit) => {
    if (unit === UNITS.DAY_OF_WEEK || unit === UNITS.DAY_OF_YEAR) { return; }

    const value = TEST_MANIPULATION_VALUE;

    const input = testMoment();
    toCheck.push({
      [CONFIG_PROPS.UNIT]: unit,
      [CONFIG_PROPS.NUMBER_VALUE]: value,
      result: transformMomentDataToReturn(resultCallback(input, unit, value))
    });

    const tzInput = testMoment().tz('America/Denver');
    toCheck.push({
      [CONFIG_PROPS.UNIT]: unit,
      [CONFIG_PROPS.NUMBER_VALUE]: value,
      [CONFIG_PROPS.TIMEZONE]: 'America/Denver',
      [CONFIG_PROPS.RESULT_FORMAT_STRING]: 'MM DD dd YY YYYY ss',
      result: resultCallback(tzInput, unit, value).format('MM DD dd YY YYYY ss')
    });
  });

  toCheck.forEach((item) => {
    if (!item) { return; }
    const { result, ...otherProps } = item;
    checkNode({
      operation,
      result,
      config: { ...otherProps }
    });
  });
};

// Helper for checking that errors are thrown
const getError = (checkNodeConfig = {}) => {
  try {
    checkNode(checkNodeConfig);
  } catch (error) {
    return error;
  }
};

const checkBadEnum = (field, checkNodeConfig) => {
  const error = getError(checkNodeConfig);
  error.type.should.deepEqual(ERROR_TYPES.INVALID_ENUM);
  error.field.should.deepEqual(field);
};

const checkMissing = (title, checkNodeConfig) => {
  const error = getError(checkNodeConfig);
  error.type.should.deepEqual(ERROR_TYPES.MISSING);
  error.title.should.deepEqual(title);
};

describe('DateTimeNode', () => {
  it('should add', () => {
    checkAllUnitsManipulation(
      OPERATIONS.ADD,
      (input, unit, value) => input.add(value, unit)
    );
  });

  it('should return the days in a month', () => {
    checkNode({ operation: OPERATIONS.DAYS_IN_MONTH, result: 31 });
  });

  it('should compute the difference', () => {
    const diff = testMoment().add(TEST_MANIPULATION_VALUE, UNITS.DAY_OF_MONTH).toDate();
    checkNode({
      operation: OPERATIONS.DIFF,
      result: testMoment().diff(diff),
      config: {
        [CONFIG_PROPS.DIFF_DATA_PATH]: 'data.diff'
      },
      extraDataIn: { diff }
    });
  });

  it('should format to specified string', () => {
    checkNode({
      operation: OPERATIONS.FORMAT,
      result: '07-23-19 05:00:00',
      config: {
        [CONFIG_PROPS.RESULT_FORMAT_STRING]: 'MM-DD-YY HH:mm:SS'
      }
    });

    checkNode({
      operation: OPERATIONS.FORMAT,
      result: '07-22-19 23:00:00',
      config: {
        [CONFIG_PROPS.TIMEZONE]: 'America/Denver',
        [CONFIG_PROPS.RESULT_FORMAT_STRING]: 'MM-DD-YY HH:mm:SS'
      }
    });
  });

  it('should get date part', () => {
    const toCheck = {
      [UNITS.YEAR]: testMoment().year(),
      [UNITS.QUARTER]: testMoment().quarter(),
      [UNITS.MONTH]: testMoment().month(),
      [UNITS.WEEK]: testMoment().week(),
      [UNITS.DAY_OF_YEAR]: testMoment().dayOfYear(),
      [UNITS.DAY_OF_MONTH]: testMoment().date(),
      [UNITS.DAY_OF_WEEK]: testMoment().day(),
      [UNITS.HOUR]: testMoment().hour(),
      [UNITS.MINUTE]: testMoment().minute(),
      [UNITS.SECOND]: testMoment().second(),
      [UNITS.MILLISECOND]: testMoment().millisecond()
    };

    Object.entries(toCheck).forEach((entry) => {
      checkNode({
        operation: OPERATIONS.GET_DATE_PART,
        result: entry[1],
        config: {
          [CONFIG_PROPS.UNIT]: entry[0]
        }
      });
    });
  });

  it('should set date part', () => {
    const values = {
      [UNITS.YEAR]: 2020,
      [UNITS.QUARTER]: 4,
      [UNITS.MONTH]: 12,
      [UNITS.WEEK]: 1,
      [UNITS.DAY_OF_YEAR]: 48,
      [UNITS.DAY_OF_MONTH]: 24,
      [UNITS.DAY_OF_WEEK]: 3,
      [UNITS.HOUR]: 12,
      [UNITS.MINUTE]: 55,
      [UNITS.SECOND]: 55,
      [UNITS.MILLISECOND]: 500
    };

    const toCheck = {
      [UNITS.YEAR]: testMoment().year(values[UNITS.YEAR]),
      [UNITS.QUARTER]: testMoment().quarter(values[UNITS.QUARTER]),
      [UNITS.MONTH]: testMoment().month(values[UNITS.MONTH]),
      [UNITS.WEEK]: testMoment().week(values[UNITS.WEEK]),
      [UNITS.DAY_OF_YEAR]: testMoment().dayOfYear(values[UNITS.DAY_OF_YEAR]),
      [UNITS.DAY_OF_MONTH]: testMoment().date(values[UNITS.DAY_OF_MONTH]),
      [UNITS.DAY_OF_WEEK]: testMoment().day(values[UNITS.DAY_OF_WEEK]),
      [UNITS.HOUR]: testMoment().hour(values[UNITS.HOUR]),
      [UNITS.MINUTE]: testMoment().minute(values[UNITS.MINUTE]),
      [UNITS.SECOND]: testMoment().second(values[UNITS.SECOND]),
      [UNITS.MILLISECOND]: testMoment().millisecond(values[UNITS.MILLISECOND])
    };

    Object.entries(toCheck).forEach(([ unit, result ]) => {
      checkNode({
        operation: OPERATIONS.SET_DATE_PART,
        result: transformMomentDataToReturn(result),
        config: {
          [CONFIG_PROPS.UNIT]: unit,
          [CONFIG_PROPS.NUMBER_VALUE]: values[unit]
        }
      });

      checkNode({
        operation: OPERATIONS.SET_DATE_PART,
        result: result.format('MM'),
        config: {
          [CONFIG_PROPS.RESULT_FORMAT_STRING]: 'MM',
          [CONFIG_PROPS.UNIT]: unit,
          [CONFIG_PROPS.NUMBER_VALUE]: values[unit]
        }
      });
    });
  });

  it('should subtract', () => {
    checkAllUnitsManipulation(
      OPERATIONS.SUBTRACT,
      (input, unit, value) => input.subtract(value, unit)
    );
  });

  it('should get the start of time', () => {
    checkAllUnitsManipulation(
      OPERATIONS.START_OF_TIME,
      (input, unit) => input.startOf(unit)
    );
  });

  it('should convert to array', () => {
    checkNode({ operation: OPERATIONS.TO_ARRAY, result: testMoment().toArray() });
    checkNode({
      operation: OPERATIONS.TO_ARRAY,
      config: { [CONFIG_PROPS.TIMEZONE]: 'America/Denver' },
      result: testMoment().tz('America/Denver').toArray()
    });
  });

  it('should convert to object', () => {
    checkNode({ operation: OPERATIONS.TO_OBJECT, result: testMoment().toObject() });
    checkNode({
      operation: OPERATIONS.TO_OBJECT,
      config: { [CONFIG_PROPS.TIMEZONE]: 'America/Denver' },
      result: testMoment().tz('America/Denver').toObject()
    });
  });

  it('should convert to a unix timestamp (in milliseconds)', () => {
    checkNode({ operation: OPERATIONS.UNIX_TIMESTAMP_MS, result: testMoment().valueOf() });
  });

  it('should convert to a unix timestamp (in seconds)', () => {
    checkNode({ operation: OPERATIONS.UNIX_TIMESTAMP_S, result: testMoment().unix() });
  });

  it('should throw error if required fields are missing', () => {
    // No operation path provided
    checkMissing('Operation', {
      config: {
        [CONFIG_PROPS.OPERATION]: undefined
      }
    });

    // Check all operations that require units
    [
      OPERATIONS.ADD,
      OPERATIONS.SET_DATE_PART,
      OPERATIONS.SUBTRACT,
      OPERATIONS.GET_DATE_PART,
      OPERATIONS.START_OF_TIME
    ].forEach((operation) => {
      checkMissing('Unit', { operation });
    });

    // Check all operations that require a number value
    [
      OPERATIONS.ADD,
      OPERATIONS.SET_DATE_PART,
      OPERATIONS.SUBTRACT
    ].forEach((operation) => {
      checkMissing('Number', {
        operation,
        config: {
          [CONFIG_PROPS.UNIT]: UNITS.HOUR
        }
      });
    });
  });

  it('should throw error if invalid data is provided', () => {
    // Invalid operation passed
    checkBadEnum('Operation', { operation: 'invalidOperation' });

    // Invalid unit passed
    checkBadEnum('Unit', {
      operation: OPERATIONS.ADD,
      config: {
        [CONFIG_PROPS.UNIT]: 'invalidUnit'
      }
    });
  });

  it('still works without a supplied format string', () => {
    checkNode({
      operation: OPERATIONS.TO_ARRAY,
      config: {
        [CONFIG_PROPS.SOURCE_FORMAT_STRING]: undefined
      },
      result: testMoment().toArray()
    });
  });

  it('should put an error message on the payload path if the date is invalid', () => {
    const invalidDate = 'invalidDate';
    const result = { error: { type: 'InvalidType', message: `Invalid date: ${invalidDate}` } };
    const badResult = { type: 'InvalidType', message: `Invalid date: ${invalidDate}` };

    // Invalid source date
    const [, sourcePayload] = checkNode({
      result,
      operation: OPERATIONS.TO_ARRAY,
      extraDataIn: {
        in: invalidDate
      }
    });

    const sourceError = sourcePayload.data.out;
    sourceError.should.not.deepEqual(badResult);

    // Invalid diff date
    const [, diffPayload] = checkNode({
      result,
      operation: OPERATIONS.DIFF,
      extraDataIn: {
        diff: invalidDate
      },
      config: {
        [CONFIG_PROPS.DIFF_DATA_PATH]: 'data.diff'
      }
    });

    const diffError = diffPayload.data.out;
    diffError.should.not.deepEqual(badResult);
  });

  it('should default source time to "now" if no source path is provided', () => {
    const now = new Date();
    tk.freeze(now);

    checkNode({
      result: moment().clone().toObject(),
      operation: OPERATIONS.TO_OBJECT,
      config: {
        [CONFIG_PROPS.SOURCE_PATH]: ''
      }
    });
  });
});
