## Status: DEFERRED

This spec is **out of scope** for the `extension-foundation` change. Bootstrap injection depends on skills and agents existing first (see design decision D2). It will be implemented in a follow-up change once those artifacts are in place. The `before_agent_start` hook in this change only handles git context re-injection.

---

## ADDED Requirements

### Requirement: System prompt injection on each agent turn
The extension SHALL append a codebase-memory tool awareness block and openspec skill workflow summary to the system prompt on every `before_agent_start` event.

#### Scenario: First agent turn in a session
- **WHEN** the agent starts its first turn
- **THEN** the system prompt contains a codebase-memory tools section and an openspec workflow section, appended after an HTML-comment marker

#### Scenario: Subsequent agent turns
- **WHEN** the agent starts a subsequent turn and the marker is already present
- **THEN** the extension SHALL NOT duplicate the injection (idempotent via marker check)

#### Scenario: Subagent depth greater than zero
- **WHEN** the agent turn is a subagent (depth > 0)
- **THEN** the extension SHALL skip injection entirely

### Requirement: Missing companion package warning
The extension SHALL detect which peer packages are absent from `~/.pi/agent/settings.json` and append a warning block listing each missing package with its install command.

#### Scenario: All peers installed
- **WHEN** all 5 sibling packages are present in settings
- **THEN** no warning block is appended

#### Scenario: Some peers missing
- **WHEN** 2 of 5 siblings are missing
- **THEN** a warning block lists exactly those 2 packages with `pi install` commands
