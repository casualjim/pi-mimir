# pi-mimir

`pi-mimir` is a Pi package monorepo for review-gated OpenSpec workflows, standalone review workflows, codebase-memory discovery support, forked advisor guidance, Cavekit specs, and Caveman terse mode.

## Workspace packages

- `packages/pi-openspec` — `@casualjim/pi-openspec`; OpenSpec extension, workflow skills, role agents, review-gated schema assets, and tests.
- `packages/pi-review` — `@casualjim/pi-review`; Codex-style `/review` command plus whole-tree implementation review skills.
- `packages/pi-codebase-memory` — `@casualjim/pi-codebase-memory`; standalone codebase-memory MCP setup plugin, raw-discovery reminders, and public `codebase-memory` skill.
- `packages/advisor` — `@casualjim/pi-advisor`; forked child advisor extension, `/advisor` command, `advisor` tool, and packaged `advisor-child` agent.
- `packages/pi-cavekit` — `@casualjim/pi-cavekit`; Pi prompt templates and skills for root `SPEC.md` workflows.
- `packages/pi-caveman` — `@casualjim/pi-caveman`; terse-mode skills, Cavecrew guidance, and Pi-native Caveman extension hooks.
- `packages/pi-heimdall` — `@casualjim/pi-heimdall`; guardian extension for secret exposure, command policy, `.env` protection, SOPS/Kubernetes guards, and bash sandboxing.

## Install in Pi

Install whichever packages you need:

```text
pi install npm:@casualjim/pi-openspec
pi install npm:@casualjim/pi-review
pi install npm:@casualjim/pi-codebase-memory
pi install npm:@casualjim/pi-advisor
pi install npm:@casualjim/pi-cavekit
pi install npm:@casualjim/pi-caveman
pi install npm:@casualjim/pi-heimdall
```

For local development from this checkout, install package paths instead:

```text
pi install ./packages/pi-openspec
pi install ./packages/pi-review
pi install ./packages/pi-codebase-memory
pi install ./packages/advisor
pi install ./packages/pi-cavekit
pi install ./packages/pi-caveman
pi install ./packages/pi-heimdall
```

## OpenSpec workflow

After installing `@casualjim/pi-openspec` with OpenSpec CLI 1.4.1 available, initialise a target repository with:

```text
/openspec:init
```

`/openspec:init` runs `openspec init --tools pi`, sets `openspec/config.yaml` to the `review-gated` schema, syncs OpenSpec schema/project-state assets, exposes packaged skills without copying them into `.pi/skills`, syncs role agents into `~/.pi/agent/agents`, and reports whether codebase-memory tools are active.

Primary skill entrypoints:

- `plan` — compose generated proposal/spec/design/task behaviour with one holistic planning review.
- `implement` — apply an implementation-ready OpenSpec change, verify it, and stop before archive. Implementation review is separate and explicit.
- `review-plan` — run a standalone planning review over existing planning artifacts.

For implementation review, install `@casualjim/pi-review` and run `review-implementation` or `/review` as needed.

`@casualjim/pi-openspec` does not commit, push, create pull requests, archive changes, or run branch-finishing workflows.

For full architecture-aware discovery, install and activate the separate codebase-memory package:

```text
pi install npm:@casualjim/pi-codebase-memory
```

Without active `codebase_memory_*` tools, workflows must report degraded discovery and use exact reads or shell inspection as fallback.

See [`packages/pi-openspec/README.md`](packages/pi-openspec/README.md) for detailed usage.

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
pnpm install
```

Run checks:

```bash
pnpm test
pnpm typecheck
pnpm check:pack
```

Run package-specific checks when working in one package, for example:

```bash
pnpm --filter @casualjim/pi-openspec test
pnpm --filter @casualjim/pi-openspec typecheck
```

## License

MIT
