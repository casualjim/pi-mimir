## Context

The package will expose two OpenSpec-specific workflow entry points backed by orchestrator agents. The orchestrators use OpenSpec CLI instructions for artifact/task behavior, use codebase-memory tools for codebase understanding, and run review skills backed by a generic reviewer persona only at explicit gates.

## Goals / Non-Goals

**Goals:**
- Register a small OpenSpec-specific user-facing workflow surface.
- Implement definition and delivery orchestration through dedicated agent profiles.
- Add artifact review and implementation review gates as review skills backed by a generic reviewer persona.
- Add codebase-memory-first discovery guidance.
- Add setup checks for required Pi packages, OpenSpec CLI, and codebase-memory availability.
- Provide a copy-paste setup prompt when codebase-memory MCP is missing.
- Add a naming pass for public skills, prompts, commands, and agents.
- Preserve content-addressable manifests for static agents, skills, and prompts; add richer version metadata only for OpenSpec schema/config/generated assets.
- Add overlap detection for rpiv-pi or generic planning skills.
- Define clear architecture-memory ownership between OpenSpec artifacts, codebase-memory ADR, and optional path-scoped guidance.

**Non-Goals:**
- No commit skill, prompt, command, or workflow step.
- No dependency on `@juicesharp/rpiv-pi`.
- No generic planning/research skill names.
- No subagent fan-out for ordinary codebase discovery.

## Decisions

### Package surface

`packages/pi-mimir/package.json` registers only OpenSpec-specific skills owned by this package:

```text
skills/define
skills/deliver
# archive/sync use expanded OpenSpec-generated workflow instructions, not a wrapper skill
```

The package also includes orchestrator agents and a generic reviewer persona agent under `packages/pi-mimir/agents/`. Agent sync remains package-owned and does not require rpiv-pi.

### Skill-to-agent flow

`define/SKILL.md` is a small invocation wrapper. It selects or creates an OpenSpec change, then delegates the phase contract to `planner`.

`deliver/SKILL.md` is a small invocation wrapper. It selects an apply-ready OpenSpec change, then delegates task execution, verification, and review coordination to `worker`.

The wrappers do not contain large planning workflows. The detailed behavior lives in orchestrator agent profiles and OpenSpec instructions.

### Planner contract

`planner`:

- runs `openspec list --json` when change context is ambiguous;
- runs `openspec status --change <name> --json` to determine artifact state;
- runs `openspec instructions <artifact-id> --change <name> --json` for ready artifacts;
- reads dependency artifacts before writing dependent artifacts;
- uses codebase-memory tools directly for needed codebase context;
- writes or updates proposal, specs, and design artifacts according to returned OpenSpec instructions;
- runs proposal/specs/design/tasks review skills after artifacts are complete;
- synthesizes reviewer findings and updates artifacts or asks the user for decisions;
- stops when artifacts pass review and the change is ready for delivery;
- never writes application code.

### Worker contract

`worker`:

- runs `openspec status --change <name> --json` to verify apply readiness;
- runs `openspec instructions apply --change <name> --json` for context files, tracking file, and apply guidance;
- reads proposal, specs, design, tasks, and any returned context files before implementation;
- implements tracked tasks incrementally;
- marks task checkboxes complete only after implementation is done;
- verifies implementation against OpenSpec artifacts;
- runs specialist review skills after verification;
- synthesizes findings and loops through fixes when needed;
- stops at archive readiness;
- never commits.

### Review gate contracts

Review gates are expressed as skills/prompts. A single generic reviewer persona agent provides the adversarial reviewer personality; each review skill supplies the dimension-specific behavior, rules, evidence requirements, and output format.

Artifact review skills run after definition artifacts are complete:

| Skill/prompt | Primary output |
|---|---|
| `review-proposal` | Findings about scope, why/what clarity, impact, and implementation leakage |
| `review-specs` | Findings about testability, scenario coverage, requirement completeness, and design leakage |
| `review-design` | Findings about technical decisions, rationale, tradeoffs, risks, and consistency with specs |
| `review-tasks` | Findings about task order, granularity, dependency mapping, and implementability |

Implementation review skills run after delivery verification:

| Skill/prompt | Primary output |
|---|---|
| `review-architecture` | Structural and integration findings |
| `review-tests` | Coverage and regression findings |
| `review-data-flow` | Hot-path and resource findings |
| `review-security` | Trust-boundary, validation, auth, and secret-handling findings |

The generic reviewer persona does not encode all specialist rules. Reviewer findings use a consistent schema: severity, artifact or file location, problem, impact, and recommended fix. Orchestrators deduplicate and decide whether to continue, fix, or ask the user.

### Codebase-memory discovery contract

Bootstrap guidance and orchestrator prompts include this discovery ladder:

1. `codebase_memory_get_architecture`
2. `codebase_memory_search_graph` or `codebase_memory_search_code`
3. `codebase_memory_trace_path`
4. `codebase_memory_get_code_snippet`
5. exact `read` of known files
6. direct synthesis
7. generic reviewer persona via review skills only for judgment gates

