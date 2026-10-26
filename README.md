<h1 align="center">edge-agent</h1>

<p align="center">
  <strong>The Losant Gateway Edge Agent — run Losant's visual workflows on your own hardware.</strong>
</p>

<p align="center">
  <a href="./LICENSE"><img alt="License: Apache-2.0" src="https://img.shields.io/badge/license-Apache--2.0-000000.svg?style=for-the-badge&labelColor=000000"></a>
  <a href="./.node-version"><img alt="Node.js 24" src="https://img.shields.io/badge/node-24-000000.svg?style=for-the-badge&logo=node.js&logoColor=white&labelColor=000000"></a>
  <a href="https://pnpm.io"><img alt="pnpm workspace" src="https://img.shields.io/badge/pnpm-workspace-000000.svg?style=for-the-badge&logo=pnpm&logoColor=white&labelColor=000000"></a>
  <a href="https://docs.losant.com/edge-compute/gateway-edge-agent/overview/"><img alt="Documentation" src="https://img.shields.io/badge/docs-losant.com-000000.svg?style=for-the-badge&labelColor=000000"></a>
</p>

---

The Gateway Edge Agent (GEA) is a Docker container you run on a Linux machine
inside your own network. It talks to the equipment around it — PLCs, meters,
sensors — over industrial protocols, runs
[workflows](https://docs.losant.com/workflows/overview/) you built in Losant's
drag-and-drop editor, and reports back to the cloud over MQTT. When the internet
goes away, it keeps running and buffers what it would have sent.

This monorepo holds the agent and the four packages it's built from.

**New to Losant?** Start with the
[Gateway Edge Agent docs](https://docs.losant.com/edge-compute/gateway-edge-agent/overview/).
This README is about the source code.

## Where does this run?

The shape of it:

```
  your machines  ──►  a gateway running the agent  ──►  Losant cloud
  Modbus, BACnet,     your hardware, your network,      dashboards,
  OPC-UA, S7, …       your rules — works offline        data tables, API
```

The same picture, filled in:

```
  ON YOUR SITE                               │  IN THE CLOUD
  ───────────────────────────────────────────┼──────────────────────────
                                             │
   ┌─────┐   ┌────────┐   ┌────────┐         │
   │ PLC │   │ Sensor │   │ Meter  │         │
   └──┬──┘   └───┬────┘   └───┬────┘         │
      │ Modbus   │ BACnet     │ OPC-UA       │
      └──────────┼────────────┘              │
                 ▼                           │
   ┌─────────────────────────────────┐       │   ┌────────────────────┐
   │ Linux gateway hardware          │       │   │  Visual Workflow   │
   │                                 │       │   │       Editor       │
   │  ┌───────────────────────────┐  │       │   ├────────────────────┤
   │  │   Gateway Edge Agent      │  │ MQTT  │   │  ↓ deploy workflow │
   │  │   (Docker container)      │◄─┼───────┼──►│    versions        │
   │  │                           │  │       │   │  ↑ report state    │
   │  │   runs edge workflows     │  │       │   ├────────────────────┤
   │  │   buffers 65k messages    │  │       │   │  dashboards        │
   │  │   while offline           │  │       │   │  data tables       │
   │  └───────────────────────────┘  │       │   │  REST API          │
   └─────────────────────────────────┘       │   └────────────────────┘
                                             │
   ◄──────── the code in this repo           │   hosted by Losant ─────►
```

Two things follow from that picture, and they're the whole reason the agent
exists:

- **Latency and reachability.** A PLC on a plant floor is not on the public
  internet, and a control loop that has to round-trip to a data center is not a
  control loop. The logic runs next to the equipment.
- **Survivability.** Site connectivity drops. The agent keeps executing
  workflows, buffers up to 65,000 MQTT messages locally, and replays them when
  the link comes back.

Workflows themselves are still authored and versioned in Losant. You deploy a
workflow version to an
[Edge Compute device](https://docs.losant.com/devices/edge-compute/), the agent
picks it up over MQTT, and runs it locally from then on.

## What actually happens inside?

A workflow is a chain of nodes handing one **payload** along. Each node reads
the payload, does its job, and passes a new one to whatever comes next.

Here's a real one — read a temperature register, and if it's too hot, do
something about it — with the package responsible for each step named
underneath:

```
   ┌──────────┐    ┌─────────────┐    ┌──────────────┐    ┌─────────────┐
   │  Modbus  │    │ Conditional │    │ Run Function │    │Device State │
   │   Read   │───►│             │───►│              │───►│             │
   │ (trigger)│    │   (logic)   │    │   (logic)    │    │  (output)   │
   └────┬─────┘    └──────┬──────┘    └──────┬───────┘    └──────┬──────┘
        │                 │                  │                   │
   payload built     is the expression   your JavaScript,    publish over
   from a register   {{data.temp}} > 80  run in a sandboxed  MQTT — or buffer
   read              true for it?        child process       until reconnect
        │                 │                  │                   │
        ▼                 ▼                  ▼                   ▼
   losant-edge     losant-handlebars    losant-sandcastle    losant-edge
```

The nodes in the middle are the interesting part: `Conditional`, `Run
Function`, and every other node type live in `losant-nodes` — and it's the
*same code* that runs Losant's cloud workflow engine. A Conditional node
behaves identically whether it executes in a data center or on a gateway in a
basement. `losant-edge`'s job is everything around that: get real hardware
data into a payload, run the node chain, get the result back out — over MQTT,
to a file, to a register write, wherever the workflow says to send it.

## What's in this repo?

Five packages, in layers. Each layer may depend on any layer below it.

```
  ┌────────────────────────────────────────────────────────────────┐
  │ losant-edge           the agent — protocol clients, MQTT,      │
  │                       local store, workflow runtime            │
  ├────────────────────────────────────────────────────────────────┤
  │ losant-nodes          70 workflow node types, shared with      │
  │                       Losant's cloud workflow engine           │
  ├──────────────────────────────┬─────────────────────────────────┤
  │ losant-handlebars            │ losant-sandcastle               │
  │ paths, templates,            │ untrusted JavaScript, in an     │
  │ expressions                  │ isolated child process          │
  ├──────────────────────────────┴─────────────────────────────────┤
  │ losant-nodejs-utils   LJSON, ObjectId, hardened HTTP, SSRF     │
  │                       protections, cloud storage wrappers      │
  └────────────────────────────────────────────────────────────────┘
```

| Package | What it is | Scale |
| --- | --- | --- |
| **[losant-edge](./packages/losant-edge)** | The Gateway Edge Agent itself. Speaks Modbus, OPC-UA, BACnet, S7, EtherNet/IP, SNMP, ADS, and serial; keeps a local LevelDB store; embeds an MQTT broker. | the agent binary |
| **[losant-nodes](./packages/losant-nodes)** | Workflow node implementations, shared with Losant's cloud workflow engine. | 70 node types |
| **[losant-handlebars](./packages/losant-handlebars)** | Losant's path and templating engine. Resolves `{{data.temp}}` against a payload and evaluates workflow expressions. Handlebars underneath, RE2 for regex. | path + expression engine |
| **[losant-sandcastle](./packages/losant-sandcastle)** | Runs untrusted JavaScript — the code you type into a Function node — in a pooled, timed-out, memory-capped child process. | pluggable sandbox + pool |
| **[losant-nodejs-utils](./packages/losant-nodejs-utils)** | Node.js-only shared utilities: LJSON serialization, an SSRF-hardened axios, SSL validation, S3/GCS/Azure wrappers. | 30 utility modules |

One dependency lives outside this repo: **`losant-rest`**, the Losant API
client, used by `losant-edge` and `losant-nodes`. It's published separately from
[Losant/losant-rest-js](https://github.com/Losant/losant-rest-js).

## Running the agent

If you want to *use* the GEA rather than work on it, you don't need this repo —
you need a container and a set of device credentials:

```bash
docker run -d --name losant-edge-agent \
  -e "DEVICE_ID=<your edge compute device id>" \
  -e "ACCESS_KEY=<your access key>" \
  -e "ACCESS_SECRET=<your access secret>" \
  losant/edge-agent
```

The [installation guide](https://docs.losant.com/edge-compute/gateway-edge-agent/installation/)
covers hardware requirements, volume mounts for persistent storage, config
files, and connecting to local peripherals. Follow it rather than the snippet
above.

## Working on the code

Requires Node.js and pnpm at the versions pinned in
[`.node-version`](./.node-version) and the root
[`package.json`](./package.json)'s `packageManager` field.

```bash
pnpm install
pnpm test          # every package
pnpm lint
```

Each package gets the same four scripts, prefixed with its short name —
`edge`, `nodes`, `handlebars`, `sandcastle`, `nodejs-utils`:

```bash
pnpm nodes:test         # run one package's tests
pnpm nodes:lint         # lint one package
pnpm nodes:lint:fix     # lint and autofix
pnpm nodes:add <dep>    # add a dependency to one package
```

Tests are Mocha + `should`, in files named `*-spec.js`.

```
edge-agent/
├── packages/
│   ├── losant-edge/           the agent
│   ├── losant-nodes/          workflow node implementations
│   ├── losant-handlebars/     path + templating engine
│   ├── losant-sandcastle/     untrusted-JS sandbox
│   └── losant-nodejs-utils/   shared Node.js utilities
├── pnpm-workspace.yaml        workspace globs + dependency overrides
├── eslint.config.js
└── package.json               per-package script entry points
```

Two conventions worth knowing before you write anything:

- **ES modules throughout**, with file extensions in relative imports:
  `import foo from './foo.js';`
- **[omnibelt](https://www.npmjs.com/package/omnibelt) is the utility library**,
  not lodash. Import what you need: `import { has, mapP } from 'omnibelt';`

[`AGENTS.md`](./AGENTS.md) and [`docs/`](./docs/index.md) have the rest.

## Contributing

Issues and pull requests are welcome at
[Losant/edge-agent](https://github.com/Losant/edge-agent). See
[`CONTRIBUTING.md`](./CONTRIBUTING.md) for setup and conventions.

## Community

- [Losant Forums](https://forums.losant.com/) — questions, ideas, and help
- [Losant Documentation](https://docs.losant.com/)

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
