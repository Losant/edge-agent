export default ({ statusCode, defaultCode }) => {
  statusCode = Math.floor(Number(statusCode));
  if (!isFinite(statusCode) || statusCode < 100 || statusCode > 599) {
    return defaultCode;
  }
  return statusCode;
};
