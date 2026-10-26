# Workflow node authoring conventions

For the basic class shape, see
[`packages/losant-nodes/README.md`](../../packages/losant-nodes/README.md).
This is the deeper reference: patterns worth following (and gotchas worth
knowing) that aren't obvious from reading any single node file.

## Config comment block

Open the class with a typed config comment, e.g.
[`aws-lambda-node.js`](../../packages/losant-nodes/src/aws-lambda-node.js):

```javascript
/* Example Config:
{
  functionName: <String - Required: Lambda Function Name>,
  resultPath: <String - Optional: JSON Path of where to put the lambda result>,
  errorBehavior: <String - Optional: What to do with errors (throw || payloadPath)>
}
*/
```

Extract **every** config field explicitly in the constructor as `this.x = config.x`
— no nested structures buried in a generic value.

## Input mode pattern (method + value)

Several nodes let the workflow author choose *how* a value is sourced —
a literal template, a JSON template, or a payload path — via a paired
`xMethod` / `xValue`-shaped config, e.g. `datadog-logs-write-node.js`'s
`writeMethod` / `writeJsonTemplate` / `writePayloadPath`. Store **separate**
constructor properties per mode rather than one shared field — each mode's
raw config value has a different shape and resolution path, so collapsing
them into one field hides which mode's value is actually missing or
malformed when validation fails.

Use [`lib/resolve-value-by-lookup-type.js`](../../packages/losant-nodes/src/lib/resolve-value-by-lookup-type.js)
to resolve these rather than hand-rolling the branch — it already knows the
`payloadPath` / `jsonTemplate` / `stringTemplate` / `workflowPayload` modes
and can throw `MissingField` for you when a required value resolves to
nothing (`errorOnMissing: true`).

## Error handling: throw vs. `resultPath`

The key decision: **throw** for config/validation errors the workflow author
must fix; **`resultPath`** for runtime errors the workflow itself can handle
with a downstream Conditional node.

- **Throw** — synchronous validation, done as early as possible and generally
  outside any try block. Missing required config (`errors.MissingField`),
  invalid config values (`errors.Validation`). See `validateLog()` in
  `datadog-logs-write-node.js` for a validation function that throws before
  any network call is attempted.
- **`resultPath`** — wrap the actual work (network/API call) in a
  `try`/`catch`; on success write `{ success: true, ... }` to `resultPath`
  (if configured), on failure write `{ error: { type, message } }`. See
  `datadog-logs-write-node.js`'s `run()` for the full shape.

### `errorBehavior`: a minority of nodes let the workflow author choose

A few nodes (`aws-lambda-node.js`, `mongo-node.js`, `redis-node.js` as of this
writing) expose `errorBehavior: 'throw' | 'payloadPath'` so the *workflow
author* decides at design time whether a runtime failure should abort the
path or be written to the payload for handling. If you're adding this option
to a node, route it through the shared
[`lib/error-path.js`](../../packages/losant-nodes/src/lib/error-path.js)
helper — call it in your `catch` block instead of duplicating the
throw-or-write branch inline:

```javascript
} catch (err) {
  payload = errorPath(err, this, payload); // re-throws, or writes to payload, per this.errorBehavior
}
```

Most nodes don't need this option — only add it if there's a real use case
for letting the workflow itself catch and react to this node's failures.

## `outputIds` — return whatever nesting is natural

`run()`'s first return value is the ID (or IDs) of the next node(s) to run.
`losant-edge`'s runner (`packages/losant-edge/src/node-runner.js`) calls
`flatten()` on whatever you return before using it — so a node can return a
flat array (`conditional-node.js` returns `[4]`), or pass along an
already-nested array of arrays (`debug-node.js` returns its whole
constructor-stored `outputIds`, e.g. `[['nid1']]`), and both work. Don't
infer a single canonical shape from one node's source.

## Output shape: don't wrap a single result "for consistency"

When a node can operate on either one item or many, match the result shape to
the input — a single input produces a single object, not a one-element array.
Wrapping a single result in an array forces every downstream workflow to
index `[0]` for the common case.

## `context` vs. `payload`

- **`context`** — runtime metadata the workflow engine sets (`applicationId`,
  `flowId`, timeouts, `context.I` for instrumentation, etc). Never modified by
  nodes.
- **`payload`** — the data moving through the workflow. Read and write it via
  `losant-handlebars`' `lookup`/`set`/`remove`, never by mutating it directly.
  This is enforced twice: statically, `no-restricted-syntax` in the root
  `eslint.config.js` flags any assignment/`delete`/increment targeting a
  property of `payload`; at test time, `losant-nodes`' test harness freezes
  every payload before `run()` (see `docs/nodes/testing.md`), so a mutation
  that somehow slips past lint throws instead of silently succeeding.
