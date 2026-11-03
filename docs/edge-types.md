# losant-edge's type layer

`losant-edge/src/types/` (84 files) defines runtime-validated shapes using
[`tcomb`](https://github.com/gcanti/tcomb) — not TypeScript, not JSDoc. Every
config object, MQTT message shape, trigger config, and flow shape the agent
handles is a `tcomb` type, validated at runtime, not just documented in a
comment.

## Two ways a type is built

Most data-shaped types (e.g. [`flow.js`](../packages/losant-edge/src/types/flow.js))
call `tcomb`'s `t.struct` directly.

Some types — mostly config structs that need to be introspected or
constructed generically, like
[`cli-args.js`](../packages/losant-edge/src/types/cli-args.js) — go through
the repo's own [`types/lib/struct.js`](../packages/losant-edge/src/types/lib/struct.js)
wrapper instead of `t.struct`. It adds two things `t.struct` doesn't have:

- **`.keys`** — the struct's own prop names as a plain array, so other code
  can `pick`/`omit`/`map` over them without hardcoding the field list. Real
  usage: `CliArgs.keys` in
  [`lib/normalize-args.js`](../packages/losant-edge/src/lib/normalize-args.js)
  and [`lib/flow-env-vars.js`](../packages/losant-edge/src/lib/flow-env-vars.js).
- **`.unary`** — a single-argument curried constructor, usable directly in a
  functional pipe. Real usage: `CliArgs.unary` in
  [`lib/get-env-args.js`](../packages/losant-edge/src/lib/get-env-args.js).

If you're adding a new config struct that other code needs to introspect
(rather than just validate), use `Struct()` from `types/lib/struct.js`, not
`t.struct` directly.

## Shared building blocks (`types/lib/`)

- **`refinements.js`** (146 lines) — reusable validated primitive types:
  `DeviceId`, `AccessKey`, `AccessSecret`, `FilePath`, `ServerPort`,
  `ServerAddress`, `SslKey`, `SslCertificate`, `BrokerProtocol`, etc. Reach
  for one of these instead of `t.String`/`t.Number` when the field has a
  real shape constraint.
- **`enums.js`** — builds a `tcomb` refinement from a plain array of allowed
  values (`Enums(['a', 'b', 'c'], 'MyEnum')`), with a nicer validation
  message than a bare `t.enums.of` gives you.
- **`custom.js`** — the underlying custom-validator factory both of the
  above build on; produces tcomb-compatible types with human-readable
  validation messages (`"{Field} is required"`, `"The provided {Field}
  ({value}) is invalid"`).

## A barrel file exists, but isn't the dominant import style

[`types/index.js`](../packages/losant-edge/src/types/index.js) re-exports
every type by name, but most real call sites import individual type files
directly (e.g. `from '../types/flow.js'`) rather than through the barrel.
Either works; don't assume one is required.
