## 1. Package Manifest

- [x] 1.1 Create workspace root `package.json` with npm workspaces pointing to `packages/*`
- [x] 1.2 Create `packages/pi-mimir/package.json` with Pi package fields (`pi.extensions`, `pi.skills`), 5 peer dependencies, and `files` array

## 2. Extension Entry Point & Constants

- [x] 2.1 Create `extensions/openspec/constants.ts` with flag name (`openspec-debug`), message type constants (`openspec-git-context`, `openspec-guidance`)
- [x] 2.2 Create `extensions/openspec/index.ts` registering the debug flag, session hooks, and slash commands

## 3. Sibling Registry & Package Checks

- [x] 3.1 Create `extensions/openspec/siblings.ts` with declarative registry of 5 peer packages (pkg, matches regex, provides description)
- [x] 3.2 Create `extensions/openspec/package-checks.ts` that reads `~/.pi/agent/settings.json` and returns missing siblings

## 4. Git Context

- [x] 4.1 Create `extensions/openspec/git-context.ts` — cached resolution (branch, commit, user), signature-based dedup, detached HEAD remapping, cache clearing, mutating-command detection

## 5. Guidance Injection

- [x] 5.1 Create `extensions/openspec/guidance.ts` — per-depth candidate ladder resolution, session-scoped dedup Set, root guidance pre-load, tool-call handler, depth-0 skip for AGENTS/CLAUDE

## 6. Agent Syncing

- [x] 6.1 Create `extensions/openspec/agents.ts` — package root resolution, manifest-based ownership (`.openspec-managed.json`), sha256 hashing, v2 marker file, read-only mode (session_start), apply mode (command), path-traversal hardening

## 7. Session Hooks

- [x] 7.1 Create `extensions/openspec/session-hooks.ts` wiring `session_start` (reset state, root guidance, git context, agent sync, sibling warning, directory scaffolding), `session_compact` (reset + re-inject), `session_shutdown` (cleanup), `tool_call` (guidance + git cache clear), `before_agent_start` (git context re-inject)

## 8. Slash Commands

- [x] 8.1 Create `extensions/openspec/setup-command.ts` — `/openspec-setup` with confirmation dialog, serial `pi install`, success/failure reporting
- [x] 8.2 Create `extensions/openspec/update-agents.ts` — `/openspec-update-agents` with apply-mode sync and count reporting
