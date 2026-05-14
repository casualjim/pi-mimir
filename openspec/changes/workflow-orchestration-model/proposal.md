## Why

The package needs a clear OpenSpec-native orchestration model that learns from rpiv-pi, pi-superpowers, and community OpenSpec schemas without copying their failure modes. Existing workflow systems either over-trigger agents with broad skill definitions, create heavy competing artifact stacks, or rely on generic research fan-out instead of codebase-memory as the primary discovery substrate.

## What Changes

- Define the product direction as a lighter OpenSpec-native successor to rpiv-pi:
  - OpenSpec owns workflow state and canonical artifacts.
  - codebase-memory owns ordinary codebase discovery.
  - orchestrators own phase steering.
  - review skills/subagents own explicit gates only.
- Capture source-system lessons:
  - Keep rpiv-pi's intent-first discovery, grounded questions, Developer Context propagation, artifact review, slice verification, and severity-tagged gates.
  - Avoid rpiv-pi's many generic public skills, `thoughts/shared` competing artifact store, broad subagent fan-out, and commit/review workflow coupling.
  - Keep pi-superpowers' phase monitor, guardrails, explicit phase transitions, and TDD/review discipline.
  - Avoid pi-superpowers' broad trigger text, overlong/vague skills, default `docs/specs`/`docs/plans` paths, and commit/PR assumptions.
  - Keep superpowers-bridge's valid complex OpenSpec DAG, inline instruction routing, fail-loud prechecks, and output redirection patterns.
  - Avoid copying Superpowers-specific semantics into the review-gated workflow.
- Make trigger hygiene and orchestration boundaries first-class requirements.
- Provide separate explicit review workflows for running plan and implementation review gates independently.
- Define an automated plan flow covering explore, codebase-memory-backed discovery, proposal/spec/design/task generation, and artifact review gates.
- Define implementation boundaries covering apply, verification, implementation review gates, and explicit archive handoff without commits.
- Keep `openspec-schema` separate as the schema-validity correction; this change defines the broader workflow model.

## Capabilities

### New Capabilities
- `workflow-orchestration-model`: Defines the OpenSpec-native product architecture, ownership boundaries, source-system lessons, and phase model.
- `trigger-hygiene`: Defines narrow public triggers, generated-skill coexistence, and anti-overtriggering rules.
- `codebase-memory-propose-flow`: Defines the automated explore/discovery/plan flow using codebase-memory-first discovery and bounded user checkpoints.
- `review-gate-semantics`: Defines artifact and implementation review gates, severity semantics, and fix/proceed rules.
- `delivery-boundaries`: Defines apply, verification, implementation review, degraded discovery behavior, and no-commit explicit archive handoff for the implement phase.

### Modified Capabilities
_(none — no accepted specs currently exist in this repository)_

## Impact

- **Skills/prompts**: implementation names the narrow OpenSpec-specific public entrypoints `plan`, `implement`, `review-plan`, and `review-implementation`.
- **Agents**: future implementation may update planner/worker/reviewer contracts to follow the orchestration model.
- **OpenSpec assets**: implementation updates `review-gated` schema instructions to reflect the orchestration boundaries after `openspec-schema` lands.
- **Extension/bootstrap**: future implementation may update session guidance, overlap warnings, and setup messaging.
- **Docs**: future implementation should document why this package is not rpiv-pi, not Superpowers, and why its `plan`/`implement` entrypoints are narrow OpenSpec phases rather than a generic planning pipeline.
- **Out of scope**: implementation code changes, schema syntax repair, pi-superpowers bridge adaptation, commit/PR automation, and wholesale rpiv-pi skill cloning.
