# losant-handlebars

Losant's path, templating, and expression engine. Resolves paths like
`data.temp` and templates like `{{data.temp}}` against a workflow payload, and
evaluates expressions like `{{data.temp}} > 80`. Built on Handlebars, but with
its own path/lookup layer and expression parser on top.

## Core exports (`src/index.js`)

- `render(template, payload, opts)` / `renderToString(...)` — render a
  template against a payload.
- `lookup(path, payload)` / `set(path, value, payload)` / `remove(path, payload)`
  — read/write/delete a path in a payload. `set`/`remove` return a *new*
  payload rather than mutating — this is what workflow nodes use to derive
  their output payload, per the immutable-payload rule.
- `evaluateExpression(expression, payload, opts)` — evaluate a boolean/logical
  expression (used by nodes like Conditional).
- `isValidPath` / `isValidTemplate` / `isValidJsonTemplate` /
  `isValidExpression` — validate without executing arbitrary side effects.

See [`docs/handlebars.md`](../../docs/handlebars.md) for implementation
conventions and gotchas worth knowing before changing this package.

## Testing

```bash
pnpm handlebars:test
```

## License

Copyright (c) 2026 SUSE

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

[http://www.apache.org/licenses/LICENSE-2.0](http://www.apache.org/licenses/LICENSE-2.0)

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
