import { pathToEdgeTestToml, sinon, restoreEnv } from './common.js';
import SeniorManager from '../src/senior-manager.js';
import { shutdown as nodeManagerShutdown } from '../src/node-manager.js';
import logger from '../src/logger/index.js';

describe('Senior Manager', function() {
  restoreEnv('CONF_PATH');

  afterEach(async () => {
    await SeniorManager.shutdown().catch(() => {});
    await nodeManagerShutdown();
  });

  it('should allow loading again after a load throws', async () => {
    process.env.CONF_PATH = pathToEdgeTestToml;
    sinon.stub(logger, 'reconfigure').throws(new Error('reconfigure failed'));

    await SeniorManager.load({}).should.be.rejectedWith('reconfigure failed');
    sinon.restore();

    const warn = sinon.stub(logger, 'warn');
    await SeniorManager.load({});
    warn.calledWith('Failed to reload agent, load already in progress').should.equal(false);
    SeniorManager.managers.levelManager.should.be.ok();
  });

  it('should refuse a second load while one is in progress', async () => {
    process.env.CONF_PATH = pathToEdgeTestToml;
    const warn = sinon.stub(logger, 'warn');

    await Promise.all([SeniorManager.load({}), SeniorManager.load({})]);
    warn.calledWith('Failed to reload agent, load already in progress').should.equal(true);
  });
});
