## Purpose

Provide a Pi-native package for Caveman's terse communication modes and skill-facing capabilities, including discoverable skills, attribution, package-contract tests, and safe exclusion of non-Pi installer and plugin behavior.

## Requirements

### Requirement: Pi Caveman package manifest
The system SHALL provide a `packages/pi-caveman` package that Pi can discover as a Pi package.

#### Scenario: Package declares Pi resources
- **WHEN** the package manifest is inspected
- **THEN** it SHALL declare the `pi-package` keyword and expose its bundled skills through the `pi.skills` manifest.

#### Scenario: Package participates in workspace tooling
- **WHEN** repository workspace tooling runs across `packages/*`
- **THEN** `packages/pi-caveman` SHALL include the package metadata and scripts needed to run its package-level tests.

### Requirement: Full Caveman skill surface for Pi
The system SHALL port the upstream Caveman skill-facing capabilities into Pi skill files where they are meaningful in Pi.

#### Scenario: Core terse communication mode is available
- **WHEN** a Pi user invokes or triggers Caveman mode
- **THEN** the package SHALL provide a `caveman` skill that preserves upstream intensity levels and terse technical communication rules.

#### Scenario: Commit-message generation is available
- **WHEN** a Pi user asks for a Caveman commit message
- **THEN** the package SHALL provide a `caveman-commit` skill that emits terse Conventional Commit messages without performing git operations.

#### Scenario: Review-comment generation is available
- **WHEN** a Pi user asks for Caveman code review comments
- **THEN** the package SHALL provide a `caveman-review` skill that emits concise actionable review findings without applying code changes.

#### Scenario: Memory-file compression guidance is available
- **WHEN** a Pi user asks to compress a natural-language memory file
- **THEN** the package SHALL provide a `caveman-compress` skill with safety rules for preserving code, paths, commands, links, and unsupported file types.

#### Scenario: Help and usage reference is available
- **WHEN** a Pi user asks for Caveman help
- **THEN** the package SHALL provide a `caveman-help` skill summarizing available modes, skills, and deactivation instructions.

#### Scenario: Stats capability is represented honestly
- **WHEN** a Pi user invokes Caveman stats
- **THEN** the package SHALL provide a `caveman-stats` skill that either uses a Pi-native stats source or clearly explains that upstream hook-based stats are unavailable in Pi without additional integration.

#### Scenario: Cavecrew delegation guidance is available
- **WHEN** a Pi user asks to use Cavecrew or compressed subagent delegation
- **THEN** the package SHALL provide Cavecrew guidance adapted to Pi's available subagent mechanisms and bundled prompt resources where practical.

### Requirement: Non-Pi upstream plugin layers are excluded from active behavior
The system SHALL avoid activating upstream installer and plugin mechanisms that target other agent harnesses.

#### Scenario: Package installation does not mutate other agent configs
- **WHEN** `packages/pi-caveman` is installed as a Pi package
- **THEN** it SHALL NOT run upstream shell installers or write Claude Code, Codex, Gemini, Cursor, Windsurf, or other non-Pi agent configuration files.

#### Scenario: Non-Pi files are treated as source material
- **WHEN** upstream commands, hooks, manifests, or statusline files are copied or referenced
- **THEN** they SHALL be documentation or source resources only unless they are explicitly adapted to Pi-native behavior.

### Requirement: Attribution and licensing are preserved
The system SHALL preserve attribution to the upstream Caveman project and its license.

#### Scenario: Documentation identifies upstream source
- **WHEN** a developer reads the `packages/pi-caveman` README
- **THEN** it SHALL identify the upstream Caveman repository and describe the package as a Pi port.

#### Scenario: License terms are available
- **WHEN** package files are inspected
- **THEN** upstream license information SHALL be included or referenced in the package.

### Requirement: Package contract is tested
The system SHALL include tests that protect the Pi package contract for the Caveman port.

#### Scenario: Skill files are discoverable
- **WHEN** package tests run
- **THEN** they SHALL verify that required Caveman skill files exist and expose valid unique skill names.

#### Scenario: Package manifest remains valid
- **WHEN** package tests run
- **THEN** they SHALL verify that the package manifest exposes the expected Pi skills path and package metadata.
