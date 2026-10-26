import nock from 'nock';
import tk from 'timekeeper';

export const mochaHooks = {
  beforeEach: function() {
    tk.reset();
    nock.disableNetConnect();
    nock.cleanAll();
  }
};

export {
  tk
};
