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

A single planning review runs after proposal, specs, design, and tasks are complete. It reviews the artifact set coherently, routes findings to the target artifact, identifies upstream root causes, and asks the user when a product, scope, or design decision is required instead of guessing. Planning review is intended to be single-shot: it should surface all actionable issues observable from the current evidence rather than staging findings across rounds. It should also be materially focused: wording-only or editorial comments that do not meaningfully change scope, behavior, risk, design direction, tasking, or implementation readiness should be suppressed. After findings are addressed, a follow-up review over unchanged material should ideally report only net new issues introduced by the edits or made newly reviewable by newly supplied evidence. The same review can be run independently with `review-plan`. The default workflow does not fan out into artifact-specific planning review skills.

## Implement orchestration

Implementation uses `openspec instructions apply --change <name> --json` and the tracked task file as the source of truth. Context files returned by OpenSpec are read before implementation. Task checkboxes are marked complete only after the matching implementation work is complete.

After task execution, implementation verifies completeness, correctness, and coherence against proposal, specs, design, and tasks. Implementation review is a separate explicit action, not a mandatory part of `implement`. When review is requested, `review-implementation` runs as its own standalone review workflow. Like planning review, it is intended to be single-shot: the review should surface all actionable issues observable from the current evidence, and follow-up review over unchanged material should ideally report only net new issues introduced by the changes or made newly reviewable by newly supplied evidence.

Implementation stops after verification unless a separate review was explicitly requested. It does not run `git commit`, `git push`, PR creation, archive, or Superpowers finishing-branch behavior; generated OpenSpec archive behavior remains a separate explicit action.

## Review finding semantics

Review findings use these severities:

- `blocker`: must be fixed before proceeding.
- `concern`: fix or ask the user to accept explicitly.
- `suggestion`: optional improvement.

Review reports return the full actionable issue list, grouped by priority, with a summary scorecard and final assessment. Reviews are expected to be single-shot rather than staged; after reported findings are addressed, a re-review over unchanged material should ideally report only net new issues introduced by the changes or made newly reviewable by newly supplied evidence. For planning review specifically, wording-only or editorial comments with no meaningful outcome change should not be reported. Findings must include severity, target artifact, upstream artifact when relevant, whether a user decision is required, location, evidence, problem, impact, and the smallest concrete fix. Orchestrators may resolve higher-severity findings first, but they should not discard lower-priority findings from the report.

## Managed manifests

OpenSpec asset version manifests cover schema, config, and generated OpenSpec assets only. Static agents, skills, and prompts remain content-addressable and should not receive synthetic version numbers.

The current package ships agents, skills, schema templates, and this config asset. Prompt assets can be added later using the same content-addressable model as agents and skills.
