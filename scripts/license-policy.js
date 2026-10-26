const parse = require('spdx-expression-parse');
const policy = require('./license-policy.json');

// `OR`: any side must be allowed. `AND`: every side must be allowed.
const satisfies = (node, allowed) => {
  if (node.license) { return allowed.has(node.license); }
  const left = satisfies(node.left, allowed);
  const right = satisfies(node.right, allowed);
  return node.conjunction === 'or' ? left || right : left && right;
};

const loadPolicy = (data = policy) => {
  Object.entries(data.overrides).forEach(([name, override]) => {
    if (!override.license || !override.reason) {
      throw new Error(`license-policy.json: override for "${name}" needs both "license" and "reason"`);
    }
  });
  return { allowed: new Set(data.allowed), overrides: data.overrides };
};

// Returns the license expression to report and a status:
// ok | denied | guessed | unparseable
const evaluate = (name, detected, { allowed, overrides }) => {
  const override = overrides[name];
  let license = override ? override.license : detected;
  if (Array.isArray(license)) { license = license.join(' OR '); }
  license = String(license).trim();

  // license-checker appends * when it guessed the license from a README or LICENSE file.
  if (!override && license.endsWith('*')) { return { license, status: 'guessed' }; }

  try {
    return { license, status: satisfies(parse(license), allowed) ? 'ok' : 'denied' };
  } catch {
    // Not an SPDX expression, e.g. "Public Domain" or "SEE LICENSE IN ...".
    return { license, status: allowed.has(license) ? 'ok' : 'unparseable' };
  }
};

module.exports = { evaluate, loadPolicy, satisfies };
