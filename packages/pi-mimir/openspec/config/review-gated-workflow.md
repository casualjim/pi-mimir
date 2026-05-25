# Review-gated workflow config

This OpenSpec config asset documents package-owned workflow gates for setup/update tooling.

## Public workflow surface

The package-owned public entrypoints are:

- `plan` — OpenSpec proposal/spec/design/task planning with codebase-memory-first discovery and one holistic planning review.
- `implement` — apply-ready implementation, verification against OpenSpec artifacts, and stop before explicit archive.
- `review-plan` — separate planning review workflow for existing planning artifacts.
- `review-implementation` — separate implementation review workflow for existing implementation evidence.

Generated `/opsx:*` or `openspec-*` skills may coexist. They are not hidden or replaced; this package guidance identifies `plan` and `implement` as the preferred orchestrated path and leaves generated sync/archive actions explicit.

## Plan orchestration

Planning uses OpenSpec status/instructions as the canonical state model. If intent is ambiguous, the orchestrator asks for intent before codebase probing. Ordinary discovery follows this ladder:

1. `codebase_memory_get_architecture`
2. `codebase_memory_search_graph` or `codebase_memory_search_code`
3. `codebase_memory_trace_path`
4. `codebase_memory_get_code_snippet`
5. exact file reads
6. direct synthesis

Discovery stops when affected capabilities, impact areas, relevant existing specs, and major implementation constraints are known. Durable research artifacts are not created by default unless the active OpenSpec schema defines one or the user explicitly asks.

codebase-memory MCP is required for full workflow readiness. If it is unavailable or stale, report degraded discovery, fall back to exact reads or shell inspection only as degraded mode, and do not claim architecture-aware discovery.

A single planning review runs after proposal, specs, design, and tasks are complete. It reviews the artifact set coherently, routes findings to the target artifact, identifies upstream root causes, and asks the user when a product, scope, or design decision is required instead of guessing. The same review can be run independently with `review-plan`. The default workflow does not fan out into artifact-specific planning review skills.

## Implement orchestration

Implementation uses `openspec instructions apply --change <name> --json` and the tracked task file as the source of truth. Context files returned by OpenSpec are read before implementation. Task checkboxes are marked complete only after the matching implementation work is complete.

After task execution, implementation verifies completeness, correctness, and coherence against proposal, specs, design, and tasks. Implementation review is a separate explicit action, not a mandatory part of `implement`. When review is requested, `review-implementation` runs as its own standalone review workflow.

Implementation stops after verification unless a separate review was explicitly requested. It does not run `git commit`, `git push`, PR creation, archive, or Superpowers finishing-branch behavior; generated OpenSpec archive behavior remains a separate explicit action.

## Review finding semantics

Review findings use these severities:

- `blocker`: must be fixed before proceeding.
- `concern`: fix or ask the user to accept explicitly.
- `suggestion`: optional improvement.

Findings must include severity, target artifact, upstream artifact when relevant, whether a user decision is required, location, evidence, problem, impact, and the smallest concrete fix. Orchestrators deduplicate findings and act on the highest-severity actionable set.

## Managed manifests

OpenSpec asset version manifests cover schema, config, and generated OpenSpec assets only. Static agents, skills, and prompts remain content-addressable and should not receive synthetic version numbers.

The current package ships agents, skills, schema templates, and this config asset. Prompt assets can be added later using the same content-addressable model as agents and skills.
