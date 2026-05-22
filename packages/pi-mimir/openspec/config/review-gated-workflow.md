# Review-gated workflow config

This OpenSpec config asset documents package-owned workflow gates for setup/update tooling.

## Public workflow surface

The package-owned public entrypoints are:

- `plan` — OpenSpec proposal/spec/design/task planning with codebase-memory-first discovery and artifact review gates.
- `implement` — apply-ready implementation, verification against OpenSpec artifacts, implementation review gates, and stop before explicit archive.
- `review-plan` — separate artifact review workflow that orchestrates `reviews/proposal.md`, `reviews/design.md`, `reviews/specs.md`, and `reviews/tasks.md`.
- `review-implementation` — separate implementation review workflow that orchestrates `reviews/architecture.md`, `reviews/tests.md`, `reviews/performance.md`, and `reviews/security.md`.

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

Artifact review gates run after planning artifacts are complete, in order: proposal, design, specs, tasks. The same gate set can be run independently with `review-plan`.

## Implement orchestration

Implementation uses `openspec instructions apply --change <name> --json` and the tracked task file as the source of truth. Context files returned by OpenSpec are read before implementation. Task checkboxes are marked complete only after the matching implementation work is complete.

After task execution, implementation verifies completeness, correctness, and coherence against proposal, specs, design, and tasks. Only after verification passes does it run architecture, tests, performance, and security review gates. The same gate set can be run independently with `review-implementation` when implementation evidence already exists.

Implementation stops after verification and implementation review. It does not run `git commit`, `git push`, PR creation, archive, or Superpowers finishing-branch behavior; generated OpenSpec archive behavior remains a separate explicit action.

## Review finding semantics

Review findings use these severities:

- `blocker`: must be fixed before proceeding.
- `concern`: fix or ask the user to accept explicitly.
- `suggestion`: optional improvement.

Findings must include location, evidence, problem, impact, severity, and the smallest concrete fix. Orchestrators deduplicate findings and act on the highest-severity actionable set.

## Managed manifests

OpenSpec asset version manifests cover schema, config, and generated OpenSpec assets only. Static agents, skills, and prompts remain content-addressable and should not receive synthetic version numbers.

The current package ships agents, skills, schema templates, and this config asset. Prompt assets can be added later using the same content-addressable model as agents and skills.
