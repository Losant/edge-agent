// Parses an HTTP Basic auth header (RFC 7617) into raw { username, password }.
// Returns null on any malformed input. Does NOT decode the userinfo further —
// callers that need RFC 6749 §2.3.1 form-urlencoded decoding must do it
// themselves on the returned values.
const parseBasicAuthHeader = (header) => {
  if (!header) { return null; }
  const parts = String(header).split(/\s+/);
  if (parts.length !== 2) { return null; }
  if (parts[0].toLowerCase() !== 'basic') { return null; }
  let credentials;
  try {
    credentials = Buffer.from(parts[1], 'base64').toString('utf8');
  } catch { return null; }
  const sep = credentials.indexOf(':');
  if (sep < 0) { return null; }
  return {
    username: credentials.slice(0, sep),
    password: credentials.slice(sep + 1)
  };
};

export default parseBasicAuthHeader;
