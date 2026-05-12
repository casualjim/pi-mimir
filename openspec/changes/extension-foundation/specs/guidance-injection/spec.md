## ADDED Requirements

### Requirement: Per-depth guidance file resolution
The extension SHALL walk from project root to a touched file's directory, resolving the first existing guidance file at each depth using the candidate ladder: AGENTS.md > CLAUDE.md > `.rpiv/guidance/<sub>/architecture.md`.

#### Scenario: File touched in a subdirectory with an AGENTS.md
- **WHEN** the agent reads `src/components/Button.tsx` and `src/AGENTS.md` exists
- **THEN** the extension resolves `src/AGENTS.md` as guidance for depth 1

#### Scenario: File touched with no guidance at any depth
- **WHEN** the agent reads `src/deep/file.ts` and no guidance files exist at any depth
- **THEN** no guidance is injected

#### Scenario: Multiple depths with guidance
- **WHEN** the agent reads `src/components/Button.tsx` and both `src/CLAUDE.md` and `src/components/AGENTS.md` exist
- **THEN** both are resolved (one per depth, root-first)

### Requirement: Depth-0 skips AGENTS.md and CLAUDE.md
The extension SHALL NOT check for AGENTS.md or CLAUDE.md at depth 0 (project root), because Pi's own resource-loader already handles those.

#### Scenario: Root-level AGENTS.md exists
- **WHEN** the agent reads a file at the project root and `AGENTS.md` exists there
- **THEN** the extension skips it (Pi's loader handles it) but still checks `.rpiv/guidance/architecture.md`

### Requirement: Session-scoped dedup
The extension SHALL track injected guidance paths in an in-memory Set and skip re-injection within the same session.

#### Scenario: Same file touched twice
- **WHEN** the agent reads `src/CLAUDE.md` in two separate tool calls within the same session
- **THEN** guidance for `src/CLAUDE.md` is injected only once

### Requirement: Root guidance pre-loaded at session start
The extension SHALL inject `.rpiv/guidance/architecture.md` at session start if it exists, using the same dedup Set.

#### Scenario: Root architecture.md exists at session start
- **WHEN** a session starts and `.rpiv/guidance/architecture.md` exists
- **THEN** it is injected via sendMessage as reference material and added to the dedup Set
