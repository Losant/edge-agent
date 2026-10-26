import { map } from 'omnibelt';

const ERROR_TYPE = 'LosantAgentConfigurationError';
const BASE_MSG = 'The following configuration errors were found:\n';
const CODE_MAP = {
  EACCES: 'Permission denied',
  ENOSPC: 'No space available on device',
  ENOENT: 'File not found',
  EROFS: 'Permission denied'
};

// :: String -> LosantAgentConfigurationError
export const configError = (message) => {
  const result = new Error();
  result.message = `${BASE_MSG}${message}`;
  result.type = ERROR_TYPE;

  return result;
};

// :: TcombValidationErrors -> LosantAgentConfigurationError
export const configErrorFromTcomb = (validationResult) => {
  return configError(
    map((err) => { return err.message; }, validationResult.errors).join('\n')
  );
};

// :: (Error, String) -> LosantAgentConfigurationError
export const configErrorFromException = (exception, additionalMsg) => {
  const message = CODE_MAP[exception.code] || `${exception.code || exception.name} error`;
  return configError(`${message} when attempting to ${additionalMsg}`);
};
