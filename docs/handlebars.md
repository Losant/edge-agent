# losant-handlebars conventions

Non-obvious things worth knowing before changing this package. See
[`packages/losant-handlebars/README.md`](../packages/losant-handlebars/README.md)
for the public API surface.

## `render()` doesn't always return a string

A template that's a single bare path expression (`{{data.temp}}` and nothing
else) skips full Handlebars rendering entirely and returns the looked-up
value as-is — a number stays a number. Pass `castAsString: true` if you need
the stringified form regardless of template shape.

## Regex matching goes through `re2`, not the native `RegExp`

See [`src/get-re2.js`](../packages/losant-handlebars/src/get-re2.js). This is
to avoid catastrophic-backtracking ReDoS from user-authored templates and
expressions. If the native `re2` addon fails to load (e.g. no prebuilt binary
for the current platform), it silently falls back to `RegExp` — so a platform
without `re2` support loses the ReDoS protection without erroring.

## Only non-block helpers are registered

`src/helpers.js` explicitly disables Handlebars' own block helpers (`if`,
`unless`, `with`, `each`, `log`) and registers a flat set of expression-style
helpers instead (`format`, `lower`, `upper`, `trim`, comparisons, GPS/date
formatting, …). Templates here are not general-purpose Handlebars templates —
control flow isn't available.

## Compiled templates, paths, and expressions are cached by source string

LRU caches, `10,000` entries by default, tunable via the `LSHB_CACHE_SIZE` env
var. Building templates from highly dynamic, rarely-repeated strings works
but won't benefit from the cache and will churn it.
