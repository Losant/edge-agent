# losant-nodes

The 70 workflow node implementations shared between the Gateway Edge Agent
(`losant-edge`) and Losant's cloud workflow engine. A Conditional node, an HTTP
node, a JWT node — all behave identically whether they run on a gateway or in
the cloud, because it's the same code.

## The node contract

Every node is a class with the same shape:

```javascript
class MyNode {
  constructor(id, outputIds, config) {
    this.id = id;
    this.outputIds = outputIds;
    // config is the node's editor-configured settings
  }

  run(context, payload) {
    // payload is immutable — never mutate it in place.
    // Derive a new payload (e.g. via losant-handlebars' `set`/`remove`)
    // and return which output(s) to follow next.
    return [resultOutputIds, modifiedPayload];
  }
}

export default MyNode;
```

- **`id`** — the node's unique ID within its workflow.
- **`outputIds`** — the IDs of the node(s) that follow this one. A node with
  multiple outputs (like Conditional's true/false branches) picks which
  `outputIds` entry to return based on its own logic.
- **`config`** — settings configured in the Losant workflow editor.
- **`run(context, payload)`** returns a `[outputIds, payload]` tuple: which
  path(s) to follow, and the payload to hand to whatever runs next.

See [`conditional-node.js`](./src/conditional-node.js) for a minimal example.

See [`docs/nodes/authoring.md`](../../docs/nodes/authoring.md) and
[`docs/nodes/testing.md`](../../docs/nodes/testing.md) for conventions and
gotchas worth knowing before writing or changing a node.

## Testing

```bash
pnpm nodes:test
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
