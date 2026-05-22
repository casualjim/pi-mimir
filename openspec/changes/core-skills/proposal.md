## Why

Phase 1 shipped the extension foundation (bootstrap injection, session hooks, agent syncing, setup commands). The package is installed but has no skills or agents to actually deliver the openspec workflow. Phase 2 delivers the four core skills — explore, propose, apply, commit — and the artifact-reviewer agent that propose depends on. Without these, the package is scaffolding with nothing to run.

## What Changes

- **New skill: `explore`** — Thinking-partner stance with codebase-memory integration. Replaces rpiv-pi's research + discover + explore three-skill pipeline with a single skill that uses codebase-memory queries directly (no agent dispatches).
- **New skill: `propose`** — Creates an openspec change and generates all artifacts in dependency order. Adds an artifact review gate that dispatches the artifact-reviewer agent ×4 in parallel (one per artifact), each cross-checking the others.
- **New skill: `apply`** — Task execution from tasks.md. Reads context files, works through checkboxes, marks complete, pauses on blockers. No agent dispatches.
- **New skill: `commit`** — Lightweight structured commits. Analyzes staged/unstaged changes, groups logically, writes descriptive commit messages. No agent dispatches.
- **New agent: `artifact-reviewer`** — Adversarial reviewer for openspec artifacts (proposal, specs, design, tasks). Checks compartmentalization, cross-consistency, completeness. Prompt Leverage format with pipe-delimited output.

## Capabilities

### New Capabilities
- `explore-skill`: Thinking-partner skill with codebase-memory tool guidance for codebase research
- `propose-skill`: Artifact creation + adversarial review gate with ×4 parallel agent dispatch
- `apply-skill`: Task execution skill that reads openspec context and works through checkboxes
- `commit-skill`: Structured commit skill that analyzes changes and groups logically
- `artifact-reviewer-agent`: Prompt Leverage agent profile for adversarial artifact review

### Modified Capabilities
_(none — no existing specs to modify)_

## Impact

- **Files added**: 5 new files (4 SKILL.md + 1 agent .md) under `packages/pi-mimir/`
- **Package manifest**: `packages/pi-mimir/package.json` may need `pi.skills` and `pi.agents` field adjustments to register the new directories
- **Extension**: No changes needed — `agents.ts` syncing already supports discovering agents from `agents/` directory
- **Dependencies**: No new peer dependencies. Uses existing codebase-memory tools (built-in) and Agent tool (from `@tintinweb/pi-subagents`)
- **No breaking changes**: Purely additive
