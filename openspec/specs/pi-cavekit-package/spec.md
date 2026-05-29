## Purpose

Provide a Pi-native package for Cavekit's `SPEC.md` workflow, including discoverable skills, prompt templates, format reference material, attribution, and package-contract tests while excluding non-Pi runtime layers.

## Requirements

### Requirement: Pi Cavekit package manifest
The system SHALL provide a `packages/pi-cavekit` package that Pi can discover as a Pi package.

#### Scenario: Package declares Pi resources
- **WHEN** the package manifest is inspected
- **THEN** it SHALL declare the `pi-package` keyword and expose bundled Cavekit skills through `pi.skills` and bundled Cavekit prompt templates through `pi.prompts`.

#### Scenario: Package excludes runtime extension registration
- **WHEN** the package manifest is inspected
- **THEN** it SHALL NOT declare `pi.extensions` for the v1 Cavekit port.

#### Scenario: Package participates in workspace tooling
- **WHEN** repository workspace tooling runs across `packages/*`
- **THEN** `packages/pi-cavekit` SHALL include package metadata and scripts needed to run package-level tests and typecheck or otherwise document the absence of a TypeScript compile surface.

### Requirement: Cavekit prompt command surface
The system SHALL preserve Cavekit's upstream `/ck:*` user command surface through Pi prompt templates.

#### Scenario: Spec command prompt is available
- **WHEN** Pi prompt templates are discovered from the package
- **THEN** the package SHALL provide a prompt template that exposes `/ck:spec` and accepts arguments for new spec, amend, backprop, and from-code flows.

#### Scenario: Build command prompt is available
- **WHEN** Pi prompt templates are discovered from the package
- **THEN** the package SHALL provide a prompt template that exposes `/ck:build` and accepts task-selection arguments such as `§T.n`, `--next`, and `--all`.

#### Scenario: Check command prompt is available
- **WHEN** Pi prompt templates are discovered from the package
- **THEN** the package SHALL provide a prompt template that exposes `/ck:check` and accepts drift-check arguments such as `§V`, `§I`, `§T`, and `--all`.

#### Scenario: Prompt files include autocomplete metadata
- **WHEN** the package prompt files are inspected
- **THEN** each Cavekit prompt template SHALL include a description and argument hint appropriate for Pi autocomplete.

### Requirement: Cavekit skill workflow surface
The system SHALL port Cavekit's workflow instructions into Pi skill files with collision-safe names.

#### Scenario: Spec mutation skill is available
- **WHEN** Pi skills are discovered from the package
- **THEN** the package SHALL provide a `cavekit-spec` skill for creating, distilling, amending, and backpropagating changes into project-root `SPEC.md`.

#### Scenario: Build execution skill is available
- **WHEN** Pi skills are discovered from the package
- **THEN** the package SHALL provide a `cavekit-build` skill for plan-then-execute work against selected `SPEC.md` tasks.

#### Scenario: Drift check skill is available
- **WHEN** Pi skills are discovered from the package
- **THEN** the package SHALL provide a `cavekit-check` skill for read-only drift reporting against `SPEC.md` interfaces, invariants, and tasks.

#### Scenario: Backprop skill is available
- **WHEN** Pi skills are discovered from the package
- **THEN** the package SHALL provide a `cavekit-backprop` skill for bug-to-spec analysis that records bugs and proposes invariants.

#### Scenario: Skill names are Pi-safe and unique
- **WHEN** package tests inspect skill frontmatter
- **THEN** every Cavekit skill SHALL have a valid unique skill name and a non-empty Pi-appropriate description.

### Requirement: Cavekit SPEC format reference
The system SHALL include Cavekit's `FORMAT.md` as the package reference for project-root `SPEC.md`.

#### Scenario: Format reference is packaged
- **WHEN** package files are inspected
- **THEN** `FORMAT.md` SHALL be included and SHALL describe the `SPEC.md` sections for goal, constraints, interfaces, invariants, tasks, and bugs.

#### Scenario: Skills reference bundled format
- **WHEN** Cavekit skill instructions are inspected
- **THEN** they SHALL direct the model to use the bundled `FORMAT.md` as the reference for writing or checking project-root `SPEC.md`.

#### Scenario: Project spec remains user-owned
- **WHEN** Cavekit workflows create or edit `SPEC.md`
- **THEN** `SPEC.md` SHALL be treated as the user's project artifact, not as a managed package asset copied or synchronized by an extension.

### Requirement: Superseded and non-Pi upstream layers are excluded
The system SHALL avoid porting upstream resources that are superseded by other Pi packages or target non-Pi runtime systems.

#### Scenario: Embedded Cavekit caveman skill is excluded
- **WHEN** package skills are inspected
- **THEN** the package SHALL NOT include upstream Cavekit `skills/caveman` because `packages/pi-caveman` owns general Caveman behavior.

#### Scenario: Pi Caveman is complementary not required
- **WHEN** package metadata and documentation are inspected
- **THEN** `packages/pi-cavekit` SHALL NOT declare a runtime dependency on `packages/pi-caveman` for Cavekit's `SPEC.md` workflow.

#### Scenario: Package installation does not mutate external agent configs
- **WHEN** `packages/pi-cavekit` is installed as a Pi package
- **THEN** it SHALL NOT run upstream shell installers, hooks, plugin manifests, or write Claude Code, Codex, Gemini, Cursor, Windsurf, or other non-Pi agent configuration files.

#### Scenario: No managed Cavekit config is installed
- **WHEN** `packages/pi-cavekit` is installed as a Pi package
- **THEN** it SHALL NOT create or synchronize project `.pi` assets, managed manifests, or Cavekit config files outside normal Pi package discovery.

### Requirement: Attribution and licensing are preserved
The system SHALL preserve attribution to the upstream Cavekit project and its license.

#### Scenario: Documentation identifies upstream source
- **WHEN** a developer reads the `packages/pi-cavekit` README
- **THEN** it SHALL identify the upstream Cavekit repository and describe the package as a Pi port.

#### Scenario: License terms are available
- **WHEN** package files are inspected
- **THEN** upstream license information SHALL be included or referenced in the package.

### Requirement: Package contract is tested
The system SHALL include tests that protect the Pi package contract for the Cavekit port.

#### Scenario: Manifest remains valid
- **WHEN** package tests run
- **THEN** they SHALL verify that the package manifest exposes expected Pi skills and prompts and does not expose an extension.

#### Scenario: Required files are discoverable
- **WHEN** package tests run
- **THEN** they SHALL verify that required skill files, prompt files, `FORMAT.md`, README, and license or attribution files exist.

#### Scenario: Excluded resources stay excluded
- **WHEN** package tests run
- **THEN** they SHALL verify that the package does not include upstream Cavekit `skills/caveman` or active non-Pi installer/plugin resources.