The orchestrators do not dispatch locator/analyzer/pattern research agents for ordinary codebase discovery.

### OpenSpec schema/config integration

The package provides OpenSpec assets that can be installed or selected by setup:

```text
packages/pi-mimir/openspec/schemas/review-gated/schema.yaml
packages/pi-mimir/openspec/schemas/review-gated/templates/*
```

The schema/config adds instructions for:

- codebase-memory-first artifact creation;
- artifact review gate expectations;
- apply/verify/review sequencing;
- no commit behavior.

Where OpenSpec's generated archive/sync behavior exists, the package should reuse it rather than wrap it. Customization belongs in expanded archive/sync instructions, schema/config rules, or generated OpenSpec workflow content so the landed-change path can include project-specific steps without adding another user-facing wrapper.

### Setup and dependency checks

`/openspec-setup` installs or reports all prerequisites for the workflow:

- Pi sibling packages from `siblings.ts`, including `@tintinweb/pi-subagents`, `rpiv-ask-user-question`, `rpiv-todo`, `rpiv-web-tools`, `rpiv-args`, `rpiv-btw`, and `pi-mcp-adapter`.
- OpenSpec CLI availability, with `npm i -g @FissionAI/openspec` as the install command when missing.
- codebase-memory availability through MCP tool detection.

codebase-memory is expected to be bundled by this package later. Until then, setup should not hide the external installation behind opaque automation. If codebase-memory MCP is missing, setup should display a concise copy-paste prompt that asks the user's agent to install codebase-memory MCP and configure it through the MCP adapter.

### Naming ergonomics

Before implementation, the public surface needs a naming pass. Current placeholder names are intentionally descriptive but too literal for the final product surface. User-visible skill, prompt, command, and agent names should be concise and tasteful; internal file/module names can remain explicit when that improves maintainability.

The naming pass should decide final names for:

- the definition entry point;
- the delivery entry point;
- review skills;
- the generic reviewer persona;
- setup/update/check commands;
- schema/profile names.

### Managed manifest versioning

Static agent, skill, and prompt manifests should remain content-addressable: content hash is the source of truth, without synthetic package/source version numbers.

OpenSpec schema, config, and generated OpenSpec asset manifests need more than file hashes because generated results can depend on OpenSpec/template/profile versions. Each OpenSpec asset entry should include:

- target path;
- source asset kind: schema, config, or generated OpenSpec asset;
- source asset identifier;
- OpenSpec CLI or explicit sentinel version used for generation;
- template/profile/schema version where available;
- content hash;
- last generated timestamp.

Setup and update commands use these OpenSpec asset markers to decide whether regeneration is required when OpenSpec or asset versions change.

### Extension changes

`bootstrap.ts` injects concise workflow guidance:

- available OpenSpec entry points;
- codebase-memory-first discovery ladder;
- allowed subagent use only at review/verification gates;
- no commit workflow.

`overlap-checks.ts` detects installed rpiv-pi package markers or generic overlapping skills/prompts and reports a warning during setup/session start.

`agents.ts` syncs only this package's orchestrator agents and generic reviewer persona. Its manifest format should be upgraded to the managed-version manifest described above.

### Architecture memory boundaries

- OpenSpec artifacts are canonical for change-scoped proposal, requirement, design, and task data.
- codebase-memory ADR stores durable project-level architecture summaries and conventions.
- ADR updates happen after a change has landed, as part of spec sync/archive guidance, not during initial definition.
- Path-scoped guidance is unresolved: if codebase-memory ADR provides reliable context, generated guidance may be unnecessary.

## Risks / Trade-offs

- **Orchestrator prompts become too broad** → Keep wrappers thin and split contracts between definition and delivery agents.
- **Review gates add latency** → Run review skills only at gates and keep discovery out of review execution.
- **OpenSpec generated skills overlap with package wrappers** → Document preferred entry points and reuse generated archive/sync only where they do not conflict.
- **codebase-memory unavailable** → Fall back to exact file reads and shell inspection, then report degraded discovery.
- **Architecture memory duplication** → Update ADR only after landed changes and link to OpenSpec artifacts for change-scoped details.

## Implementation Plan

1. Implement package registration for the `define` and `deliver` skill surface.
2. Add the planner and worker agent profiles.
3. Add review skills and the generic reviewer persona agent.
4. Add bootstrap guidance, setup dependency checks, copy-paste codebase-memory setup prompt, naming pass, overlap checks, and managed manifest versioning.
5. Add or configure the review-gated OpenSpec schema/profile assets.
6. Add expanded archive/sync instructions for post-landing ADR handling.
7. Add tests for package registration, setup dependency detection, manifest drift detection, overlap detection, no commit workflow, and no rpiv-pi dependency.

## Open Questions

- Can codebase-memory ADR fully replace generated path-scoped guidance, or is file-touch guidance still needed for local conventions?
