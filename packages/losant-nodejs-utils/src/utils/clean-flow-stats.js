import { clamp } from 'omnibelt';

const MAX_NAME = 255;
const MAX_MESSAGE = 1024;
const MAX_ERRORS = 5;
const MAX_STAT_VALUE = 2147483647; // maximum positive value for a 32-bit signed integer

const cleanupErrors = (errors) => {
  const finalErrors = [];
  const seenErrors = new Set();
  for (const err of errors) {
    if (finalErrors.length >= MAX_ERRORS) { break; }
    if (err?.error?.name) {
      const cleanError = {
        error: {
          name: `${err.error.name}`.slice(0, MAX_NAME)
        }
      };
      if (err.nodeId) {
        cleanError.nodeId = `${err.nodeId}`.slice(0, MAX_NAME);
      }
      // uniq errors by node id and error name
      const errorKey = `${cleanError.nodeId}-${cleanError.error.name}`;
      if (!seenErrors.has(errorKey)) {
        seenErrors.add(errorKey);
        if (err.error.message) {
          cleanError.error.message = `${err.error.message}`.slice(0, MAX_MESSAGE);
        }
        finalErrors.push(cleanError);
      }
    }
  }
  return finalErrors;
};

export default (stats = {}, encodeErrors = false) => {
  const cleanStats = {};
  ['time', 'wallTime', 'runCount', 'pathsCompleted', 'pathsFailed'].forEach((field) => {
    const curVal = stats[field];
    if (typeof(curVal) === 'number' && curVal >= 0) {
      cleanStats[field] = field === 'time' ? curVal : clamp(0, MAX_STAT_VALUE, curVal);
    }
  });

  if (!cleanStats.runCount) { return null; } // if there were no runs, there are no stats to report
  if (!cleanStats.wallTime) { cleanStats.wallTime = 1; } // if there were runs, runs take time

  if (Array.isArray(stats.errors) && stats.errors.length > 0) {
    if (!cleanStats.pathsFailed) { cleanStats.pathsFailed = stats.errors.length; }
    const cleanErrors = cleanupErrors(stats.errors);
    if (cleanErrors.length > 0) {
      if (encodeErrors) {
        cleanStats.errors = Buffer.from(JSON.stringify(cleanErrors)).toString('base64');
      } else {
        cleanStats.errors = cleanErrors;
      }
    }
  }
  return cleanStats;
};
