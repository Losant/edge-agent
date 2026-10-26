# losant-nodejs-utils

Shared, Node.js-only utility library used by `losant-edge`, `losant-nodes`, and
`losant-sandcastle`. Not for browser/frontend use.

## What's in here

- **`bson.js`** — `ObjectId` and `EJSON`.
- **`ljson.js`** / **`ljson-lite.js`** — LJSON, an extended-type JSON
  serialization format that round-trips values plain `JSON` can't (dates,
  `ObjectId`, `RegExp`, etc.).
- **`axios.js`** — a pre-configured axios instance with LJSON-aware response
  parsing and an extension point for network-access policy.
- **`csv.js`** — CSV encode/decode helpers.
- **`errors.js`** — shared typed errors (`Validation`, `NotFound`,
  `MissingField`, …), each carrying a `statusCode` where one applies.
- **`utils/`** — SSL validation, DNS/host verification, S3/GCS/Azure storage
  wrappers, semver, redaction, and more.
- **`constants/`** — shared constants (time, size, encoding lists, JWT
  algorithms).

See [`docs/nodejs-utils.md`](../../docs/nodejs-utils.md) for implementation
conventions and gotchas worth knowing before changing this package.

## Testing

```bash
pnpm nodejs-utils:test
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
