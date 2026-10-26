# Testing workflow nodes

## Running tests

```bash
pnpm nodes:test
pnpm nodes:test --grep "ConditionalNode"   # filter to one node
```

## Test harness (`test/common.js`)

Every node test file gets this for free, via Mocha's root hooks — no manual
setup or teardown needed:

- **Payloads are frozen (`updeep`'s `u.freeze`) before every `run()` call.**
  A node that mutates its payload in place, instead of going through
  `losant-handlebars`' `set`/`remove`, throws during tests. This is the real
  enforcement of the immutable-payload rule — don't work around it by
  deep-cloning the payload yourself in a test.
- `nock` is activated and network connections are disabled by default; any
  request a node makes must be mocked. Unconsumed `nock` mocks fail the test
  ("Pending Nocks") in `afterEach`.
- `sinon` (a shared sandbox, exported as `sinon` from `common.js`) is
  auto-restored after every test.
- `timekeeper` is reset every test.

## Node setup: construct inline, no factories

There's no database and no factory layer in this package — build the node
and its `context`/`payload` inline, per test:

```javascript
import './common.js';
import ConditionalNode from '../src/conditional-node.js';

const node = new ConditionalNode('id', [[5], [4]], { expression: '{{foo}} < {{bar}}' });
const [outputIds, payload] = node.run({}, { foo: 1, bar: 2 });
```

Remember `outputIds` in the constructor is an array of arrays (see
`docs/nodes/authoring.md`) — `[[5], [4]]` means "output 0 goes to node 5,
output 1 goes to node 4", not "outputs 5 and 4".

## Asserting on throws vs. `resultPath`

- Pre-validation errors **throw** — test with `.should.be.rejectedWith(...)`
  (for `async run()`) or a synchronous `.should.throw(...)`.
- Runtime errors land on `resultPath` — test by asserting on the returned
  payload, e.g. `result.result.error.type.should.equal('...')`.

## Mock third-party services, never call them

Tests must pass with no credentials and no outbound access to real cloud
services. Mock the HTTP layer with `nock` (use `fakeGoogleCredentials` and the
other fake constants in
[`losant-nodejs-utils/test/utils/testing-constants.js`](../../packages/losant-nodejs-utils/test/utils/testing-constants.js)
where the SDK needs a credential), or `sinon`-stub the SDK client when it
doesn't talk plain HTTP — see `snowflake-node-spec.js`,
`google-publish-node-spec.js`, and `azure-event-hub-publish-spec.js`.
Infrastructure we can run locally (Redis, Mongo, mosquitto) is the exception:
use `describeService()` for those (see the root `AGENTS.md`).

## Test both the single and the collection case

If a node accepts one or multiple items and returns a different shape for
each (see `docs/nodes/authoring.md` → Output shape), write one test for the
single-input → single-object case, and one for the multiple-input → array
case.
