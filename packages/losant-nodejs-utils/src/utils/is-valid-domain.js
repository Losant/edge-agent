import isValidDomain from 'is-valid-domain';

export default (str, opts) => {
  return str &&
    typeof(str) === 'string' &&
    isValidDomain(str, opts);
};
