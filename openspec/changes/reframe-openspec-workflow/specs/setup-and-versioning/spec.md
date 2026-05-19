## ADDED Requirements

### Requirement: Setup installs required Pi packages
The setup command SHALL install all Pi package dependencies required by the OpenSpec workflow.

#### Scenario: Required Pi packages are missing
- **WHEN** `/openspec-setup` runs and required Pi packages are absent
- **THEN** it offers to install the missing packages through `pi install`

### Requirement: Sibling registry includes required tools
The sibling registry SHALL include subagents, ask-user-question, todo, web tools, args, `rpiv-btw`, and `pi-mcp-adapter`.

#### Scenario: Sibling registry is inspected
- **WHEN** `packages/pi-openspec/extensions/openspec/siblings.ts` is loaded
- **THEN** it contains install and detection entries for every required Pi package

### Requirement: Setup ensures OpenSpec CLI availability
The setup command SHALL check whether the `openspec` CLI is available and SHALL provide or run the global install command when it is missing.

#### Scenario: OpenSpec CLI is missing
- **WHEN** `/openspec-setup` detects that `openspec` is not available on PATH
- **THEN** it includes `npm i -g @FissionAI/openspec` in the setup actions or reports that command to the user

### Requirement: Setup ensures codebase-memory availability
The setup command SHALL check `~/.pi/agent/mcp.json` for codebase-memory MCP configuration and SHALL guide setup when it is missing.

#### Scenario: codebase-memory MCP config is unavailable
- **WHEN** `/openspec-setup` does not detect codebase-memory MCP configuration in `~/.pi/agent/mcp.json`
- **THEN** it presents a copy-paste prompt that asks the user's agent to install codebase-memory MCP and configure it through the MCP adapter

### Requirement: Codebase-memory bundling is future-compatible
The setup model SHALL allow codebase-memory to become bundled later without changing the user-facing workflow.

#### Scenario: codebase-memory becomes bundled
- **WHEN** a future package version includes bundled codebase-memory setup
- **THEN** `/openspec-setup` uses the bundled setup path instead of external install instructions

### Requirement: Static workflow assets remain content-addressable
Static agents, skills, and prompts SHALL use content-addressable manifests where content hash is the source of truth.

#### Scenario: Static agent is synced
- **WHEN** this package syncs an agent, skill, or prompt definition into a repository
- **THEN** the manifest records content hashes rather than synthetic package or source version numbers

### Requirement: OpenSpec assets record generator versions
OpenSpec schema, config, and generated OpenSpec assets SHALL record enough non-content-addressable metadata to decide when regeneration is needed.

#### Scenario: OpenSpec assets are synced
- **WHEN** this package syncs OpenSpec schema, config, or generated OpenSpec assets into a repository
- **THEN** the OpenSpec asset manifest records OpenSpec or source asset version metadata, source asset kind, target path, and content hash

### Requirement: OpenSpec asset drift detection uses version markers
Sync logic SHALL use OpenSpec asset version markers and content hashes to detect stale generated OpenSpec assets.

#### Scenario: Installed OpenSpec asset is stale
- **WHEN** the OpenSpec asset manifest records an older OpenSpec version, source asset version, or content hash for an OpenSpec asset
- **THEN** setup or update commands report that regeneration is needed
