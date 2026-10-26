# Contributing to edge-agent

## Setup

```bash
pnpm install
```

## Before opening a PR

```bash
pnpm verify   # lint + full test suite
```

`pnpm verify` is the single gate CI runs (split across
`.github/workflows/lint.yml` and `.github/workflows/test.yml`) — run it
locally before pushing. A `pre-commit` hook also runs `pnpm lint` on every
commit.

To work on a single package instead of the whole repo:

```bash
pnpm <package>:lint
pnpm <package>:test   # e.g. pnpm nodes:test, pnpm edge:test
```

Some tests need Redis, Mongo, or an MQTT broker; if they aren't running, the
test run stops and says so. `pnpm test:env:up` starts them in Docker and
`pnpm test:env:down` stops them. See the testing section of
[`AGENTS.md`](./AGENTS.md).

## Code conventions

See [`AGENTS.md`](./AGENTS.md) and [`docs/`](./docs) — the same conventions
that apply to AI coding agents working in this repo apply to human
contributors too: ES modules with required file extensions, `omnibelt` over
lodash, and the package-specific gotchas under `docs/`.

## Commit messages

Follow [Conventional Commits](https://www.conventionalcommits.org/)
(`type(scope): summary`), terse — one line unless a commit genuinely needs
more explanation.

## Pull requests

- Keep PRs focused — one change per PR.
- Make sure `pnpm verify` passes before requesting review.
- Describe *why* the change is needed, not just what changed.
