## Context

pi-openspec-workflow is a greenfield Pi package. The codebase is empty — no `package.json`, no source files. This is the first change, establishing the extension that all skills and agents depend on.

The reference implementation is `@juicesharp/rpiv-pi/extensions/rpiv-core/`, which provides the same capabilities (session hooks, git context, guidance, agent syncing, setup command). We follow its patterns closely but adapt naming and specifics for openspec.

## Goals / Non-Goals

**Goals:**
- Produce a working Pi extension that registers hooks, commands, and a flag
- Establish the package.json as a valid Pi package with correct peer deps
- Copy proven patterns from rpiv-pi's extension (git-context, guidance, agents, session-hooks)
- Keep each module focused — pure utilities have no ExtensionAPI dependency

**Non-Goals:**
- Skills, agents, schemas, templates, rules — those are separate changes
- Bootstrap prompt injection (that needs the skill/agent content to exist first)
- Tests (follow-up change)

## Decisions

### D1: Module structure mirrors rpiv-pi

Same 10-file structure, same separation of concerns:

```
extensions/openspec-core/
├── index.ts              # orchestrator
├── session-hooks.ts      # lifecycle wiring
├── agents.ts             # bundled agent sync
├── setup-command.ts      # /openspec-setup
├── update-agents.ts      # /openspec-update-agents
├── git-context.ts        # cached branch/commit/user
├── guidance.ts           # per-depth guidance resolution
├── constants.ts          # flag names, message types
├── siblings.ts           # peer package registry
└── package-checks.ts     # detect missing siblings
```

**Why**: Proven pattern. rpiv-pi's extension works reliably in production. Deviating without reason adds risk for no gain.

**Alternative**: Single-file extension. Rejected — rpiv-pi tried this and refactored to multi-file because the single file became unmaintainable (~800 lines).

### D2: No bootstrap injection in this change

The bootstrap prompt (codebase-memory tool awareness + openspec skill workflow) depends on skills and agents existing. This change creates the extension shell with session hooks, git context, guidance, and commands. Bootstrap injection is a follow-up once skills are in place.

The `before_agent_start` hook will only handle git context re-injection in this change.

### D3: Agent syncing uses rpiv-pi's manifest approach

Copy the v2 manifest system (`.<prefix>-managed.json` + v2 marker file) with the openspec naming convention. Same three-way hash logic, same smart-gate vs legacy migration, same path-traversal hardening.

**Why**: The v2 system handles edge cases (partial writes, corruption, concurrent sessions) that a simpler approach would miss.

### D4: Guidance resolution identical to rpiv-pi

Same candidate ladder (AGENTS.md > CLAUDE.md > architecture.md), same depth-0 skip for AGENTS/CLAUDE, same dedup Set, same sendMessage envelope format.

**Why**: Same Pi resource-loader behavior applies regardless of package.

### D5: Sibling registry — 5 peers

From PLAN.md (rpiv-advisor removed — our workspace includes `packages/advisor` instead):

| Package | Provides |
|---|---|
| `@tintinweb/pi-subagents` | Agent / get_subagent_result / steer_subagent |
| `@juicesharp/rpiv-ask-user-question` | ask_user_question |
| `@juicesharp/rpiv-todo` | todo + /todos |
| `@juicesharp/rpiv-web-tools` | web_search + web_fetch |
| `@juicesharp/rpiv-args` | $ARGUMENTS substitution |

No legacy siblings to prune (new package). Advisor tool comes from `packages/advisor` within this workspace.

### D6: No pi-installer abstraction

rpiv-pi has a `pi-installer.ts` module wrapping `pi install`. We'll call `pi.exec("pi", ["install", pkg])` directly in setup-command.ts. If we need the abstraction later, we can extract it.

**Why**: YAGNI. One call site doesn't need a wrapper module.

### D7: Workspace layout

Top-level `package.json` uses npm workspaces with `packages/*`. The core package lives at `packages/core/` with the extension at `packages/core/extensions/openspec-core/`. The advisor package at `packages/advisor/` is a sibling workspace package providing the advisor tool.

**Why**: Workspace keeps advisor and core co-located. Advisor needs its own context window (subagent, not completeSimple on executor branch), so it can't be part of core. But they share the same repo because they're tightly coupled — advisor knows about openspec artifacts and review patterns.

## Risks / Trade-offs

**Extension API stability** → Pi's extension API is stable (v1). The types we use (on, registerCommand, registerFlag, sendMessage, exec, getFlag) have been stable across many releases.

**Duplicate code with rpiv-pi** → git-context.ts and guidance.ts are near-copies. Acceptable because they're small, self-contained, and may diverge over time. Extracting to a shared package is premature.

**No tests in this change** → The modules are pure utilities that can be unit-tested. Tests are a follow-up change to keep this one focused.

## Open Questions

None — the design is straightforward adaptation of a proven pattern.
