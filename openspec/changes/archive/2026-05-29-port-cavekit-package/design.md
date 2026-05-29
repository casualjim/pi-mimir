## Context

Upstream Cavekit v4 is intentionally small: one project-root `SPEC.md`, three user-facing commands (`/ck:spec`, `/ck:build`, `/ck:check`), and supporting skills for spec mutation, build execution, drift checks, and backpropagation. Its repository also includes `FORMAT.md`, which defines the `SPEC.md` section schema and caveman-style encoding rules.

Pi packages can declaratively expose skills and prompt templates through `package.json` `pi.skills` and `pi.prompts`. Pi prompt templates become slash commands by filename, and the loader derives the command name from the markdown basename. Therefore `prompts/ck:spec.md`, `prompts/ck:build.md`, and `prompts/ck:check.md` preserve the upstream `/ck:*` UX without registering extension commands.

This port should coexist with `packages/pi-caveman`. Cavekit's upstream embedded `skills/caveman` is not part of this package; `pi-caveman` owns general Caveman response compression. Cavekit only owns the `SPEC.md` workflow and its bundled `FORMAT.md` reference.

## Goals / Non-Goals

**Goals:**

- Add `packages/pi-cavekit` as a first-class Pi package.
- Preserve upstream Cavekit v4 behavior through Pi-native skills and prompt templates.
- Preserve `/ck:spec`, `/ck:build`, and `/ck:check` command names via prompt filenames.
- Include `FORMAT.md` as a package reference asset for the project-root `SPEC.md` format.
- Use namespaced skill names to avoid collisions with generic skills such as `spec`, `build`, `check`, and `caveman`.
- Preserve upstream MIT license and attribution.
- Add tests for package manifest, skill files, prompt files, `FORMAT.md`, and excluded resources.

**Non-Goals:**

- Do not port upstream Cavekit `skills/caveman`.
- Do not add a runtime extension in v1.
- Do not add `/ck:init`, managed project config, copied `.pi` assets, or managed manifests.
- Do not run upstream installers, hooks, plugin manifests, or other non-Pi package mechanisms.
- Do not make `pi-cavekit` depend on `pi-caveman`.
- Do not auto-commit changes from Cavekit instructions; respect Pi session and repository rules that commits happen only when explicitly requested.

## Decisions

### Decision: Ship skills and prompts, not an extension

`packages/pi-cavekit/package.json` will declare `keywords: ["pi-package"]`, `pi.skills: ["skills"]`, and `pi.prompts: ["prompts"]`. No `pi.extensions` entry is needed for v1.

Rationale:
- Cavekit v4 is instruction-driven and file-driven, not runtime-driven.
- Pi prompt templates already provide slash command expansion.
- Pi skills already provide progressive-disclosure workflow instructions.
- Extensions are for runtime hooks, tools, UI, registered commands, session persistence, rendering, or config mutation. This port does not require those behaviors.

Alternatives considered:
- Extension-registered `/ck:*` commands: rejected for v1 because prompt templates preserve the command UX without runtime code.
- Managed `/ck:init`: rejected because upstream Cavekit v4's durable artifact is user-owned `SPEC.md`, not project config.

### Decision: Preserve `/ck:*` with prompt templates

The package will include:

- `prompts/ck:spec.md`
- `prompts/ck:build.md`
- `prompts/ck:check.md`

Each prompt will adapt the corresponding upstream `commands/*.md` file for Pi and should direct the model to use the namespaced Cavekit skill workflow. The filenames intentionally include `:` so Pi exposes `/ck:spec`, `/ck:build`, and `/ck:check`.

Alternatives considered:
- `prompts/spec.md`, `build.md`, `check.md`: rejected because they would collide semantically with generic command names and lose upstream UX.
- Skill-only usage through `/skill:cavekit-spec`: rejected as the only UX because upstream's primary user-facing surface is `/ck:*`.

### Decision: Use namespaced skill names

The package will provide these skills:

- `cavekit-spec`
- `cavekit-build`
- `cavekit-check`
- `cavekit-backprop`

Rationale: upstream names `spec`, `build`, and `check` are too generic for Pi's global skill namespace. `caveman` is also already owned by `packages/pi-caveman`.

Alternatives considered:
- Preserve upstream skill names exactly: rejected due to collision risk.

### Decision: Bundle `FORMAT.md` as a reference asset

The package will include upstream-adapted `FORMAT.md` at package root and include it in package files. Skills and prompts will refer to it as the bundled reference that defines how project-root `SPEC.md` is structured.

The project `SPEC.md` remains user-owned and is created or edited by Cavekit workflows. It is not copied from the package or managed by an extension.

### Decision: Exclude Caveman and non-Pi runtime layers

The package will not include upstream Cavekit `skills/caveman`, global installers, Claude plugin manifests, hooks, or runtime orchestration. General user-facing Caveman behavior belongs in `packages/pi-caveman`; Cavekit only uses its own `FORMAT.md` encoding rules for spec content.

### Decision: Test the package contract

Tests should validate packaging and discoverability rather than model style quality:

- manifest exposes `pi.skills` and `pi.prompts`, not `pi.extensions`.
- required skill files exist with valid unique names.
- required prompt files exist with descriptions and argument hints.
- `FORMAT.md`, README, and license/attribution files are included.
- no `skills/caveman` directory exists in the package.
- no active installer/plugin/hook resources are packaged.

## Risks / Trade-offs

- Prompt filenames with `:` depend on Pi's filename-derived prompt names and slash parser accepting non-whitespace command names → covered by tests or a focused local probe during implementation.
- Cavekit build instructions upstream mention committing after task completion → adapt instructions to Pi project rules so no commit occurs unless the user explicitly requests it.
- Removing embedded `caveman` may look like lost upstream parity → document that `pi-caveman` is the separate package for general Caveman behavior, while Cavekit keeps `FORMAT.md` spec encoding.
- No extension means no runtime enforcement of setup or format validity → acceptable for v1 because upstream Cavekit v4 is deliberately prompt/skill based.
- `FORMAT.md` location in an installed package is not the same as project root → prompts and skills must clearly say the bundled file is the reference, while project-root `SPEC.md` is the working artifact.
