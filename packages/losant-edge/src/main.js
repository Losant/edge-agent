import SeniorManager from './senior-manager.js';
import { shutdown as nodeManagerShutdown } from './node-manager.js';

// :: Command -> Gateway
export default async (command = {}) => {
  await SeniorManager.load(command);
  const reloadManagers = () => { SeniorManager.load(command, true); };
  process.on('SIGHUP', reloadManagers);

  return {
    gateway: () => { return SeniorManager.managers.gateway; },
    shutdown: async () => {
      process.removeListener('SIGHUP', reloadManagers);
      await SeniorManager.shutdown();
      await nodeManagerShutdown();
    }
  };
};
