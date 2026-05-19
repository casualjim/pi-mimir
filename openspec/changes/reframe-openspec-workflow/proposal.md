## Why

Pi needs an OpenSpec-native workflow that can define and deliver changes with review gates while using codebase-memory for codebase understanding. The workflow must be specific enough to steer agents reliably and small enough to avoid generic planning-skill overlap.

## What Changes

- Add an `define` user-facing skill/prompt for the definition phase.
- Add an `deliver` user-facing skill/prompt for the delivery phase.
- Add `planner` and `worker` agent profiles.
- Add review skills/prompts for proposal, specs, design, and tasks artifact review, backed by a generic reviewer persona agent.
- Add review skills/prompts for claim verification plus architecture, tests, performance, and security implementation review, backed by the same reviewer persona agent.
- Add codebase-memory-first guidance to the OpenSpec workflow bootstrap/context.
- Add an overlap check that warns when rpiv-pi or generic planning skills are installed.
- Expand `/openspec-setup` so it installs required Pi sibling packages, ensures OpenSpec CLI availability, and checks codebase-memory MCP availability.
- When codebase-memory MCP is missing, show a copy-paste setup prompt instead of hiding a complex external install behind setup automation.
- Add a naming pass so public skills, prompts, commands, and agents use concise product-facing names rather than literal implementation labels.
- Preserve content-addressable manifests for static agents/skills/prompts and add OpenSpec asset manifests that track OpenSpec/source asset versions where content hashing alone is insufficient.
- Add or configure an OpenSpec schema/profile/ruleset for review-gated definition and delivery.
- Expand the OpenSpec archive/sync guidance rather than wrapping the generated archive workflow.
- Add ADR update guidance to the spec-sync/archive path after a change has landed.
- Update package registration and documentation for the new workflow surface.
- Remove commit workflow from this package's planned surface.

## Capabilities

### New Capabilities
- `standalone-openspec-workflow`: OpenSpec-specific skill/prompt surface and package boundaries.
- `definition-orchestration`: Definition phase orchestration for exploration, artifact creation, and artifact review.
- `delivery-orchestration`: Delivery phase orchestration for apply, verify, implementation review, and archive readiness.
- `codebase-memory-first-discovery`: Required discovery behavior using codebase-memory before subagents.
- `review-gate-agents`: Review skill contracts and the generic reviewer persona agent.
- `architecture-memory-boundaries`: Ownership rules for OpenSpec artifacts, codebase-memory ADR, and optional path guidance, with ADR updates tied to landed-change sync/archive activity.
- `setup-and-versioning`: Setup dependency checks and managed-file version manifests.
- `naming-and-ergonomics`: Public naming rules and copy-paste setup prompt behavior.

### Modified Capabilities
_(none — no existing accepted specs to modify)_

## Impact

- **Package manifest**: update `packages/pi-openspec/package.json` skill and agent registration.
- **Skills/prompts**: add `packages/pi-openspec/skills/define/` and `packages/pi-openspec/skills/deliver/`; archive uses expanded OpenSpec-generated workflow instructions without a package wrapper skill.
- **Agents**: add orchestrator profiles and a generic reviewer persona under `packages/pi-openspec/agents/`.
- **Extension**: update bootstrap guidance, setup dependency installation/checks, OpenSpec asset manifest metadata, content-addressable static asset handling, and rpiv-pi/generic-skill overlap detection.
- **OpenSpec assets**: add schema/profile/config/rules for review-gated workflow behavior.
- **Docs**: update README usage docs for the shipped workflow.
- **Dependencies**: no dependency on `@juicesharp/rpiv-pi`.
- **Out of scope**: no commit skill, commit prompt, or commit workflow step.
