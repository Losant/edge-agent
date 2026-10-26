# AI Setup (Claude Code)

## How it works

Claude Code (and other agent tools that follow the [agents.md](https://agents.md)
convention) read instructions from several places:

| Source | Loaded | Committed |
|---|---|---|
| `AGENTS.md` (root) | always | yes |
| `packages/<pkg>/AGENTS.md` (nested) | when working in that package | yes |
| `docs/` | on demand, when something points an agent at a file | yes |
| `~/.claude/CLAUDE.md` | always | no — your machine, all projects |

**Nested `AGENTS.md` files are the primary, zero-setup mechanism in this
repo.** `losant-edge`, `losant-nodes`, `losant-nodejs-utils`,
`losant-handlebars`, and `losant-sandcastle` each have one, and every agent
that follows the convention reads the nearest `AGENTS.md` to whatever file
it's touching — nobody has to configure anything.

## Verifying it loaded

Open a file in a package with a nested `AGENTS.md`, ask Claude Code to read
it, then run `/memory` — the loaded `AGENTS.md` files appear in the loaded
files list.
