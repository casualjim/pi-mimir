## Context

This package is intended to become a better OpenSpec-native workflow layer for Pi. The product direction comes from comparing three existing systems:

- `~/github/juicesharp/rpiv-mono/packages/rpiv-pi`: strong review discipline, grounded questions, Developer Context, artifact/slice verification, and specialist reviewers; too many public skills, a competing `thoughts/shared` artifact store, and heavy generic research/planning ceremony.
- `../pi-superpowers`: useful phase monitor, guardrails, explicit transitions, TDD/review discipline; overly broad skill triggers, long vague skills, default `docs/specs`/`docs/plans` paths, and commit/PR assumptions.
- `~/github/JiangWay/openspec-schemas/superpowers-bridge`: validates that complex OpenSpec schema DAGs can route prompts, prechecks, output redirection, apply behavior, and post-apply artifacts using supported schema fields; its Superpowers semantics and finishing behavior should not be copied into this package's review-gated workflow.

The package should use OpenSpec as the canonical artifact/state model and codebase-memory as the default discovery substrate. Pi skills and agents should steer the workflow, not replace OpenSpec or recreate rpiv-pi.

## Goals / Non-Goals

**Goals:**
- Define a small OpenSpec-native public workflow surface.
- Make trigger hygiene a first-class product requirement.
- Define an automated plan flow that combines intent capture, bounded codebase-memory discovery, artifact generation, and artifact review gates.
- Define an implement flow that applies tracked tasks, verifies against OpenSpec artifacts, runs implementation review gates, and stops before explicit archive.
- Preserve useful lessons from rpiv-pi, pi-superpowers, and superpowers-bridge while avoiding their failure modes.
- Keep OpenSpec artifacts canonical and avoid competing artifact stores.

**Non-Goals:**
- Do not repair `review-gated/schema.yaml` here; that is the separate `openspec-schema` change.
- Do not implement a pi-superpowers-specific bridge schema here.
- Do not register generic rpiv-pi-style skills.
- Do not introduce commit, push, PR, or finishing-branch automation.
- Do not make durable research artifacts mandatory by default.

## Decisions

### Decision 1: Two orchestrated public phases

The product should expose at most two primary workflow entrypoints:

```text
plan                  → explore, codebase-memory discovery, OpenSpec artifacts, artifact review
implement             → task execution, verification, implementation review, archive-ready
review-plan           → orchestrates proposal/specs/design/tasks review artifact gates only
review-implementation → orchestrates claim/architecture/tests/performance/security review artifact gates only
```

The primary public names are `plan` and `implement`, with explicit independent review workflows `review-plan` and `review-implementation`. They are intentionally narrow OpenSpec-specific entrypoints, not generic rpiv-style stages. The model should still avoid a broad public chain like `discover → research → design → plan → implement → validate`. Internally, planner/worker-style orchestrator agents may exist, but they should not appear as extra generic user-facing workflow skills.

Rationale: rpiv-pi's pipeline is powerful but too heavy and too easy to invoke out of order. A two-phase `plan`/`implement` surface maps better to OpenSpec's artifact/apply split while using terms users expect.

### Decision 2: OpenSpec artifacts are canonical

OpenSpec owns change-scoped state:

```text
openspec/changes/<name>/proposal.md
openspec/changes/<name>/specs/**/spec.md
openspec/changes/<name>/design.md
openspec/changes/<name>/tasks.md
```

The package should not create a parallel `thoughts/shared` proposal/research/design/plan/validate stack for normal changes. If a schema eventually needs durable `verify.md` or similar, it should be modeled as a supported OpenSpec artifact node.

Rationale: duplicated artifact stores are a root cause of confusion in rpiv-pi-style and Superpowers-style workflows.

### Decision 3: codebase-memory replaces ordinary research fan-out

The propose orchestrator should use codebase-memory directly for ordinary codebase discovery:

1. architecture overview
2. graph/code search
3. trace path
4. code snippet
5. exact reads
6. direct synthesis

Subagents are reserved for review/judgment gates and exceptional gaps, not default discovery. This deliberately diverges from rpiv-pi's broad analyzer/locator/pattern-finder fan-out.

