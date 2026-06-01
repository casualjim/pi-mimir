# pi-mimir

`pi-mimir` is a Pi package monorepo for review-gated OpenSpec workflows, codebase-memory discovery support, forked advisor guidance, Cavekit specs, and Caveman terse mode.

## Workspace packages

- `packages/pi-mimir` — `@casualjim/pi-mimir`; OpenSpec extension, workflow skills, role agents, review-gated schema assets, and tests.
- `packages/pi-codebase-memory` — `@casualjim/pi-codebase-memory`; standalone codebase-memory MCP setup plugin, raw-discovery reminders, and public `codebase-memory` skill.
- `packages/advisor` — `@casualjim/pi-advisor`; forked child advisor extension, `/advisor` command, `advisor` tool, and packaged `advisor-child` agent.
- `packages/pi-cavekit` — `@casualjim/pi-cavekit`; Pi prompt templates and skills for root `SPEC.md` workflows.
- `packages/pi-caveman` — `@casualjim/pi-caveman`; terse-mode skills, Cavecrew guidance, and Pi-native Caveman extension hooks.

## Install in Pi

Install whichever packages you need:

```text
pi install npm:@casualjim/pi-mimir
pi install npm:@casualjim/pi-codebase-memory
pi install npm:@casualjim/pi-advisor
pi install npm:@casualjim/pi-cavekit
pi install npm:@casualjim/pi-caveman
```

For local development from this checkout, install package paths instead:

```text
pi install ./packages/pi-mimir
pi install ./packages/pi-codebase-memory
pi install ./packages/advisor
pi install ./packages/pi-cavekit
pi install ./packages/pi-caveman
```

## OpenSpec workflow

After installing `@casualjim/pi-mimir`, initialise a target repository with:

```text
/openspec:init
```

`/openspec:init` runs `openspec init --tools pi`, sets `openspec/config.yaml` to the `review-gated` schema, syncs OpenSpec schema/project-state assets, exposes packaged skills without copying them into `.pi/skills`, syncs role agents into `~/.pi/agent/agents`, and reports whether codebase-memory tools are active.

Primary skill entrypoints:

- `plan` — compose generated proposal/spec/design/task behaviour with one holistic planning review.
- `implement` — apply an implementation-ready OpenSpec change, verify it, and stop before archive. Implementation review is separate and explicit.
- `review-plan` — run a standalone planning review over existing planning artifacts.
- `review-implementation` — run a standalone implementation review over implementation evidence.

`@casualjim/pi-mimir` does not commit, push, create pull requests, archive changes, or run branch-finishing workflows.

For full architecture-aware discovery, install and activate the separate codebase-memory package:

```text
pi install npm:@casualjim/pi-codebase-memory
```

Without active `codebase_memory_*` tools, workflows must report degraded discovery and use exact reads or shell inspection as fallback.

See [`packages/pi-mimir/README.md`](packages/pi-mimir/README.md) for detailed usage.

## Cavekit and Caveman

`@casualjim/pi-cavekit` provides:

```text
/ck:spec
/ck:build
/ck:check
```

It uses project-root `SPEC.md` as the durable spec artifact and bundles `FORMAT.md` as reference material.

`@casualjim/pi-caveman` provides persistent terse response mode, commit/review/compress helper skills, Cavecrew delegation guidance, and Pi-native `session_start`, `input`, and `before_agent_start` hooks. It does not install Claude Code hooks or mutate `~/.claude`.

## Development

Install workspace dependencies from the repository root:

```bash
npm install
```

Run checks:

```bash
npm test --workspaces --if-present
npm run typecheck --workspaces --if-present
npm run check:pack --workspaces --if-present
```

Run package-specific checks when working in one package, for example:

```bash
npm test --workspace @casualjim/pi-mimir
npm run typecheck --workspace @casualjim/pi-mimir
```

## License

MIT
