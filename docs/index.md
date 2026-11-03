# docs/

Deep reference for this repo — loaded on demand (by a nested `AGENTS.md`
pointer, or when you ask an agent to read one directly), not always-loaded
like the root `AGENTS.md`. See [`ai-setup.md`](./ai-setup.md) for how the
loading actually works.

- **[ai-setup.md](./ai-setup.md)** — how root/nested `AGENTS.md` and `docs/`
  fit together for Claude Code and other agent tools.
- **[nodejs-utils.md](./nodejs-utils.md)** — `losant-nodejs-utils` gotchas:
  fail-open SSRF hooks, the `ObjectId` dual-package hazard, `ljson.js` vs raw
  `JSON`.
- **[handlebars.md](./handlebars.md)** — `losant-handlebars` gotchas: `re2`
  ReDoS fallback, non-string `render()` results, non-block-helpers-only,
  template caching.
- **[edge-types.md](./edge-types.md)** — `losant-edge`'s `tcomb`-based
  runtime type layer (`src/types/`), the `Struct()` wrapper's `.keys`/
  `.unary` sugar, and the shared refinement/enum helpers.
- **nodes/[authoring.md](./nodes/authoring.md)** — workflow node conventions:
  config comment block, input-mode pattern, throw-vs-`resultPath` error
  handling, `errorBehavior`, and how `outputIds` nesting actually works.
- **nodes/[testing.md](./nodes/testing.md)** — `losant-nodes`' test harness:
  frozen payloads, no factories, `nock`/`sinon`/`timekeeper` auto-reset,
  and mocking third-party services instead of calling them.

Package-specific `AGENTS.md` files point into these; you don't need to read
this index to find them if you're already working inside a package.
