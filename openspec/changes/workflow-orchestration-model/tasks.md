## 1. Finalize Workflow Surface

- [x] 1.1 Decide final public entrypoint names for the two primary phases (`plan`/`implement`)
- [x] 1.2 Update package skill descriptions so public triggers are narrow and OpenSpec-specific
- [x] 1.3 Ensure generic rpiv-pi-style workflow skill names are not registered as primary package entrypoints
- [x] 1.4 Document how package entrypoints coexist with generated OpenSpec `/opsx:*` or `openspec-*` skills

## 2. Encode Codebase-Memory Propose Flow

- [x] 2.1 Update plan orchestrator guidance to ask intent-first clarification before codebase probing when intent is ambiguous
- [x] 2.2 Add the codebase-memory discovery ladder to plan orchestration
- [x] 2.3 Define the discovery stop condition for affected capabilities, impact areas, existing specs, and implementation constraints
- [x] 2.4 Add degraded-discovery behavior for unavailable or stale codebase-memory
- [x] 2.5 Ensure durable research artifacts are not created by default unless the active OpenSpec schema defines them or the user asks for one

## 3. Encode Review Gate Semantics

- [x] 3.1 Define artifact review gate ordering for proposal, specs, design, and tasks
- [x] 3.2 Define implementation review gate ordering after implementation verification
- [x] 3.3 Standardize finding severity semantics: `blocker`, `concern`, and `suggestion`
- [x] 3.4 Update orchestrator guidance to deduplicate review findings and choose fix, ask, or proceed behavior
- [x] 3.5 Ensure review skills emit grounded actionable findings with evidence and concrete fixes
- [x] 3.6 Add separate `review-plan` and `review-implementation` workflows for independently running review gates

## 4. Encode Implementation Boundaries

- [x] 4.1 Update implement/apply orchestrator guidance to use OpenSpec apply instructions and tracked task files as source of truth
- [x] 4.2 Ensure task checkboxes are updated only after corresponding implementation work is complete
- [x] 4.3 Add verification-before-review behavior against proposal, specs, design, and tasks
- [x] 4.4 Ensure implementation stops before explicit generated OpenSpec archive
- [x] 4.5 Ensure implementation guidance does not invoke `git commit`, `git push`, PR creation, or Superpowers finishing-branch behavior

## 5. Align Schema and Bootstrap Guidance

- [x] 5.1 After `openspec-schema` lands, update `review-gated` schema instructions to reflect this orchestration model
- [x] 5.2 Update bootstrap/session guidance to identify preferred package entrypoints
- [x] 5.3 Update overlap warnings for rpiv-pi, pi-superpowers, and broad generated workflow conflicts
- [x] 5.4 Document which lessons were kept and rejected from rpiv-pi, pi-superpowers, and superpowers-bridge

## 6. Validate and Test

- [x] 6.1 Add or update tests that inspect registered public skills and reject generic workflow names
- [x] 6.2 Add or update tests that check skill descriptions for broad over-triggering language
- [x] 6.3 Add or update tests for overlap warning behavior
- [x] 6.4 Add or update tests for no-commit implementation guidance
- [x] 6.5 Run `openspec validate workflow-orchestration-model --strict`
- [x] 6.6 Add real Pi workflow integration tests for workflow entrypoints
- [x] 6.7 Model individual review gate steps, instructions, and output templates in the review-gated schema
- [x] 6.8 Add deterministic OpenSpec CLI behavior tests for review-gated workflow milestones
- [x] 6.9 Remove misleading aggregate review/archive artifacts from schema guidance
