// Captures the named env vars before each test and restores them afterward,
// deleting any that were originally unset. Call inside a describe block.
export const restoreEnv = (...envNames) => {
  let originals;
  beforeEach(() => {
    originals = Object.fromEntries(envNames.map((name) => [name, process.env[name]]));
  });
  afterEach(() => {
    envNames.forEach((name) => {
      if (originals[name] === undefined) { delete process.env[name]; } else { process.env[name] = originals[name]; }
    });
  });
};
