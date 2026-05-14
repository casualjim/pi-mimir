## Context

The broader `reframe-openspec-workflow` plan defines a full OpenSpec-native Pi workflow: definition and delivery skills, planner/worker agents, review gates, setup checks, managed assets, codebase-memory-first discovery, and archive/ADR guidance. The current schema asset under `packages/core/openspec/schemas/review-gated/` was intended to encode the OpenSpec portion of that workflow, but its `schema.yaml` uses unsupported fields and does not match OpenSpec's actual schema model.

This change isolates only the schema asset correction. It should make `review-gated` a valid OpenSpec schema without implementing or refactoring the rest of the package workflow.

## Goals / Non-Goals

**Goals:**
- Rewrite `packages/core/openspec/schemas/review-gated/schema.yaml` using OpenSpec's supported schema structure.
- Preserve the intended review-gated artifact flow: proposal, specs, design, tasks, then apply.
- Put review-gated artifact/apply guidance in supported inline `instruction` fields.
- Keep templates as markdown skeletons/examples rather than workflow-policy containers.
- Decide how to handle currently present `templates/apply.md` and `templates/archive.md` without pretending unsupported schema fields wire them.
- Add validation that proves the schema can be loaded and can generate instructions.

**Non-Goals:**
- Do not modify planner, worker, or reviewer agents.
- Do not modify review skills.
- Do not modify setup commands, managed manifests, sibling package detection, or package registration.
- Do not implement archive/sync behavior or ADR update automation.
- Do not introduce a new OpenSpec schema dialect.

## Decisions

### Decision 1: Mirror OpenSpec's `spec-driven` schema shape

Use the built-in `spec-driven` schema as the structural model because it matches OpenSpec's parser and CLI behavior. The corrected `review-gated/schema.yaml` should use:

```yaml
name: review-gated
version: 1
description: ...
artifacts:
  - id: proposal
    generates: proposal.md
    description: ...
    template: proposal.md
    instruction: |
      ...
    requires: []
apply:
  requires: [tasks]
  tracks: tasks.md
  instruction: |
    ...
```

Reject the current invented shape:

```yaml
artifacts:
  proposal:
    path: proposal.md
    instructions: templates/proposal.md
archive:
  instructions: templates/archive.md
rules:
  - ...
```

Rationale: OpenSpec validates schema YAML against a typed schema. Unsupported fields do not create workflow behavior and can make the asset fail validation.

### Decision 2: Inline instructions own schema-specific guidance

Review-gated behavior that OpenSpec needs when generating artifacts belongs in artifact `instruction` fields and `apply.instruction`.

Artifact instructions should include only behavior relevant to generating that artifact:

- `proposal`: WHY/WHAT/Impact, capability contract, codebase-memory-first discovery expectation, no implementation leakage.
- `specs`: capability-to-spec mapping, delta operation rules, SHALL/MUST requirements, `#### Scenario:` formatting, full-copy rule for MODIFIED requirements.
- `design`: HOW decisions, rationale, alternatives, tradeoffs, risks, ADR-candidate notation, no task-level detail.
- `tasks`: strict checkbox format, dependency ordering, maps to specs/design, no commit step.
- `apply`: read artifacts/context, execute tasks incrementally, verify against artifacts, run post-verification review gates through package workflow, stop archive-ready, never commit.

Rationale: this keeps the OpenSpec CLI capable of returning complete instructions through `openspec instructions ... --json` without requiring unsupported file indirection.

### Decision 3: Templates stay skeletal

The existing copied default templates should remain mostly lightweight. They may receive better examples, especially for spec delta operations, but they should not contain setup behavior, agent dispatch, review skill contracts, or archive/ADR policy.

Rationale: templates provide output structure. The schema and orchestrators provide behavior. Mixing those concerns makes generated artifacts noisy and makes schema validation harder.

### Decision 4: Treat apply/archive template files as ownership questions

`templates/apply.md` is not referenced through `template` because `apply` is not an artifact entry in OpenSpec's schema model. Its useful content should either be folded into `apply.instruction` or retained only as package documentation if some package-owned asset sync mechanism needs it.

`templates/archive.md` cannot be wired through a top-level `archive` schema section. Its useful ADR/archive guidance should be moved to a supported archive/sync instruction surface if one exists, or kept as package documentation/setup guidance outside this schema-only change.

