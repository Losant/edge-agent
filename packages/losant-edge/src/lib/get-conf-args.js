import fs from 'fs-extra';
import toml from '@iarna/toml';
import logger from '../logger/index.js';

export default async (confPath) => {
  try {
    return toml.parse(
      await fs.readFile(confPath, 'utf8')
    );
  } catch {
    logger.warn(`Unable to read and parse agent config file at expected path: ${confPath}`);
    logger.warn('Attempting startup using configuration from only environment variables and command line flags.');
    return {};
  }
};
