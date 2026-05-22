## Why

pi-mimir needs a Pi extension to bootstrap itself into every session. Without it, the agent has no awareness of codebase-memory tools, no git context, no agent syncing, no guidance injection, and no way to install peer packages. The extension is the connective tissue that makes skills and agents usable in practice.

## What Changes

- **package.json** — npm manifest declaring this as a Pi package within a workspace, with peer dependencies on 5 sibling packages
- **extensions/openspec/** — runtime extension that registers session hooks, slash commands, and prompt injection
  - Bootstrap prompt injection (codebase-memory + openspec awareness on every agent turn)
  - Session lifecycle hooks (start/compact/shutdown/tool_call/before_agent_start)
  - Git context caching and injection
  - Guidance file resolution and auto-injection
  - Agent profile syncing (bundled → `.pi/agents/`)
  - `/openspec-setup` command to install peer packages
  - `/openspec-update-agents` command to sync agent profiles
- **Workspace root** — top-level `package.json` with npm workspaces pointing to `packages/pi-mimir` and `packages/advisor`

## Capabilities

### New Capabilities

- `bootstrap-injection`: System prompt injection of codebase-memory tool awareness and openspec workflow on every agent turn, with companion package detection
- `session-lifecycle`: Session start/compact/shutdown hooks managing git context, guidance, agent syncing, and sibling warnings
- `git-context`: Cached branch/commit/user resolution injected as hidden messages, invalidated on mutating git commands
- `guidance-injection`: Per-depth guidance file resolution (AGENTS.md > CLAUDE.md > architecture.md) on file touch
- `agent-syncing`: Bundled agent profiles copied to `.pi/agents/` with manifest-based drift detection
- `setup-commands`: `/openspec-setup` and `/openspec-update-agents` slash commands
- `workspace-setup`: Top-level workspace `package.json` with npm workspaces for `packages/pi-mimir` and `packages/advisor`

### Modified Capabilities

None — greenfield.

## Impact

- Every agent turn receives ~60 lines of additional system prompt (idempotent, marker-guarded)
- Session start runs 4 async operations (agent sync, git context, root guidance, sibling check) — sub-100ms
- `.pi/agents/` directory is ready to receive agent profile markdown files (profiles added in a follow-up change)
- 5 peer npm packages required for full functionality (graceful degradation with warnings)
- Workspace includes `packages/advisor` for a subagent-based advisor (separate package, not a peer dep)
