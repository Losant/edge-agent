# AGENTS.md — losant-nodes

Nested `AGENTS.md` for this package. See the root `AGENTS.md` for
repo-wide conventions first.

Before writing or editing a node:

- **Read [`../../docs/nodes/authoring.md`](../../docs/nodes/authoring.md)** —
  config comment block, input-mode pattern, throw-vs-`resultPath` error
  handling, the `errorBehavior`/`error-path.js` convention, and how
  `outputIds` nesting actually works (it's not what it looks like from one
  file — the runner flattens it).
- **Read [`../../docs/nodes/testing.md`](../../docs/nodes/testing.md)**
  before writing tests — payloads are frozen during tests, so a node that
  mutates its payload in place will throw. No factories, no database; build
  nodes and payloads inline.

Run this package's tests with `pnpm nodes:test`, lint with `pnpm nodes:lint`.