Rationale: preserving files is acceptable only if their role is honest. They must not be represented as active schema wiring unless OpenSpec supports that wiring.

### Decision 5: Validate behavior from the OpenSpec CLI boundary

The implementation should be validated from the same boundary the package uses: OpenSpec schema loading and instruction generation. Validation should prove that a change using `review-gated` can reach apply readiness and that artifact/apply instructions contain the expected guidance.

Rationale: file-shape validation alone is insufficient. The workflow depends on `openspec status` and `openspec instructions` returning usable data.

### Decision 6: Use `superpowers-bridge` as external schema precedent, not as review-gated scope

`~/github/JiangWay/openspec-schemas/superpowers-bridge/schema.yaml` is a valid complex custom OpenSpec schema. A temporary project install validated successfully with `openspec schema validate superpowers-bridge --json`. It is useful precedent because it proves complex integrations still use the normal OpenSpec schema shape: artifact array entries with `id`, `generates`, `description`, `template`, inline `instruction`, and `requires`, plus `apply.requires`, `apply.tracks`, and inline `apply.instruction`.

Patterns to adopt as precedent for `review-gated`:

- Fail-loud prechecks belong inside inline artifact/apply instructions, not unsupported top-level schema fields.
- Output redirection can be expressed in inline artifact instructions when a wrapped skill has a default output location.
- Post-apply lifecycle artifacts, when needed, should be modeled as normal artifact nodes such as `verify` or `retrospective`, not as unsupported top-level schema sections.
- Complex apply behavior still belongs under supported `apply` fields.

Do not copy `superpowers-bridge` semantics into this change. It targets Superpowers execution and `../pi-superpowers`, while this change targets the package's schema-only `review-gated` asset. A Pi-adapted Superpowers bridge would be a separate follow-up schema/change.

Compatibility notes for that possible follow-up:

- `superpowers-bridge` refers to skill names like `superpowers:brainstorming` and `superpowers:writing-plans`, while `../pi-superpowers` registers Pi skills from its `skills/` directory.
- `superpowers-bridge` redirects brainstorming and plan outputs into `openspec/changes/<name>/brainstorm.md` and `plan.md`, while `../pi-superpowers` workflow monitor currently recognizes `docs/specs/*` and `docs/plans/*` as canonical signals.
- `superpowers-bridge` intentionally includes commit/PR/finishing-branch behavior, which is compatible with a Superpowers delivery package but not with this package's no-commit `review-gated` scope.
- `superpowers-bridge` invokes `openspec-verify-change`; a Pi adaptation must confirm whether that skill exists in the target environment or provide an equivalent.

## Risks / Trade-offs

- **Risk: schema instructions become too large** → Keep orchestration in planner/worker agents and review-skill details in review skills; include only artifact/apply guidance needed by OpenSpec.
- **Risk: archive/ADR guidance gets lost** → Preserve it outside schema YAML and document the supported surface where it should be wired later.
- **Risk: implementation drifts into broader workflow refactor** → Enforce scope validation that excludes agents, skills, setup, manifests, package registration, and unrelated docs.
- **Risk: templates remain too generic** → Improve examples only where they directly help artifact quality, especially spec delta examples.

## Migration Plan

1. Replace `review-gated/schema.yaml` with a valid OpenSpec schema structure.
2. Move useful apply guidance from `templates/apply.md` into `apply.instruction` unless a supported package asset mechanism owns the file.
3. Remove unsupported archive wiring from the schema and preserve archive/ADR guidance outside the schema path if needed.
4. Optionally refine templates as skeletons/examples only.
5. Validate the schema and generated instructions before treating the change as complete.

Rollback is straightforward: restore the previous schema/templates from git if validation reveals OpenSpec compatibility problems. Because this change is schema-only, it should not affect package runtime code unless setup or tests explicitly consume the corrected asset.

## Open Questions

- Should `templates/apply.md` be deleted, retained as package documentation, or consumed by a separate asset-sync mechanism outside OpenSpec schema YAML?
- Should `templates/archive.md` move to a package docs/config location, or is there an OpenSpec-supported archive/sync instruction hook this package should target in a later change?
- Should template examples be expanded in this change, or should this change focus strictly on schema validity and inline instructions?
