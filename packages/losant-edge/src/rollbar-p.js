import { compose, reject, objOf, unless, isNil } from 'omnibelt';
import rollbar from './rollbar.js';

const rollbarP = ({ message, err, custom }) => {
  custom = unless(isNil, objOf('custom'))(custom);
  const args = compose(reject(isNil))([message, err, custom]);

  return new Promise((resolve) => {
    rollbar.error(...args, resolve);
  });
};

export default rollbarP;
