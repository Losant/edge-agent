# losant-nodejs-utils conventions

Non-obvious things worth knowing before changing this package. See
[`packages/losant-nodejs-utils/README.md`](../packages/losant-nodejs-utils/README.md)
for what's actually in it.

## `axios.js` is fail-open by default

The wrapper accepts a `resolveCustomAgents` hook for injecting
`httpAgent`/`httpsAgent` based on the request's destination — but with nothing
registered, requests go out exactly as passed, unchecked. Any network-access
policy (blocking internal IPs, enforcing an allowlist, etc.) is the *caller's*
responsibility to install; this package has no opinion of its own. Same
pattern in `utils/verify-hosts.js`'s `setDnsLookup` — it defaults to plain
`dns.lookup`, and "which addresses are safe" is left entirely to whoever calls
`setDnsLookup()`.

Both hooks throw if you try to register a second, different function without
first passing `null` to clear the old one — that's deliberate, so two call
sites can't silently stomp on each other's policy.

## `ObjectId` is re-exported via `require()`, not `import`

`bson` ships separate CJS and ESM builds, each defining its own `ObjectId`
class. The `mongodb` driver loads `bson` via CJS, so an ESM import here would
produce a class that fails `instanceof` checks against real query results.
`bson.js` forces `createRequire()` specifically to land on the same class the
driver uses.

## Use `ljson.js`, not raw `JSON`, for anything crossing a payload boundary

LJSON round-trips types plain JSON can't — `Date`, `ObjectId`, `RegExp` — via a
`$oid`/`$regex`-style wire format. Mixing `JSON.stringify` and `LJSON.parse`
(or vice versa) across a serialization boundary silently degrades those
values to strings.
