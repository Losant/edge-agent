# AGENTS.md — losant-handlebars

Nested `AGENTS.md` for this package. See the root `AGENTS.md` for
repo-wide conventions first.

**Read [`../../docs/handlebars.md`](../../docs/handlebars.md) before changing
anything in `src/`.** The short version:

- Regex goes through `re2` (`src/get-re2.js`), not native `RegExp`, to avoid
  ReDoS from user-authored templates — but it silently falls back to
  `RegExp` if the native addon fails to load. Don't remove the `re2` import
  without understanding that fallback.
- `render()` doesn't always return a string — a single bare path expression
  (`{{data.temp}}`) returns the looked-up value as-is. Pass
  `castAsString: true` if you need a string regardless.
- Only non-block helpers are registered (`if`/`unless`/`with`/`each`/`log`
  are disabled). Don't assume general-purpose Handlebars control flow works
  in a Losant template.
- Templates/paths/expressions are cached by source string (LRU,
  `LSHB_CACHE_SIZE` env var). Building from highly dynamic strings works but
  churns the cache.

Run this package's tests with `pnpm handlebars:test`, lint with
`pnpm handlebars:lint`.
