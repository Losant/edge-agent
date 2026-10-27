# AGENTS.md

Guidance for AI coding agents working in this repository. See `docs/ai-setup.md`
for how this file, nested `AGENTS.md` files, and `docs/` fit together.

## Project overview

A pnpm workspace monorepo holding the Losant Gateway Edge Agent (`losant-edge`)
and its four supporting packages (`losant-nodes`, `losant-handlebars`,
`losant-sandcastle`, `losant-nodejs-utils`). See the root `README.md` for what
the agent is and how the packages relate.

**Monorepo note:** `losant-edge`, `losant-nodes`, `losant-nodejs-utils`,
`losant-handlebars`, and `losant-sandcastle` each have their own nested
`AGENTS.md` with package-specific conventions. The nearest `AGENTS.md` to the
file you're editing takes precedence — read it before changing code in that
package.

## Setup commands

```bash
pnpm install
```

pnpm version is pinned via `packageManager` in the root `package.json` —
use that version, not whatever's on `PATH`.

## Code style

- ES6 `import`/`export` throughout (all packages are `"type": "module"`).
- Import specific functions from utilities: `import { has, mapP } from 'omnibelt';`
- File extensions required in imports: `import foo from './foo.js';`
- **omnibelt** is the primary utility library (not lodash).
- **losant-nodejs-utils** provides `LJSON` (extended-type JSON serialization)
  and `ObjectId` (from its `bson.js`) — use these, not raw `bson`/`JSON`, for
  anything that crosses a workflow payload boundary. See
  `docs/nodejs-utils.md` before changing that package.

## Testing instructions

- Backend tests: Mocha + `should`, files named `*-spec.js`.
- Run everything: `pnpm test`. Run a single package's tests:
  `pnpm <package>:test` (e.g. `pnpm edge:test`, `pnpm nodes:test`).
- Lint: `pnpm lint`, or `pnpm <package>:lint` / `pnpm <package>:lint:fix` for
  one package.
- Licenses: `pnpm licenses:check` (needs `pnpm install:scripts` once) fails if
  any dependency's license isn't allowed. The policy is
  `scripts/license-policy.json`: add a license to `allowed`, or add an
  `overrides` entry with a `reason` for a package whose metadata is wrong or
  missing. CI runs it on every PR.
- Some suites need a real service. Before any test runs, `edge:test` and
  `nodes:test` check that their services are reachable and **fail the run**
  with instructions if one is not:

  | Service | Host env var (default `localhost`) | Needed by |
  |---|---|---|
  | Redis 6379 | `REDIS_HOST_CI` | edge `redis-manager-spec.js`, nodes `redis-node-spec.js` |
  | Redis cluster 7379 | `REDIS_HOST_CLUSTER` | nodes `redis-node-spec.js` (cluster block) |
  | Mongo 27017 | `MONGO_HOST_CI` | nodes `mongo-node-spec.js` |
  | mosquitto 1888 | `MOSQUITTO_HOST` | edge `mqtt-client-manager-spec.js` (MQTT 5 block) |

  ```bash
  pnpm test:env:up     # start the services in Docker
  pnpm nodes:test
  pnpm test:env:down   # stop them
  ```
  `test:env:up` reuses any service already answering on its port (e.g. a
  Redis or Mongo from another project's test stack) and only starts the
  rest; `test:env:down` only stops what it started. The check and
  `describeService()` live in
  `packages/losant-nodejs-utils/test/utils/test-services.js` — use
  `describeService('<service>', ...)` for any new suite that needs one.
- The compose files behind those services and test runs:

  | File | Used by | What it is |
  |---|---|---|
  | `scripts/test-infra/compose-services.yml` | `compose-ci.yml` and `compose-local.yml` | The redis, redis cluster, mongo and mosquitto definitions, kept in one place |
  | `scripts/test-infra/compose-test-base.yml` | `compose-ci.yml` | The base test runner: mounts the repo and points the host env vars at the service names |
  | `scripts/test-infra/compose-ci.yml` | GitHub Actions (`.github/workflows/test.yml`) | Runs any package's tests with its services |
  | `scripts/test-infra/compose-local.yml` | `pnpm test:env:up` | The services published on localhost for tests run on your machine |
- No test needs third-party credentials or a live cloud account: mock those
  services with `nock` or `sinon` stubs (see `docs/nodes/testing.md`).
- If a suite finishes but the process never exits, a test leaked a handle
  (socket, server, timer). Close resources in `finally`/`after` hooks, not at
  the end of the test body.

## Security considerations

- **`losant-nodejs-utils`' `axios.js` and `verify-hosts.js` are fail-open by
  default** — no SSRF/network-access policy is enforced unless a caller
  registers one via `resolveCustomAgents` (`src/axios.js:70`) or
  `setDnsLookup` (`src/utils/verify-hosts.js:40`). Don't assume outbound
  requests through this package are safe by default. See
  `docs/nodejs-utils.md`.
- **`losant-handlebars` uses `re2` instead of native `RegExp`**
  (`src/get-re2.js:5`) to avoid ReDoS from user-authored templates/
  expressions, but silently falls back to `RegExp` if the native addon fails
  to load (`src/get-re2.js:6`). See `docs/handlebars.md`.
- **`losant-sandcastle`'s default sandbox (`src/unsafe-sandbox.js`) uses
  Node's `vm` module** (`vm.Script`/`vm.createContext`, line 40-41), which
  shares the host process/event loop — it is not strong isolation. Don't
  treat it as safe for untrusted, multi-tenant code without a custom sandbox
  (see that package's README).

## Losant Workflow Node Implementations

Workflow nodes (in `losant-nodes`, and node types embedded in `losant-edge`) follow this pattern:

```javascript
class MyNode {
  constructor(id, outputIds, config) {
    this.id = id;
    this.outputIds = outputIds;
  }

  run(context, payload) {
    // payload is immutable — use losant-handlebars methods to derive a new payload
    return [resultOutputIds, modifiedPayload];
  }
}

export default MyNode;
```

See `docs/nodes/authoring.md` and `docs/nodes/testing.md` for the full
conventions (error handling, `outputIds` shape, test harness behavior).

## Non-obvious details

- **pnpm version**: must match `packageManager` in root `package.json`.
- **`losant-rest`** (the Losant API client used by `losant-edge` and `losant-nodes`) is an external dependency, not part of this workspace — published from [Losant/losant-rest-js](https://github.com/Losant/losant-rest-js).

## Pull requests

Run `pnpm verify` (lint + full test suite) before committing — or at minimum
the affected package's `:lint`/`:test` scripts — and make sure it passes
clean. A `pre-commit` hook already runs `pnpm lint` for you.