Rationale: codebase-memory provides a repository-indexed substrate that is cheaper, more deterministic, and less narrativized than spawning multiple research agents for normal discovery.

### Decision 4: Research is ephemeral unless the schema defines it

The standard plan flow should not emit `research.md`. Discovery findings should feed directly into proposal/spec/design/tasks. Durable research artifacts are allowed only if the active OpenSpec schema explicitly defines them or if the user asks for a standalone research artifact.

Rationale: this preserves the useful rpiv idea of grounded research while avoiding its heavy artifact chain.

### Decision 5: Trigger hygiene is a product feature

Skill descriptions must be narrow. Review skills should be orchestrator-invoked at gates. Bootstrap guidance should identify the preferred OpenSpec-native entrypoints and warn when rpiv-pi, pi-superpowers, or generated OpenSpec skills could steer the agent differently.

Rationale: Superpowers' broad trigger language is a core failure mode. Trigger hygiene should be tested and reviewed like functionality, not treated as copy polish.

### Decision 6: Review gates use severity semantics

Review findings should use consistent semantics:

- `blocker`: must be fixed before proceeding
- `concern`: fix or ask the user to accept explicitly
- `suggestion`: optional improvement

Artifact gates run before implementation readiness. Implementation gates run after task execution and verification. Orchestrators deduplicate findings and decide whether to fix, ask, or proceed.

Rationale: rpiv's reviewer agents are valuable because they are grounded and severity-tagged. The new model should preserve that discipline without importing the full rpiv pipeline.

### Decision 7: Implementation stops before explicit archive

This package's review-gated implement flow should not commit, push, create PRs, invoke finishing-branch behavior, or create archive artifacts. It should implement tasks, verify, run implementation review gates, and then hand off to generated OpenSpec archive behavior as an explicit separate action.

Rationale: OpenSpec already owns archive/sync behavior, and pi-superpowers/superpowers-bridge can keep commit/PR flows in their domain. This package should remain OpenSpec planning/implementation review orchestration, not archive or git workflow ownership.

### Decision 8: Learn from superpowers-bridge schema mechanics

Complex schemas are acceptable when they remain valid OpenSpec schemas. The package should borrow these mechanics from superpowers-bridge:

- inline artifact/apply instructions for prechecks and routing
- fail-loud missing-tool behavior
- output redirection instructions when wrapping tools with default paths
- post-apply milestones as normal artifact nodes if durable artifacts are needed

It should not borrow Superpowers-specific skill names, docs paths, or finishing behavior into `review-gated`.

## Risks / Trade-offs

- **Too little structure recreates ad-hoc agent behavior** → Keep OpenSpec status/instructions and review gates as hard phase boundaries.
- **Too much structure recreates rpiv-pi heaviness** → Keep public phases small and make research durable only when explicitly schema-defined.
- **codebase-memory unavailable** → Report degraded discovery and fall back honestly to exact file reads/shell inspection.
- **Generated OpenSpec skills conflict with package entrypoints** → Document preferred entrypoints and coexistence rules instead of hiding generated skills.
- **Review gates become noisy** → Enforce severity semantics and grounded actionable findings.

## Migration Plan

1. Land `openspec-schema` first so the `review-gated` schema is structurally valid.
2. Use this orchestration model to revise planner/worker/reviewer contracts and skill descriptions.
3. Update bootstrap/setup guidance to encode trigger hygiene and overlap warnings.
4. Update `review-gated` schema instructions to align with the orchestration model.
5. Add tests for public skill surface, trigger descriptions, no generic workflow skills, no commit behavior, and degraded discovery messaging.

## Open Questions

- Final public names are `plan`/`implement`; remaining naming work is limited to keeping their descriptions narrow and OpenSpec-specific.
- Should `verify.md` become a first-class artifact in `review-gated`, or remain orchestrator output only?
- How much generated `/opsx:*` surface should remain visible in user-facing docs?
- Should a separate `pi-superpowers-bridge` change adapt superpowers-bridge to Pi skill names and workflow-monitor paths?
