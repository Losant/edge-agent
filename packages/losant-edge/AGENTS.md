# AGENTS.md — losant-edge

Nested `AGENTS.md` for this package. See the root `AGENTS.md` for
repo-wide conventions first.

- **Node types** (`src/nodes/*.js`) follow the same contract as
  `losant-nodes` — same constructor shape, same config comment block, same
  `payloadHelper` usage. Read
  [`../../docs/nodes/authoring.md`](../../docs/nodes/authoring.md) before
  writing or editing one. The payload-mutation lint rule in the root
  `eslint.config.js` covers `src/nodes/**/*.js` here too.
- **Config/type layer** (`src/types/`, 84 files) is built on `tcomb`, not
  TypeScript. Read
  [`../../docs/edge-types.md`](../../docs/edge-types.md) before adding or
  changing a config struct.
- **Testing is not the same as `losant-nodes`.** `test/common.js` spins up a
  real LevelDB manager, a fake MQTT broker, an OPC-UA test server, and other
  hardware/protocol simulators — it does not freeze payloads the way
  `losant-nodes`' harness does. Read `test/common.js` and
  `scripts/run-test.sh` directly rather than assuming
  `docs/nodes/testing.md` applies as-is.

Run this package's tests with `pnpm edge:test`, lint with `pnpm edge:lint`.
