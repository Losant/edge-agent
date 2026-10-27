import { pick } from 'omnibelt';
import errors from './errors.js';

export const normalizeHBError = (error) => {
  const details = pick(['lineNumber', 'endLineNumber', 'column', 'endColumn', 'token', 'expected'], error);
  if (error.loc) {
    details.lineNumber = error.loc.first_line;
    details.endLineNumber = error.loc.last_line;
    details.column = error.loc.first_column;
    details.endColumn = error.loc.last_column;
  }

  let message = error.message;
  if (details.expected) {
    message = message.split('\nExpecting \'')[0];
  } else if (message.startsWith('You specified knownHelpersOnly')) {
    const helper = message.match(/unknown helper (.+) - /)?.[1];
    message = `Attempted to use an invalid helper: ${helper}`;
  }

  return errors.InvalidTemplate({ message, details });
};

export const applyHBParseErrorOverride = (hbInstance) => {
  hbInstance.compile('')(); // initializes parser
  hbInstance.Parser.yy.parseError = function(str, hash) {
    const error = new Error(str);
    Object.assign(error, hash);
    throw error;
  };
};
