# AGENTS.md — losant-sandcastle

Nested `AGENTS.md` for this package. See the root `AGENTS.md` for
repo-wide conventions first, and this package's own
[`README.md`](./README.md) — its API Reference and Architecture sections are
the real reference, not duplicated here.

- The default sandbox (`src/unsafe-sandbox.js`) uses Node's `vm` module and
  shares the host process/event loop — treat it as basic isolation, not
  strong multi-tenant isolation. A custom sandbox implements `BaseSandbox`
  (`src/base-sandbox.js`): override `shouldUseAsync()` and
  `runWrappedSource()`.
- IPC between the parent process and the sandboxed child is Unix domain
  sockets with length-prefixed streams — see `bin/sandcastle.js` and
  `src/script.js` before changing the process-boundary protocol.

Run this package's tests with `pnpm sandcastle:test`, lint with
`pnpm sandcastle:lint`.
