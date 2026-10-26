import cleanStats from '../src/utils/clean-flow-stats.js';

const MAX_STAT_VALUE = 2147483647;

describe('Clean Flow Stats', () => {

  it('should constrain flow stat values', () => {
    const time = 1663560372021;
    const flowStats = {
      time,
      wallTime: 2e20,
      runCount: 1e20,
      pathsCompleted: 1e12,
      pathsFailed: 1e12
    };
    const cleanedFlowStats = cleanStats(flowStats);
    cleanedFlowStats.should.deepEqual({
      time,
      wallTime: MAX_STAT_VALUE,
      runCount: MAX_STAT_VALUE,
      pathsCompleted: MAX_STAT_VALUE,
      pathsFailed: MAX_STAT_VALUE
    });
  });

});
