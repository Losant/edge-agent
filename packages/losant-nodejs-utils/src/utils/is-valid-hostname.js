import isValidHostname from 'is-valid-hostname';

export default (str) => {
  return str &&
    typeof(str) === 'string' &&
    isValidHostname(str);
};
