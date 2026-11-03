# AGENTS.md — losant-nodejs-utils

Nested `AGENTS.md` for this package. See the root `AGENTS.md` for
repo-wide conventions first.

**Read [`../../docs/nodejs-utils.md`](../../docs/nodejs-utils.md) before
changing anything in `src/`.** The short version:

- `axios.js` and `verify-hosts.js` are fail-open — no network-access policy
  is enforced unless a caller installs one via `resolveCustomAgents` /
  `setDnsLookup`. Don't add code here that assumes requests are pre-filtered.
- `bson.js` re-exports `ObjectId` via `require()`, not `import` — this is
  deliberate (dual-package hazard with the `mongodb` driver's own `ObjectId`
  class). Don't "simplify" it to an ESM import.
- Use `ljson.js`, not raw `JSON`, for anything that crosses a payload
  boundary — it round-trips types plain JSON can't.

Run this package's tests with `pnpm nodejs-utils:test`, lint with
`pnpm nodejs-utils:lint`.
