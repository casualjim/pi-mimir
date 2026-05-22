# pi-mimir

`pi-mimir` is a Pi workflow package for review-gated OpenSpec development.

It provides focused entrypoints for planning, implementation, and review while keeping generated OpenSpec sync/archive behavior explicit.

## Packages

- `packages/pi-mimir` — the Pi package: extension, agents, skill seeds, OpenSpec schema assets, and tests.
- `packages/advisor` — supporting package in this workspace.

## Main workflow

After installing the Pi package, initialize a repository with:

```text
/openspec:init
```

For full architecture-aware discovery, install and configure [codebase-memory MCP](https://github.com/DeusData/codebase-memory-mcp).

Primary skill entrypoints:

- `plan` — plan or refine an OpenSpec change through proposal, specs, design, tasks, and planning review gates.
- `implement` — implement an apply-ready OpenSpec change, verify it, run implementation review gates, and stop before archive.
- `review-plan` — run planning artifact review gates directly.
- `review-implementation` — run implementation review gates directly.

See [`packages/pi-mimir/README.md`](packages/pi-mimir/README.md) for usage and development details.

## Development

From the repository root, install workspace dependencies:

```bash
npm install
```

Run package checks from `packages/pi-mimir`:

```bash
cd packages/pi-mimir
npm test
npm run typecheck
```

## License

MIT
