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

# No hardcoded secrets

Source code must not contain passwords, API keys, tokens, or connection URLs with credentials.
Read them from the environment, a function parameter, or the config module.

# Comments explain why, not what

A comment states a reason, a constraint, a workaround, or a non-obvious invariant. A comment
that restates what the next line plainly does is a violation.

# Errors are not swallowed

A `catch` block must handle the error, report it, or re-raise it. An empty catch block, or
one whose body is only a comment, is a violation.

# No partial implementations

Implement features fully. A comment that says "for now", "simplified", or "later", or a
stub body, is a violation. If a part genuinely cannot be done, say so in your reply instead
of stubbing it.

# Do not run destructive commands that erase uncommitted work

`git reset --hard`, `git checkout -- .`, `git clean -fd`, and similar commands that discard
untracked or uncommitted changes are forbidden. These destroy work that has no backup. If a
clean tree is needed, create a worktree instead or ask the user.

# No explicit any in TypeScript

paths: **/*.ts, **/*.tsx

Do not use the `any` type explicitly. Use a precise type, `unknown` with narrowing, or a generic instead.

# Exported functions declare return types

paths: src/**/*.ts

Every exported function declares its return type explicitly. Inferred return types on exported functions are a violation.
