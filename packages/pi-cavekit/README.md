# pi-cavekit

Pi-native port of [JuliusBrussee/cavekit](https://github.com/JuliusBrussee/cavekit): a compact `SPEC.md` workflow for spec-driven development.

Cavekit keeps one durable project artifact at repo root:

```text
SPEC.md
```

The package bundles upstream Cavekit `FORMAT.md` as the reference for that file's sections, addressing rules, pipe tables, and caveman-style spec encoding.

## Install

```text
pi install @casualjim/pi-cavekit
```

For local development from this monorepo:

```text
pi install ./packages/pi-cavekit
```

## Commands

This package exposes Pi prompt templates with upstream Cavekit command names:

- `/ck:spec [bug: <description> | amend <§X.n> | from-code | <idea>]` — create, distill, amend, or backprop project `SPEC.md`.
- `/ck:build [§T.n | --next | --all]` — plan and execute selected §T tasks from `SPEC.md`.
- `/ck:check [§V | §I | §T | --all]` — read-only drift report comparing `SPEC.md` to current code.

Pi prompt template filenames preserve the command names: `prompts/ck:spec.md`, `prompts/ck:build.md`, and `prompts/ck:check.md`.

## Included skills

- `cavekit-spec` — `SPEC.md` creation, distillation, amendment, and bug backprop mutation.
- `cavekit-build` — plan-then-execute implementation against selected `SPEC.md` tasks.
- `cavekit-check` — read-only drift detection for §V invariants, §I interfaces, and §T task status.
- `cavekit-backprop` — bug-to-spec analysis that proposes §B and §V updates.

Pi also registers skills as `/skill:<name>` commands when skill commands are enabled. The `/ck:*` prompt templates are the primary Cavekit UX.

## `FORMAT.md` and `SPEC.md`

- `FORMAT.md` is packaged reference material copied from upstream Cavekit.
- `SPEC.md` is the user's project-root working artifact.
- Cavekit skills use `FORMAT.md` to write/check `SPEC.md` sections:
  - §G goal
  - §C constraints
  - §I interfaces
  - §V invariants
  - §T tasks
  - §B bugs

`SPEC.md` is not a managed package asset. This package does not create `.pi` managed manifests, synchronize project config, or install hooks.

## Relationship to pi-caveman

`pi-cavekit` does not bundle upstream Cavekit's embedded `skills/caveman` and does not depend on `@casualjim/pi-caveman`.

Use `@casualjim/pi-caveman` as a complementary package for general terse response mode, commit messages, review comments, and memory compression. Cavekit only uses the `FORMAT.md` spec encoding rules for `SPEC.md` content.

## Non-goals

This package does not include:

- a Pi extension;
- `/ck:init`;
- managed project config;
- upstream shell installers;
- Claude Code plugin manifests;
- hooks, statusline integrations, or runtime orchestration;
- active setup for non-Pi agents.

## Development

```bash
npm test --workspace @casualjim/pi-cavekit
npm run typecheck --workspace @casualjim/pi-cavekit
```

## Attribution

This package is a Pi port of Cavekit by Julius Brussee:

- Upstream: https://github.com/JuliusBrussee/cavekit
- License: MIT, see `LICENSE`
