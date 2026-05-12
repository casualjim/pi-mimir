## ADDED Requirements

### Requirement: Session start hook
The extension SHALL register a `session_start` handler that resets injection state, injects root guidance, resolves and injects git context, syncs bundled agents (read-only mode), and warns about missing siblings.

#### Scenario: Fresh session start
- **WHEN** a new Pi session begins
- **THEN** the extension resets guidance dedup state, injects root `.rpiv/guidance/architecture.md`, resolves git context, copies any new agent profiles, and notifies the user of missing siblings

### Requirement: Session compact hook
The extension SHALL register a `session_compact` handler that re-injects root guidance and git context (since compaction clears the transcript).

#### Scenario: Context compaction occurs
- **WHEN** Pi compacts the context window
- **THEN** the extension resets injection state, clears git context cache, resets the injection marker, re-injects root guidance, and re-injects git context

### Requirement: Session shutdown hook
The extension SHALL register a `session_shutdown` handler that cleans up all in-memory state.

#### Scenario: Session ends
- **WHEN** the Pi session shuts down
- **THEN** the extension clears guidance injection state, git context cache, and the injection marker

### Requirement: Tool call hook for guidance and git cache invalidation
The extension SHALL register a `tool_call` handler that injects guidance on `read`/`edit`/`write` and clears git context cache on mutating git commands.

#### Scenario: Agent reads a file
- **WHEN** the agent calls the `read` tool on a file path
- **THEN** the extension resolves guidance files from project root to that file's directory and injects any new ones via sendMessage

#### Scenario: Agent runs a mutating git command
- **WHEN** the agent runs `git checkout`, `git commit`, `git merge`, `git rebase`, `git pull`, `git reset`, `git revert`, `git cherry-pick`, `git stash`, `git switch`, `git worktree`, or `git am` via bash
- **THEN** the extension clears the git context cache so it re-resolves on the next `before_agent_start`

### Requirement: OpenSpec directory scaffolding
The extension SHALL create `openspec/changes/` and `openspec/profiles/` directories at session start if they don't exist.

#### Scenario: Fresh project without openspec directories
- **WHEN** a session starts and `openspec/changes/` does not exist
- **THEN** the extension creates `openspec/changes/` and `openspec/profiles/` recursively
