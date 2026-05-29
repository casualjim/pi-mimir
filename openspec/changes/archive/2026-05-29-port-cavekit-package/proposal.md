## Why

Cavekit v4 exists as a small spec-driven development workflow for Claude Code, but Pi users do not have a first-class package for its `SPEC.md` loop. Porting it to `packages/pi-cavekit` makes Cavekit installable through Pi while preserving the upstream minimal shape: one project spec, three command prompts, and no runtime orchestration.

## What Changes

- Add a new Pi package at `packages/pi-cavekit`.
- Bundle Pi-native Cavekit skills for spec mutation, build execution, drift checking, and bug backpropagation.
- Bundle Pi prompt templates that preserve upstream slash-command UX: `/ck:spec`, `/ck:build`, and `/ck:check`.
- Include upstream `FORMAT.md` as the packaged reference for project-root `SPEC.md` format and caveman-style spec encoding.
- Preserve upstream MIT attribution and links to the source Cavekit project.
- Add package metadata and tests that verify Pi can discover the package skills/prompts and that the port excludes non-Pi or superseded resources.
- Exclude upstream Cavekit's embedded `caveman` skill; `packages/pi-caveman` owns user-facing Caveman behavior separately.
- Exclude extensions, managed project config, hooks, installers, and runtime orchestration from the v1 Cavekit port.

## Capabilities

### New Capabilities
- `pi-cavekit-package`: A Pi package that provides Cavekit's `SPEC.md` workflow through Pi skills, prompt templates, and packaged format reference files.

### Modified Capabilities

None.

## Impact

- Adds `packages/pi-cavekit/` with package metadata, README, license/attribution, `FORMAT.md`, prompt templates, skills, tests, and TypeScript/Vitest config as needed.
- Updates workspace package coverage only through the existing `packages/*` workspace pattern.
- No changes to existing packages, active OpenSpec capabilities, or Pi core behavior.
- No runtime dependency on `packages/pi-caveman`, upstream Cavekit installers, or non-Pi plugin mechanisms.
