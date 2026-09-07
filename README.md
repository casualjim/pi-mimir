# pi-mimir

`pi-mimir` is a Pi package monorepo for Cavekit specs, Caveman terse mode, Crumbs discovery guidance, pstack skills, and Heimdall security guards.

## Workspace packages

- `packages/pi-cavekit` — `@casualjim/pi-cavekit`; Pi prompt templates and skills for root `SPEC.md` workflows.
- `packages/pi-caveman` — `@casualjim/pi-caveman`; terse-mode skills, Cavecrew guidance, and Pi-native Caveman extension hooks.
- `packages/pi-crumbs` — `@casualjim/pi-crumbs`; Crumbs CLI discovery guidance plugin, raw-discovery reminders, graph augmentation, and public `crumbs` skill. Assumes `crumbs` on `$PATH`; disables gracefully when missing.
- `packages/pi-heimdall` — `@casualjim/pi-heimdall`; guardian extension for secret exposure, command policy, `.env` protection, SOPS/Kubernetes guards, and bash sandboxing.
- `packages/pi-pstack` — `@casualjim/pi-pstack`; pstack skills, Poteto Mode, and bundled agents delegating through pi-subagents.

## Install in Pi

Install whichever packages you need:

```text
pi install npm:@casualjim/pi-cavekit
pi install npm:@casualjim/pi-caveman
pi install npm:@casualjim/pi-crumbs
pi install npm:@casualjim/pi-heimdall
pi install npm:@casualjim/pi-pstack
```

For local development from this checkout, install package paths instead:

```text
pi install ./packages/pi-cavekit
pi install ./packages/pi-caveman
pi install ./packages/pi-crumbs
pi install ./packages/pi-heimdall
pi install ./packages/pi-pstack
```

All packages are also compatible with [omp](https://omp.sh): install with `omp plugin add` or link with `omp plugin link ./packages/<name>`.

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
pnpm --filter @casualjim/pi-heimdall test
pnpm --filter @casualjim/pi-heimdall typecheck
```

## License

MIT
